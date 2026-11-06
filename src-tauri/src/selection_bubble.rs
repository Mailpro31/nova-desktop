//! Bulle de sélection : l'élève sélectionne un texte n'importe où, une bulle
//! apparaît à côté, et un clic l'explique, le lit ou l'envoie vers une
//! application (demande de Sash, 24/10).
//!
//! # Quand la bulle apparaît
//!
//! Après un glisser de la souris, un double ou triple clic, Ctrl + A, ou une
//! sélection au clavier (Maj + flèches, relâchée), **seulement si Windows
//! confirme une sélection** par l'accessibilité (`auto_style::read_selection`).
//! Un glisser de fenêtre, de fichier ou de barre de défilement n'a pas de
//! sélection : rien n'apparaît. Le presse-papiers n'est jamais touché.
//!
//! # Quand elle disparaît
//!
//! Au premier clic ailleurs, à la molette ou à la frappe, tant qu'elle ne
//! montre que ses actions. Une réponse affichée reste (l'élève la lit en
//! faisant défiler son cours) jusqu'à Échap, sa croix ou une nouvelle
//! sélection.
//!
//! La fenêtre ne prend jamais le focus : la sélection reste active dans
//! l'application de l'élève, et « Remplacer » peut y coller.

use tauri::AppHandle;

use crate::nova_commands::{CommandError, TargetWindow};

/// Les sélections faites au clavier, lues dans le crochet clavier (bugs 0.6 et
/// 0.8, 26/10) : Ctrl + A, et Maj + une touche de déplacement, au relâchement
/// de Maj. Sans état système : de simples booléens, testables partout.
#[derive(Default)]
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
struct KeyTracker {
    ctrl: bool,
    shift: bool,
    /// Une touche de déplacement a été pressée pendant que Maj était tenue.
    extended: bool,
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
impl KeyTracker {
    /// Une touche pressée. `true` quand c'est Ctrl + A.
    fn press(&mut self, ctrl: bool, shift: bool, letter_a: bool, navigation: bool) -> bool {
        if ctrl {
            self.ctrl = true;
        }
        if shift {
            self.shift = true;
        }
        if self.shift && navigation {
            self.extended = true;
        }
        self.ctrl && letter_a
    }

