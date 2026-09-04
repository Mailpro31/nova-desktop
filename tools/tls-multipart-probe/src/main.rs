//! Sonde réseau : ce que reqwest écrit réellement sur un transport TLS épinglé.
//!
//! ## Pourquoi une crate à part
//!
//! Le test équivalent, dans `handy`, ne peut pas s'exécuter sur le poste
//! Windows : son binaire de test embarque le moteur audio et ONNX, et ne se
//! charge pas (`STATUS_ENTRYPOINT_NOT_FOUND`). Or c'est précisément Windows
//! qu'il faut observer — la CI tourne sous Linux, où `native-tls` s'appuie sur
//! OpenSSL, tandis que Windows utilise **Schannel**. Deux implémentations
//! différentes, et une seule échoue.
//!
//! Cette sonde ne dépend donc ni du moteur audio, ni d'ONNX, ni de Tauri. Elle
//! reproduit trois choses et rien d'autre : la configuration exacte du client
//! de `campus_client`, l'assemblage exact du multipart de
//! `build_audio_multipart`, et un serveur TLS qui compte les octets
//! **déchiffrés**.
//!
//! ## Ce qu'elle ne journalise pas
//!
//! Aucun secret. Les jetons employés sont factices et ne sont jamais affichés.
//! La sonde n'imprime que des grandeurs : un protocole négocié, une longueur
//! déclarée, un nombre d'octets.
//!
//! ## Usage
//!
//! ```text
//! cargo run --release -- native    # Schannel sur Windows, OpenSSL sur Linux
//! cargo run --release -- rustls    # même sonde, moteur rustls
//! ```

use std::sync::Arc;
use std::time::Duration;

use base64::Engine as _;
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// Paire jetable, sans usage hors de cette sonde.
const CERT_DER_B64: &str = concat!(
    "MIIBVzCB/aADAgECAgIQkjAKBggqhkjOPQQDAjAcMRowGAYDVQQDDBFub3ZhLWxhYi10bHMtdGVz",
    "dDAeFw0yNjAxMDEwMDAwMDBaFw00NjAxMDEwMDAwMDBaMBwxGjAYBgNVBAMMEW5vdmEtbGFiLXRs",
    "cy10ZXN0MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEm2Ih3DvqRLTbrTNVZeBpYTOTITxip/bI",
    "x9QtHiAnDgRa5vLHsSNab12qRCSZtQ2J3Dk0zyqLwEm9vQJOJKSDR6MvMC0wDwYDVR0TAQH/BAUw",
    "AwEB/zAaBgNVHREEEzARhwR/AAABgglsb2NhbGhvc3QwCgYIKoZIzj0EAwIDSQAwRgIhAPyq7POD",
    "oCNxtowibd/Ja5Ay7cS89BL94vkszuexy3wJAiEA/fgmsr6y4DsTB0X/c+IIUx1gMCoG0+PuZey5",
    "OB5QtAM=",
);
const KEY_PKCS8_B64: &str = concat!(
    "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgYgMrFb47pivsnZ/lwwBNaKVyBJJZ",
    "RNQbC3YtaQuyUs6hRANCAASbYiHcO+pEtNutM1Vl4GlhM5MhPGKn9sjH1C0eICcOBFrm8sexI1pv",
    "XapEJJm1DYncOTTPKovASb29Ak4kpINH",
);

/// Taille de la dictée réelle qui a échoué le 02/09 à 12:16:26.
const AUDIO_BYTES: usize = 373_484;

/// Jetons factices. Ils existent pour reproduire la taille et la forme des
/// en-têtes du client réel, pas pour authentifier quoi que ce soit.
const FAKE_SESSION_TOKEN: &str = "jeton-de-session-factice-pour-la-sonde";
const FAKE_DEVICE_TOKEN: &str = "jeton-de-peripherique-factice-pour-la-sonde";

fn decode(value: &str) -> Vec<u8> {
    base64::engine::general_purpose::STANDARD
        .decode(value)
        .expect("vecteur décodable")
}

// ─────────────────────────────────────────────────────────────────────────────
// Copie fidèle de `build_audio_multipart` (src-tauri/src/commands/campus.rs).
// Toute divergence ici invaliderait la sonde.
// ─────────────────────────────────────────────────────────────────────────────

struct AudioMultipart {
    content_type: String,
    body: Vec<u8>,
    audio_bytes: usize,
}

fn multipart_boundary(audio_len: usize) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let seed = format!("{nanos}:{audio_len}:{:p}", &audio_len as *const usize);
    format!("nova{:x}", Sha256::digest(seed.as_bytes()))[..36].to_string()
}

