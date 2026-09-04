mod actions;
#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
mod apple_intelligence;
mod audio_feedback;
pub mod audio_toolkit;
mod auto_style;
/// Trace de diagnostic des requetes Campus/Lab, expurgee par construction.
mod campus_trace;
mod catalog;
pub mod cli;
mod clipboard;
mod commands;
mod deployment;
mod dictation_state;
mod helpers;
mod input;
/// Enrôlement d'un poste dans un Lab local. Ce code est exclu des binaires
/// Nova ordinaires ; voir `Cargo.toml` feature `lab`.
#[cfg(feature = "lab")]
mod lab_enrollment;
/// Transport TLS du Lab : identite epinglee, verifiee strictement.
#[cfg(feature = "lab")]
mod lab_tls;
mod lexicon_learning;
mod licensing;
mod llm_client;
mod local_llm;
mod machine_id;
mod managers;
mod meeting_capture;
mod meeting_live;
mod meeting_segmenter;
mod meeting_session;
mod meeting_transcript;
mod nova_commands;
/// Modèle d'organisation partagé (éditions, membres, groupes). Voir
/// `docs/architecture/organization-foundation.md`.
pub mod organization;
/// Découverte d'organisation : trouver son service sans taper une adresse.
/// Voir `docs/architecture/organization-discovery.md`.
mod organization_discovery;
mod organization_packages;
/// Connexion Organization par SSO (Authorization Code + PKCE), Microsoft Entra
/// et Google Workspace. Voir `docs/architecture/microsoft-entra-sso.md` et
/// `docs/architecture/google-workspace-sso.md`.
mod organization_sso;
mod overlay;
mod performance;
pub mod portable;
mod quota;
mod rewrite;
mod screen_ocr;
mod screen_vision;
mod screen_vlm;
mod settings;
mod shortcut;
mod signal_handle;
mod telemetry;
mod transcription_coordinator;
mod tray;
mod tray_i18n;
mod utils;
mod week_stats;

pub use cli::CliArgs;
#[cfg(debug_assertions)]
use specta_typescript::{BigIntExportBehavior, Typescript};
use tauri_specta::{collect_commands, collect_events, Builder};

use env_filter::Builder as EnvFilterBuilder;
use managers::audio::AudioRecordingManager;
use managers::history::HistoryManager;
use managers::model::ModelManager;
use managers::transcription::TranscriptionManager;
#[cfg(unix)]
use signal_hook::consts::{SIGUSR1, SIGUSR2};
#[cfg(unix)]
use signal_hook::iterator::Signals;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::Arc;
use tauri::image::Image;
pub use transcription_coordinator::TranscriptionCoordinator;

use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Listener, Manager};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_log::{Builder as LogBuilder, RotationStrategy, Target, TargetKind};

use crate::settings::get_settings;

// Global atomic to store the file log level filter
// We use u8 to store the log::LevelFilter as a number
pub static FILE_LOG_LEVEL: AtomicU8 = AtomicU8::new(log::LevelFilter::Debug as u8);

/// When `true`, log records are also forwarded to the webview via the
/// `log://log` event for the debug panel's live log viewer. Gated on debug
/// mode — the live log viewer is its only consumer and only exists in debug
/// mode — so normal runs never broadcast log records (which can include file
/// paths or transcribed text) onto the frontend event bus. Synced at startup
/// and whenever debug mode is toggled (see `shortcut::change_debug_mode_setting`).
pub static WEBVIEW_LOG_STREAMING: AtomicBool = AtomicBool::new(false);

fn level_filter_from_u8(value: u8) -> log::LevelFilter {
    match value {
        0 => log::LevelFilter::Off,
        1 => log::LevelFilter::Error,
        2 => log::LevelFilter::Warn,
        3 => log::LevelFilter::Info,
        4 => log::LevelFilter::Debug,
        5 => log::LevelFilter::Trace,
        _ => log::LevelFilter::Trace,
    }
}

fn build_console_filter() -> env_filter::Filter {
    let mut builder = EnvFilterBuilder::new();

    match std::env::var("RUST_LOG") {
        Ok(spec) if !spec.trim().is_empty() => {
            if let Err(err) = builder.try_parse(&spec) {
                log::warn!(
                    "Ignoring invalid RUST_LOG value '{}': {}. Falling back to info-level console logging",
                    spec,
                    err
                );
                builder.filter_level(log::LevelFilter::Info);
            }
        }
        _ => {
            builder.filter_level(log::LevelFilter::Info);
        }
    }

    builder.build()
}

pub(crate) fn show_main_window(app: &AppHandle) {
    if let Some(main_window) = app.get_webview_window("main") {
        if let Err(e) = main_window.unminimize() {
            log::error!("Failed to unminimize webview window: {}", e);
        }
        if let Err(e) = main_window.show() {
            log::error!("Failed to show webview window: {}", e);
        }
        if let Err(e) = main_window.set_focus() {
            log::error!("Failed to focus webview window: {}", e);
        }
        #[cfg(target_os = "macos")]
        {
            if let Err(e) = app.set_activation_policy(tauri::ActivationPolicy::Regular) {
                log::error!("Failed to set activation policy to Regular: {}", e);
            }
        }
        return;
    }

    let webview_labels = app.webview_windows().keys().cloned().collect::<Vec<_>>();
    log::error!(
        "Main window not found. Webview labels: {:?}",
        webview_labels
    );
}

#[allow(unused_variables)]
fn should_force_show_permissions_window(app: &AppHandle) -> bool {
    #[cfg(target_os = "windows")]
    {
        let model_manager = app.state::<Arc<ModelManager>>();
        let has_downloaded_models = model_manager
            .get_available_models()
            .iter()
            .any(|model| model.is_downloaded);

        if !has_downloaded_models {
            return false;
        }

        let status = commands::audio::get_windows_microphone_permission_status();
        if status.supported && status.overall_access == commands::audio::PermissionAccess::Denied {
            log::info!(
                "Windows microphone permissions are denied; forcing main window visible for onboarding"
            );
            return true;
        }
    }

    false
}

