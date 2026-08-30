//! Découverte d'organisation : trouver son service sans taper une adresse.
//!
//! ## Ce que cela remplace
//!
//! Jusqu'ici, un poste apprenait où joindre son organisation par une **adresse**
//! — déposée par la DSI, ou saisie par l'utilisateur. Une adresse est une
//! mauvaise chose à demander : elle est longue, elle change, elle expose une
//! topologie, et elle se trompe en silence. La recette réelle de la Phase 16
//! s'est arrêtée net sur un port erroné, sans le moindre message utile.
//!
//! La découverte remplace « où est votre serveur ? » par « quelle est votre
//! organisation ? ».
//!
//! ## Ce que ce module ne fait pas
//!
//! Il ne prouve aucune identité et ne transporte aucun contenu. Il choisit
//! **où** parler, pas **qui** parle : l'authentification vient après, et c'est
//! le SSO qui s'en charge. Aucun audio, aucun texte, aucun prompt ne passe par
//! ici.

use serde::{Deserialize, Serialize};
use specta::Type;
use std::time::Duration;

/// Version de contrat comprise par ce poste.
///
/// Un serveur qui annoncerait une version plus récente est refusé plutôt
/// qu'interprété au jugé : mieux vaut un message clair qu'un bootstrap à
/// moitié compris.
pub const DISCOVERY_CONTRACT_VERSION: u32 = 1;

/// Ce que le poste retient d'une découverte réussie.
///
/// Aucun secret : un identifiant public, un nom affichable, une adresse, une
/// version. C'est tout ce qu'il faut pour joindre l'organisation, et rien de
/// plus n'a de raison d'être conservé.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, Type)]
pub struct OrganizationBootstrap {
    /// Identifiant public de l'organisation — pas une donnée d'authentification.
    pub organization: String,
    pub display_name: String,
    /// Adresse à laquelle s'adresser ensuite. Elle peut changer : une
    /// organisation doit pouvoir déménager sans réinstaller Nova.
    pub service_endpoint: String,
    pub deployment_mode: String,
    pub contract_version: u32,
}

/// Motifs d'échec d'une découverte. Codes stables, jamais de détail technique.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, Type)]
#[serde(tag = "code")]
pub enum DiscoveryError {
    /// Le service de découverte n'a pas pu être joint.
    DiscoveryUnavailable,
    /// L'organisation est inconnue, suspendue ou n'a pas publié d'adresse.
    /// Volontairement indistinct : le serveur lui-même ne fait pas la
    /// différence dans sa réponse publique.
    OrganizationNotAvailable,
    /// Réponse illisible ou incomplète.
    DiscoveryResponseInvalid,
    /// Contrat plus récent que ce que ce poste sait lire.
    DiscoveryVersionUnsupported,
    /// L'adresse annoncée n'est pas une destination acceptable.
    ServiceEndpointInvalid,
}

impl DiscoveryError {
    pub fn code(&self) -> &'static str {
        match self {
            DiscoveryError::DiscoveryUnavailable => "DISCOVERY_UNAVAILABLE",
            DiscoveryError::OrganizationNotAvailable => "ORGANIZATION_NOT_AVAILABLE",
            DiscoveryError::DiscoveryResponseInvalid => "DISCOVERY_RESPONSE_INVALID",
            DiscoveryError::DiscoveryVersionUnsupported => "DISCOVERY_VERSION_UNSUPPORTED",
            DiscoveryError::ServiceEndpointInvalid => "SERVICE_ENDPOINT_INVALID",
        }
    }
}

