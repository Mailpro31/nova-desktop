//! Lecture de contexte — palier D : vision cloud (Nova Ultra, strictement opt-in).
//!
//! Dernier repli quand l'accessibilité (palier A) ET l'OCR local (palier B)
//! n'ont rien pu lire — typiquement une fenêtre au rendu purement graphique.
//! Nova capture la fenêtre au premier plan (même capture GDI que le palier B),
//! l'encode en PNG (réduite pour borner la taille et la latence) et l'envoie au
//! relais `turbo-vision`, qui vérifie la licence Ultra côté serveur et renvoie
//! un résumé court et neutre du contexte à l'écran. L'image n'est jamais
//! conservée. Ne se déclenche QUE si l'utilisateur a activé « Vision cloud ».
//!
//! Défensif de bout en bout : au moindre échec (réseau, quota, licence),
//! renvoie `None` et la dictée continue sans contexte.

#[cfg(target_os = "windows")]
pub use imp::describe_focused_window;
// Réutilisés par le palier C (screen_vlm) : réduction + encodage PNG partagés.
#[cfg(target_os = "windows")]
pub(crate) use imp::{downscale_rgb, encode_png};

#[cfg(not(target_os = "windows"))]
pub fn describe_focused_window(_license_key: &str, _max_chars: usize) -> Option<String> {
    None
}

#[cfg(target_os = "windows")]
mod imp {
    const URL: &str = "https://cvpucqsxgjczkdskohte.supabase.co/functions/v1/turbo-vision";
    // Côté le plus long de la capture envoyée : borne la taille PNG et la
    // latence de la vision sans nuire à la lisibilité du texte à l'écran.
    const MAX_SIDE: u32 = 1280;

    /// Capture la fenêtre active, la décrit via `turbo-vision`, borné à
    /// `max_chars`. `None` sans clé, ou au moindre échec.
    pub fn describe_focused_window(license_key: &str, max_chars: usize) -> Option<String> {
        let key = license_key.trim();
        if key.is_empty() {
            return None;
        }
        let (rgb, w, h) = crate::screen_ocr::capture_foreground()?;
        let (rgb, w, h) = downscale_rgb(rgb, w, h, MAX_SIDE);
        let png = encode_png(&rgb, w, h)?;

        let resp = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(9))
            .build()
            .ok()?
            .post(URL)
            .header("Authorization", format!("Bearer {key}"))
            .header("Content-Type", "image/png")
            .body(png)
            .send()
            .ok()?;
        if !resp.status().is_success() {
            return None;
        }
        let v: serde_json::Value = resp.json().ok()?;
        let text = v.get("text")?.as_str()?.trim().to_string();
        if text.is_empty() {
            return None;
        }
        Some(text.chars().take(max_chars).collect())
    }

    /// Réduction plus proche voisin : suffisante pour l'OCR/vision, sans
    /// dépendance lourde. Ne touche à rien si l'image est déjà sous la borne.
    pub(crate) fn downscale_rgb(
        rgb: Vec<u8>,
        w: u32,
        h: u32,
        max_side: u32,
    ) -> (Vec<u8>, u32, u32) {
        let long = w.max(h);
        if long <= max_side || w == 0 || h == 0 {
            return (rgb, w, h);
        }
        let nw = ((w * max_side) / long).max(1);
        let nh = ((h * max_side) / long).max(1);
        let mut out = vec![0u8; (nw as usize) * (nh as usize) * 3];
        for y in 0..nh {
            let sy = (y * h) / nh;
            for x in 0..nw {
                let sx = (x * w) / nw;
                let si = ((sy * w + sx) as usize) * 3;
                let di = ((y * nw + x) as usize) * 3;
                out[di..di + 3].copy_from_slice(&rgb[si..si + 3]);
            }
        }
        (out, nw, nh)
    }

    pub(crate) fn encode_png(rgb: &[u8], w: u32, h: u32) -> Option<Vec<u8>> {
        let mut buf = Vec::new();
        {
            let mut enc = png::Encoder::new(&mut buf, w, h);
            enc.set_color(png::ColorType::Rgb);
            enc.set_depth(png::BitDepth::Eight);
            let mut writer = enc.write_header().ok()?;
            writer.write_image_data(rgb).ok()?;
        }
        Some(buf)
    }
}