fn build_audio_multipart(
    field_name: &str,
    file_name: &str,
    mime: &str,
    audio: &[u8],
) -> AudioMultipart {
    let boundary = multipart_boundary(audio.len());
    let header = format!(
        "--{boundary}\r\n\
         Content-Disposition: form-data; name=\"{field_name}\"; filename=\"{file_name}\"\r\n\
         Content-Type: {mime}\r\n\
         \r\n"
    );
    let trailer = format!("\r\n--{boundary}--\r\n");

    let mut body = Vec::with_capacity(header.len() + audio.len() + trailer.len());
    body.extend_from_slice(header.as_bytes());
    body.extend_from_slice(audio);
    body.extend_from_slice(trailer.as_bytes());

    AudioMultipart {
        content_type: format!("multipart/form-data; boundary={boundary}"),
        body,
        audio_bytes: audio.len(),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Copie fidèle de `campus_request_client_with_timeout`, branche Lab.
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Clone, Copy, PartialEq, Eq)]
enum Engine {
    Native,
    Rustls,
}

impl Engine {
    fn label(self) -> &'static str {
        match self {
            // Sur Windows `native-tls` est Schannel ; sur Linux, OpenSSL.
            Engine::Native => "native-tls (Schannel sur Windows, OpenSSL sur Linux)",
            Engine::Rustls => "rustls",
        }
    }
}

fn campus_client(engine: Engine, certificate_der: &[u8]) -> reqwest::Client {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::AUTHORIZATION,
        format!("Bearer {FAKE_SESSION_TOKEN}")
            .parse()
            .expect("en-tête valide"),
    );
    headers.insert(
        "X-Nova-Lab-Device",
        FAKE_DEVICE_TOKEN.parse().expect("en-tête valide"),
    );

    let certificate =
        reqwest::Certificate::from_der(certificate_der).expect("certificat épinglé lisible");

    let builder = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .https_only(true)
        .tls_built_in_root_certs(false)
        .add_root_certificate(certificate)
        .default_headers(headers);

    let builder = match engine {
        Engine::Native => builder.use_native_tls(),
        Engine::Rustls => builder.use_rustls_tls(),
    };

    builder.build().expect("client construit")
}

// ─────────────────────────────────────────────────────────────────────────────
// Serveur TLS d'observation.
// ─────────────────────────────────────────────────────────────────────────────

struct Observation {
    alpn: Option<String>,
    header_bytes: usize,
    announced: u64,
    body_read: usize,
    /// Octets déchiffrés arrivés **après** le corps déclaré.
    trailing: usize,
}

async fn observe(listener: tokio::net::TcpListener) -> Observation {
    let certificate = tokio_rustls::rustls::pki_types::CertificateDer::from(decode(CERT_DER_B64));
    let key = tokio_rustls::rustls::pki_types::PrivateKeyDer::try_from(decode(KEY_PKCS8_B64))
        .expect("clé privée lisible");
    let mut config = tokio_rustls::rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(vec![certificate], key)
        .expect("configuration TLS");
    config.alpn_protocols = vec![b"h2".to_vec(), b"http/1.1".to_vec()];
    let acceptor = tokio_rustls::TlsAcceptor::from(Arc::new(config));

    let step = Duration::from_secs(20);
    let (socket, _) = tokio::time::timeout(step, listener.accept())
        .await
        .expect("aucune connexion TCP dans le délai")
        .expect("connexion TCP");
    let mut stream = tokio::time::timeout(step, acceptor.accept(socket))
        .await
        .expect("poignée de main TLS non aboutie")
        .expect("poignée de main TLS");
    let alpn = stream
        .get_ref()
        .1
        .alpn_protocol()
        .map(|p| String::from_utf8_lossy(p).to_string());

    let mut buffer = Vec::new();
    let mut chunk = vec![0u8; 65536];

    let early_400 = std::env::args().any(|a| a == "--early-400");

    let header_end = loop {
        if let Some(at) = buffer.windows(4).position(|w| w == b"\r\n\r\n") {
            break at + 4;
        }
        let read = tokio::time::timeout(step, stream.read(&mut chunk))
            .await
            .expect("aucun en-tête reçu dans le délai")
            .expect("lecture des en-têtes");
        assert!(read > 0, "connexion fermée avant la fin des en-têtes");
        buffer.extend_from_slice(&chunk[..read]);
    };

    let headers = String::from_utf8_lossy(&buffer[..header_end]).to_string();
    let value = |name: &str| -> Option<String> {
        headers.lines().find_map(|line| {
            let (key, value) = line.split_once(':')?;
            (key.trim().eq_ignore_ascii_case(name)).then(|| value.trim().to_string())
        })
    };
    let announced: u64 = value("content-length")
        .unwrap_or_else(|| "0".to_string())
        .parse()
        .unwrap_or(0);

    // La passerelle repond 400 pendant que le client televerse encore. C'est la
    // derniere difference entre cette sonde et la production, et elle change
    // peut-etre ce que le client ecrit ensuite.
    if early_400 {
        let body = b"{\"detail\":\"Invalid HTTP request received.\"}";
        let head = format!(
            "HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n",
            body.len()
        );
        let _ = stream.write_all(head.as_bytes()).await;
        let _ = stream.write_all(body).await;
        let _ = stream.flush().await;
    }

    let mut body_read = buffer.len() - header_end;
    while (body_read as u64) < announced {
        match tokio::time::timeout(step, stream.read(&mut chunk)).await {
            Ok(Ok(0)) | Err(_) => break,
            Ok(Ok(read)) => body_read += read,
            Ok(Err(_)) => break,
        }
    }

    // Le cœur de la mesure : ce qui arrive après la frontière annoncée.
    let mut trailing = 0usize;
    loop {
        match tokio::time::timeout(Duration::from_millis(800), stream.read(&mut chunk)).await {
            Ok(Ok(0)) | Err(_) => break,
            Ok(Ok(read)) => trailing += read,
            Ok(Err(_)) => break,
        }
    }

    if early_400 {
        return Observation {
            alpn,
            header_bytes: header_end,
            announced,
            body_read,
            trailing,
        };
    }

    let payload = b"{\"text\":\"sonde\"}";
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n",
        payload.len()
    );
    let _ = stream.write_all(response.as_bytes()).await;
    let _ = stream.write_all(payload).await;
    let _ = stream.flush().await;

    Observation {
        alpn,
        header_bytes: header_end,
        announced,
        body_read,
        trailing,
    }
}

