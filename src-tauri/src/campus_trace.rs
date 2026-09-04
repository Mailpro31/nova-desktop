//! Trace de diagnostic des requêtes Campus/Lab — **expurgée par construction**.
//!
//! ## Pourquoi ce module existe
//!
//! Le serveur Lab a répondu `HTTP 400 Bad Request: Invalid HTTP request
//! received.` à une dictée. Ce message ne dit ni quelle requête, ni comment
//! elle était formée — et sans cela on ne peut que deviner. Il manquait la
//! forme de la requête : sa méthode, son chemin, sa version HTTP, et surtout
//! la manière dont son corps était annoncé (`Content-Length` ? `chunked` ?
//! `Expect: 100-continue` ?), qui est exactement ce qu'une passerelle
//! pointilleuse peut refuser.
//!
//! ## Ce qui ne peut pas fuir
//!
//! La règle n'est pas « penser à masquer » : c'est **ne jamais lire** ce qu'on
//! ne doit pas écrire. Ce module n'accède à aucune valeur d'en-tête. Il ne sait
//! répondre qu'à « cet en-tête est-il présent ? » pour trois noms précis, et ne
//! recopie que des grandeurs : un statut, une taille, un type MIME sans ses
//! paramètres.
//!
//! `Authorization`, `X-Nova-Lab-Device`, le certificat épinglé, le code
//! d'invitation et l'OTP ne sont donc pas « filtrés » — ils ne traversent
//! jamais ce code. Un en-tête inconnu n'est pas non plus journalisé : ajouter
//! un secret ailleurs ne peut pas le faire apparaître ici par accident.
//!
//! La seule valeur d'en-tête effectivement lue est `Content-Type`, réduite à sa
//! partie type/sous-type — le paramètre `boundary` d'un multipart est écarté,
//! non parce qu'il serait secret, mais parce qu'il change à chaque requête et
//! n'apprend rien.

/// Ce qu'on écrit à la place de toute valeur qu'on refuse de connaître.
pub const REDACTED: &str = "[REDACTED]";

/// En-têtes dont la **présence** est un signal de diagnostic utile. Leur valeur
/// ne l'est pas, et n'est jamais lue.
const OBSERVED_HEADERS: [&str; 3] = ["content-length", "transfer-encoding", "expect"];

/// La forme d'une requête sortante, sans son contenu.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestShape {
    pub method: String,
    /// Chemin seul : ni hôte, ni port, ni chaîne de requête.
    pub path: String,
    pub version: String,
    /// `content-length`, `transfer-encoding`, `expect` — présence uniquement.
    pub headers_present: Vec<&'static str>,
    /// Type MIME sans paramètres, `None` si l'en-tête est absent.
    pub mime: Option<String>,
    /// Taille du corps HTTP **complet**, enveloppe multipart comprise.
    pub body_bytes: Option<u64>,
    /// Taille de la charge utile seule — l'audio, sans l'enveloppe.
    ///
    /// Les deux sont journalisees separement parce que leur ecart est
    /// exactement ce qui a mis six heures a se voir : le poste annoncait la
    /// taille de l'audio et envoyait l'enveloppe en plus. Un ecart nul, ou
    /// aberrant, se lit desormais d'un coup d'oeil.
    pub audio_bytes: Option<u64>,
}

impl RequestShape {
    /// Lit la forme d'une requête déjà construite.
    ///
    /// Prend la requête bâtie plutôt que le constructeur : c'est le seul moyen
    /// d'observer ce qui partira réellement sur le réseau, en-têtes ajoutés par
    /// reqwest compris. Deviner à la place aurait produit un diagnostic sur une
    /// requête imaginaire.
    pub fn observe(request: &reqwest::Request) -> Self {
        let headers = request.headers();

        let headers_present = OBSERVED_HEADERS
            .iter()
            .filter(|name| headers.contains_key(**name))
            .copied()
            .collect();

        // Seule valeur d'en-tête lue, et amputée de ses paramètres.
        let mime = headers
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(|value| value.split(';').next().unwrap_or(value).trim().to_string());

        let body_bytes = request
            .body()
            .and_then(|body| body.as_bytes())
            .map(|bytes| bytes.len() as u64)
            .or_else(|| {
                headers
                    .get(reqwest::header::CONTENT_LENGTH)
                    .and_then(|value| value.to_str().ok())
                    .and_then(|value| value.parse::<u64>().ok())
            });

        Self {
            method: request.method().as_str().to_string(),
            path: request.url().path().to_string(),
            version: format!("{:?}", request.version()),
            headers_present,
            mime,
            body_bytes,
            audio_bytes: None,
        }
    }

    /// Renseigne la taille de la charge utile, quand l'appelant la connait.
    pub fn with_audio_bytes(mut self, audio_bytes: Option<u64>) -> Self {
        self.audio_bytes = audio_bytes;
        self
    }

    /// Une ligne de journal, sans rien à masquer après coup.
    pub fn render(&self) -> String {
        let present = if self.headers_present.is_empty() {
            "none".to_string()
        } else {
            self.headers_present.join(",")
        };
        // L'enveloppe est affichee explicitement : c'est la grandeur qui
        // manquait, et une valeur nulle signale immediatement le defaut ou le
        // `Content-Length` etait celui du seul fichier.
        let payload = match (self.audio_bytes, self.body_bytes) {
            (Some(audio), Some(body)) => format!(
                "audio={audio}B body={body}B envelope={}B",
                body.saturating_sub(audio)
            ),
            (Some(audio), None) => format!("audio={audio}B body=unknown"),
            (None, Some(body)) => format!("body={body}B"),
            (None, None) => "body=unknown".to_string(),
        };
        format!(
            "campus request {method} {path} {version} headers[{present}] mime={mime} {payload} auth={redacted}",
            method = self.method,
            path = self.path,
            version = self.version,
            present = present,
            mime = self.mime.as_deref().unwrap_or("none"),
            payload = payload,
            redacted = REDACTED,
        )
    }
}

