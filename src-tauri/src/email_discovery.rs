//! Trouver son organisation avec sa seule adresse e-mail.
//!
//! L'étudiant tape `prenom.nom@ecole.fr`. Le poste prend le domaine, lit
//! l'enregistrement DNS `_nova.ecole.fr`, et y trouve l'adresse du serveur.
//! C'est le mécanisme de SPF et de DMARC : ce qui engage un domaine se publie
//! dans ce domaine.
//!
//! ## Pourquoi le DNS seul ne suffit pas
//!
//! Un enregistrement dit **où aller**, pas **à qui l'on parle**. Le poste va
//! confier une session au serveur qu'on lui désigne : une zone mal tenue, ou
//! une réponse fabriquée, deviendrait un détournement d'authentification. Le
//! poste recoupe donc trois choses, et refuse si l'une manque :
//!
//! 1. l'adresse est en **HTTPS** — la résolution elle-même passe par
//!    DNS-over-HTTPS, pour qu'un réseau hostile ne réponde pas à la place du
//!    DNS ;
//! 2. son hôte appartient au **domaine de l'adresse e-mail** — `ecole.fr` ne
//!    peut envoyer que chez lui ;
//! 3. le serveur atteint **confirme qu'il sert ce domaine**.
//!
//! ## Ce que ce module ne fait pas
//!
//! Il n'authentifie personne et ne transporte aucun contenu : il choisit une
//! destination, et le SSO fait le reste. Il n'écrit rien dans le DNS.

use serde::{Deserialize, Serialize};
use specta::Type;
use std::time::Duration;

use crate::organization_discovery::service_endpoint_is_allowed;

/// Résolveur public, joint en HTTPS. Le résolveur du réseau local ne convient
/// pas : c'est précisément celui qu'un réseau hostile contrôle.
const DOH_ENDPOINT: &str = "https://cloudflare-dns.com/dns-query";
const RECORD_PREFIX: &str = "_nova.";
const RECORD_VERSION: &str = "v=nova1";

/// Variable d'environnement qui remplace la lecture DNS, **sur ce poste
/// seulement**, le temps d'essayer la découverte avant que l'organisation ait
/// publié son enregistrement.
///
/// Forme : `ecole.fr=https://nova.test` — plusieurs domaines séparés par `;`.
///
/// ## Pourquoi c'est sans danger
///
/// Elle se pose sur la machine elle-même : quiconque peut la poser peut déjà
/// installer le logiciel de son choix sur ce poste. Aucune réponse réseau ne
/// l'active. Et le reste des contrôles tient : le serveur désigné doit
/// toujours confirmer qu'il sert ce domaine. Seule la règle « l'hôte
/// appartient au domaine » est levée — une adresse de test (`localhost`, un
/// nom Tailscale) n'est presque jamais sous le domaine de l'école.
pub const TEST_OVERRIDE_ENV: &str = "NOVA_EMAIL_DISCOVERY_OVERRIDE";

/// L'adresse de test fixée pour un domaine, s'il y en a une.
pub fn test_override(raw: Option<&str>, domain: &str) -> Option<String> {
    raw?.split(';').find_map(|entry| {
        let (key, endpoint) = entry.split_once('=')?;
        let key = key.trim().trim_end_matches('.').to_ascii_lowercase();
        let endpoint = endpoint.trim();
        (key == domain && !endpoint.is_empty()).then(|| endpoint.to_string())
    })
}

/// Ce que le poste retient d'une découverte par e-mail.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, Type)]
pub struct EmailDiscovery {
    pub domain: String,
    pub organization_name: String,
    pub service_endpoint: String,
}

/// Motifs de refus. Chacun dit quoi faire ensuite — c'est à cela qu'ils
/// servent : « ça n'a pas marché » n'aide personne.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, Type)]
#[serde(tag = "code")]
pub enum EmailDiscoveryError {
    /// L'adresse saisie n'est pas une adresse e-mail.
    EmailInvalid,
    /// Le DNS n'a pas répondu. Distinct d'une absence d'enregistrement.
    DnsUnavailable,
    /// Le domaine ne publie pas d'enregistrement Nova.
    RecordNotFound,
    /// L'adresse publiée n'est pas une destination acceptable.
    EndpointInvalid,
    /// L'adresse publiée n'appartient pas au domaine de l'adresse e-mail.
    EndpointOutsideDomain,
    /// Le serveur désigné n'a pas répondu.
    ServerUnreachable,
    /// Le serveur répond, mais ne sert pas ce domaine.
    DomainNotServed,
}

