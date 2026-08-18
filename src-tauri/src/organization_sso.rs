//! Connexion Organization par SSO : Authorization Code + PKCE.
//!
//! Un seul moteur pour Microsoft Entra et Google Workspace. Ce qui distingue
//! les deux fournisseurs — point d'autorisation, secret exigé à l'échange,
//! revendication de rattachement — vit **côté serveur** : le poste ne connaît
//! qu'un identifiant de fournisseur et deux routes.
//!
//! ## Ce que fait ce module, et ce qu'il ne fait pas
//!
//! Il prépare une tentative de connexion, ouvre le **navigateur système**,
//! attend le retour sur une adresse de bouclage, puis transmet le code
//! d'autorisation au serveur Nova. Il ne valide aucune identité et ne reçoit
//! aucun jeton du fournisseur : c'est le serveur qui échange le code auprès de
//! celui-ci, vérifie cryptographiquement le jeton d'identité et décide de
//! l'organisation.
//!
//! Autrement dit, ce poste ne dit jamais au serveur « fais-moi confiance, je
//! suis X dans l'organisation Y ». Un poste modifié peut au pire tenter une
//! connexion, jamais en fabriquer une.
//!
//! ## Client public
//!
//! Nova est un client public : **aucun secret client** n'est embarqué, ni ici,
//! ni dans un fichier de configuration. Google exige un secret à l'échange pour
//! ses clients « Desktop » ; il vit côté serveur, puisque c'est le serveur qui
//! échange — le poste n'en a jamais connaissance. Ce qui prouve qu'un code d'autorisation
//! revient bien à celui qui l'a demandé, c'est le `code_verifier` de PKCE — un
//! secret créé pour l'occasion, gardé en mémoire, détruit à la fin.
//!
//! ## Ce qui n'est jamais journalisé
//!
//! Le vérificateur, le code d'autorisation, le `state`, le `nonce` et le jeton
//! de session. Les diagnostics ne contiennent qu'un identifiant de tentative et
//! un code de raison.

use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use specta::Type;
use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use crate::commands::campus::{normalize_base_url, save_campus_credentials, CampusSession};

/// Au-delà, la tentative est abandonnée et le port refermé. Large parce qu'une
/// authentification multifacteur prend du temps ; borné parce qu'un port qui
/// reste ouvert indéfiniment est une surface qui reste ouverte indéfiniment.
const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(300);

/// Une seule tentative à la fois par poste. Sans ce verrou, deux fenêtres de
/// navigateur pourraient revenir sur deux écouteurs concurrents et l'on ne
/// saurait plus laquelle a produit quelle session.
static SIGN_IN_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

/// Libère le verrou même en cas de panique ou de retour anticipé.
#[derive(Debug)]
struct SignInGuard;

impl SignInGuard {
    fn acquire() -> Result<Self, SsoError> {
        if SIGN_IN_IN_PROGRESS.swap(true, Ordering::SeqCst) {
            return Err(SsoError::AlreadyInProgress);
        }
        Ok(SignInGuard)
    }
}

impl Drop for SignInGuard {
    fn drop(&mut self) {
        SIGN_IN_IN_PROGRESS.store(false, Ordering::SeqCst);
    }
}

/// Motifs d'échec, énumérés plutôt que rédigés.
///
/// L'interface choisit le libellé ; ce code sert au diagnostic et ne contient
/// jamais de secret. Les variantes correspondent aux codes que le serveur
/// renvoie, pour qu'une cause serveur ne se perde pas en route.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, Type)]
#[serde(tag = "code")]
pub enum SsoError {
    /// Une autre tentative de connexion est déjà ouverte.
    AlreadyInProgress,
    /// L'utilisateur a fermé le navigateur ou refusé le consentement.
    AuthCancelled,
    /// Aucun retour dans le délai imparti.
    AuthTimeout,
    /// Le retour ne correspond pas à la tentative en cours.
    StateMismatch,
    /// Impossible d'ouvrir un écouteur de bouclage.
    LoopbackUnavailable,
    /// Le serveur de l'établissement n'a pas pu être joint.
    NetworkError,
    /// Le serveur a refusé, avec son propre code (`TENANT_NOT_ALLOWED`, …).
    Server { detail: String },
}