/// Ce que la requête a donné.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RequestOutcome {
    /// Le serveur a répondu, avec ce code.
    Status(u16),
    /// La requête n'a pas abouti. Le libellé est une **catégorie**, jamais le
    /// message brut : une erreur de transport peut citer l'URL, un en-tête ou
    /// un certificat, et rien n'oblige à en prendre le risque.
    Transport(&'static str),
}

impl RequestOutcome {
    /// Classe une erreur reqwest sans recopier son message.
    pub fn from_error(error: &reqwest::Error) -> Self {
        let kind = if error.is_connect() {
            "connect"
        } else if error.is_timeout() {
            "timeout"
        } else if error.is_request() {
            "request"
        } else if error.is_body() {
            "body"
        } else if error.is_decode() {
            "decode"
        } else {
            "other"
        };
        RequestOutcome::Transport(kind)
    }

    pub fn render(&self) -> String {
        match self {
            RequestOutcome::Status(code) => format!("campus response status={code}"),
            RequestOutcome::Transport(kind) => {
                format!("campus response transport-error={kind} detail={REDACTED}")
            }
        }
    }
}

/// Journalise la forme d'une requête. Niveau `debug` : le diagnostic est un
/// outil d'enquête, pas une trace de fonctionnement normal.
pub fn log_request(shape: &RequestShape) {
    log::debug!("{}", shape.render());
}

/// Journalise l'issue d'une requête.
pub fn log_outcome(outcome: &RequestOutcome) {
    log::debug!("{}", outcome.render());
}

#[cfg(test)]
mod tests {
    use super::*;

    fn multipart_request() -> reqwest::Request {
        let form = reqwest::multipart::Form::new().part(
            "file",
            reqwest::multipart::Part::bytes(vec![0u8; 2048])
                .file_name("recording.wav")
                .mime_str("audio/wav")
                .expect("mime valide"),
        );
        reqwest::Client::new()
            .post("https://192.168.0.26:8443/api/transcribe")
            .header(
                reqwest::header::AUTHORIZATION,
                "Bearer un-jeton-tres-secret",
            )
            .header("X-Nova-Lab-Device", "jeton-de-peripherique-secret")
            .header(reqwest::header::EXPECT, "100-continue")
            .multipart(form)
            .build()
            .expect("requete constructible")
    }

    #[test]
    fn la_forme_decrit_la_requete_sans_son_contenu() {
        let shape = RequestShape::observe(&multipart_request());

        assert_eq!(shape.method, "POST");
        assert_eq!(shape.path, "/api/transcribe");
        assert_eq!(shape.version, "HTTP/1.1");
        assert_eq!(shape.mime.as_deref(), Some("multipart/form-data"));
        assert!(shape.headers_present.contains(&"expect"));
    }

    #[test]
    fn aucun_secret_ne_peut_atteindre_le_journal() {
        // Les valeurs sensibles sont posées sur la requête ci-dessus ; la
        // trace rendue ne doit en porter aucune trace, ni en clair ni en
        // fragment.
        let rendered = RequestShape::observe(&multipart_request()).render();

        for secret in [
            "un-jeton-tres-secret",
            "Bearer",
            "jeton-de-peripherique-secret",
            "X-Nova-Lab-Device",
            "Authorization",
            "authorization",
            "192.168.0.26",
        ] {
            assert!(
                !rendered.contains(secret),
                "la trace a laissé fuir « {secret} » : {rendered}"
            );
        }
        assert!(rendered.contains(REDACTED));
    }

    #[test]
    fn le_parametre_boundary_est_ecarte() {
        // `boundary` n'est pas un secret, mais il change à chaque requête et
        // rendrait deux traces incomparables.
        let rendered = RequestShape::observe(&multipart_request()).render();
        assert!(!rendered.contains("boundary"));
    }

    #[test]
    fn la_taille_du_multipart_est_reportee() {
        let shape = RequestShape::observe(&multipart_request());
        let bytes = shape
            .body_bytes
            .expect("taille connue pour un multipart figé");
        // Les 2048 octets utiles, plus l'encadrement multipart.
        assert!(bytes > 2048, "taille inattendue : {bytes}");
    }

    #[test]
    fn labsence_den_tete_est_une_information() {
        let request = reqwest::Client::new()
            .get("https://192.168.0.26:8443/api/health")
            .build()
            .expect("requete constructible");
        let shape = RequestShape::observe(&request);

        assert!(shape.headers_present.is_empty());
        assert_eq!(shape.mime, None);
        assert!(shape.render().contains("headers[none]"));
    }

    #[test]
    fn lissue_ne_recopie_jamais_le_message_derreur() {
        assert_eq!(
            RequestOutcome::Status(400).render(),
            "campus response status=400"
        );
        let rendered = RequestOutcome::Transport("connect").render();
        assert!(rendered.contains("transport-error=connect"));
        assert!(rendered.contains(REDACTED));
    }
}