    /// Une touche relâchée. `true` quand Maj se relâche après avoir étendu une sélection.
    fn release(&mut self, ctrl: bool, shift: bool) -> bool {
        if ctrl {
            self.ctrl = false;
        }
        if shift {
            self.shift = false;
            return std::mem::take(&mut self.extended);
        }
        false
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
    use std::sync::{mpsc, Mutex};
    use std::time::{Duration, Instant};

    use log::{debug, warn};
    use rdev::{Button, EventType, Key};
    use serde::Serialize;
    use tauri::{
        AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindowBuilder,
    };

    use crate::nova_commands::TargetWindow;

    const LABEL: &str = "selection_bubble";
    const SHOW_EVENT: &str = "selection-bubble-show";
    const HIDE_EVENT: &str = "selection-bubble-hide";
    /// Au-delà, la sélection est un document entier, pas un passage à expliquer.
    const MAX_CHARS: usize = 20_000;

    #[derive(Clone, Serialize)]
    struct ShowPayload {
        text: String,
        editable: bool,
        target: TargetWindow,
    }

    /// Le point où la sélection s'est terminée, en pixels physiques.
    static ANCHOR: Mutex<(i32, i32)> = Mutex::new((0, 0));
    /// Une réponse est affichée : la bulle reste jusqu'à Échap ou sa croix.
    static PINNED: AtomicBool = AtomicBool::new(false);
    static VISIBLE: AtomicBool = AtomicBool::new(false);
    /// Le dernier texte montré : un clic qui le laisse sélectionné ne le remontre pas.
    static LAST_TEXT: Mutex<String> = Mutex::new(String::new());
    /// Le processus d'où vient la sélection affichée.
    static TARGET_PID: AtomicU32 = AtomicU32::new(0);

    enum Signal {
        Press(i32, i32),
        /// `deliberate` : un vrai geste de sélection (double-clic, ou glisser
        /// de 20 px), pas un clic qui a un peu bougé.
        Selected {
            x: i32,
            y: i32,
            deliberate: bool,
            /// Ctrl + A ou Maj + flèches. shortcut: la bulle se place sous la
            /// souris, pas près du champ actif ; à revoir si les élèves la cherchent.
            keyboard: bool,
        },
        Key {
            escape: bool,
        },
        Wheel,
    }

    pub fn start(app: &AppHandle) {
        // Bulle éteinte : pas de fenêtre, ≈ 40 Mo de WebView économisés (point 0.2).
        set_window(
            app,
            crate::settings::get_settings(app).selection_bubble_enabled,
        );
        let (tx, rx) = mpsc::channel::<Signal>();
        let worker_app = app.clone();
        std::thread::spawn(move || worker(worker_app, rx));
        std::thread::spawn(move || {
            // Le crochet souris de Windows : ce rappel doit rester instantané,
            // tout le travail part vers `worker`.
            let mut pos = (0.0_f64, 0.0_f64);
            let mut press = (0.0_f64, 0.0_f64);
            let mut last_press: Option<((f64, f64), Instant)> = None;
            let mut double = false;
            let mut keys = super::KeyTracker::default();
            let near = |a: (f64, f64), b: (f64, f64), d: f64| {
                (a.0 - b.0).abs() <= d && (a.1 - b.1).abs() <= d
            };
            let result = rdev::listen(move |event| {
                let signal = match event.event_type {
                    EventType::MouseMove { x, y } => {
                        pos = (x, y);
                        None
                    }
                    EventType::ButtonPress(Button::Left) => {
                        let now = Instant::now();
                        double = last_press.is_some_and(|(at, when)| {
                            now.duration_since(when) < Duration::from_millis(500)
                                && near(at, pos, 4.0)
                        });
                        last_press = Some((pos, now));
                        press = pos;
                        Some(Signal::Press(pos.0 as i32, pos.1 as i32))
                    }
                    EventType::ButtonRelease(Button::Left) => (double || !near(press, pos, 6.0))
                        .then(|| Signal::Selected {
                            x: pos.0 as i32,
                            y: pos.1 as i32,
                            deliberate: double || !near(press, pos, 20.0),
                            keyboard: false,
                        }),
                    EventType::KeyPress(key) => {
                        let ctrl_a = keys.press(
                            matches!(key, Key::ControlLeft | Key::ControlRight),
                            matches!(key, Key::ShiftLeft | Key::ShiftRight),
                            key == Key::KeyA,
                            matches!(
                                key,
                                Key::LeftArrow
                                    | Key::RightArrow
                                    | Key::UpArrow
                                    | Key::DownArrow
                                    | Key::Home
                                    | Key::End
                                    | Key::PageUp
                                    | Key::PageDown
                            ),
                        );
                        let _ = tx.send(Signal::Key {
                            escape: key == Key::Escape,
                        });
                        ctrl_a.then_some(Signal::Selected {
                            x: pos.0 as i32,
                            y: pos.1 as i32,
                            deliberate: true,
                            keyboard: true,
                        })
                    }
                    EventType::KeyRelease(key) => keys
                        .release(
                            matches!(key, Key::ControlLeft | Key::ControlRight),
                            matches!(key, Key::ShiftLeft | Key::ShiftRight),
                        )
                        .then_some(Signal::Selected {
                            x: pos.0 as i32,
                            y: pos.1 as i32,
                            deliberate: true,
                            keyboard: true,
                        }),
                    EventType::Wheel { .. } => Some(Signal::Wheel),
                    _ => None,
                };
                if let Some(signal) = signal {
                    let _ = tx.send(signal);
                }
            });
            if let Err(error) = result {
                warn!("Bulle de sélection : écoute de la souris impossible ({error:?})");
            }
        });
    }

    /// Crée la fenêtre de la bulle, ou la détruit, selon le réglage.
    pub fn set_window(app: &AppHandle, enabled: bool) {
        match app.get_webview_window(LABEL) {
            None if enabled => create_window(app),
            Some(window) if !enabled => {
                hide(app);
                let _ = window.destroy();
            }
            _ => {}
        }
    }

    fn create_window(app: &AppHandle) {
        let mut builder = WebviewWindowBuilder::new(
            app,
            LABEL,
            tauri::WebviewUrl::App("src/bubble/index.html".into()),
        )
        .title("Nova")
        .inner_size(360.0, 52.0)
        .resizable(false)
        .shadow(false)
        .maximizable(false)
        .minimizable(false)
        .closable(false)
        .accept_first_mouse(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .transparent(true)
        .focusable(false)
        .focused(false)
        .visible(false);
        if let Some(data_dir) = crate::portable::data_dir() {
            builder = builder.data_directory(data_dir.join("webview"));
        }
        if let Err(error) = builder.build() {
            warn!("Bulle de sélection : fenêtre non créée ({error})");
        }
    }

    fn worker(app: AppHandle, rx: mpsc::Receiver<Signal>) {
        for signal in rx {
            match signal {
                Signal::Press(x, y) => {
                    if VISIBLE.load(Ordering::Relaxed) && !inside(&app, x, y) {
                        if PINNED.load(Ordering::Relaxed) {
                            hide_if_app_changed(&app);
                        } else {
                            hide(&app);
                        }
                    }
                }
                Signal::Selected {
                    x,
                    y,
                    deliberate,
                    keyboard,
                } => {
                    if inside(&app, x, y) {
                        continue;
                    }
                    let settings = crate::settings::get_settings(&app);
                    if !settings.selection_bubble_enabled {
                        continue;
                    }
                    // Nova lui-même, une application écartée par l'élève, ou un plein
                    // écran (un jeu, une présentation) : pas de bulle.
                    let (process, pid) = crate::auto_style::foreground_window_identity();
                    if pid == std::process::id()
                        || settings.selection_bubble_blocklist.contains(&process)
                        || foreground_is_fullscreen()
                    {
                        continue;
                    }
                    // L'application met sa sélection à jour juste après le geste ;
                    // certaines (Chrome, lecteurs PDF) plus lentement : un second
                    // essai plutôt qu'une bulle manquée (bug 0.6 d).
                    let read = || {
                        crate::auto_style::read_selection(
                            &settings.auto_style_blocklist,
                            MAX_CHARS,
                            x,
                            y,
                        )
                    };
                    std::thread::sleep(Duration::from_millis(if keyboard { 100 } else { 60 }));
                    let Some((text, editable)) = read().or_else(|| {
                        std::thread::sleep(Duration::from_millis(150));
                        read()
                    }) else {
                        debug!(
                            "Bulle : aucune sélection lue dans {process} (clavier : {keyboard})"
                        );
                        continue;
                    };
                    // Test de Sash (24/10) : cliquer ailleurs dans une page dont le
                    // texte restait sélectionné déplaçait la bulle sous le clic.
                    // Seulement si la bulle est encore là : bulle fermée, resélectionner
                    // le même texte doit la rouvrir (bug 0.6 a).
                    if let Ok(mut last) = LAST_TEXT.lock() {
                        if !deliberate && VISIBLE.load(Ordering::Relaxed) && *last == text {
                            continue;
                        }
                        last.clone_from(&text);
                    }
                    if let Ok(mut anchor) = ANCHOR.lock() {
                        *anchor = (x, y);
                    }
                    PINNED.store(false, Ordering::Relaxed);
                    TARGET_PID.store(pid, Ordering::Relaxed);
                    let payload = ShowPayload {
                        text,
                        editable,
                        target: TargetWindow { process, pid },
                    };
                    // La bulle se montre quand elle a mesuré son contenu (`layout`).
                    if let Err(error) = app.emit_to(LABEL, SHOW_EVENT, payload) {
                        debug!("Bulle de sélection : {error}");
                    }
                }
                Signal::Key { escape } => {
                    if !VISIBLE.load(Ordering::Relaxed) {
                        continue;
                    }
                    if escape || !PINNED.load(Ordering::Relaxed) {
                        hide(&app);
                    } else {
                        // Alt+Tab vers une autre application.
                        hide_if_app_changed(&app);
                    }
                }
                Signal::Wheel => {
                    if VISIBLE.load(Ordering::Relaxed) && !PINNED.load(Ordering::Relaxed) {
                        hide(&app);
                    }
                }
            }
        }
    }

    /// Une réponse affichée suit l'application d'où vient la sélection : elle
    /// se cache quand l'élève passe à une autre (elle restait par-dessus tout).
    fn hide_if_app_changed(app: &AppHandle) {
        std::thread::sleep(Duration::from_millis(150));
        let (_process, pid) = crate::auto_style::foreground_window_identity();
        if pid != 0 && pid != TARGET_PID.load(Ordering::Relaxed) && pid != std::process::id() {
            hide(app);
        }
    }

    /// La fenêtre au premier plan couvre-t-elle tout son écran ? Un plein écran
    /// de lecture (PDF en F11) perd aussi la bulle : le prix d'un jeu tranquille.
    fn foreground_is_fullscreen() -> bool {
        use windows::Win32::Foundation::RECT;
        use windows::Win32::Graphics::Gdi::{
            GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
        };
        use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowRect};

        unsafe {
            let window = GetForegroundWindow();
            if window.is_invalid() {
                return false;
            }
            let mut rect = RECT::default();
            if GetWindowRect(window, &mut rect).is_err() {
                return false;
            }
            let mut info = MONITORINFO {
                cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                ..Default::default()
            };
            let monitor = MonitorFromWindow(window, MONITOR_DEFAULTTONEAREST);
            GetMonitorInfoW(monitor, &mut info).as_bool() && rect == info.rcMonitor
        }
    }

    /// Le texte d'origine est-il toujours sélectionné ? Sinon « Remplacer »
    /// collerait au nouvel endroit du curseur.
    pub fn still_selected(app: &AppHandle, original: &str) -> bool {
        let (x, y) = ANCHOR.lock().map(|a| *a).unwrap_or((0, 0));
        let settings = crate::settings::get_settings(app);
        crate::auto_style::read_selection(&settings.auto_style_blocklist, MAX_CHARS, x, y)
            .is_some_and(|(text, _)| text == original.trim())
    }

    fn inside(app: &AppHandle, x: i32, y: i32) -> bool {
        let Some(window) = app.get_webview_window(LABEL) else {
            return false;
        };
        if !VISIBLE.load(Ordering::Relaxed) {
            return false;
        }
        match (window.outer_position(), window.outer_size()) {
            (Ok(at), Ok(size)) => {
                x >= at.x
                    && y >= at.y
                    && x < at.x + size.width as i32
                    && y < at.y + size.height as i32
            }
            _ => false,
        }
    }

    pub fn hide(app: &AppHandle) {
        VISIBLE.store(false, Ordering::Relaxed);
        PINNED.store(false, Ordering::Relaxed);
        if let Some(window) = app.get_webview_window(LABEL) {
            let _ = window.hide();
            let _ = app.emit_to(LABEL, HIDE_EVENT, ());
        }
    }

    /// Place la bulle sous le point de fin de sélection, ou au-dessus quand
    /// l'écran manque de place, sans jamais déborder de l'écran.
    pub fn layout(app: &AppHandle, width: f64, height: f64, pinned: bool) -> Result<(), String> {
        let window = app
            .get_webview_window(LABEL)
            .ok_or_else(|| "bubble window missing".to_string())?;
        let (ax, ay) = ANCHOR.lock().map(|a| *a).unwrap_or((0, 0));
        let monitor = app
            .available_monitors()
            .map_err(|e| e.to_string())?
            .into_iter()
            .find(|m| {
                let (p, s) = (m.position(), m.size());
                ax >= p.x && ay >= p.y && ax < p.x + s.width as i32 && ay < p.y + s.height as i32
            })
            .or_else(|| window.primary_monitor().ok().flatten())
            .ok_or_else(|| "no monitor".to_string())?;
        let scale = monitor.scale_factor();
        let (w, h) = (
            (width * scale).round() as i32,
            (height * scale).round() as i32,
        );
        let gap = (16.0 * scale) as i32;
        let (mx, my) = (monitor.position().x, monitor.position().y);
        let (mw, mh) = (monitor.size().width as i32, monitor.size().height as i32);
        let x = (ax - gap).clamp(mx, (mx + mw - w).max(mx));
        let below = ay + gap;
        let y = if below + h <= my + mh {
            below
        } else {
            (ay - gap - h).max(my)
        };

        window
            .set_size(PhysicalSize::new(w as u32, h as u32))
            .map_err(|e| e.to_string())?;
        window
            .set_position(PhysicalPosition::new(x, y))
            .map_err(|e| e.to_string())?;
        PINNED.store(pinned, Ordering::Relaxed);
        if !VISIBLE.swap(true, Ordering::Relaxed) {
            window.show().map_err(|e| e.to_string())?;
            let _ = window.set_always_on_top(true);
        }
        Ok(())
    }
}

/// Hors de Windows, la bulle n'existe pas : l'accessibilité qui lit la
/// sélection sans presse-papiers est propre à Windows.
#[cfg(not(target_os = "windows"))]
mod platform {
    use tauri::AppHandle;

