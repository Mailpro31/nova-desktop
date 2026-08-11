use crate::managers::history::{HistoryEntry, HistoryManager};
use crate::managers::model::ModelManager;
use crate::managers::transcription::TranscriptionManager;
use crate::settings;
use crate::tray_i18n::get_tray_translations;
use log::{debug, error, info, warn};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::TrayIcon;
use tauri::{AppHandle, Manager, Theme};
use tauri_plugin_clipboard_manager::ClipboardExt;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum TrayIconState {
    Idle,
    Recording,
    Transcribing,
    Error,
}

/// Tauri managed state holding the last icon state set via `change_tray_icon`.
pub struct CurrentTrayIconState(pub Mutex<TrayIconState>);

impl CurrentTrayIconState {
    pub fn new() -> Self {
        Self(Mutex::new(TrayIconState::Idle))
    }

    pub fn get(&self) -> TrayIconState {
        // Récupère l'état même si un autre thread a paniqué en tenant le verrou :
        // la valeur protégée est un simple enum `Copy`, jamais laissée dans un
        // état incohérent — inutile de propager l'empoisonnement en panique.
        *self.0.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn set(&self, state: TrayIconState) {
        *self.0.lock().unwrap_or_else(|e| e.into_inner()) = state;
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum AppTheme {
    Dark,
    Light,
    Colored, // Pink/colored theme for Linux
}

/// Gets the current app theme, with Linux defaulting to Colored theme
pub fn get_current_theme(app: &AppHandle) -> AppTheme {
    if cfg!(target_os = "linux") {
        // On Linux, always use the colored theme
        AppTheme::Colored
    } else {
        // On Windows the tray icon sits on the taskbar, which follows the
        // *system* theme (SystemUsesLightTheme), not the app theme. With the
        // "Custom" personalization mode the two can differ (e.g. dark taskbar
        // + light apps), and the window theme would pick an icon that is
        // invisible against the taskbar.
        #[cfg(target_os = "windows")]
        if let Some(theme) = windows_taskbar_theme() {
            return theme;
        }

        // On other platforms, map system theme to our app theme
        if let Some(main_window) = app.get_webview_window("main") {
            match main_window.theme().unwrap_or(Theme::Dark) {
                Theme::Light => AppTheme::Light,
                Theme::Dark => AppTheme::Dark,
                _ => AppTheme::Dark, // Default fallback
            }
        } else {
            AppTheme::Dark
        }
    }
}

/// Reads the Windows taskbar theme from the registry.
///
/// Returns None if the value is missing (older Windows 10 builds default to a
/// dark taskbar there, but falling back to the window theme is safer than
/// guessing).
#[cfg(target_os = "windows")]
fn windows_taskbar_theme() -> Option<AppTheme> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let personalize = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize")
        .ok()?;
    let system_uses_light: u32 = personalize.get_value("SystemUsesLightTheme").ok()?;
    Some(if system_uses_light == 1 {
        AppTheme::Light
    } else {
        AppTheme::Dark
    })
}

/// Gets the appropriate icon path for the given theme and state
pub fn get_icon_path(theme: AppTheme, state: TrayIconState) -> &'static str {
    match (theme, state) {
        // Dark theme uses light icons
        (AppTheme::Dark, TrayIconState::Idle) => "resources/tray_idle.png",
        (AppTheme::Dark, TrayIconState::Recording) => "resources/tray_recording.png",
        (AppTheme::Dark, TrayIconState::Transcribing) => "resources/tray_transcribing.png",
        (AppTheme::Dark, TrayIconState::Error) => "resources/tray_idle.png",
        // Light theme uses dark icons
        (AppTheme::Light, TrayIconState::Idle) => "resources/tray_idle_dark.png",
        (AppTheme::Light, TrayIconState::Recording) => "resources/tray_recording_dark.png",
        (AppTheme::Light, TrayIconState::Transcribing) => "resources/tray_transcribing_dark.png",
        (AppTheme::Light, TrayIconState::Error) => "resources/tray_idle_dark.png",
        // Colored theme uses pink icons (for Linux)
        (AppTheme::Colored, TrayIconState::Idle) => "resources/handy.png",
        (AppTheme::Colored, TrayIconState::Recording) => "resources/recording.png",
        (AppTheme::Colored, TrayIconState::Transcribing) => "resources/transcribing.png",
        (AppTheme::Colored, TrayIconState::Error) => "resources/handy.png",
    }
}

/// Adds a compact status badge while preserving the exact Nova orb asset.
/// Recording uses a solid Apple-blue dot, processing a blue ring, and errors a
/// sober red dot. Rendering from the source pixels keeps every theme variant
/// visually identical to the brand glyph instead of maintaining near-duplicate
/// raster files that can drift.
fn decorate_tray_icon(image: Image<'static>, state: TrayIconState) -> Image<'static> {
    if state == TrayIconState::Idle {
        return image;
    }

    let width = image.width();
    let height = image.height();
    if width < 16 || height < 16 {
        return image;
    }

    let mut rgba = image.rgba().to_vec();
    let scale = width.min(height) as f32 / 64.0;
    let center_x = width as i32 - (11.0 * scale).round() as i32;
    let center_y = height as i32 - (11.0 * scale).round() as i32;
    let outer_radius = (10.0 * scale).round().max(2.0) as i32;
    let badge_radius = (7.0 * scale).round().max(1.0) as i32;
    let hole_radius = (3.2 * scale).round().max(1.0) as i32;
    let outline = [31, 31, 34, 255]; // Nova surface #1F1F22
    let accent = [10, 132, 255, 255]; // Apple blue #0A84FF
    let error = [255, 69, 58, 255]; // sober system red

    for y in (center_y - outer_radius).max(0)..=(center_y + outer_radius).min(height as i32 - 1) {
        for x in (center_x - outer_radius).max(0)..=(center_x + outer_radius).min(width as i32 - 1)
        {
            let dx = x - center_x;
            let dy = y - center_y;
            let distance_squared = dx * dx + dy * dy;
            let color = if distance_squared <= badge_radius * badge_radius {
                match state {
                    TrayIconState::Recording => accent,
                    TrayIconState::Transcribing
                        if distance_squared <= hole_radius * hole_radius =>
                    {
                        outline
                    }
                    TrayIconState::Transcribing => accent,
                    TrayIconState::Error => error,
                    TrayIconState::Idle => continue,
                }
            } else if distance_squared <= outer_radius * outer_radius {
                outline
            } else {
                continue;
            };
            let offset = ((y as u32 * width + x as u32) * 4) as usize;
            rgba[offset..offset + 4].copy_from_slice(&color);
        }
    }

    Image::new_owned(rgba, width, height)
}

pub fn change_tray_icon(app: &AppHandle, icon: TrayIconState) {
    let tray = app.state::<TrayIcon>();
    let theme = get_current_theme(app);

    // Store current state
    app.state::<CurrentTrayIconState>().set(icon);

    let icon_path = get_icon_path(theme, icon);

    let icon_started = std::time::Instant::now();
    if let Err(err) = load_tray_icon(
        app.path()
            .resolve(icon_path, tauri::path::BaseDirectory::Resource),
    )
    .map(|image| decorate_tray_icon(image, icon))
    .and_then(|image| tray.set_icon(Some(image)))
    {
        error!("Failed to update tray icon '{icon_path}': {err}");
    }
    let icon_elapsed = icon_started.elapsed();

    // Update menu based on state
    let menu_started = std::time::Instant::now();
    update_tray_menu(app, None);
    debug!(
        "tray icon change ({:?}): icon={} set_icon={:?} menu={:?}",
        icon,
        icon_path,
        icon_elapsed,
        menu_started.elapsed()
    );
}

/// Re-applies the last known tray state — for when only the *theme* changed
/// and the state itself (idle/recording/transcribing) should be preserved.
pub fn refresh_tray_icon(app: &AppHandle) {
    let icon = app.state::<CurrentTrayIconState>().get();
    change_tray_icon(app, icon);
}

fn load_tray_icon(resolved_icon_path: tauri::Result<PathBuf>) -> tauri::Result<Image<'static>> {
    let resolved_icon_path = resolved_icon_path?;
    Image::from_path(&resolved_icon_path).map(Image::to_owned)
}

pub fn tray_tooltip() -> String {
    version_label()
}

fn version_label() -> String {
    if cfg!(debug_assertions) {
        format!("Nova v{} (Dev)", env!("CARGO_PKG_VERSION"))
    } else {
        format!("Nova v{}", env!("CARGO_PKG_VERSION"))
    }
}

pub fn update_tray_menu(app: &AppHandle, locale: Option<&str>) {
    // Reconstruire le menu est appelé à chaque changement d'état/de thème. Si
    // Tauri refuse de créer un item (ressource système transitoire), « jamais de
    // plantage » : on journalise et on conserve le menu précédent plutôt que de
    // paniquer et faire tomber l'app entière.
    if let Err(err) = try_update_tray_menu(app, locale) {
        error!("Failed to rebuild tray menu: {err}");
    }
}

fn try_update_tray_menu(app: &AppHandle, locale: Option<&str>) -> tauri::Result<()> {
    let state = app.state::<CurrentTrayIconState>().get();
    let settings = settings::get_settings(app);

    let locale = locale.unwrap_or(&settings.app_language);
    let strings = get_tray_translations(Some(locale.to_string()));

    // Platform-specific accelerators
    #[cfg(target_os = "macos")]
    let (settings_accelerator, quit_accelerator) = (Some("Cmd+,"), Some("Cmd+Q"));
    #[cfg(not(target_os = "macos"))]
    let (settings_accelerator, quit_accelerator) = (Some("Ctrl+,"), Some("Ctrl+Q"));

    // Create common menu items
    let version_label = version_label();
    let version_i = MenuItem::with_id(app, "version", &version_label, false, None::<&str>)?;
    let settings_i = MenuItem::with_id(
        app,
        "settings",
        &strings.settings,
        true,
        settings_accelerator,
    )?;
    let check_updates_i = MenuItem::with_id(
        app,
        "check_updates",
        &strings.check_updates,
        settings.update_checks_enabled,
        None::<&str>,
    )?;
    let copy_last_transcript_i = MenuItem::with_id(
        app,
        "copy_last_transcript",
        &strings.copy_last_transcript,
        true,
        None::<&str>,
    )?;
    let model_loaded = app.state::<Arc<TranscriptionManager>>().is_model_loaded();
    let quit_i = MenuItem::with_id(app, "quit", &strings.quit, true, quit_accelerator)?;

    // Build model submenu — label is the active model name
    let model_manager = app.state::<Arc<ModelManager>>();
    let models = model_manager.get_available_models();
    let current_model_id = &settings.selected_model;

    let mut downloaded: Vec<_> = models.into_iter().filter(|m| m.is_downloaded).collect();
    downloaded.sort_by(|a, b| a.name.cmp(&b.name));

    let submenu_label = downloaded
        .iter()
        .find(|m| m.id == *current_model_id)
        .map(|m| m.name.clone())
        .unwrap_or_else(|| strings.model.clone());

    let model_submenu = {
        let submenu = Submenu::with_id(app, "model_submenu", &submenu_label, true)?;

        for model in &downloaded {
            let is_active = model.id == *current_model_id;
            let item_id = format!("model_select:{}", model.id);
            let item =
                CheckMenuItem::with_id(app, &item_id, &model.name, true, is_active, None::<&str>)?;
            let _ = submenu.append(&item);
        }

        submenu
    };

    let unload_model_i = MenuItem::with_id(
        app,
        "unload_model",
        &strings.unload_model,
        model_loaded,
        None::<&str>,
    )?;

    let menu = match state {
        TrayIconState::Recording | TrayIconState::Transcribing => {
            let cancel_i = MenuItem::with_id(app, "cancel", &strings.cancel, true, None::<&str>)?;
            Menu::with_items(
                app,
                &[
                    &version_i,
                    &PredefinedMenuItem::separator(app)?,
                    &cancel_i,
                    &PredefinedMenuItem::separator(app)?,
                    &copy_last_transcript_i,
                    &PredefinedMenuItem::separator(app)?,
                    &settings_i,
                    &check_updates_i,
                    &PredefinedMenuItem::separator(app)?,
                    &quit_i,
                ],
            )?
        }
        TrayIconState::Idle | TrayIconState::Error => Menu::with_items(
            app,
            &[
                &version_i,
                &PredefinedMenuItem::separator(app)?,
                &copy_last_transcript_i,
                &PredefinedMenuItem::separator(app)?,
                &model_submenu,
                &unload_model_i,
                &PredefinedMenuItem::separator(app)?,
                &settings_i,
                &check_updates_i,
                &PredefinedMenuItem::separator(app)?,
                &quit_i,
            ],
        )?,
    };

    let tray = app.state::<TrayIcon>();
    let _ = tray.set_menu(Some(menu));
    let _ = tray.set_icon_as_template(true);
    let _ = tray.set_tooltip(Some(version_label));
    Ok(())
}

fn last_transcript_text(entry: &HistoryEntry) -> &str {
    entry
        .post_processed_text
        .as_deref()
        .unwrap_or(&entry.transcription_text)
}

pub fn set_tray_visibility(app: &AppHandle, visible: bool) {
    let tray = app.state::<TrayIcon>();
    if let Err(e) = tray.set_visible(visible) {
        error!("Failed to set tray visibility: {}", e);
    } else {
        info!("Tray visibility set to: {}", visible);
    }
}

pub fn copy_last_transcript(app: &AppHandle) {
    let history_manager = app.state::<Arc<HistoryManager>>();
    let entry = match history_manager.get_latest_completed_entry() {
        Ok(Some(entry)) => entry,
        Ok(None) => {
            warn!("No completed transcription history entries available for tray copy.");
            return;
        }
        Err(err) => {
            error!(
                "Failed to fetch last completed transcription entry: {}",
                err
            );
            return;
        }
    };

    let text = last_transcript_text(&entry);
    if text.trim().is_empty() {
        warn!("Last completed transcription is empty; skipping tray copy.");
        return;
    }

    if let Err(err) = app.clipboard().write_text(text) {
        error!("Failed to copy last transcript to clipboard: {}", err);
        return;
    }

    info!("Copied last transcript to clipboard via tray.");
}

#[cfg(test)]
mod tests {
    use super::{decorate_tray_icon, last_transcript_text, load_tray_icon, TrayIconState};
    use crate::managers::history::HistoryEntry;
    use tauri::image::Image;

