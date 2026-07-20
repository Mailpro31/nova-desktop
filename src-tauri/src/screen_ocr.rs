//! Lecture de contexte — palier B : repli OCR local (Nova Ultra).
//!
//! Quand l'accessibilité (palier A, `auto_style::read_focused_context`) ne
//! renvoie rien — typiquement les apps Chromium/Electron ou à rendu canvas —
//! Nova capture la fenêtre au premier plan (GDI `PrintWindow`, qui capture
//! correctement ces apps) et en lit le texte via `ocrs` (moteur d'inférence en
//! Rust pur, aucune DLL native à distribuer). 100 % local, rien n'est conservé.
//!
//! Les deux modèles OCR (~15 Mo) sont téléchargés en tâche de fond au premier
//! besoin réel ; tant qu'ils ne sont pas là, la fonction renvoie simplement
//! `None` (la dictée continue). Défensif de bout en bout : ne panique jamais,
//! ne bloque jamais la dictée.

#[cfg(target_os = "windows")]
pub use imp::ocr_focused_window;
// Réutilisé par le palier D (screen_vision) : même capture GDI de la fenêtre
// active, encodée ensuite en PNG pour la vision cloud.
#[cfg(target_os = "windows")]
pub(crate) use imp::capture_foreground;

#[cfg(not(target_os = "windows"))]
pub fn ocr_focused_window(_max_chars: usize) -> Option<String> {
    None
}