/// Ce qu'un poste accepte de contacter.
///
/// La réponse de découverte dit au poste où envoyer ses identifiants : une
/// réponse hostile qui l'enverrait ailleurs serait un détournement
/// d'authentification. Le poste revalide donc ce que le serveur a déjà validé —
/// les deux contrôles protègent contre des fautes différentes.
///
/// `allow_insecure` n'existe que pour le développement, et n'est jamais
/// activable depuis une réponse réseau : c'est un paramètre du poste.
pub fn service_endpoint_is_allowed(
    endpoint: &str,
    allow_insecure: bool,
) -> Result<(), &'static str> {
    let trimmed = endpoint.trim();
    if trimmed.is_empty() {
        return Err("empty");
    }
    if trimmed.contains('@') {
        // Des identifiants dans l'URL, ou une adresse malformée : dans les deux
        // cas, ce n'est pas une base de service.
        return Err("credentials_in_url");
    }
    if trimmed.contains('?') || trimmed.contains('#') {
        return Err("not_a_base_url");
    }

    let lowercase = trimmed.to_ascii_lowercase();
    let rest = if let Some(rest) = lowercase.strip_prefix("https://") {
        rest
    } else if let Some(rest) = lowercase.strip_prefix("http://") {
        if !allow_insecure {
            return Err("scheme_not_https");
        }
        rest
    } else {
        // `file://`, `ftp://`, `javascript:`, `data:` et tout le reste.
        return Err("scheme_not_allowed");
    };

    let host = rest.split(['/', ':']).next().unwrap_or("");
    if host.is_empty() {
        return Err("missing_host");
    }
    if !allow_insecure && is_local_host(host) {
        // En production, une adresse locale signifie que quelque chose s'est
        // substitué au service : le poste ne doit pas y envoyer sa session.
        return Err("local_host");
    }
    Ok(())
}

/// L'hôte désigne-t-il la machine elle-même ou son voisinage immédiat ?
fn is_local_host(host: &str) -> bool {
    let host = host.trim_start_matches('[').trim_end_matches(']');
    if host == "localhost" || host.ends_with(".localhost") || host == "::1" {
        return true;
    }
    let octets: Vec<&str> = host.split('.').collect();
    if octets.len() == 4 && octets.iter().all(|part| part.parse::<u8>().is_ok()) {
        let values: Vec<u8> = octets.iter().filter_map(|p| p.parse::<u8>().ok()).collect();
        return matches!(
            values.as_slice(),
            [127, ..] | [10, ..] | [192, 168, ..] | [169, 254, ..]
        ) || matches!(values.as_slice(), [172, second, ..] if (16..=31).contains(second));
    }
    false
}

// ─────────────────────────────────────────────────────────────────────────────
// Appel du service de découverte
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct DiscoveryResponse {
    contract_version: u32,
    organization: DiscoveryOrganization,
    deployment_mode: String,
    service_endpoint: String,
}

#[derive(Deserialize)]
struct DiscoveryOrganization {
    slug: String,
    display_name: String,
}

/// Transforme une réponse brute en bootstrap utilisable, ou la refuse.
///
/// Séparée de l'appel réseau pour être vérifiable : c'est ici que se joue la
/// confiance accordée à une réponse, pas dans le transport.
pub fn parse_discovery_response(
    body: &str,
    allow_insecure_endpoint: bool,
) -> Result<OrganizationBootstrap, DiscoveryError> {
    let response: DiscoveryResponse =
        serde_json::from_str(body).map_err(|_| DiscoveryError::DiscoveryResponseInvalid)?;

    if response.contract_version > DISCOVERY_CONTRACT_VERSION {
        return Err(DiscoveryError::DiscoveryVersionUnsupported);
    }
    if response.organization.slug.trim().is_empty() {
        return Err(DiscoveryError::DiscoveryResponseInvalid);
    }
    service_endpoint_is_allowed(&response.service_endpoint, allow_insecure_endpoint)
        .map_err(|_| DiscoveryError::ServiceEndpointInvalid)?;

    Ok(OrganizationBootstrap {
        organization: response.organization.slug,
        display_name: response.organization.display_name,
        service_endpoint: response.service_endpoint.trim_end_matches('/').to_string(),
        deployment_mode: response.deployment_mode,
        contract_version: response.contract_version,
    })
}