    fn build_entry(transcription: &str, post_processed: Option<&str>) -> HistoryEntry {
        HistoryEntry {
            id: 1,
            file_name: "handy-1.wav".to_string(),
            timestamp: 0,
            saved: false,
            title: "Recording".to_string(),
            transcription_text: transcription.to_string(),
            post_processed_text: post_processed.map(|text| text.to_string()),
            post_process_prompt: None,
            post_process_requested: false,
        }
    }

    #[test]
    fn uses_post_processed_text_when_available() {
        let entry = build_entry("raw", Some("processed"));
        assert_eq!(last_transcript_text(&entry), "processed");
    }

    #[test]
    fn falls_back_to_raw_transcription() {
        let entry = build_entry("raw", None);
        assert_eq!(last_transcript_text(&entry), "raw");
    }

    #[test]
    fn tray_icon_resolution_failure_is_returned_instead_of_panicking() {
        assert!(load_tray_icon(Err(tauri::Error::UnknownPath)).is_err());
    }

    #[test]
    fn tray_icon_returns_err_when_file_does_not_exist() {
        let dir = tempfile::tempdir().expect("failed to create tempdir");
        let missing = dir.path().join("does_not_exist.png");
        assert!(load_tray_icon(Ok(missing)).is_err());
    }

    #[test]
    fn tray_status_badges_are_distinct_and_preserve_idle_pixels() {
        let pixels = vec![0_u8; 64 * 64 * 4];
        let idle = decorate_tray_icon(
            Image::new_owned(pixels.clone(), 64, 64),
            TrayIconState::Idle,
        );
        let recording = decorate_tray_icon(
            Image::new_owned(pixels.clone(), 64, 64),
            TrayIconState::Recording,
        );
        let processing = decorate_tray_icon(
            Image::new_owned(pixels.clone(), 64, 64),
            TrayIconState::Transcribing,
        );
        let error = decorate_tray_icon(
            Image::new_owned(pixels.clone(), 64, 64),
            TrayIconState::Error,
        );

        assert_eq!(idle.rgba(), pixels);
        assert_ne!(recording.rgba(), processing.rgba());
        assert_ne!(recording.rgba(), error.rgba());
        assert_ne!(processing.rgba(), error.rgba());
    }
}