fn initialize_core_logic(app_handle: &AppHandle) {
    // Note: Enigo (keyboard/mouse simulation) is NOT initialized here.
    // The frontend is responsible for calling the `initialize_enigo` command
    // after onboarding completes. This avoids triggering permission dialogs
    // on macOS before the user is ready.

    performance::apply_startup_policy_if_enabled(app_handle);

    // Initialize the managers. The audio recorder receives the streaming router
    // explicitly, so always-on microphone startup can wire live-preview frames
    // even before Tauri state is populated.
    let model_manager =
        Arc::new(ModelManager::new(app_handle).expect("Failed to initialize model manager"));
    let transcription_manager = Arc::new(
        TranscriptionManager::new(app_handle, model_manager.clone())
            .expect("Failed to initialize transcription manager"),
    );
    let recording_manager = Arc::new(
        AudioRecordingManager::new(app_handle, transcription_manager.stream_router())
            .expect("Failed to initialize recording manager"),
    );
    let history_manager =
        Arc::new(HistoryManager::new(app_handle).expect("Failed to initialize history manager"));

    // Initialize the transcribe-cpp native backend (logging + backend module
    // registration) on a background thread. On some Windows machines a
    // broken/buggy Vulkan driver makes native device enumeration inside this
    // call hang or spin a CPU core forever; run synchronously here — inside
    // Tauri's `.setup()`, before the event loop starts — that froze the
    // ENTIRE app before any window or tray icon ever appeared (reported: CPU
    // pegged on one core, nothing visible, no way back in). Code that
    // actually needs the registered devices (model load, GPU device listing)
    // waits for it with a bounded timeout instead of assuming it already ran
    // — see `wait_for_transcribe_backend_ready` in managers/transcription.rs.
    // If the previous run's init never returned, this launch skips the GPU
    // modules and initializes CPU compute only (hang recovery markers).
    {
        let handle = app_handle.clone();
        std::thread::spawn(move || managers::transcription::init_transcribe_backend(&handle));
    }

    // Apply accelerator preferences before any model loads
    managers::transcription::apply_accelerator_settings(app_handle);

    // Add managers to Tauri's managed state
    app_handle.manage(recording_manager.clone());
    app_handle.manage(model_manager.clone());
    app_handle.manage(transcription_manager.clone());
    app_handle.manage(history_manager.clone());
    app_handle.manage(tray::CurrentTrayIconState::new());
    app_handle.manage(local_llm::LocalLlmProcess::default());
    app_handle.manage(commands::meeting::MeetingSessionState::default());
    app_handle.manage(commands::campus::CampusState::default());

    // Note: Shortcuts are NOT initialized here.
    // The frontend is responsible for calling the `initialize_shortcuts` command
    // after permissions are confirmed (on macOS) or after onboarding completes.
    // This matches the pattern used for Enigo initialization.

    #[cfg(unix)]
    let signals = Signals::new([SIGUSR1, SIGUSR2]).unwrap();
    // Set up signal handlers for toggling transcription
    #[cfg(unix)]
    signal_handle::setup_signal_handler(app_handle.clone(), signals);

    // Apply macOS Accessory policy if starting hidden and tray is available.
    // If the tray icon is disabled, keep the dock icon so the user can reopen.
    #[cfg(target_os = "macos")]
    {
        let settings = settings::get_settings(app_handle);
        if settings.start_hidden && settings.show_tray_icon {
            let _ = app_handle.set_activation_policy(tauri::ActivationPolicy::Accessory);
        }
    }
    // Get the current theme to set the appropriate initial icon
    let initial_theme = tray::get_current_theme(app_handle);

    // Choose the appropriate initial icon based on theme
    let initial_icon_path = tray::get_icon_path(initial_theme, tray::TrayIconState::Idle);

    let tray = TrayIconBuilder::new()
        .icon(
            Image::from_path(
                app_handle
                    .path()
                    .resolve(initial_icon_path, tauri::path::BaseDirectory::Resource)
                    .unwrap(),
            )
            .unwrap(),
        )
        .tooltip(tray::tray_tooltip())
        .show_menu_on_left_click(true)
        .icon_as_template(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "settings" => {
                show_main_window(app);
            }
            "check_updates" => {
                let settings = settings::get_settings(app);
                if settings.update_checks_enabled {
                    show_main_window(app);
                    let _ = app.emit("check-for-updates", ());
                }
            }
            "copy_last_transcript" => {
                tray::copy_last_transcript(app);
            }
            "unload_model" => {
                let transcription_manager = app.state::<Arc<TranscriptionManager>>();
                if !transcription_manager.is_model_loaded() {
                    log::warn!("No model is currently loaded.");
                    return;
                }
                match transcription_manager.unload_model() {
                    Ok(()) => log::info!("Model unloaded via tray."),
                    Err(e) => log::error!("Failed to unload model via tray: {}", e),
                }
            }
            "cancel" => {
                use crate::utils::cancel_current_operation;

                // Use centralized cancellation that handles all operations
                cancel_current_operation(app);
            }
            "quit" => {
                app.exit(0);
            }
            id if id.starts_with("model_select:") => {
                let model_id = id.strip_prefix("model_select:").unwrap().to_string();
                let current_model = settings::get_settings(app).selected_model;
                if model_id == current_model {
                    return;
                }
                let app_clone = app.clone();
                std::thread::spawn(move || {
                    match commands::models::switch_active_model(&app_clone, &model_id) {
                        Ok(()) => {
                            log::info!("Model switched to {} via tray.", model_id);
                        }
                        Err(e) => {
                            log::error!("Failed to switch model via tray: {}", e);
                        }
                    }
                    tray::update_tray_menu(&app_clone, None);
                });
            }
            _ => {}
        })
        .build(app_handle)
        .unwrap();
    app_handle.manage(tray);

    // Initialize tray menu with idle state
    utils::update_tray_menu(app_handle, None);

    // Apply show_tray_icon setting
    let settings = settings::get_settings(app_handle);
    if !settings.show_tray_icon {
        tray::set_tray_visibility(app_handle, false);
    }

    // Refresh tray menu when model state changes
    let app_handle_for_listener = app_handle.clone();
    app_handle.listen("model-state-changed", move |_| {
        tray::update_tray_menu(&app_handle_for_listener, None);
    });

    // Get the autostart manager and configure based on user setting
    let autostart_manager = app_handle.autolaunch();
    let settings = settings::get_settings(app_handle);

    if settings.autostart_enabled {
        // Enable autostart if user has opted in
        let _ = autostart_manager.enable();
    } else {
        // Disable autostart if user has opted out
        let _ = autostart_manager.disable();
    }

    // Create the recording overlay window (hidden by default)
    utils::create_recording_overlay(app_handle);
}