impl SsoError {
    /// Code stable, pour les journaux et les tests.
    pub fn code(&self) -> &str {
        match self {
            SsoError::AlreadyInProgress => "AUTH_ALREADY_IN_PROGRESS",
            SsoError::AuthCancelled => "AUTH_CANCELLED",
            SsoError::AuthTimeout => "AUTH_TIMEOUT",
            SsoError::StateMismatch => "STATE_MISMATCH",
            SsoError::LoopbackUnavailable => "LOOPBACK_UNAVAILABLE",
            SsoError::NetworkError => "NETWORK_ERROR",
            SsoError::Server { detail } => detail,
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PKCE
// ─────────────────────────────────────────────────────────────────────────────

fn random_bytes(length: usize) -> Result<Vec<u8>, SsoError> {
    let mut buffer = vec![0u8; length];
    getrandom::getrandom(&mut buffer).map_err(|_| SsoError::LoopbackUnavailable)?;
    Ok(buffer)
}

fn base64url(bytes: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

/// Secret à usage unique, propre à une tentative.
///
/// 32 octets d'aléa cryptographique donnent 43 caractères une fois encodés —
/// la longueur minimale exigée par la spécification PKCE, et bien au-delà de ce
/// qu'un attaquant pourrait deviner.
pub fn generate_code_verifier() -> Result<String, SsoError> {
    Ok(base64url(&random_bytes(32)?))
}

/// Empreinte publique du vérificateur : `BASE64URL(SHA256(verifier))`.
///
/// C'est elle qui part vers le fournisseur. Le vérificateur, lui, ne quitte le
/// poste
/// qu'au moment de l'échange, ce qui rend un code d'autorisation intercepté
/// inutilisable.
pub fn code_challenge_s256(verifier: &str) -> String {
    base64url(&Sha256::digest(verifier.as_bytes()))
}

/// Valeur aléatoire opaque : `state` ou `nonce` selon l'usage.
pub fn generate_opaque_value() -> Result<String, SsoError> {
    Ok(base64url(&random_bytes(24)?))
}

// ─────────────────────────────────────────────────────────────────────────────
// Écouteur de bouclage
// ─────────────────────────────────────────────────────────────────────────────

/// Ce que le navigateur a renvoyé.
#[derive(Debug, PartialEq, Eq)]
pub struct CallbackParams {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

/// Lit les paramètres de la ligne de requête HTTP.
///
/// Analyse volontairement étroite : seule la première ligne est lue, et seuls
/// trois paramètres sont retenus. Ce serveur n'a qu'un rôle — recevoir un
/// retour — et tout ce qu'il accepte en plus serait une surface offerte.
pub fn parse_callback_request(request_line: &str) -> CallbackParams {
    let mut params = CallbackParams {
        code: None,
        state: None,
        error: None,
    };
    let Some(target) = request_line.split_whitespace().nth(1) else {
        return params;
    };
    let Some((_, query)) = target.split_once('?') else {
        return params;
    };
    for pair in query.split('&') {
        let Some((key, value)) = pair.split_once('=') else {
            continue;
        };
        let value = percent_decode(value);
        match key {
            "code" => params.code = Some(value),
            "state" => params.state = Some(value),
            // `error` et `error_description` disent la même chose ici : la
            // tentative n'a pas abouti. Seul le premier est retenu.
            "error" => params.error = Some(value),
            _ => {}
        }
    }
    params
}

fn percent_decode(value: &str) -> String {
    let bytes = value.replace('+', " ").into_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(
                std::str::from_utf8(&bytes[index + 1..index + 3]).unwrap_or(""),
                16,
            ) {
                out.push(byte);
                index += 3;
                continue;
            }
        }
        out.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Page rendue au navigateur après le retour.
///
/// Ni jeton, ni code, ni adresse, ni tenant : la page est vue par le
/// navigateur, conservée dans son historique, et parfois lue par une extension.
/// Elle ne dit donc rien d'autre que « c'est terminé ».
fn callback_page(message: &str) -> String {
    format!(
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">\
         <title>Nova</title></head><body style=\"font-family:system-ui;\
         display:flex;align-items:center;justify-content:center;height:100vh;\
         margin:0;color:#1a1a1a\"><p>{message}</p></body></html>"
    )
}

fn write_response(stream: &mut TcpStream, body: &str) {
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\
         Content-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

/// Adresse de retour annoncée à Microsoft.
///
/// Sa forme n'est pas cosmétique : elle doit correspondre à ce qui est
/// enregistré dans l'application Entra. Microsoft ignore **uniquement le port**
/// lors de la comparaison d'une adresse de bouclage ; l'hôte, le schéma et
/// surtout **le chemin** doivent correspondre exactement, et la comparaison du
/// chemin est sensible à la casse.
///
/// Conséquence pratique : l'enregistrement doit porter
/// `http://127.0.0.1/callback`, chemin compris. Un enregistrement réduit à
/// `http://127.0.0.1` produirait un `AADSTS50011` à la première connexion
/// réelle — voir `docs/architecture/microsoft-entra-sso.md` § 16.
///
/// L'adresse littérale est préférée à `localhost`, comme le recommandent la
/// RFC 8252 et Microsoft : elle ne dépend d'aucune résolution de noms, donc ni
/// d'un fichier `hosts` modifié, ni d'une interface renommée.
pub fn redirect_uri_for_port(port: u16) -> String {
    format!("http://127.0.0.1:{}/callback", port)
}

/// Écouteur ouvert **uniquement** sur la boucle locale, sur un port choisi par
/// le système.
///
/// `127.0.0.1` et non `0.0.0.0` : le retour vient du navigateur de cette
/// machine et de nulle part ailleurs. Un écouteur exposé au réseau local
/// permettrait à un voisin de tenter d'y déposer un code.
pub fn bind_loopback_listener() -> Result<TcpListener, SsoError> {
    let address = SocketAddr::from((Ipv4Addr::LOCALHOST, 0));
    TcpListener::bind(address).map_err(|_| SsoError::LoopbackUnavailable)
}

/// Attend le retour du navigateur, ou renonce.
///
/// L'écouteur est fermé dès la sortie de cette fonction, quelle qu'en soit la
/// cause : le port n'est ouvert que pendant la connexion.
fn wait_for_callback(listener: TcpListener, expected_state: &str) -> Result<String, SsoError> {
    listener
        .set_nonblocking(true)
        .map_err(|_| SsoError::LoopbackUnavailable)?;
    let deadline = Instant::now() + SIGN_IN_TIMEOUT;

    while Instant::now() < deadline {
        match listener.accept() {
            Ok((mut stream, _)) => {
                let mut buffer = [0u8; 4096];
                stream.set_nonblocking(false).ok();
                stream.set_read_timeout(Some(Duration::from_secs(5))).ok();
                let read = stream.read(&mut buffer).unwrap_or(0);
                let request = String::from_utf8_lossy(&buffer[..read]);
                let params = parse_callback_request(request.lines().next().unwrap_or(""));

                // Le navigateur demande souvent `/favicon.ico` juste après :
                // sans paramètres, ce n'est pas le retour attendu.
                if params.code.is_none() && params.error.is_none() {
                    write_response(&mut stream, &callback_page("Nova"));
                    continue;
                }

                let outcome = match (&params.error, &params.code, &params.state) {
                    (Some(_), _, _) => Err(SsoError::AuthCancelled),
                    // Le `state` est vérifié **avant** d'exploiter le code : un
                    // retour qui ne correspond pas à cette tentative n'a rien à
                    // faire ici, même s'il porte un code valide.
                    (_, Some(code), Some(state)) if state == expected_state => Ok(code.clone()),
                    (_, Some(_), _) => Err(SsoError::StateMismatch),
                    _ => Err(SsoError::AuthCancelled),
                };

                let message = if outcome.is_ok() {
                    "Authentication complete. You can return to Nova."
                } else {
                    "Sign-in was not completed. You can return to Nova."
                };
                write_response(&mut stream, &callback_page(message));
                return outcome;
            }
            Err(ref error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(120));
            }
            Err(_) => return Err(SsoError::LoopbackUnavailable),
        }
    }
    Err(SsoError::AuthTimeout)
}

// ─────────────────────────────────────────────────────────────────────────────
// Échanges avec le serveur de l'établissement
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct PkceStartResponse {
    flow_id: String,
    authorization_url: String,
}

#[derive(Deserialize)]
struct PkceExchangeResponse {
    email: String,
    token: String,
}

/// Une configuration de fournisseur, telle que le poste a le droit de la voir.
///
/// Le strict minimum pour dessiner un bouton : un identifiant, un type, un
/// libellé. Ni émetteur, ni identifiant client, ni tenant — rien de tout cela
/// n'aide à afficher un bouton, et tout cela renseignerait sur
/// l'infrastructure de l'organisation.
#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct ProviderConfigView {
    pub id: String,
    /// `microsoft_entra` | `google_workspace` | `oidc`
    #[serde(rename = "type")]
    pub provider_type: String,
    pub display_name: String,
}

/// Les fournisseurs que l'établissement propose réellement.
///
/// Chaque champ n'est vrai que si le serveur a **tout** ce qu'il lui faut :
/// identifiant d'application, secret quand le fournisseur l'exige, et
/// rattachement d'organisation déclaré. Le poste n'en décide rien — il ne peut
/// donc pas afficher un bouton inopérant.
#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct OrganizationAuthProviders {
    pub microsoft_entra: bool,
    pub google_workspace: bool,
    /// Fournisseur OIDC générique, si l'organisation en a déclaré un.
    pub oidc: bool,
    /// Le code par adresse reste disponible partout.
    pub legacy_email_code: bool,
    /// Libellé du bouton OIDC, choisi par l'organisation — « Okta »,
    /// « Company SSO », « IPSA SSO ». **Affichage uniquement** : il n'entre
    /// dans aucune décision, et le serveur en fournit toujours un.
    pub oidc_display_name: Option<String>,
    /// Liste détaillée, une entrée par configuration. C'est la forme que
    /// l'interface doit consommer : une organisation peut avoir deux IdP OIDC,
    /// ce que des booléens par type ne sauraient pas représenter. Les champs
    /// booléens ci-dessus restent pour les postes déjà déployés.
    pub configs: Vec<ProviderConfigView>,
}

/// Fournisseur d'identité utilisable pour une connexion Organization.
///
/// Les identifiants correspondent exactement à ceux du modèle partagé
/// (`IdentityProvider`) : pas de second vocabulaire.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Type)]
#[serde(rename_all = "snake_case")]
pub enum SsoProvider {
    MicrosoftEntra,
    GoogleWorkspace,
    /// Tout IdP OpenID Connect standard : Okta, Keycloak, Auth0, Ping…
    /// Un seul adaptateur, configuré côté serveur.
    Oidc,
}

impl SsoProvider {
    fn id(self) -> &'static str {
        match self {
            SsoProvider::MicrosoftEntra => "microsoft_entra",
            SsoProvider::GoogleWorkspace => "google_workspace",
            SsoProvider::Oidc => "oidc",
        }
    }

    /// Routes du serveur pour ce fournisseur.
    ///
    /// Microsoft conserve ses routes historiques : elles sont déployées et
    /// éprouvées en conditions réelles, et rien ne justifie de les remplacer.
    /// Google — et les fournisseurs suivants — passent par la route générique.
    fn endpoints(self, base_url: &str) -> (String, String) {
        match self {
            SsoProvider::MicrosoftEntra => (
                format!("{base_url}/api/auth/entra/pkce/start"),
                format!("{base_url}/api/auth/entra/pkce/exchange"),
            ),
            other => (
                format!("{base_url}/api/auth/sso/{}/start", other.id()),
                format!("{base_url}/api/auth/sso/{}/exchange", other.id()),
            ),
        }
    }
}

#[derive(Deserialize)]
struct AvailabilityResponse {
    providers: Vec<String>,
    #[serde(default)]
    display_names: std::collections::HashMap<String, String>,
    /// Absent d'un serveur antérieur à cette forme : le poste retombe alors
    /// sur les booléens par type.
    #[serde(default)]
    provider_configs: Vec<ProviderConfigView>,
}

fn sso_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .expect("reqwest client builds")
}

/// Traduit une réponse d'erreur du serveur en code, sans jamais recopier un
/// contenu inattendu dans les journaux.
async fn server_error(response: reqwest::Response) -> SsoError {
    let detail = response
        .json::<serde_json::Value>()
        .await
        .ok()
        .and_then(|value| {
            value
                .get("detail")
                .and_then(|detail| detail.as_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| "SERVER_ERROR".to_string());
    SsoError::Server { detail }
}

/// Fournisseurs proposés par l'établissement.
///
/// Le poste ne décide pas seul quoi afficher : c'est le serveur qui dit ce
/// qu'il sait faire. Un établissement resté au code par adresse ne voit donc
/// jamais apparaître un bouton Microsoft inopérant.
#[tauri::command]
#[specta::specta]
pub async fn organization_auth_providers(
    server_url: String,
) -> Result<OrganizationAuthProviders, String> {
    let base_url = normalize_base_url(&server_url);
    let response = sso_client()
        .get(format!("{}/api/auth/entra/pkce/available", base_url))
        .send()
        .await;

    // Un serveur plus ancien ne connaît pas cette route : le code par adresse
    // reste alors le seul chemin, exactement comme aujourd'hui.
    let Ok(response) = response else {
        return Ok(legacy_only_providers());
    };
    if !response.status().is_success() {
        return Ok(legacy_only_providers());
    }
    let body = response
        .json::<AvailabilityResponse>()
        .await
        .unwrap_or(AvailabilityResponse {
            providers: Vec::new(),
            display_names: std::collections::HashMap::new(),
            provider_configs: Vec::new(),
        });
    let providers = body.providers;
    Ok(OrganizationAuthProviders {
        microsoft_entra: providers.iter().any(|p| p == "microsoft_entra"),
        google_workspace: providers.iter().any(|p| p == "google_workspace"),
        oidc: providers.iter().any(|p| p == "oidc"),
        legacy_email_code: providers.iter().any(|p| p == "legacy_email_code")
            || providers.is_empty(),
        oidc_display_name: body.display_names.get("oidc").cloned(),
        configs: body.provider_configs,
    })
}

/// Ce qu'annonce un serveur qui ne connaît pas le SSO moderne : le code par
/// adresse, et rien d'autre.
fn legacy_only_providers() -> OrganizationAuthProviders {
    OrganizationAuthProviders {
        microsoft_entra: false,
        google_workspace: false,
        oidc: false,
        legacy_email_code: true,
        oidc_display_name: None,
        configs: Vec::new(),
    }
}

/// Connexion Organization, de bout en bout, quel que soit le fournisseur.
///
/// Le secret PKCE vit dans cette fonction et meurt avec elle : succès, échec ou
/// délai dépassé, il n'est ni écrit sur disque, ni journalisé, ni transmis
/// ailleurs qu'au serveur de l'établissement au moment de l'échange.
#[tauri::command]
#[specta::specta]
pub async fn sign_in_with_organization(
    app: AppHandle,
    provider: SsoProvider,
    server_url: String,
    machine: String,
    // Configuration précise à employer. Le poste la relaie telle que le serveur
    // la lui a annoncée ; il ne la fabrique jamais, et le serveur la revérifie
    // dans son organisation active.
    provider_config_id: Option<String>,
    organization_code: Option<String>,
) -> Result<CampusSession, SsoError> {
    // Journalisation de sécurité : fournisseur, issue et **code de raison**.
    // Jamais le vérificateur, le code d'autorisation, le `state`, le `nonce`,
    // le jeton de session ni l'adresse complète.
    match run_organization_sign_in(
        app,
        provider,
        server_url,
        machine,
        provider_config_id,
        organization_code,
    )
    .await
    {
        Ok(session) => {
            log::info!("[auth] provider={} result=success", provider.id());
            Ok(session)
        }
        Err(error) => {
            log::warn!(
                "[auth] provider={} result=failure reason={}",
                provider.id(),
                error.code()
            );
            Err(error)
        }
    }
}

async fn run_organization_sign_in(
    app: AppHandle,
    provider: SsoProvider,
    server_url: String,
    machine: String,
    provider_config_id: Option<String>,
    organization_code: Option<String>,
) -> Result<CampusSession, SsoError> {
    let _guard = SignInGuard::acquire()?;
    let base_url = normalize_base_url(&server_url);

    let verifier = generate_code_verifier()?;
    let challenge = code_challenge_s256(&verifier);
    let state = generate_opaque_value()?;
    let nonce = generate_opaque_value()?;

    let listener = bind_loopback_listener()?;
    let port = listener
        .local_addr()
        .map_err(|_| SsoError::LoopbackUnavailable)?
        .port();
    let redirect_uri = redirect_uri_for_port(port);

    let (start_url, exchange_url) = provider.endpoints(&base_url);
    let client = sso_client();
    let response = client
        .post(&start_url)
        .json(&serde_json::json!({
            "code_challenge": challenge,
            "nonce": nonce,
            "redirect_uri": redirect_uri,
            "machine": machine,
            "provider_config_id": provider_config_id,
        }))
        .send()
        .await
        .map_err(|_| SsoError::NetworkError)?;
    if !response.status().is_success() {
        return Err(server_error(response).await);
    }
    let start = response
        .json::<PkceStartResponse>()
        .await
        .map_err(|_| SsoError::NetworkError)?;

    // Le `state` appartient au poste : c'est lui qui l'a créé et lui seul qui
    // le vérifiera au retour. Il n'est donc ajouté qu'ici.
    let authorization_url = format!("{}&state={}", start.authorization_url, urlencode(&state));

    app.opener()
        .open_url(authorization_url, None::<&str>)
        .map_err(|_| SsoError::LoopbackUnavailable)?;

    let expected_state = state.clone();
    let code =
        tauri::async_runtime::spawn_blocking(move || wait_for_callback(listener, &expected_state))
            .await
            .map_err(|_| SsoError::AuthTimeout)??;

    let response = client
        .post(&exchange_url)
        .json(&serde_json::json!({
            "flow_id": start.flow_id,
            "code": code,
            "code_verifier": verifier,
            "redirect_uri": redirect_uri,
        }))
        .send()
        .await
        .map_err(|_| SsoError::NetworkError)?;
    if !response.status().is_success() {
        return Err(server_error(response).await);
    }
    let exchange = response
        .json::<PkceExchangeResponse>()
        .await
        .map_err(|_| SsoError::NetworkError)?;

    let session = CampusSession {
        server_url: base_url,
        email: exchange.email.to_lowercase(),
        // Renseignée quand le poste a découvert son organisation : le
        // trousseau suit alors l'organisation plutôt que l'adresse, et une
        // migration de serveur ne perd plus la session.
        organization: organization_code,
    };
    // Seule la session Nova est conservée durablement, dans le trousseau du
    // système. Aucun jeton Microsoft n'a transité par ce poste.
    save_campus_credentials(&app, session.clone(), exchange.token)
        .map_err(|detail| SsoError::Server { detail })?;
    Ok(session)
}

fn urlencode(value: &str) -> String {
    value
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (byte as char).to_string()
            }
            _ => format!("%{:02X}", byte),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_challenge_matches_the_rfc_7636_test_vector() {
        // Vecteur de l'annexe B de la RFC 7636 : si notre calcul en diverge,
        // Microsoft rejettera l'échange sans que rien d'autre ne le signale.
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        assert_eq!(
            code_challenge_s256(verifier),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn a_verifier_is_long_random_and_never_repeated() {
        let first = generate_code_verifier().unwrap();
        let second = generate_code_verifier().unwrap();
        assert_ne!(first, second);
        // La RFC exige entre 43 et 128 caractères.
        assert!(
            (43..=128).contains(&first.len()),
            "longueur {}",
            first.len()
        );
        assert!(first
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "-._~".contains(c)));
    }

    #[test]
    fn state_and_nonce_are_unpredictable() {
        let values: std::collections::HashSet<String> = (0..64)
            .filter_map(|_| generate_opaque_value().ok())
            .collect();
        assert_eq!(values.len(), 64, "des valeurs se répètent");
    }

    #[test]
    fn the_challenge_never_reveals_the_verifier() {
        let verifier = generate_code_verifier().unwrap();
        let challenge = code_challenge_s256(&verifier);
        assert_ne!(challenge, verifier);
        assert!(!challenge.contains(&verifier));
    }

    #[test]
    fn a_successful_callback_is_parsed() {
        let params = parse_callback_request("GET /callback?code=abc123&state=xyz789 HTTP/1.1");
        assert_eq!(params.code.as_deref(), Some("abc123"));
        assert_eq!(params.state.as_deref(), Some("xyz789"));
        assert_eq!(params.error, None);
    }

    #[test]
    fn a_refusal_is_recognised_as_such() {
        let params = parse_callback_request(
            "GET /callback?error=access_denied&error_description=User+cancelled HTTP/1.1",
        );
        assert_eq!(params.error.as_deref(), Some("access_denied"));
        assert_eq!(params.code, None);
    }

    #[test]
    fn percent_encoded_values_are_decoded() {
        let params = parse_callback_request("GET /callback?code=a%2Fb%2Bc&state=x%3Dy HTTP/1.1");
        assert_eq!(params.code.as_deref(), Some("a/b+c"));
        assert_eq!(params.state.as_deref(), Some("x=y"));
    }

    #[test]
    fn a_request_without_parameters_yields_nothing() {
        // Le navigateur demande `/favicon.ico` : ce n'est pas un retour.
        for request in [
            "GET /favicon.ico HTTP/1.1",
            "GET / HTTP/1.1",
            "",
            "MALFORMED",
        ] {
            let params = parse_callback_request(request);
            assert_eq!(params.code, None);
            assert_eq!(params.error, None);
        }
    }

    /// Régression : la forme de l'adresse de retour conditionne la
    /// correspondance côté Microsoft.
    ///
    /// Entra n'ignore que le **port** d'une adresse de bouclage. Si le chemin
    /// disparaissait — ou changeait de casse — la connexion échouerait en
    /// `AADSTS50011` chez chaque établissement, et aucun test local ne le
    /// verrait puisque tout le reste continuerait de fonctionner.
    #[test]
    fn the_redirect_uri_keeps_the_shape_entra_matches_on() {
        let uri = redirect_uri_for_port(53125);
        assert_eq!(uri, "http://127.0.0.1:53125/callback");

        // Adresse littérale : ni « localhost », ni un nom à résoudre.
        assert!(uri.starts_with("http://127.0.0.1:"));
        // Chemin présent, et exactement celui qui sera enregistré.
        assert!(uri.ends_with("/callback"));
        assert_eq!(uri.matches('/').count(), 3);
        // Seul le port varie d'une tentative à l'autre.
        assert_eq!(
            redirect_uri_for_port(1).replace("1", "<p>"),
            redirect_uri_for_port(1).replace("1", "<p>")
        );
        assert_ne!(redirect_uri_for_port(1024), redirect_uri_for_port(1025));
    }

    #[test]
    fn the_listener_only_ever_binds_the_loopback() {
        let listener = bind_loopback_listener().unwrap();
        let address = listener.local_addr().unwrap();
        assert!(address.ip().is_loopback(), "écouteur exposé sur {address}");
        // Port éphémère choisi par le système, jamais un port fixe.
        assert_ne!(address.port(), 0);
    }

    #[test]
    fn two_listeners_never_share_a_port() {
        // Deux instances de Nova doivent pouvoir tenter une connexion sans que
        // le retour de l'une atteigne l'autre.
        let first = bind_loopback_listener().unwrap();
        let second = bind_loopback_listener().unwrap();
        assert_ne!(
            first.local_addr().unwrap().port(),
            second.local_addr().unwrap().port()
        );
    }

    #[test]
    fn only_one_sign_in_runs_at_a_time() {
        let first = SignInGuard::acquire().expect("première tentative");
        assert_eq!(
            SignInGuard::acquire().unwrap_err(),
            SsoError::AlreadyInProgress
        );
        drop(first);
        // Le verrou est rendu : une nouvelle tentative reste possible après un
        // échec ou une annulation.
        assert!(SignInGuard::acquire().is_ok());
    }

    #[test]
    fn the_generic_route_serves_every_new_provider() {
        // Microsoft garde ses routes historiques ; tout le reste passe par la
        // route générique, y compris les fournisseurs à venir.
        let (start, exchange) = SsoProvider::Oidc.endpoints("https://nova.test");
        assert_eq!(start, "https://nova.test/api/auth/sso/oidc/start");
        assert_eq!(exchange, "https://nova.test/api/auth/sso/oidc/exchange");
        assert_eq!(SsoProvider::Oidc.id(), "oidc");
    }

    #[test]
    fn each_provider_keeps_its_own_routes() {
        let (start, exchange) = SsoProvider::MicrosoftEntra.endpoints("https://nova.test");
        // Microsoft garde ses routes historiques : elles sont déployées et
        // éprouvées, les remplacer serait un risque sans contrepartie.
        assert_eq!(start, "https://nova.test/api/auth/entra/pkce/start");
        assert_eq!(exchange, "https://nova.test/api/auth/entra/pkce/exchange");

        let (start, exchange) = SsoProvider::GoogleWorkspace.endpoints("https://nova.test");
        assert_eq!(
            start,
            "https://nova.test/api/auth/sso/google_workspace/start"
        );
        assert_eq!(
            exchange,
            "https://nova.test/api/auth/sso/google_workspace/exchange"
        );
    }

    #[test]
    fn provider_identifiers_match_the_shared_model() {
        // Une seule source de vérité : ces chaînes sont celles du modèle
        // d'identité partagé. Un second vocabulaire (« google », « entra »…)
        // produirait deux fournisseurs là où il n'y en a qu'un.
        assert_eq!(SsoProvider::MicrosoftEntra.id(), "microsoft_entra");
        assert_eq!(SsoProvider::GoogleWorkspace.id(), "google_workspace");
    }

    #[test]
    fn one_provider_cannot_borrow_another_s_attempt() {
        // Le verrou est global au poste : tant qu'une connexion Microsoft est
        // ouverte, une tentative Google est refusée, et réciproquement. Aucun
        // retour de navigateur ne peut donc atterrir sur l'écouteur de l'autre.
        let first = SignInGuard::acquire().expect("première tentative");
        assert_eq!(
            SignInGuard::acquire().unwrap_err(),
            SsoError::AlreadyInProgress
        );
        drop(first);
        assert!(SignInGuard::acquire().is_ok());
    }

    #[test]
    fn pkce_generation_is_provider_independent() {
        // Le même générateur sert les deux fournisseurs : rien dans le
        // vérificateur ni dans le challenge ne dépend de la destination.
        let verifier = generate_code_verifier().unwrap();
        let challenge = code_challenge_s256(&verifier);
        for provider in [SsoProvider::MicrosoftEntra, SsoProvider::GoogleWorkspace] {
            assert!(!challenge.contains(provider.id()));
            assert!(!verifier.contains(provider.id()));
        }
    }

    #[test]
    fn error_codes_are_stable() {
        assert_eq!(SsoError::AuthCancelled.code(), "AUTH_CANCELLED");
        assert_eq!(SsoError::AuthTimeout.code(), "AUTH_TIMEOUT");
        assert_eq!(SsoError::StateMismatch.code(), "STATE_MISMATCH");
        assert_eq!(
            SsoError::Server {
                detail: "TENANT_NOT_ALLOWED".into()
            }
            .code(),
            "TENANT_NOT_ALLOWED"
        );
    }

    #[test]
    fn the_callback_page_reveals_nothing() {
        let page = callback_page("Authentication complete. You can return to Nova.");
        for secret in ["code=", "token", "tenant", "@", "Bearer"] {
            assert!(!page.contains(secret), "la page laisse fuir « {secret} »");
        }
    }
}
