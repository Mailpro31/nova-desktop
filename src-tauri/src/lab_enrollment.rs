//! Enrôlement temporaire d'un Desktop dans un Nova Organization Lab.
//!
//! Un code `NOVA-LAB1` porte une adresse LAN, un port et les 128 premiers bits
//! du SHA-256 du certificat attendu. Le premier téléchargement du certificat
//! est forcément non authentifié : aucune invitation ni donnée utilisateur ne
//! part à ce stade. Les octets reçus sont comparés à l'empreinte du code avant
//! d'être installés comme unique racine de confiance pour l'appel d'enrôlement.

use crate::commands::campus::{save_lab_connection, LabConnection};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use specta::Type;
use tauri::AppHandle;

const PREFIX: &str = "NOVALAB1";
const PAYLOAD_BYTES: usize = 39;
const CODE_CHARS: usize = 63;
const ALPHABET: &str = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

#[derive(Debug, Clone, PartialEq, Eq)]
struct Invitation {
    endpoint: String,
    certificate_pin: [u8; 16],
}

#[derive(Deserialize)]
struct EnrollResponse {
    contract_version: u32,
    organization: EnrollOrganization,
    service_endpoint: String,
    deployment_mode: String,
    device_token: String,
}

#[derive(Deserialize)]
struct EnrollOrganization {
    slug: String,
    display_name: String,
}

/// Réponse sans secret, affichable par l'interface.
#[derive(serde::Serialize, Clone, Type)]
pub struct LabEnrollment {
    pub service_endpoint: String,
    pub organization: String,
    pub display_name: String,
}

fn decode_invitation(code: &str) -> Result<Invitation, String> {
    // Reconnaître d'abord le préfixe littéral. Les substitutions Crockford ne
    // s'appliquent qu'au corps : les appliquer à tout le texte transformerait
    // le O de NOVA en zéro et rendrait chaque invitation invalide.
    let cleaned: String = code
        .chars()
        .filter(|c| {
            !c.is_whitespace()
                && *c != '-'
                && *c != '_'
                && !matches!(
                    *c,
                    '\u{feff}' | '\u{200b}' | '\u{200c}' | '\u{200d}' | '\u{2060}'
                )
        })
        .map(|c| c.to_ascii_uppercase())
        .collect();
    if !cleaned.starts_with(PREFIX) {
        return Err("LAB_CODE_INVALID".to_string());
    }
    let body: String = cleaned[PREFIX.len()..]
        .chars()
        .map(|c| match c {
            'I' | 'L' => '1',
            'O' => '0',
            other => other,
        })
        .collect();
    if body.len() != CODE_CHARS {
        return Err("LAB_CODE_INVALID".to_string());
    }

    let mut characters = body.chars();
    let first = characters
        .next()
        .and_then(|character| ALPHABET.find(character))
        .ok_or_else(|| "LAB_CODE_INVALID".to_string())? as u32;
    // The first base32 symbol contains three zero padding bits followed by the
    // first two payload bits. Keep only those two payload bits before feeding
    // the remaining symbols through the byte assembler.
    if first > 3 {
        return Err("LAB_CODE_INVALID".to_string());
    }
    let mut bytes = Vec::with_capacity(PAYLOAD_BYTES);
    let mut accumulator = first;
    let mut bits = 2u8;
    for character in characters {
        let value = ALPHABET
            .find(character)
            .ok_or_else(|| "LAB_CODE_INVALID".to_string())? as u32;
        accumulator = (accumulator << 5) | value;
        bits += 5;
        while bits >= 8 {
            bits -= 8;
            bytes.push(((accumulator >> bits) & 0xff) as u8);
        }
    }
    if bytes.len() != PAYLOAD_BYTES || bits != 0 {
        return Err("LAB_CODE_INVALID".to_string());
    }
    if bytes[0] != 1 {
        return Err("LAB_CODE_INVALID".to_string());
    }
    let port = u16::from_be_bytes([bytes[5], bytes[6]]);
    if port == 0 {
        return Err("LAB_CODE_INVALID".to_string());
    }
    let host = format!("{}.{}.{}.{}", bytes[1], bytes[2], bytes[3], bytes[4]);
    let mut certificate_pin = [0u8; 16];
    certificate_pin.copy_from_slice(&bytes[7..23]);
    Ok(Invitation {
        endpoint: format!("https://{host}:{port}"),
        certificate_pin,
    })
}