#[tauri::command]
#[specta::specta]
fn trigger_update_check(app: AppHandle) -> Result<(), String> {
    let settings = settings::get_settings(&app);
    if !settings.update_checks_enabled {
        return Ok(());
    }
    app.emit("check-for-updates", ())
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
fn show_main_window_command(app: AppHandle) -> Result<(), String> {
    show_main_window(&app);
    Ok(())
}

/// Headless one-shot transcription for the `--transcribe-file` / `--list-devices`
/// path. Drives the same `TranscriptionManager::transcribe` the app uses; no
/// mic, no VAD, no download. Returns a process exit code (0 ok, 1 runtime
/// failure, 2 bad input/usage).
fn run_headless_transcription(app: &AppHandle, args: &CliArgs) -> i32 {
    use std::time::Instant;

    // --list-devices: print registered compute devices (with indices) and exit.
    // Useful on multi-GPU machines to discover the index for --device-index.
    if args.list_devices {
        let devices = crate::managers::transcription::describe_compute_devices();
        if devices.is_empty() {
            println!("No transcribe-cpp compute devices registered.");
        } else {
            println!("transcribe-cpp compute devices:");
            for d in &devices {
                println!("  {}", d);
            }
        }
        if args.transcribe_file.is_none() {
            return 0;
        }
    }

    // --list-models: print the model registry (catalog + on-disk + custom) with
    // their ids — the same ids `--model` accepts — then exit. `--json` emits the
    // full ModelInfo array for scripting.
    if args.list_models {
        let model_manager = app.state::<Arc<ModelManager>>();
        let models = model_manager.get_available_models();
        if args.json {
            match serde_json::to_string_pretty(&models) {
                Ok(s) => println!("{}", s),
                Err(e) => {
                    eprintln!("error: failed to serialize models: {}", e);
                    return 1;
                }
            }
        } else if models.is_empty() {
            println!("No models available.");
        } else {
            println!("Available models (✓ = installed):");
            let width = models.iter().map(|m| m.id.len()).max().unwrap_or(0);
            for m in &models {
                let mark = if m.is_downloaded { "✓" } else { " " };
                let rec = if m.is_recommended {
                    "  [recommended]"
                } else {
                    ""
                };
                println!(
                    "  {}  {:<width$}  {}{}",
                    mark,
                    m.id,
                    m.name,
                    rec,
                    width = width
                );
            }
        }
        if args.transcribe_file.is_none() {
            return 0;
        }
    }

    let Some(wav) = args.transcribe_file.clone() else {
        return 0;
    };

    // read_wav_samples reads 16-bit int samples and does no validation; the app
    // only ever saves 16 kHz mono 16-bit PCM, so reject anything else rather than
    // transcribe garbage / mis-time / mis-decode.
    match hound::WavReader::open(&wav) {
        Ok(reader) => {
            let spec = reader.spec();
            if spec.sample_rate != 16_000
                || spec.channels != 1
                || spec.bits_per_sample != 16
                || spec.sample_format != hound::SampleFormat::Int
            {
                eprintln!(
                    "error: expected 16 kHz mono 16-bit PCM WAV, got {} Hz / {} ch / {}-bit {:?}",
                    spec.sample_rate, spec.channels, spec.bits_per_sample, spec.sample_format
                );
                return 2;
            }
        }
        Err(e) => {
            eprintln!("error: cannot open {}: {}", wav.display(), e);
            return 2;
        }
    }

    let samples = match crate::audio_toolkit::read_wav_samples(&wav) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("error: failed to read {}: {}", wav.display(), e);
            return 2;
        }
    };
    let audio_secs = samples.len() as f64 / 16_000.0;

    let tm = app.state::<Arc<TranscriptionManager>>();

    let model_id = args
        .model
        .clone()
        .unwrap_or_else(|| get_settings(app).selected_model);
    if model_id.is_empty() {
        eprintln!("error: no model selected (pass --model or pick one in the app)");
        return 2;
    }

    // --device-index hard-selects a compute device by its --list-devices registry
    // index (transcribe-cpp / whisper-family models only; not persisted). Omit it
    // to use the persisted accelerator setting.
    let device_index = args.device_index;
    let requested_device = match device_index {
        Some(idx) => format!("index {}", idx),
        None => "settings".to_string(),
    };

    // Cold load (timed).
    let load_start = Instant::now();
    if let Err(e) = tm.load_model_with_device(&model_id, device_index) {
        eprintln!("error: load_model('{}') failed: {}", model_id, e);
        return 1;
    }
    let load_ms = load_start.elapsed().as_millis() as u64;
    let bound_backend = tm.current_backend();

    let runs = args.repeat.unwrap_or(1).max(1);
    let mut times_ms: Vec<u64> = Vec::new();
    let mut text = String::new();
    for i in 0..runs {
        // If the model's unload-timeout is "Immediately", transcribe() unloads
        // the engine after each run; reload (untimed) so repeats keep working
        // and the inference timing below stays clean.
        if !tm.is_model_loaded() {
            if let Err(e) = tm.load_model_with_device(&model_id, device_index) {
                eprintln!("error: reload before run {} failed: {}", i + 1, e);
                return 1;
            }
        }
        let t = Instant::now();
        match tm.transcribe(samples.clone()) {
            Ok(out) => text = out,
            Err(e) => {
                eprintln!("error: transcribe failed: {}", e);
                return 1;
            }
        }
        times_ms.push(t.elapsed().as_millis() as u64);
    }
    let best_ms = times_ms.iter().copied().min().unwrap_or(0);
    let rtf = if best_ms > 0 {
        audio_secs / (best_ms as f64 / 1000.0)
    } else {
        0.0
    };

    if args.json {
        println!(
            "{}",
            serde_json::json!({
                "model": model_id,
                "requested_device": requested_device,
                "bound_backend": bound_backend,
                "audio_secs": audio_secs,
                "load_ms": load_ms,
                "transcribe_ms": times_ms,
                "best_ms": best_ms,
                "rtf": rtf,
                "text": text,
            })
        );
    } else {
        println!(
            "model={} device={} backend={} audio={:.2}s load={}ms best={}ms rtf={:.2}x",
            model_id,
            requested_device,
            bound_backend.as_deref().unwrap_or("?"),
            audio_secs,
            load_ms,
            best_ms,
            rtf,
        );
        println!("text: {}", text);
    }
    0
}