#[cfg(target_os = "windows")]
mod imp {
    use std::io::Write;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Mutex, OnceLock};

    use ocrs::{ImageSource, OcrEngine, OcrEngineParams};

    // Poids OCR (format `.rten`) hébergés par Nova (novaspeak.app), avec repli
    // sur le miroir amont officiel si le site est momentanément indisponible.
    const DET_URLS: [&str; 2] = [
        "https://novaspeak.app/models/text-detection.rten",
        "https://ocrs-models.s3-accelerate.amazonaws.com/text-detection.rten",
    ];
    const REC_URLS: [&str; 2] = [
        "https://novaspeak.app/models/text-recognition.rten",
        "https://ocrs-models.s3-accelerate.amazonaws.com/text-recognition.rten",
    ];

    fn model_paths() -> Option<(PathBuf, PathBuf)> {
        let base = std::env::var("LOCALAPPDATA").ok()?;
        let dir = PathBuf::from(base).join("Nova").join("ocr-models");
        std::fs::create_dir_all(&dir).ok()?;
        Some((
            dir.join("text-detection.rten"),
            dir.join("text-recognition.rten"),
        ))
    }

    fn download(url: &str, to: &Path) -> bool {
        (|| -> Option<()> {
            let bytes = reqwest::blocking::Client::builder()
                .timeout(std::time::Duration::from_secs(180))
                .build()
                .ok()?
                .get(url)
                .send()
                .ok()?
                .error_for_status()
                .ok()?
                .bytes()
                .ok()?;
            let tmp = to.with_extension("part");
            std::fs::File::create(&tmp).ok()?.write_all(&bytes).ok()?;
            std::fs::rename(&tmp, to).ok()?;
            Some(())
        })()
        .is_some()
    }

    // Essaie chaque miroir dans l'ordre (Nova puis amont) jusqu'au premier succès.
    fn download_any(urls: &[&str], to: &Path) -> bool {
        urls.iter().any(|u| download(u, to))
    }

    // Un seul téléchargement en vol à la fois (évite de relancer à chaque dictée).
    static FETCHING: AtomicBool = AtomicBool::new(false);

    fn fetch_models_in_background() {
        if FETCHING.swap(true, Ordering::SeqCst) {
            return; // déjà en cours
        }
        std::thread::spawn(|| {
            if let Some((det, rec)) = model_paths() {
                if !det.exists() {
                    let _ = download_any(&DET_URLS, &det);
                }
                if !rec.exists() {
                    let _ = download_any(&REC_URLS, &rec);
                }
            }
            FETCHING.store(false, Ordering::SeqCst);
        });
    }

    static ENGINE: OnceLock<Mutex<Option<OcrEngine>>> = OnceLock::new();

    fn build_engine() -> Option<OcrEngine> {
        let (det_p, rec_p) = model_paths()?;
        if !det_p.exists() || !rec_p.exists() {
            return None;
        }
        let det = rten::Model::load_file(&det_p).ok()?;
        let rec = rten::Model::load_file(&rec_p).ok()?;
        OcrEngine::new(OcrEngineParams {
            detection_model: Some(det),
            recognition_model: Some(rec),
            ..Default::default()
        })
        .ok()
    }

    /// Capture la fenêtre au premier plan et en lit le texte, borné à
    /// `max_chars`. `None` si les modèles ne sont pas (encore) là, ou au moindre
    /// échec. Le premier appel sans modèles déclenche leur téléchargement en
    /// tâche de fond puis renvoie `None` (le contexte sera disponible ensuite).
    pub fn ocr_focused_window(max_chars: usize) -> Option<String> {
        let cell = ENGINE.get_or_init(|| Mutex::new(build_engine()));
        let mut guard = cell.lock().ok()?;
        if guard.is_none() {
            *guard = build_engine();
        }
        let engine = match guard.as_ref() {
            Some(e) => e,
            None => {
                fetch_models_in_background();
                return None;
            }
        };

        let (rgb, w, h) = capture_foreground()?;
        let src = ImageSource::from_bytes(&rgb, (w, h)).ok()?;
        let input = engine.prepare_input(src).ok()?;
        let text = engine.get_text(&input).ok()?;
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return None;
        }
        Some(trimmed.chars().take(max_chars).collect())
    }

    /// Capture GDI de la fenêtre au premier plan → (pixels RGB packés, w, h).
    pub(crate) fn capture_foreground() -> Option<(Vec<u8>, u32, u32)> {
        use windows::Win32::Foundation::RECT;
        // Note windows-rs : GetWindowDC/ReleaseDC vivent dans Graphics::Gdi, et
        // PrintWindow/PRINT_WINDOW_FLAGS dans Storage::Xps (et non WindowsAndMessaging).
        use windows::Win32::Graphics::Gdi::{
            CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits,
            GetWindowDC, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
            DIB_RGB_COLORS, HDC, HGDIOBJ,
        };
        use windows::Win32::Storage::Xps::{PrintWindow, PRINT_WINDOW_FLAGS};
        use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowRect};

        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.0.is_null() {
                return None;
            }
            let mut rect = RECT::default();
            GetWindowRect(hwnd, &mut rect).ok()?;
            let w = rect.right - rect.left;
            let h = rect.bottom - rect.top;
            if w < 8 || h < 8 || w > 8000 || h > 8000 {
                return None;
            }

            let hdc_win = GetWindowDC(Some(hwnd));
            if hdc_win.0.is_null() {
                return None;
            }

            let out = (|| -> Option<(Vec<u8>, u32, u32)> {
                let hdc_mem = CreateCompatibleDC(Some(hdc_win));
                if hdc_mem.0.is_null() {
                    return None;
                }
                // CreateCompatibleDC renvoie un CreatedHDC ; SelectObject/GetDIBits/
                // PrintWindow attendent un HDC — même poignée, on l'enveloppe une fois.
                let mem = HDC(hdc_mem.0);
                let hbmp = CreateCompatibleBitmap(hdc_win, w, h);
                if hbmp.0.is_null() {
                    let _ = DeleteDC(hdc_mem);
                    return None;
                }
                let old = SelectObject(mem, HGDIOBJ(hbmp.0));

                // PW_RENDERFULLCONTENT (2) : rendu correct des apps Chromium/Electron.
                let printed = PrintWindow(hwnd, mem, PRINT_WINDOW_FLAGS(2)).as_bool();

                let mut bmi = BITMAPINFO::default();
                bmi.bmiHeader = BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: w,
                    biHeight: -h, // top-down
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0 as u32,
                    ..Default::default()
                };
                let mut bgra = vec![0u8; (w as usize) * (h as usize) * 4];
                let lines = GetDIBits(
                    mem,
                    hbmp,
                    0,
                    h as u32,
                    Some(bgra.as_mut_ptr() as *mut _),
                    &mut bmi,
                    DIB_RGB_COLORS,
                );

                SelectObject(mem, old);
                let _ = DeleteObject(HGDIOBJ(hbmp.0));
                let _ = DeleteDC(hdc_mem);

                if !printed || lines == 0 {
                    return None;
                }
                // BGRA → RGB (ocrs attend 3 canaux)
                let mut rgb = vec![0u8; (w as usize) * (h as usize) * 3];
                for (i, px) in bgra.chunks_exact(4).enumerate() {
                    rgb[i * 3] = px[2];
                    rgb[i * 3 + 1] = px[1];
                    rgb[i * 3 + 2] = px[0];
                }
                Some((rgb, w as u32, h as u32))
            })();

            let _ = ReleaseDC(Some(hwnd), hdc_win);
            out
        }
    }
}