impl EmailDiscoveryError {
    pub fn code(&self) -> &'static str {
        match self {
            EmailDiscoveryError::EmailInvalid => "EMAIL_INVALID",
            EmailDiscoveryError::DnsUnavailable => "DNS_UNAVAILABLE",
            EmailDiscoveryError::RecordNotFound => "RECORD_NOT_FOUND",
            EmailDiscoveryError::EndpointInvalid => "ENDPOINT_INVALID",
            EmailDiscoveryError::EndpointOutsideDomain => "ENDPOINT_OUTSIDE_DOMAIN",
            EmailDiscoveryError::ServerUnreachable => "SERVER_UNREACHABLE",
            EmailDiscoveryError::DomainNotServed => "DOMAIN_NOT_SERVED",
        }
    }
}

/// Le domaine d'une adresse e-mail, s'il en porte la forme.
pub fn email_domain(address: &str) -> Option<String> {
    let trimmed = address.trim().to_ascii_lowercase();
    let (local, domain) = trimmed.split_once('@')?;
    if local.is_empty() || domain.is_empty() || trimmed.matches('@').count() != 1 {
        return None;
    }
    let domain = domain.trim_end_matches('.');
    if !domain.contains('.') || domain.len() > 253 {
        return None;
    }
    let labels: Vec<&str> = domain.split('.').collect();
    let well_formed = labels.iter().all(|label| {
        !label.is_empty()
            && label.len() <= 63
            && !label.starts_with('-')
            && !label.ends_with('-')
            && label.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
    });
    well_formed.then(|| domain.to_string())
}

/// Le nom DNS à interroger pour un domaine.
pub fn record_name(domain: &str) -> String {
    format!("{RECORD_PREFIX}{domain}")
}

/// L'adresse annoncée par un enregistrement Nova, parmi les TXT d'un nom.
///
/// Un nom porte souvent plusieurs TXT — SPF, vérifications de propriété. On
/// lit celui de Nova, et on ignore ses voisins sans jamais s'y tromper.
pub fn record_endpoint(values: &[String]) -> Option<String> {
    for raw in values {
        let value = raw.trim().trim_matches('"').trim();
        if !value.to_ascii_lowercase().starts_with(RECORD_VERSION) {
            continue;
        }
        for part in value.split(';').skip(1) {
            if let Some((key, candidate)) = part.split_once('=') {
                if key.trim().eq_ignore_ascii_case("endpoint") && !candidate.trim().is_empty() {
                    return Some(candidate.trim().to_string());
                }
            }
        }
    }
    None
}

/// L'adresse publiée appartient-elle au domaine de l'adresse e-mail ?
///
/// `ecole.fr` peut désigner `nova.ecole.fr` ou `ecole.fr`, jamais
/// `nova.ailleurs.test` — ni `ecole.fr.ailleurs.test`, qui ressemble à s'y
/// méprendre sans rien avoir en commun.
pub fn endpoint_belongs_to_domain(endpoint: &str, domain: &str) -> bool {
    let lowercase = endpoint.trim().to_ascii_lowercase();
    let rest = match lowercase
        .strip_prefix("https://")
        .or_else(|| lowercase.strip_prefix("http://"))
    {
        Some(rest) => rest,
        None => return false,
    };
    let host = rest.split(['/', ':']).next().unwrap_or("");
    let host = host.trim_end_matches('.');
    let domain = domain.trim_end_matches('.');
    host == domain || host.ends_with(&format!(".{domain}"))
}

#[derive(Deserialize)]
struct DohAnswer {
    #[serde(default)]
    data: String,
}

#[derive(Deserialize)]
struct DohResponse {
    #[serde(default, rename = "Answer")]
    answer: Vec<DohAnswer>,
}

