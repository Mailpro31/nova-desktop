//! Réduction et encodage PNG d'une capture d'écran, partagés par la vision
//! locale (`screen_vlm`).
//!
//! Le relais de vision cloud de Nova personnel (`turbo-vision`, Nova Ultra) est
//! retiré : un poste d'école n'envoie jamais une image de son écran (lot 1c).

#[cfg(target_os = "windows")]
pub(crate) use imp::{downscale_rgb, encode_png};

#[cfg(target_os = "windows")]
mod imp {
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