    pub fn start(_app: &AppHandle) {}

    pub fn set_window(_app: &AppHandle, _enabled: bool) {}

    pub fn hide(_app: &AppHandle) {}

    pub fn still_selected(_app: &AppHandle, _original: &str) -> bool {
        true
    }

    pub fn layout(
        _app: &AppHandle,
        _width: f64,
        _height: f64,
        _pinned: bool,
    ) -> Result<(), String> {
        Ok(())
    }
}

pub use platform::start;

/// La bulle a mesuré son contenu : la placer et la montrer.
#[tauri::command]
#[specta::specta]
pub fn selection_bubble_layout(
    app: AppHandle,
    width: f64,
    height: f64,
    pinned: bool,
) -> Result<(), String> {
    platform::layout(&app, width, height, pinned)
}

#[tauri::command]
#[specta::specta]
pub fn selection_bubble_hide(app: AppHandle) {
    platform::hide(&app);
}

/// Remplace la sélection de l'élève par `result` (Corriger, Simplifier).
///
/// La bulle n'a jamais pris le focus : la sélection est toujours active dans
/// l'application, et le collage la remplace. Refusé si la fenêtre a changé.
#[tauri::command]
#[specta::specta]
pub fn selection_bubble_replace(
    app: AppHandle,
    result: String,
    original: String,
    target: TargetWindow,
) -> Result<(), CommandError> {
    if !platform::still_selected(&app, &original) {
        return Err(CommandError::TargetChanged);
    }
    selection_bubble_hide(app.clone());
    crate::nova_commands::paste_preserving_clipboard(&app, &result, &target)
}

/// Les applications sans bulle (« Ne plus afficher dans cette application »).
#[tauri::command]
#[specta::specta]
pub fn change_selection_bubble_blocklist_setting(
    app: AppHandle,
    blocklist: Vec<String>,
) -> Result<(), String> {
    let mut settings = crate::settings::get_settings(&app);
    settings.selection_bubble_blocklist = blocklist;
    crate::settings::write_settings(&app, settings);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn change_selection_bubble_enabled_setting(
    app: AppHandle,
    enabled: bool,
) -> Result<(), String> {
    let mut settings = crate::settings::get_settings(&app);
    settings.selection_bubble_enabled = enabled;
    crate::settings::write_settings(&app, settings);
    // Créer une fenêtre dans une commande synchrone bloque sous Windows.
    std::thread::spawn(move || platform::set_window(&app, enabled));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::KeyTracker;

    #[test]
    fn ctrl_a_is_detected_while_ctrl_is_held() {
        let mut keys = KeyTracker::default();
        assert!(!keys.press(true, false, false, false));
        assert!(keys.press(false, false, true, false));
        keys.release(true, false);
        assert!(
            !keys.press(false, false, true, false),
            "A seul n'est pas Ctrl + A"
        );
    }

    #[test]
    fn shift_selection_fires_once_on_release() {
        let mut keys = KeyTracker::default();
        keys.press(false, true, false, false);
        keys.press(false, false, false, true);
        keys.press(false, false, false, true);
        assert!(keys.release(false, true));
        assert!(!keys.release(false, true));
    }

    #[test]
    fn shift_alone_or_arrows_alone_select_nothing() {
        let mut keys = KeyTracker::default();
        keys.press(false, true, false, false);
        assert!(!keys.release(false, true), "Maj seule (une majuscule)");
        keys.press(false, false, false, true);
        assert!(!keys.release(false, false), "une flèche sans Maj");
    }
}