/// Toutes les commandes et les evenements exposes a l'interface.
///
/// ## Un seul `.commands(...)`, et c'est un invariant
///
/// `Builder::commands()` ne cumule pas : il **remplace** la liste deja
/// enregistree (tauri-specta v2 reaffecte `commands` et `command_types`). Le
/// build Lab ajoutait sa commande par un second appel ; il ne restait donc que
/// `enroll_lab_device`, et le premier appel de l'interface repondait
/// « Command get_app_settings not found » — une fenetre inutilisable, sur
/// laquelle « Relancer Nova » ne pouvait que reproduire la meme erreur.
///
/// La liste vit donc dans une macro locale, invoquee **une fois**, avec la
/// commande Lab en supplement quand la feature est active. Les commandes sont
/// passees en `tt` et non en `path` : un fragment `path` deviendrait opaque et
/// ne se laisserait plus analyser par `collect_commands!`.
fn build_specta_builder() -> Builder<tauri::Wry> {
    macro_rules! nova_command_registry {
        ($($lab_commands:tt)*) => {
            collect_commands![
                shortcut::change_binding,
                shortcut::reset_binding,
                shortcut::change_ptt_setting,
                shortcut::change_audio_feedback_setting,
                shortcut::change_audio_feedback_volume_setting,
                shortcut::change_sound_theme_setting,
                shortcut::change_theme_setting,
                shortcut::change_start_hidden_setting,
                shortcut::change_autostart_setting,
                shortcut::change_translate_to_english_setting,
                shortcut::change_selected_language_setting,
                shortcut::change_overlay_position_setting,
                shortcut::change_overlay_style_setting,
                shortcut::change_persistent_overlay_setting,
                shortcut::change_debug_mode_setting,
                shortcut::change_word_correction_threshold_setting,
                shortcut::change_extra_recording_buffer_setting,
                shortcut::change_paste_delay_ms_setting,
                shortcut::change_paste_delay_after_ms_setting,
                shortcut::change_paste_method_setting,
                shortcut::get_available_typing_tools,
                shortcut::change_typing_tool_setting,
                shortcut::change_external_script_path_setting,
                shortcut::change_clipboard_handling_setting,
                shortcut::change_auto_submit_setting,
                shortcut::change_auto_submit_key_setting,
                shortcut::change_post_process_enabled_setting,
                shortcut::change_experimental_enabled_setting,
                shortcut::change_post_process_base_url_setting,
                shortcut::change_post_process_api_key_setting,
                shortcut::change_post_process_model_setting,
                shortcut::set_post_process_provider,
                shortcut::fetch_post_process_models,
                shortcut::add_post_process_prompt,
                shortcut::update_post_process_prompt,
                shortcut::delete_post_process_prompt,
                shortcut::set_post_process_selected_prompt,
                shortcut::update_custom_words,
                shortcut::update_custom_variables,
                shortcut::update_auto_style_config,
                shortcut::update_context_reading_config,
                shortcut::suspend_binding,
                shortcut::resume_binding,
                shortcut::change_mute_while_recording_setting,
                shortcut::change_append_trailing_space_setting,
                shortcut::change_lazy_stream_close_setting,
                shortcut::change_vad_enabled_setting,
                shortcut::change_lexicon_learning_setting,
                shortcut::change_app_language_setting,
                shortcut::change_update_checks_setting,
                shortcut::change_show_whats_new_on_update_setting,
                shortcut::change_whats_new_last_seen_version_setting,
                shortcut::change_keyboard_implementation_setting,
                shortcut::get_keyboard_implementation,
                shortcut::change_show_tray_icon_setting,
                shortcut::change_transcribe_accelerator_setting,
                shortcut::change_ort_accelerator_setting,
                shortcut::change_transcribe_gpu_device,
                shortcut::get_available_accelerators,
                shortcut::handy_keys::start_handy_keys_recording,
                shortcut::handy_keys::stop_handy_keys_recording,
                trigger_update_check,
                show_main_window_command,
                commands::cancel_operation,
                commands::trigger_transcription,
                commands::finish_recording,
                commands::copy_transcription,
                commands::dismiss_recording_overlay,
                commands::is_portable,
                commands::get_app_dir_path,
                commands::get_app_settings,
                commands::get_default_settings,
                nova_commands::nova_command_capture_selection,
                nova_commands::nova_command_replace,
                nova_commands::nova_command_diagnostics,
                commands::campus::get_campus_config,
                commands::campus::fetch_campus_server_config,
                commands::campus::set_campus_mode,
                organization_sso::sign_in_with_organization,
                organization_sso::organization_auth_providers,
                organization_discovery::discover_organization,
                deployment::get_deployment_state,
                commands::campus::load_campus_session,
                commands::campus::clear_campus_session,
                commands::campus::logout_campus_session,
                commands::campus::complete_campus_onboarding,
                commands::campus::check_campus_server_reachability,
                commands::campus::request_campus_auth,
                commands::campus::verify_campus_auth,
                commands::campus::start_campus_entra_auth,
                commands::campus::poll_campus_entra_auth,
                commands::campus::get_campus_me,
                commands::campus::get_campus_vocabulary,
                commands::campus::add_campus_dictionary_entry,
                commands::campus::delete_campus_dictionary_entry,
                commands::campus::learn_campus_dictionary,
                commands::campus::export_campus_dictionary,
                commands::campus::import_campus_dictionary,
                commands::campus::analyze_campus_document,
                commands::campus::add_campus_snippet,
                commands::campus::delete_campus_snippet,
                commands::campus::get_campus_formatting_rules,
                commands::campus::add_campus_formatting_rule,
                commands::campus::delete_campus_formatting_rule,
                commands::campus::execute_campus_command,
                commands::campus::get_campus_ai_skills,
                commands::campus::refresh_organization_packages,
                commands::campus::fetch_learning_catalog,
                commands::campus::fetch_learning_progress,
                commands::campus::update_learning_progress,
                commands::campus::request_learning_feedback,
                commands::campus::clear_organization_packages,
                commands::campus::run_organization_skill,
                commands::campus::format_campus_engineering_notes,
                commands::campus::transcribe_campus_audio_file,
                commands::get_lexicon_suggestions,
                commands::accept_lexicon_suggestion,
                commands::dismiss_lexicon_suggestion,
                commands::get_log_dir_path,
                commands::get_recent_log_lines,
                commands::set_log_level,
                commands::open_recordings_folder,
                commands::open_log_dir,
                commands::open_app_data_dir,
                commands::check_apple_intelligence_available,
                commands::initialize_enigo,
                commands::initialize_shortcuts,
                commands::models::get_available_models,
                commands::models::get_model_info,
                commands::models::download_model,
                commands::models::delete_model,
                commands::models::cancel_download,
                commands::local_llm::get_local_llm_profiles,
                commands::local_llm::activate_local_llm_profile,
                commands::license::get_license_status,
                commands::license::acknowledge_trial_expired,
                commands::license::activate_license,
                commands::license::activate_license_code,
                commands::license::clear_license,
                commands::license::open_billing_portal,
                quota::get_quota_status,
                week_stats::get_week_stat,
                overlay::set_overlay_menu_height,
                commands::models::set_active_model,
                commands::models::get_current_model,
                commands::models::get_transcription_model_status,
                commands::models::is_model_loading,
                commands::models::rescan_local_models,
                commands::audio::update_microphone_mode,
                commands::audio::get_microphone_mode,
                commands::audio::get_windows_microphone_permission_status,
                commands::audio::open_microphone_privacy_settings,
                commands::audio::get_available_microphones,
                commands::audio::set_selected_microphone,
                commands::audio::get_selected_microphone,
                commands::audio::get_available_output_devices,
                commands::audio::set_selected_output_device,
                commands::audio::get_selected_output_device,
                commands::audio::play_test_sound,
                commands::audio::check_custom_sounds,
                commands::audio::set_clamshell_microphone,
                commands::audio::get_clamshell_microphone,
                commands::audio::is_recording,
                commands::transcription::set_model_unload_timeout,
                commands::transcription::get_model_load_status,
                commands::transcription::unload_model_manually,
                commands::transcription::is_transcribe_cpu_only_mode,
                commands::transcription::clear_transcribe_gpu_blacklist,
                meeting_capture::probe_meeting_capture,
                commands::meeting::list_meeting_apps,
                commands::meeting::start_meeting,
                commands::meeting::stop_meeting,
                performance::run_performance_diagnostics,
                performance::apply_adaptive_performance,
                performance::change_adaptive_performance_setting,
                performance::clear_performance_history,
                performance::acknowledge_thinking_frame,
                commands::history::get_history_entries,
                commands::history::toggle_history_entry_saved,
                commands::history::get_audio_file_path,
                commands::history::delete_history_entry,
                commands::history::retry_history_entry_transcription,
                commands::history::update_history_limit,
                commands::history::update_recording_retention_period,
                helpers::clamshell::is_laptop,
                $($lab_commands)*
            ]
        };
    }

    // Le paquet Desktop ordinaire n'expose aucune surface Lab.
    #[cfg(not(feature = "lab"))]
    let commands = nova_command_registry!();

    // L'artefact de demonstration ajoute l'enrolement — a la meme liste, jamais
    // par un second enregistrement.
    #[cfg(feature = "lab")]
    let commands = nova_command_registry!(
        lab_enrollment::enroll_lab_device,
        commands::campus::lab_connection_active
    );

    Builder::<tauri::Wry>::new()
        .commands(commands)
        .events(collect_events![
            managers::history::HistoryUpdatePayload,
            managers::transcription::StreamTextEvent,
            managers::transcription::StreamPhaseEvent,
            nova_commands::NovaCommandCaptureEvent,
            dictation_state::DictationStateEvent,
        ])
}