/// Extrait la frontière d'un `Content-Type` multipart.
fn multipart_content_type_boundary(content_type: &str) -> String {
    content_type
        .split("boundary=")
        .nth(1)
        .unwrap_or_default()
        .to_string()
}

/// Combien de fois une séquence apparaît dans un tampon.
fn count_occurrences(haystack: &[u8], needle: &[u8]) -> usize {
    if needle.is_empty() || haystack.len() < needle.len() {
        return 0;
    }
    haystack
        .windows(needle.len())
        .filter(|w| *w == needle)
        .count()
}

#[tokio::main]
async fn main() {
    let _ = tokio_rustls::rustls::crypto::ring::default_provider().install_default();

    let engine = match std::env::args().nth(1).as_deref() {
        Some("rustls") => Engine::Rustls,
        _ => Engine::Native,
    };

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("port local");
    let port = listener.local_addr().expect("adresse").port();
    let server = tokio::spawn(observe(listener));

    // Second argument facultatif : un WAV reel. Un remplissage constant ne
    // reproduit pas tout — si la frontiere multipart apparait par hasard dans
    // l'audio, un analyseur cote serveur peut clore la partie trop tot. Il faut
    // donc pouvoir rejouer les octets exacts de la dictee qui a echoue.
    let audio = match std::env::args().nth(2) {
        Some(path) => {
            let bytes = std::fs::read(&path).expect("fichier audio lisible");
            println!(
                "audio         : lu depuis un fichier reel ({} octets)",
                bytes.len()
            );
            bytes
        }
        None => vec![0x5Au8; AUDIO_BYTES],
    };
    let multipart = build_audio_multipart("file", "recording.wav", "audio/wav", &audio);
    let expected = multipart.body.len();
    let audio_bytes = multipart.audio_bytes;

    let audio_for_check = audio.clone();
    let content_type = multipart.content_type.clone();

    let client = campus_client(engine, &decode(CERT_DER_B64));
    let outcome = client
        .post(format!("https://127.0.0.1:{port}/api/transcribe"))
        .header(reqwest::header::CONTENT_TYPE, &multipart.content_type)
        .body(multipart.body)
        .send()
        .await;

    let boundary = multipart_content_type_boundary(&content_type);
    let collisions = count_occurrences(&audio_for_check, boundary.as_bytes());

    let observation = tokio::time::timeout(Duration::from_secs(60), server)
        .await
        .expect("le serveur n'a pas rendu la main")
        .expect("serveur");

    println!("moteur TLS     : {}", engine.label());
    println!("plateforme     : {}", std::env::consts::OS);
    println!("ALPN négocié   : {:?}", observation.alpn);
    println!("audio          : {audio_bytes} octets");
    println!("corps attendu  : {expected} octets");
    println!("en-têtes HTTP  : {} octets", observation.header_bytes);
    println!("Content-Length : {}", observation.announced);
    println!("corps lu       : {}", observation.body_read);
    println!("APRÈS le corps : {} octets", observation.trailing);
    println!("frontière dans l'audio : {collisions} occurrence(s)");
    println!(
        "réponse HTTP   : {}",
        match &outcome {
            Ok(response) => response.status().to_string(),
            Err(_) => "erreur de transport".to_string(),
        }
    );

    if observation.trailing == 0 && observation.announced == expected as u64 {
        println!("\nVERDICT : conforme — le client écrit exactement ce qu'il déclare.");
    } else {
        println!(
            "\nVERDICT : NON CONFORME — {} octets de trop, écart de déclaration {}.",
            observation.trailing,
            expected as i64 - observation.announced as i64
        );
        std::process::exit(1);
    }
}