#[derive(Deserialize)]
struct ServesResponse {
    #[serde(default)]
    serves: bool,
    #[serde(default)]
    organization: Option<ServesOrganization>,
}

#[derive(Deserialize)]
struct ServesOrganization {
    #[serde(default)]
    name: String,
}

/// Les TXT publiés, lus en DNS-over-HTTPS.
pub fn parse_doh_response(body: &str) -> Result<Vec<String>, EmailDiscoveryError> {
    let parsed: DohResponse =
        serde_json::from_str(body).map_err(|_| EmailDiscoveryError::DnsUnavailable)?;
    Ok(parsed
        .answer
        .into_iter()
        .map(|answer| answer.data)
        .collect())
}

/// Résout une adresse e-mail en adresse de service, en trois contrôles.
#[tauri::command]
#[specta::specta]
pub async fn discover_organization_by_email(
    email: String,
    allow_insecure_endpoint: bool,
) -> Result<EmailDiscovery, EmailDiscoveryError> {
    let domain = email_domain(&email).ok_or(EmailDiscoveryError::EmailInvalid)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|_| EmailDiscoveryError::DnsUnavailable)?;

    // Réglage de test posé sur ce poste : il remplace le DNS, et lui seul.
    let override_value = std::env::var(TEST_OVERRIDE_ENV).ok();
    if let Some(endpoint) = test_override(override_value.as_deref(), &domain) {
        log::warn!("Email discovery uses the local test override for {domain}");
        // Une adresse de test est souvent locale ou en HTTP : c'est permis ici,
        // et seulement ici, puisque c'est ce poste qui l'a demandé.
        service_endpoint_is_allowed(&endpoint, true)
            .map_err(|_| EmailDiscoveryError::EndpointInvalid)?;
        return confirm(&client, &endpoint, domain).await;
    }

    let response = client
        .get(DOH_ENDPOINT)
        .query(&[("name", record_name(&domain).as_str()), ("type", "TXT")])
        .header("accept", "application/dns-json")
        .send()
        .await
        .map_err(|_| EmailDiscoveryError::DnsUnavailable)?;
    if !response.status().is_success() {
        return Err(EmailDiscoveryError::DnsUnavailable);
    }
    let body = response
        .text()
        .await
        .map_err(|_| EmailDiscoveryError::DnsUnavailable)?;
    let endpoint =
        record_endpoint(&parse_doh_response(&body)?).ok_or(EmailDiscoveryError::RecordNotFound)?;

    service_endpoint_is_allowed(&endpoint, allow_insecure_endpoint)
        .map_err(|_| EmailDiscoveryError::EndpointInvalid)?;
    if !allow_insecure_endpoint && !endpoint_belongs_to_domain(&endpoint, &domain) {
        return Err(EmailDiscoveryError::EndpointOutsideDomain);
    }

    confirm(&client, &endpoint, domain).await
}