/// Rejoint le Lab indiqué par un code à usage unique.
///
/// Le code ne part jamais avant la vérification du certificat. Le jeton que
/// répond le serveur reste dans la mémoire native et n'est pas renvoyé au JS.
#[tauri::command]
#[specta::specta]
pub async fn enroll_lab_device(
    app: AppHandle,
    code: String,
    device_name: String,
) -> Result<LabEnrollment, String> {
    let invitation = decode_invitation(&code)?;
    let untrusted = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .https_only(true)
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|_| "LAB_CONNECTION_UNAVAILABLE".to_string())?;
    let certificate_der = untrusted
        .get(format!("{}/lab/certificate", invitation.endpoint))
        .send()
        .await
        .map_err(|_| "LAB_CONNECTION_UNAVAILABLE".to_string())?
        .error_for_status()
        .map_err(|_| "LAB_CONNECTION_UNAVAILABLE".to_string())?
        .bytes()
        .await
        .map_err(|_| "LAB_CONNECTION_UNAVAILABLE".to_string())?
        .to_vec();
    let digest = Sha256::digest(&certificate_der);
    if digest[..16] != invitation.certificate_pin {
        return Err("LAB_CERTIFICATE_PIN_MISMATCH".to_string());
    }
    let certificate = reqwest::Certificate::from_der(&certificate_der)
        .map_err(|_| "LAB_CERTIFICATE_INVALID".to_string())?;
    let trusted = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .https_only(true)
        .tls_built_in_root_certs(false)
        .add_root_certificate(certificate)
        .build()
        .map_err(|_| "LAB_CERTIFICATE_INVALID".to_string())?;
    let response = trusted
        .post(format!("{}/lab/enroll", invitation.endpoint))
        .json(&serde_json::json!({ "code": code, "device_name": device_name }))
        .send()
        .await
        .map_err(|_| "LAB_CONNECTION_UNAVAILABLE".to_string())?
        .error_for_status()
        .map_err(|_| "LAB_ENROLLMENT_REJECTED".to_string())?
        .json::<EnrollResponse>()
        .await
        .map_err(|_| "LAB_ENROLLMENT_REJECTED".to_string())?;
    if response.contract_version != 1
        || response.deployment_mode != "lab"
        || response.service_endpoint.trim_end_matches('/') != invitation.endpoint
        || response.organization.slug.trim().is_empty()
        || response.organization.display_name.trim().is_empty()
        || response.device_token.trim().is_empty()
    {
        return Err("LAB_ENROLLMENT_RESPONSE_INVALID".to_string());
    }
    // Le jeton part au trousseau du systeme, l'adresse et le certificat sur le
    // disque : l'enrolement doit survivre a la fermeture de Nova Lab.
    save_lab_connection(
        &app,
        LabConnection {
            endpoint: invitation.endpoint.clone(),
            certificate_der,
            device_token: response.device_token,
        },
    )?;
    Ok(LabEnrollment {
        service_endpoint: invitation.endpoint,
        organization: response.organization.slug,
        display_name: response.organization.display_name,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_real_layout_decodes_to_the_expected_endpoint_and_pin() {
        // Vecteur canonique produit par le serveur Python pour : version 1,
        // 192.168.0.26:8443, empreinte 00..0f et secret 64..73. Garder une
        // valeur littérale évite que le test partage (ou reproduise mal) son
        // algorithme d'encodage avec l'implémentation testée.
        let code = concat!(
            "NOVA-LAB1-00W1A-0038G-FP001-081G8-1860W-40J2G-B1G6G-W3V4C-",
            "NK6ET-39D9N-PRVBE-DXR72-WKK"
        );
        let invitation = decode_invitation(code).expect("valid code");
        assert_eq!(invitation.endpoint, "https://192.168.0.26:8443");
        assert_eq!(
            invitation.certificate_pin,
            [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
        );
    }

    #[test]
    fn malformed_or_noncanonical_codes_are_refused() {
        for code in ["", "NOVA-LAB2-ABC", "NOVA-LAB1-"] {
            assert!(decode_invitation(code).is_err());
        }
    }
}