/// Ce que le paquet expose reellement, verifie sur les liaisons rendues.
///
/// Le bug corrige ici ne se voyait ni a la lecture du `Cargo.toml`, ni a la
/// compilation : le build Lab compilait parfaitement et ne perdait ses commandes
/// qu'a l'execution, au premier `invoke`. Seule l'inspection de la table
/// reellement enregistree peut donc l'attraper — c'est ce que fait
/// `export_str`, qui rend exactement ce que `Builder` a retenu.
#[cfg(test)]
mod specta_registration {
    use super::build_specta_builder;
    use specta_typescript::{BigIntExportBehavior, Typescript};

    fn registered_commands() -> String {
        build_specta_builder()
            .export_str(Typescript::default().bigint(BigIntExportBehavior::Number))
            .expect("les liaisons TypeScript doivent se rendre")
    }

    /// Un echantillon des commandes dont depend le premier ecran. Sans elles,
    /// l'interface ne peut meme pas se decider a afficher quoi que ce soit.
    const ESSENTIAL: [&str; 4] = [
        "get_app_settings",
        "get_available_models",
        "load_campus_session",
        "get_history_entries",
    ];

    #[test]
    fn the_ordinary_commands_are_registered() {
        let bindings = registered_commands();
        for command in ESSENTIAL {
            assert!(
                bindings.contains(command),
                "commande absente des liaisons : {command}"
            );
        }
    }

