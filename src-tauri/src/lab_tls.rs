//! Transport TLS du Lab : une identité épinglée, vérifiée strictement.
//!
//! ## Ce que ce module remplace, et pourquoi
//!
//! Les mesures simultanées ont établi que Nova remet à hyper exactement
//! `Content-Length` octets, en une seule frame, et que la passerelle reçoit
//! ensuite des octets HTTP clairs supplémentaires — 11 882 fois, 1 450 une
//! autre, sans corrélation avec la taille du corps. Le calcul multipart et le
//! code applicatif sont hors de cause : l'excédent naît sous hyper, dans la
//! pile TLS. Ce module permet de substituer rustls à Schannel **pour le Lab
//! seulement**, afin de le confirmer.
//!
//! ## Le modèle de confiance
//!
//! Le certificat du Lab est auto-signé. rustls refuse de le traiter comme une
//! autorité — et il a raison : un certificat feuille sans `keyCertSign` n'en est
//! pas une. Mais nous n'avons pas besoin d'une chaîne : nous connaissons le
//! certificat exact, transmis par l'invitation et vérifié par son empreinte au
//! moment de l'enrôlement.
//!
//! La confiance repose donc sur l'**identité**, pas sur une signature d'autorité.
//! `PinnedIdentityVerifier` n'accepte qu'un seul certificat, celui-là, comparé
//! octet pour octet. C'est strictement plus fort qu'une validation de chaîne :
//! une autorité compromise ne peut rien émettre qui passe ici.
//!
//! ## Ce que ce module ne fait pas
//!
//! Il n'y a ni `danger_accept_invalid_certs`, ni vérificateur permissif, ni
//! repli en cas d'échec. Quatre conditions sont exigées, et chacune est
//! bloquante :
//!
//! 1. le certificat présenté est **exactement** le certificat épinglé ;
//! 2. aucune chaîne intermédiaire n'accompagne la présentation ;
//! 3. le nom demandé figure dans les noms alternatifs du certificat ;
//! 4. l'instant présent tombe dans la période de validité.
//!
//! La signature de la poignée de main reste vérifiée par le fournisseur
//! cryptographique — c'est elle qui prouve que le pair détient bien la clé
//! privée correspondante. Épingler sans cela accepterait une simple copie du
//! certificat, qui est public.
//!
//! Aucun jeton, aucun certificat, aucun nom d'hôte n'est journalisé.

use std::sync::Arc;

use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::client::verify_server_name;
use rustls::crypto::{verify_tls12_signature, verify_tls13_signature, CryptoProvider};
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::server::ParsedCertificate;
use rustls::{CertificateError, DigitallySignedStruct, Error, SignatureScheme};

/// Vérificateur d'identité épinglée.
///
/// `Debug` est requis par rustls. L'implémentation ne divulgue rien : le
/// certificat n'y figure pas.
pub struct PinnedIdentityVerifier {
    pinned: CertificateDer<'static>,
    provider: Arc<CryptoProvider>,
}

impl std::fmt::Debug for PinnedIdentityVerifier {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // Volontairement opaque : ni le certificat, ni sa taille, ni son
        // empreinte n'ont à se retrouver dans une trace de débogage.
        f.write_str("PinnedIdentityVerifier")
    }
}

impl PinnedIdentityVerifier {
    pub fn new(pinned: Vec<u8>, provider: Arc<CryptoProvider>) -> Self {
        Self {
            pinned: CertificateDer::from(pinned),
            provider,
        }
    }

    /// L'instant présent tombe-t-il dans la période de validité ?
    ///
    /// rustls n'expose pas cette vérification pour un certificat isolé : elle
    /// n'a lieu, chez lui, qu'au fil d'une validation de chaîne — celle que le
    /// certificat auto-signé du Lab ne peut pas passer. Elle est pourtant
    /// obligatoire, donc elle est faite ici, explicitement.
    fn verify_validity_period(
        certificate: &CertificateDer<'_>,
        now: UnixTime,
    ) -> Result<(), Error> {
        let (_, parsed) = x509_parser::parse_x509_certificate(certificate.as_ref())
            .map_err(|_| Error::InvalidCertificate(CertificateError::BadEncoding))?;

        let seconds = now.as_secs();
        let not_before = parsed.validity().not_before.timestamp();
        let not_after = parsed.validity().not_after.timestamp();

        if not_before < 0 || not_after < 0 {
            return Err(Error::InvalidCertificate(CertificateError::BadEncoding));
        }
        if seconds < not_before as u64 {
            return Err(Error::InvalidCertificate(CertificateError::NotValidYet));
        }
        if seconds > not_after as u64 {
            return Err(Error::InvalidCertificate(CertificateError::Expired));
        }
        Ok(())
    }
}