/// Le serveur désigné confirme-t-il qu'il sert ce domaine ? Dernier des trois
/// contrôles, et le seul qu'aucun réglage ne lève.
async fn confirm(
    client: &reqwest::Client,
    endpoint: &str,
    domain: String,
) -> Result<EmailDiscovery, EmailDiscoveryError> {
    let base = endpoint.trim_end_matches('/');
    let confirmation = client
        .get(format!("{base}/api/discovery/email-domain"))
        .query(&[("domain", domain.as_str())])
        .send()
        .await
        .map_err(|_| EmailDiscoveryError::ServerUnreachable)?;
    if !confirmation.status().is_success() {
        return Err(EmailDiscoveryError::ServerUnreachable);
    }
    let answer: ServesResponse = confirmation
        .json()
        .await
        .map_err(|_| EmailDiscoveryError::ServerUnreachable)?;
    if !answer.serves {
        return Err(EmailDiscoveryError::DomainNotServed);
    }

    Ok(EmailDiscovery {
        organization_name: answer
            .organization
            .map(|organization| organization.name)
            .unwrap_or_default(),
        service_endpoint: base.to_string(),
        domain,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_test_override_is_read_for_its_domain_only() {
        let raw = Some("ecole.fr=http://127.0.0.1:8080; autre.fr=https://nova.test");
        assert_eq!(
            test_override(raw, "ecole.fr").as_deref(),
            Some("http://127.0.0.1:8080")
        );
        assert_eq!(
            test_override(raw, "autre.fr").as_deref(),
            Some("https://nova.test")
        );
        assert!(test_override(raw, "ailleurs.fr").is_none());
    }

    #[test]
    fn no_override_means_dns_as_usual() {
        assert!(test_override(None, "ecole.fr").is_none());
        assert!(test_override(Some(""), "ecole.fr").is_none());
        assert!(test_override(Some("ecole.fr="), "ecole.fr").is_none());
        assert!(test_override(Some("pas de signe egal"), "ecole.fr").is_none());
    }

    #[test]
    fn an_address_gives_its_domain() {
        assert_eq!(
            email_domain("Prenom.Nom@Ecole.FR").as_deref(),
            Some("ecole.fr")
        );
        assert_eq!(
            email_domain("  a@sous.ecole.fr  ").as_deref(),
            Some("sous.ecole.fr")
        );
    }

    #[test]
    fn anything_that_is_not_an_address_is_refused() {
        for value in [
            "",
            "ecole.fr",
            "a@",
            "@ecole.fr",
            "a@ecole",
            "a@@ecole.fr",
            "a@-ecole.fr",
            "a@ecole-.fr",
            "a@ecole .fr",
        ] {
            assert!(email_domain(value).is_none(), "{value}");
        }
    }

    #[test]
    fn the_nova_record_is_read_among_its_neighbours() {
        let values = vec![
            "v=spf1 -all".to_string(),
            "\"v=nova1; endpoint=https://nova.ecole.fr \"".to_string(),
        ];
        assert_eq!(
            record_endpoint(&values).as_deref(),
            Some("https://nova.ecole.fr")
        );
    }

    #[test]
    fn anything_else_is_not_a_nova_record() {
        for values in [
            vec![],
            vec!["v=spf1 -all".to_string()],
            vec!["v=nova1".to_string()],
            vec!["v=nova2; endpoint=https://nova.ecole.fr".to_string()],
            vec!["v=nova1; endpoint=".to_string()],
        ] {
            assert!(record_endpoint(&values).is_none(), "{values:?}");
        }
    }

    #[test]
    fn a_domain_can_only_send_to_itself() {
        assert!(endpoint_belongs_to_domain(
            "https://nova.ecole.fr",
            "ecole.fr"
        ));
        assert!(endpoint_belongs_to_domain("https://ecole.fr", "ecole.fr"));
        assert!(endpoint_belongs_to_domain(
            "https://NOVA.Ecole.fr:8443/",
            "ecole.fr"
        ));
    }

    #[test]
    fn a_lookalike_domain_is_refused() {
        for endpoint in [
            "https://nova.ailleurs.test",
            // Le piège : le domaine visé n'est qu'un préfixe du vrai hôte.
            "https://ecole.fr.ailleurs.test",
            "https://mauvaiseecole.fr",
            "ftp://nova.ecole.fr",
            "nova.ecole.fr",
        ] {
            assert!(
                !endpoint_belongs_to_domain(endpoint, "ecole.fr"),
                "{endpoint}"
            );
        }
    }

    #[test]
    fn the_record_name_is_the_one_the_console_publishes() {
        assert_eq!(record_name("ecole.fr"), "_nova.ecole.fr");
    }

    #[test]
    fn a_dns_answer_is_read_and_a_broken_one_refused() {
        let body = r#"{"Status":0,"Answer":[{"name":"_nova.ecole.fr","type":16,"data":"v=nova1; endpoint=https://nova.ecole.fr"}]}"#;
        assert_eq!(
            record_endpoint(&parse_doh_response(body).unwrap()).as_deref(),
            Some("https://nova.ecole.fr")
        );
        assert_eq!(parse_doh_response("{}").unwrap(), Vec::<String>::new());
        assert!(parse_doh_response("pas du json").is_err());
    }
}