/// Résout une organisation en adresse de service.
///
/// L'identifiant part dans le corps plutôt que dans l'URL : il n'est pas
/// secret, mais il n'a pas besoin de se retrouver dans les journaux de chaque
/// intermédiaire réseau.
///
/// > **Ce que Nova apprend.** Appeler la découverte révèle au service que « ce
/// > poste cherche l'organisation X ». C'est une métadonnée réelle, et il faut
/// > le dire plutôt que prétendre le contraire. Aucun contenu de travail ne
/// > transite en revanche par ce chemin.
#[tauri::command]
#[specta::specta]
pub async fn discover_organization(
    discovery_base_url: String,
    organization: String,
    allow_insecure_endpoint: bool,
) -> Result<OrganizationBootstrap, DiscoveryError> {
    let base = discovery_base_url.trim().trim_end_matches('/');
    service_endpoint_is_allowed(base, allow_insecure_endpoint)
        .map_err(|_| DiscoveryError::ServiceEndpointInvalid)?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|_| DiscoveryError::DiscoveryUnavailable)?;

    let response = client
        .post(format!("{base}/api/discovery/organization"))
        .json(&serde_json::json!({ "organization": organization }))
        .send()
        .await
        .map_err(|_| DiscoveryError::DiscoveryUnavailable)?;

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(DiscoveryError::OrganizationNotAvailable);
    }
    if !response.status().is_success() {
        return Err(DiscoveryError::DiscoveryUnavailable);
    }

    let body = response
        .text()
        .await
        .map_err(|_| DiscoveryError::DiscoveryUnavailable)?;
    parse_discovery_response(&body, allow_insecure_endpoint)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bootstrap_json(endpoint: &str, version: u32) -> String {
        format!(
            r#"{{"contract_version":{version},"organization":{{"slug":"ecole","display_name":"École"}},"deployment_mode":"dedicated","service_endpoint":"{endpoint}"}}"#
        )
    }

    // ── Ce que le poste accepte de contacter ────────────────────────────

    #[test]
    fn a_public_https_endpoint_is_accepted() {
        assert!(service_endpoint_is_allowed("https://nova.exemple.fr", false).is_ok());
        assert!(service_endpoint_is_allowed("https://nova.exemple.fr:8443", false).is_ok());
    }

    #[test]
    fn plain_http_is_refused_in_production() {
        assert_eq!(
            service_endpoint_is_allowed("http://nova.exemple.fr", false),
            Err("scheme_not_https")
        );
        // Toléré uniquement quand le poste, lui, l'a décidé.
        assert!(service_endpoint_is_allowed("http://localhost:8787", true).is_ok());
    }

    #[test]
    fn exotic_schemes_are_refused() {
        for endpoint in [
            "file:///etc/passwd",
            "ftp://nova.exemple.fr",
            "javascript:alert(1)",
            "data:text/html,x",
            "nova.exemple.fr",
        ] {
            assert_eq!(
                service_endpoint_is_allowed(endpoint, true),
                Err("scheme_not_allowed"),
                "{endpoint}"
            );
        }
    }

    #[test]
    fn credentials_in_the_url_are_refused() {
        assert_eq!(
            service_endpoint_is_allowed("https://user:pass@nova.exemple.fr", false),
            Err("credentials_in_url")
        );
    }

    #[test]
    fn a_query_or_fragment_is_refused() {
        for endpoint in ["https://nova.exemple.fr?a=b", "https://nova.exemple.fr#x"] {
            assert_eq!(
                service_endpoint_is_allowed(endpoint, false),
                Err("not_a_base_url"),
                "{endpoint}"
            );
        }
    }

    #[test]
    fn local_and_private_hosts_are_refused_in_production() {
        // Une adresse locale annoncée en production signifie que quelque chose
        // s'est substitué au service : le poste ne doit pas y envoyer sa session.
        for endpoint in [
            "https://localhost",
            "https://127.0.0.1:8787",
            "https://10.0.0.5",
            "https://192.168.1.20",
            "https://172.16.4.4",
            "https://169.254.169.254",
        ] {
            assert_eq!(
                service_endpoint_is_allowed(endpoint, false),
                Err("local_host"),
                "{endpoint}"
            );
        }
    }

    #[test]
    fn a_public_address_that_merely_looks_private_is_accepted() {
        // 172.32 est publique : la plage privée s'arrête à 172.31.
        assert!(service_endpoint_is_allowed("https://172.32.0.1", false).is_ok());
        assert!(service_endpoint_is_allowed("https://11.0.0.1", false).is_ok());
    }

    // ── Lecture d'une réponse ───────────────────────────────────────────

    #[test]
    fn a_valid_response_becomes_a_bootstrap() {
        let bootstrap =
            parse_discovery_response(&bootstrap_json("https://nova.exemple.fr/", 1), false)
                .expect("réponse valide");
        assert_eq!(bootstrap.organization, "ecole");
        assert_eq!(bootstrap.display_name, "École");
        // L'adresse est normalisée, sans barre finale.
        assert_eq!(bootstrap.service_endpoint, "https://nova.exemple.fr");
        assert_eq!(bootstrap.deployment_mode, "dedicated");
    }

    #[test]
    fn a_newer_contract_is_refused_rather_than_guessed() {
        assert_eq!(
            parse_discovery_response(&bootstrap_json("https://nova.exemple.fr", 2), false),
            Err(DiscoveryError::DiscoveryVersionUnsupported)
        );
    }

    #[test]
    fn a_hostile_endpoint_is_refused_even_from_a_valid_response() {
        // Le serveur a beau répondre correctement, le poste revalide : les deux
        // contrôles protègent contre des fautes différentes.
        for endpoint in [
            "http://nova.exemple.fr",
            "file:///etc/passwd",
            "https://127.0.0.1:9999",
            "https://user:pass@nova.exemple.fr",
        ] {
            assert_eq!(
                parse_discovery_response(&bootstrap_json(endpoint, 1), false),
                Err(DiscoveryError::ServiceEndpointInvalid),
                "{endpoint}"
            );
        }
    }

    #[test]
    fn a_malformed_or_incomplete_response_is_refused() {
        for body in [
            "pas du json",
            "{}",
            r#"{"contract_version":1}"#,
            r#"{"contract_version":1,"organization":{"slug":"","display_name":"x"},"deployment_mode":"dedicated","service_endpoint":"https://nova.exemple.fr"}"#,
        ] {
            let result = parse_discovery_response(body, false);
            assert!(
                matches!(
                    result,
                    Err(DiscoveryError::DiscoveryResponseInvalid)
                        | Err(DiscoveryError::ServiceEndpointInvalid)
                ),
                "{body} → {result:?}"
            );
        }
    }

    #[test]
    fn the_bootstrap_carries_no_secret() {
        let bootstrap =
            parse_discovery_response(&bootstrap_json("https://nova.exemple.fr", 1), false).unwrap();
        let serialized = serde_json::to_string(&bootstrap).unwrap();
        for forbidden in ["token", "secret", "tenant", "client_id", "issuer"] {
            assert!(!serialized.contains(forbidden), "{forbidden}");
        }
    }

    #[test]
    fn error_codes_are_stable() {
        assert_eq!(
            DiscoveryError::OrganizationNotAvailable.code(),
            "ORGANIZATION_NOT_AVAILABLE"
        );
        assert_eq!(
            DiscoveryError::ServiceEndpointInvalid.code(),
            "SERVICE_ENDPOINT_INVALID"
        );
    }

    #[test]
    fn an_endpoint_rotation_produces_a_different_bootstrap() {
        // Une organisation doit pouvoir déménager sans réinstaller Nova.
        let before =
            parse_discovery_response(&bootstrap_json("https://avant.exemple.fr", 1), false)
                .unwrap();
        let after = parse_discovery_response(&bootstrap_json("https://apres.exemple.fr", 1), false)
            .unwrap();
        assert_ne!(before.service_endpoint, after.service_endpoint);
        // …mais la même organisation. L'identité ne change pas avec l'adresse.
        assert_eq!(before.organization, after.organization);
    }
}