impl ServerCertVerifier for PinnedIdentityVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        intermediates: &[CertificateDer<'_>],
        server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        now: UnixTime,
    ) -> Result<ServerCertVerified, Error> {
        // 1. Identité. La comparaison est totale : un octet de différence et
        //    l'on refuse. Aucune autorité, aucune chaîne, ne peut en produire un
        //    autre qui passe.
        if end_entity.as_ref() != self.pinned.as_ref() {
            return Err(Error::InvalidCertificate(
                CertificateError::ApplicationVerificationFailure,
            ));
        }

        // 2. Un pair qui présente une chaîne ne présente pas l'identité
        //    épinglée seule : on refuse plutôt que d'ignorer le supplément.
        if !intermediates.is_empty() {
            return Err(Error::InvalidCertificate(
                CertificateError::ApplicationVerificationFailure,
            ));
        }

        // 3. Le nom demandé doit figurer dans le certificat. Sans cela, le
        //    certificat d'un hôte servirait pour un autre.
        let parsed = ParsedCertificate::try_from(end_entity)?;
        verify_server_name(&parsed, server_name)?;

        // 4. Et il doit être valide maintenant.
        Self::verify_validity_period(end_entity, now)?;

        Ok(ServerCertVerified::assertion())
    }

    /// La preuve que le pair détient la clé privée. Épingler sans la vérifier
    /// accepterait une copie du certificat, qui est public.
    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, Error> {
        verify_tls12_signature(
            message,
            cert,
            dss,
            &self.provider.signature_verification_algorithms,
        )
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, Error> {
        verify_tls13_signature(
            message,
            cert,
            dss,
            &self.provider.signature_verification_algorithms,
        )
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.provider
            .signature_verification_algorithms
            .supported_schemes()
    }
}