    /// La regression exacte : un second `.commands(...)` effacait tout le reste.
    #[cfg(feature = "lab")]
    #[test]
    fn the_lab_build_adds_enrollment_without_losing_anything() {
        let bindings = registered_commands();
        assert!(
            bindings.contains("enroll_lab_device"),
            "l'artefact Lab doit exposer l'enrolement"
        );
        for command in ESSENTIAL {
            assert!(
                bindings.contains(command),
                "l'artefact Lab a perdu une commande ordinaire : {command}"
            );
        }
    }

    /// Et le paquet Desktop ordinaire n'en sait toujours rien.
    #[cfg(not(feature = "lab"))]
    #[test]
    fn the_ordinary_build_exposes_no_lab_command() {
        assert!(
            !registered_commands().contains("enroll_lab_device"),
            "le paquet Nova ordinaire ne doit pas exposer la surface Lab"
        );
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(cli_args: CliArgs) {
    // Rapport de plantage (dormant tant que NOVA_SENTRY_DSN est vide) — au plus
    // tôt pour capturer même un panic au démarrage. Le garde vit jusqu'à la
    // fermeture de l'app (run() ne rend la main qu'à la sortie).
    let _sentry_guard = telemetry::init();

    // Detect portable mode before anything else
    portable::init();

    // Parse console logging directives from RUST_LOG, falling back to info-level logging
    // when the variable is unset
    let console_filter = build_console_filter();

    let specta_builder = build_specta_builder();

    #[cfg(debug_assertions)] // <- Only export on non-release builds
    specta_builder
        .export(
            Typescript::default().bigint(BigIntExportBehavior::Number),
            "../src/bindings.ts",
        )
        .expect("Failed to export typescript bindings");

    let invoke_handler = specta_builder.invoke_handler();

    // The headless path must run as its own instance (see the single-instance
    // note below), not forward to an already-running app.
    let headless_mode =
        cli_args.transcribe_file.is_some() || cli_args.list_devices || cli_args.list_models;

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .device_event_filter(tauri::DeviceEventFilter::Always)
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            LogBuilder::new()
                .level(log::LevelFilter::Trace) // Set to most verbose level globally
                .max_file_size(500_000)
                .rotation_strategy(RotationStrategy::KeepOne)
                .clear_targets()
                .targets([
                    // Console output respects RUST_LOG environment variable. In
                    // headless mode (--transcribe-file/--list-devices/--list-models)
                    // stdout carries only the result (JSON or plain), so send console
                    // logs to stderr instead to keep stdout clean for CI parsing.
                    Target::new(if headless_mode {
                        TargetKind::Stderr
                    } else {
                        TargetKind::Stdout
                    })
                    .filter({
                        let console_filter = console_filter.clone();
                        move |metadata| console_filter.enabled(metadata)
                    }),
                    // File logs respect the user's settings (stored in FILE_LOG_LEVEL atomic)
                    Target::new(if let Some(data_dir) = portable::data_dir() {
                        TargetKind::Folder {
                            path: data_dir.join("logs"),
                            file_name: Some("handy".into()),
                        }
                    } else {
                        TargetKind::LogDir {
                            file_name: Some("handy".into()),
                        }
                    })
                    .filter(|metadata| {
                        let file_level = FILE_LOG_LEVEL.load(Ordering::Relaxed);
                        metadata.level() <= level_filter_from_u8(file_level)
                    }),
                    // Stream logs to the webview (via the `log://log` event) so the
                    // debug panel's live log viewer can show them in real time. Only
                    // active while debug mode is on (its sole consumer), and shares the
                    // file log level so the "Log Level" setting controls verbosity.
                    Target::new(TargetKind::Webview).filter(|metadata| {
                        WEBVIEW_LOG_STREAMING.load(Ordering::Relaxed)
                            && metadata.level()
                                <= level_filter_from_u8(FILE_LOG_LEVEL.load(Ordering::Relaxed))
                    }),
                ])
                .build(),
        );

    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_nspanel::init());
    }

    // Single-instance forwards CLI args to an already-running Handy and exits.
    // That would make the headless path
    // (--transcribe-file/--list-devices/--list-models) a silent no-op whenever the
    // app is already open, so skip it in headless mode and run a standalone
    // instance instead.
    if !headless_mode {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if args.iter().any(|a| a == "--toggle-transcription") {
                signal_handle::send_transcription_input(app, "transcribe", "CLI");
            } else if args.iter().any(|a| a == "--toggle-post-process") {
                signal_handle::send_transcription_input(app, "transcribe_with_post_process", "CLI");
            } else if args.iter().any(|a| a == "--cancel") {
                crate::utils::cancel_current_operation(app);
            } else {
                show_main_window(app);
            }
        }));
    }

    builder = builder
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init());

    // Un artefact Lab est volontairement éphémère et installé côte à côte. Il
    // ne doit jamais consulter le canal de mise à jour de Nova puis se changer
    // silencieusement en binaire de production sous son identité de test.
    #[cfg(not(feature = "lab"))]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_macos_permissions::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .manage(cli_args.clone())
        .setup(move |app| {
            specta_builder.mount_events(app);

            // Headless one-shot path (`--transcribe-file` / `--list-devices` /
            // `--list-models`): initialize only what transcription needs — the
            // store/paths plugins, the model + transcription managers, and the
            // transcribe-cpp backend + accelerator settings — then run on a worker
            // thread and exit. Deliberately skips the window, tray, overlay, audio
            // recorder (so it never opens the mic, even with always_on_microphone),
            // signal handlers, and autostart that initialize_core_logic sets up.
            if headless_mode {
                let app_handle = app.handle().clone();
                let model_manager = Arc::new(
                    ModelManager::new(&app_handle).expect("Failed to initialize model manager"),
                );
                let transcription_manager = Arc::new(
                    TranscriptionManager::new(&app_handle, model_manager.clone())
                        .expect("Failed to initialize transcription manager"),
                );
                app_handle.manage(model_manager);
                app_handle.manage(transcription_manager);
                managers::transcription::init_transcribe_backend(&app_handle);
                managers::transcription::apply_accelerator_settings(&app_handle);

                let handle = app_handle.clone();
                let args = cli_args.clone();
                std::thread::spawn(move || {
                    let code = run_headless_transcription(&handle, &args);
                    // Drop the loaded engine before teardown: ggml-metal's global
                    // device free asserts (SIGABRT) if a model's Metal resources
                    // are still alive at C++ static-destructor time.
                    if let Some(tm) = handle.try_state::<Arc<TranscriptionManager>>() {
                        let _ = tm.unload_model();
                    }
                    // process::exit (not app.exit, which exits 0 regardless) so the
                    // exit code propagates to the shell for CI gating. Flush first
                    // since process::exit runs no destructors / buffer flushes.
                    use std::io::Write;
                    let _ = std::io::stdout().flush();
                    let _ = std::io::stderr().flush();
                    std::process::exit(code);
                });
                return Ok(());
            }

            // Create main window programmatically so we can set data_directory
            // for portable mode (redirects WebView2 cache to portable Data dir)
            let mut win_builder =
                tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("/".into()))
                    // Le binaire Lab s'installe a cote de Nova. Deux fenetres
                    // intitulees « Nova » dans la barre des taches, c'est une
                    // ambiguite que l'utilisateur paie : il ferme la mauvaise.
                    .title(if cfg!(feature = "lab") {
                        "Nova Lab"
                    } else {
                        "Nova"
                    })
                    // Fenêtre spacieuse par défaut : l'ancienne 680×570 tassait
                    // tout et rendait les réglages illisibles. On garde un
                    // minimum utilisable et on autorise l'agrandissement/plein
                    // écran.
                    .inner_size(1080.0, 800.0)
                    .min_inner_size(760.0, 620.0)
                    .resizable(true)
                    .maximizable(true)
                    .center()
                    .visible(false);

            if let Some(data_dir) = portable::data_dir() {
                win_builder = win_builder.data_directory(data_dir.join("webview"));
            }

            win_builder.build()?;

            let mut settings = get_settings(app.handle());

            // Apply the persisted appearance theme to the Windows title bar before
            // the window is shown, so it matches the in-app palette without a flash
            // of the wrong theme. On macOS/Linux, Tauri themes are app-wide and
            // would also affect windows that intentionally keep the system theme.
            #[cfg(target_os = "windows")]
            shortcut::apply_window_theme(app.handle(), settings.theme);

            // CLI --debug flag overrides debug_mode and log level (runtime-only, not persisted)
            if cli_args.debug {
                settings.debug_mode = true;
                settings.log_level = settings::LogLevel::Trace;
            }

            let tauri_log_level: tauri_plugin_log::LogLevel = settings.log_level.into();
            let file_log_level: log::Level = tauri_log_level.into();
            // Store the file log level in the atomic for the filter to use
            FILE_LOG_LEVEL.store(file_log_level.to_level_filter() as u8, Ordering::Relaxed);
            // Only forward logs to the webview while debug mode is on (the live log
            // viewer is the sole consumer and only exists in debug mode). This also
            // honors the runtime `--debug` override applied to `settings` above.
            WEBVIEW_LOG_STREAMING.store(settings.debug_mode, Ordering::Relaxed);
            let app_handle = app.handle().clone();
            app.manage(TranscriptionCoordinator::new(app_handle.clone()));

            initialize_core_logic(&app_handle);

            // Populate the overlay-enabled cache from initial settings so the
            // audio path (overlay::emit_levels, called ~24 Hz during recording)
            // can do a single atomic load instead of reading the Tauri store.
            // Kept in sync by shortcut::change_overlay_style_setting.
            overlay::update_overlay_enabled_cache(
                settings.overlay_style != settings::OverlayStyle::None,
            );

            // Bulle « toujours affichée » : montre l'état de repos dès le
            // démarrage (avec engrenage de choix de Style). Sans effet si
            // l'overlay est désactivé (overlay_style = None).
            if settings.persistent_overlay && settings.overlay_style != settings::OverlayStyle::None
            {
                overlay::show_idle_overlay(&app_handle);
            }

            // Pre-warm GPU/accelerator enumeration on a background thread. The first
            // get_available_accelerators call enumerates ORT execution providers and
            // transcribe-cpp compute devices, which can take a moment; without this
            // the cost is paid synchronously when the user first opens Advanced
            // settings, freezing the UI. Result is cached in a OnceLock.
            std::thread::spawn(|| {
                let _ = crate::managers::transcription::get_available_accelerators();
            });

            // Préchauffe l'Intelligence privée (moteur local) en arrière-plan si
            // c'est le moteur de reformulation actif et que son modèle est déjà
            // téléchargé : `llama-server` charge alors le modèle pendant que
            // l'utilisateur s'installe, plutôt qu'au moment de la première
            // dictée. Best-effort, non bloquant, jamais de téléchargement ici.
            //
            // Rien de tout cela dans l'artefact Lab : il ne sert qu'a rejoindre
            // un serveur de test, dont le GPU porte l'IA. Precharger un modele
            // local y ferait telecharger 600 Mo sur un poste de demonstration
            // pour un moteur que ce build n'utilisera jamais.
            #[cfg(not(feature = "lab"))]
            {
                let prewarm_handle = app_handle.clone();
                let prewarm_settings = settings.clone();
                tauri::async_runtime::spawn(async move {
                    crate::local_llm::prewarm_if_selected(&prewarm_handle, &prewarm_settings).await;
                });
            }

            // Installe l'Intelligence privée (moteur + modèle recommandé) dès le
            // premier lancement, en arrière-plan : la première reformulation
            // locale est ainsi immédiate, sans aucune action de l'utilisateur, et
            // à l'identique sur tous les paliers. Non bloquant et défensif — un
            // échec (réseau absent…) laisse le premier lancement se poursuivre et
            // sera réessayé au lancement suivant.
            #[cfg(not(feature = "lab"))]
            {
                let provision_handle = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    crate::local_llm::provision_default_model_in_background(&provision_handle)
                        .await;
                });
            }

            // Récupère le jeton gratuit signé (NOVAF1) auprès de trial-check :
            // sans licence, c'est lui qui authentifie les reformulations Turbo
            // du palier Gratuit. Défensif — un échec retente au prochain
            // lancement, la dictée locale n'est jamais impactée.
            //
            // Le Lab n'a pas de palier a authentifier : ses reformulations
            // passent par le serveur de test. Reclamer un jeton d'essai depuis
            // un artefact de demonstration melangerait son identite a celle de
            // Nova, dont il est justement separe.
            #[cfg(not(feature = "lab"))]
            {
                let token_handle = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    crate::commands::license::fetch_and_store_free_token(&token_handle).await;
                });
            }

            // Un poste deja enrole dans un Lab doit repartir enrole. Sans cette
            // restauration, le certificat epingle et le jeton du peripherique
            // disparaissaient a la fermeture, la liaison TLS echouait au
            // lancement suivant, et Nova Lab retombait en mode local en
            // paraissant l'avoir choisi.
            #[cfg(feature = "lab")]
            match crate::commands::campus::restore_lab_connection(&app_handle) {
                Ok(true) => log::info!("Enrolement Lab restaure depuis le trousseau du systeme"),
                Ok(false) => log::debug!("Aucun enrolement Lab a restaurer"),
                Err(error) => log::warn!("Enrolement Lab non restaure : {error}"),
            }

            // Hide tray icon if --no-tray was passed
            if cli_args.no_tray {
                tray::set_tray_visibility(&app_handle, false);
            }

            // Show main window only if not starting hidden.
            // CLI --start-hidden flag overrides the setting.
            // But if permission onboarding is required, always show the window.
            let should_hide = settings.start_hidden || cli_args.start_hidden;
            let should_force_show = should_force_show_permissions_window(&app_handle);

            // If start_hidden but tray is disabled, we must show the window
            // anyway. Without a tray icon, the dock is the only way back in.
            let tray_available = settings.show_tray_icon && !cli_args.no_tray;
            if should_force_show || !should_hide || !tray_available {
                show_main_window(&app_handle);
            }

            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _res = window.hide();

                #[cfg(target_os = "macos")]
                {
                    let settings = get_settings(window.app_handle());
                    let tray_visible =
                        settings.show_tray_icon && !window.app_handle().state::<CliArgs>().no_tray;
                    if tray_visible {
                        // Tray is available: hide the dock icon, app lives in the tray
                        let res = window
                            .app_handle()
                            .set_activation_policy(tauri::ActivationPolicy::Accessory);
                        if let Err(e) = res {
                            log::error!("Failed to set activation policy: {}", e);
                        }
                    }
                    // No tray: keep the dock icon visible so the user can reopen
                }
            }
            tauri::WindowEvent::ThemeChanged(theme) => {
                log::info!("Theme changed to: {:?}", theme);
                // Re-apply the current tray state with the new theme's icon set
                utils::refresh_tray_icon(window.app_handle());
            }
            _ => {}
        })
        .invoke_handler(invoke_handler)
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match &event {
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => {
                show_main_window(app);
            }
            // Teardown transcribe.cpp before exit
            tauri::RunEvent::Exit => {
                if let Some(tm) = app.try_state::<Arc<TranscriptionManager>>() {
                    let _ = tm.unload_model();
                }
                local_llm::shutdown(app);
            }
            _ => {}
        });
}