/// Configuration rustls du Lab : aucune racine système, une seule identité.
pub fn pinned_client_config(certificate_der: Vec<u8>) -> Result<rustls::ClientConfig, String> {
    let provider = CryptoProvider::get_default()
        .cloned()
        .unwrap_or_else(|| Arc::new(rustls::crypto::ring::default_provider()));

    let verifier = Arc::new(PinnedIdentityVerifier::new(
        certificate_der,
        provider.clone(),
    ));

    let config = rustls::ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .map_err(|_| "LAB_TLS_VERSIONS_UNAVAILABLE".to_string())?
        // `dangerous()` nomme l'API, pas la pratique : y installer un
        // vérificateur *plus strict* que le défaut est précisément l'usage
        // prévu. Le contournement serait d'accepter tout ; ici on n'accepte
        // qu'un seul certificat.
        .dangerous()
        .with_custom_certificate_verifier(verifier)
        .with_no_client_auth();

    Ok(config)
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine as _;

    /// Certificat épinglé de référence (SAN : 127.0.0.1, localhost),
    /// valide du 01/01/2026 au 01/01/2046.
    const PINNED_B64: &str = concat!(
        "MIIBVzCB/aADAgECAgIQkjAKBggqhkjOPQQDAjAcMRowGAYDVQQDDBFub3ZhLWxhYi10bHMtdGVz",
        "dDAeFw0yNjAxMDEwMDAwMDBaFw00NjAxMDEwMDAwMDBaMBwxGjAYBgNVBAMMEW5vdmEtbGFiLXRs",
        "cy10ZXN0MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEm2Ih3DvqRLTbrTNVZeBpYTOTITxip/bI",
        "x9QtHiAnDgRa5vLHsSNab12qRCSZtQ2J3Dk0zyqLwEm9vQJOJKSDR6MvMC0wDwYDVR0TAQH/BAUw",
        "AwEB/zAaBgNVHREEEzARhwR/AAABgglsb2NhbGhvc3QwCgYIKoZIzj0EAwIDSQAwRgIhAPyq7POD",
        "oCNxtowibd/Ja5Ay7cS89BL94vkszuexy3wJAiEA/fgmsr6y4DsTB0X/c+IIUx1gMCoG0+PuZey5",
        "OB5QtAM=",
    );

    fn decode(value: &str) -> Vec<u8> {
        base64::engine::general_purpose::STANDARD
            .decode(value)
            .expect("vecteur de test décodable")
    }

    fn provider() -> Arc<CryptoProvider> {
        Arc::new(rustls::crypto::ring::default_provider())
    }

    fn verifier() -> PinnedIdentityVerifier {
        PinnedIdentityVerifier::new(decode(PINNED_B64), provider())
    }

    /// 1er janvier 2030 : à l'intérieur de la période de validité.
    fn valid_now() -> UnixTime {
        UnixTime::since_unix_epoch(std::time::Duration::from_secs(1_893_456_000))
    }

    fn name(host: &'static str) -> ServerName<'static> {
        ServerName::try_from(host).expect("nom d'hôte valide")
    }

    #[test]
    fn accepte_le_certificat_epingle_pour_le_bon_nom() {
        let pinned = CertificateDer::from(decode(PINNED_B64));
        assert!(verifier()
            .verify_server_cert(&pinned, &[], &name("localhost"), &[], valid_now())
            .is_ok());
    }

    #[test]
    fn refuse_un_autre_certificat() {
        // Un certificat different, meme parfaitement valide par ailleurs, n'est
        // pas l'identite epinglee.
        let mut other = decode(PINNED_B64);
        let last = other.len() - 1;
        other[last] ^= 0xFF;

        let outcome = verifier().verify_server_cert(
            &CertificateDer::from(other),
            &[],
            &name("localhost"),
            &[],
            valid_now(),
        );
        assert!(outcome.is_err(), "un certificat different doit etre refuse");
    }

    #[test]
    fn refuse_un_nom_de_serveur_different() {
        let pinned = CertificateDer::from(decode(PINNED_B64));
        let outcome =
            verifier().verify_server_cert(&pinned, &[], &name("example.test"), &[], valid_now());
        assert!(
            outcome.is_err(),
            "un nom absent du certificat doit etre refuse"
        );
    }

    #[test]
    fn refuse_avant_le_debut_de_validite() {
        let pinned = CertificateDer::from(decode(PINNED_B64));
        // 1er janvier 2020, avant `notBefore`.
        let too_early = UnixTime::since_unix_epoch(std::time::Duration::from_secs(1_577_836_800));
        let outcome =
            verifier().verify_server_cert(&pinned, &[], &name("localhost"), &[], too_early);
        assert!(
            outcome.is_err(),
            "un certificat pas encore valide doit etre refuse"
        );
    }

    #[test]
    fn refuse_apres_expiration() {
        let pinned = CertificateDer::from(decode(PINNED_B64));
        // 1er janvier 2050, apres `notAfter`.
        let too_late = UnixTime::since_unix_epoch(std::time::Duration::from_secs(2_524_608_000));
        let outcome =
            verifier().verify_server_cert(&pinned, &[], &name("localhost"), &[], too_late);
        assert!(outcome.is_err(), "un certificat expire doit etre refuse");
    }

    #[test]
    fn refuse_une_chaine_intermediaire() {
        let pinned = CertificateDer::from(decode(PINNED_B64));
        let intermediate = CertificateDer::from(decode(PINNED_B64));
        let outcome = verifier().verify_server_cert(
            &pinned,
            std::slice::from_ref(&intermediate),
            &name("localhost"),
            &[],
            valid_now(),
        );
        assert!(outcome.is_err(), "une chaine presentee doit etre refusee");
    }

    #[test]
    fn refuse_un_certificat_illisible() {
        let outcome = verifier().verify_server_cert(
            &CertificateDer::from(vec![0u8, 1, 2, 3]),
            &[],
            &name("localhost"),
            &[],
            valid_now(),
        );
        assert!(outcome.is_err(), "un certificat illisible doit etre refuse");
    }

    #[test]
    fn la_trace_de_debogage_ne_divulgue_rien() {
        let rendered = format!("{:?}", verifier());
        assert_eq!(rendered, "PinnedIdentityVerifier");
        assert!(!rendered.contains("MII"));
    }
}
