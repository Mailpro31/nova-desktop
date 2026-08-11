//! Adaptive performance policy and lightweight end-to-end latency telemetry.
//!
//! This module deliberately keeps measurements local. No transcription text,
//! filenames, API keys, or window titles are stored in a sample.

use crate::audio_toolkit::audio::list_input_devices;
use crate::managers::transcription::{
    get_available_accelerators, is_transcribe_cpu_only_mode, TranscriptionManager,
};
use crate::settings::{
    get_settings, write_settings, ModelUnloadTimeout, OrtAcceleratorSetting,
    TranscribeAcceleratorSetting,
};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::{BTreeMap, VecDeque};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use sysinfo::System;
use tauri::{AppHandle, Emitter, Manager};

const MAX_LATENCY_SAMPLES: usize = 240;
const LOW_MEMORY_BYTES: u64 = 10 * 1024 * 1024 * 1024;
const VERY_LOW_MEMORY_BYTES: u64 = 7 * 1024 * 1024 * 1024;

static LATENCY_SAMPLES: LazyLock<Mutex<VecDeque<LatencySample>>> =
    LazyLock::new(|| Mutex::new(VecDeque::with_capacity(MAX_LATENCY_SAMPLES)));
static UI_HANDOFF_ID: AtomicU64 = AtomicU64::new(0);
static UI_HANDOFF_NOTIFY: LazyLock<tokio::sync::Notify> = LazyLock::new(tokio::sync::Notify::new);

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct LatencySample {
    pub stage: String,
    pub duration_ms: u64,
    pub timestamp_ms: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct LatencyStats {
    pub stage: String,
    pub count: usize,
    pub median_ms: u64,
    pub p95_ms: u64,
    pub last_ms: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum AdaptiveClass {
    LowMemory,
    Balanced,
    Performance,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct DeviceProfile {
    pub class: AdaptiveClass,
    pub total_memory_mb: u64,
    pub available_memory_mb: u64,
    pub logical_cpus: usize,
    pub cpu_name: String,
    pub cpu_score: u64,
    pub gpu_count: usize,
    pub cpu_only_fallback: bool,
    pub recommended_model_unload: String,
    pub recommended_accelerator: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum DiagnosticStatus {
    Ok,
    Warning,
    Error,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct DiagnosticCheck {
    pub id: String,
    pub status: DiagnosticStatus,
    pub detail: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct PerformanceReport {
    pub device: DeviceProfile,
    pub latency: Vec<LatencyStats>,
    pub checks: Vec<DiagnosticCheck>,
    pub adaptive_enabled: bool,
}

/// Record one anonymous pipeline span in the in-memory rolling window.
pub fn record_latency(stage: &str, elapsed: Duration) {
    let sample = LatencySample {
        stage: stage.to_string(),
        duration_ms: elapsed.as_millis().min(u64::MAX as u128) as u64,
        timestamp_ms: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
            .min(u64::MAX as u128) as u64,
    };

    if let Ok(mut samples) = LATENCY_SAMPLES.lock() {
        if samples.len() == MAX_LATENCY_SAMPLES {
            samples.pop_front();
        }
        samples.push_back(sample);
    }
}

/// Let the overlay paint its completed progress state before insertion. The UI
/// acknowledges on the next animation frame; the short timeout is only a
/// fail-safe for a closed webview, not a fixed delay on the normal path.
pub async fn wait_for_thinking_frame(app: &AppHandle) {
    let id = UI_HANDOFF_ID.fetch_add(1, Ordering::SeqCst) + 1;
    let _ = app.emit("thinking-complete", id);
    let _ = tokio::time::timeout(Duration::from_millis(120), UI_HANDOFF_NOTIFY.notified()).await;
}

#[tauri::command]
#[specta::specta]
pub fn acknowledge_thinking_frame(id: u64) {
    if UI_HANDOFF_ID.load(Ordering::SeqCst) == id {
        UI_HANDOFF_NOTIFY.notify_one();
    }
}

fn percentile(sorted: &[u64], numerator: usize, denominator: usize) -> u64 {
    if sorted.is_empty() {
        return 0;
    }
    let index = ((sorted.len() - 1) * numerator).div_ceil(denominator);
    sorted[index.min(sorted.len() - 1)]
}

fn latency_stats() -> Vec<LatencyStats> {
    let Ok(samples) = LATENCY_SAMPLES.lock() else {
        return Vec::new();
    };
    let mut grouped: BTreeMap<String, Vec<u64>> = BTreeMap::new();
    for sample in samples.iter() {
        grouped
            .entry(sample.stage.clone())
            .or_default()
            .push(sample.duration_ms);
    }

    grouped
        .into_iter()
        .map(|(stage, mut values)| {
            let last_ms = values.last().copied().unwrap_or_default();
            values.sort_unstable();
            LatencyStats {
                stage,
                count: values.len(),
                median_ms: percentile(&values, 1, 2),
                p95_ms: percentile(&values, 95, 100),
                last_ms,
            }
        })
        .collect()
}

fn cpu_micro_benchmark() -> u64 {
    // Short, deterministic integer workload. It is intentionally bounded to
    // avoid making the diagnostics button itself feel slow on small CPUs.
    let started = Instant::now();
    let mut iterations = 0_u64;
    let mut value = 0x9e37_79b9_7f4a_7c15_u64;
    while started.elapsed() < Duration::from_millis(120) {
        for _ in 0..4_096 {
            value ^= value.rotate_left(13).wrapping_mul(0xbf58_476d_1ce4_e5b9);
            value = value.wrapping_add(0x94d0_49bb_1331_11eb);
        }
        iterations += 4_096;
    }
    std::hint::black_box(value);
    iterations / started.elapsed().as_millis().max(1) as u64
}

fn inspect_device(run_benchmark: bool) -> DeviceProfile {
    let mut system = System::new_all();
    system.refresh_memory();
    system.refresh_cpu_all();

    let total_memory = system.total_memory();
    let available_memory = system.available_memory();
    let logical_cpus = system.cpus().len();
    let cpu_name = system
        .cpus()
        .first()
        .map(|cpu| cpu.brand().trim().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "CPU".to_string());
    let accelerators = get_available_accelerators();
    let gpu_count = accelerators.gpu_devices.len();
    let cpu_only_fallback = is_transcribe_cpu_only_mode();
    let class = if total_memory <= VERY_LOW_MEMORY_BYTES || logical_cpus <= 4 {
        AdaptiveClass::LowMemory
    } else if total_memory <= LOW_MEMORY_BYTES || logical_cpus <= 8 {
        AdaptiveClass::Balanced
    } else {
        AdaptiveClass::Performance
    };

    let recommended_model_unload = match class {
        AdaptiveClass::LowMemory => "immediately",
        AdaptiveClass::Balanced => "min2",
        AdaptiveClass::Performance => "min5",
    }
    .to_string();
    let recommended_accelerator = if cpu_only_fallback || gpu_count == 0 {
        "cpu"
    } else {
        "auto"
    }
    .to_string();

    DeviceProfile {
        class,
        total_memory_mb: total_memory / 1024 / 1024,
        available_memory_mb: available_memory / 1024 / 1024,
        logical_cpus,
        cpu_name,
        cpu_score: if run_benchmark {
            cpu_micro_benchmark()
        } else {
            0
        },
        gpu_count,
        cpu_only_fallback,
        recommended_model_unload,
        recommended_accelerator,
    }
}

fn apply_profile(app: &AppHandle, device: &DeviceProfile) {
    let mut settings = get_settings(app);
    settings.adaptive_performance_enabled = true;
    settings.model_unload_timeout = match device.class {
        AdaptiveClass::LowMemory => ModelUnloadTimeout::Immediately,
        AdaptiveClass::Balanced => ModelUnloadTimeout::Min2,
        AdaptiveClass::Performance => ModelUnloadTimeout::Min5,
    };
    if device.cpu_only_fallback || device.gpu_count == 0 {
        settings.transcribe_accelerator = TranscribeAcceleratorSetting::Cpu;
        settings.ort_accelerator = OrtAcceleratorSetting::Cpu;
    } else {
        settings.transcribe_accelerator = TranscribeAcceleratorSetting::Auto;
        settings.ort_accelerator = OrtAcceleratorSetting::Auto;
    }
    // Closing the source stream promptly frees native audio resources and is
    // especially useful on low-memory systems and flaky Windows audio drivers.
    settings.lazy_stream_close = false;
    write_settings(app, settings);
}

/// Re-evaluate only the cheap RAM policy during startup. Accelerator probing is
/// intentionally excluded here because a faulty graphics driver must never
/// delay the Tauri setup path.
pub fn apply_startup_policy_if_enabled(app: &AppHandle) {
    let mut settings = get_settings(app);
    if !settings.adaptive_performance_enabled {
        return;
    }
    let mut system = System::new();
    system.refresh_memory();
    settings.model_unload_timeout = if system.total_memory() <= VERY_LOW_MEMORY_BYTES {
        ModelUnloadTimeout::Immediately
    } else if system.total_memory() <= LOW_MEMORY_BYTES {
        ModelUnloadTimeout::Min2
    } else {
        ModelUnloadTimeout::Min5
    };
    write_settings(app, settings);
}

fn diagnostic_checks(app: &AppHandle, device: &DeviceProfile) -> Vec<DiagnosticCheck> {
    let settings = get_settings(app);
    let microphone_count = list_input_devices().map(|devices| devices.len());
    let transcription_manager = app.state::<Arc<TranscriptionManager>>();
    let provider_ready = settings
        .active_post_process_provider()
        .map(|provider| {
            let key = settings
                .post_process_api_keys
                .get(&provider.id)
                .map(String::as_str)
                .unwrap_or("");
            matches!(
                provider.id.as_str(),
                "nova_turbo" | crate::local_llm::PROVIDER_ID | "apple_intelligence"
            ) || !key.trim().is_empty()
        })
        .unwrap_or(false);

    let mut checks = Vec::new();
    checks.push(match microphone_count {
        Ok(count) if count > 0 => DiagnosticCheck {
            id: "microphone".to_string(),
            status: DiagnosticStatus::Ok,
            detail: format!("{count} microphone(s) detected"),
        },
        Ok(_) => DiagnosticCheck {
            id: "microphone".to_string(),
            status: DiagnosticStatus::Error,
            detail: "No microphone detected".to_string(),
        },
        Err(error) => DiagnosticCheck {
            id: "microphone".to_string(),
            status: DiagnosticStatus::Error,
            detail: format!("Microphone enumeration failed: {error}"),
        },
    });
    checks.push(DiagnosticCheck {
        id: "transcription_model".to_string(),
        status: if transcription_manager.get_current_model().is_some() {
            DiagnosticStatus::Ok
        } else {
            DiagnosticStatus::Warning
        },
        detail: transcription_manager
            .get_current_model()
            .map(|model| format!("Selected model: {model}"))
            .unwrap_or_else(|| "No transcription model selected".to_string()),
    });
    checks.push(DiagnosticCheck {
        id: "online_rewrite".to_string(),
        status: if provider_ready {
            DiagnosticStatus::Ok
        } else {
            DiagnosticStatus::Warning
        },
        detail: if provider_ready {
            "Online rewrite provider is configured".to_string()
        } else {
            "Online rewrite provider needs configuration".to_string()
        },
    });
    checks.push(DiagnosticCheck {
        id: "memory".to_string(),
        status: if device.available_memory_mb < 1_024 {
            DiagnosticStatus::Warning
        } else {
            DiagnosticStatus::Ok
        },
        detail: format!("{} MB available", device.available_memory_mb),
    });
    checks.push(DiagnosticCheck {
        id: "accelerator".to_string(),
        status: if device.cpu_only_fallback {
            DiagnosticStatus::Warning
        } else {
            DiagnosticStatus::Ok
        },
        detail: if device.cpu_only_fallback {
            "GPU disabled after a driver failure; CPU fallback is active".to_string()
        } else if device.gpu_count == 0 {
            "No compatible GPU detected; CPU mode is recommended".to_string()
        } else {
            format!("{} compatible GPU(s) detected", device.gpu_count)
        },
    });
    checks
}

#[tauri::command]
#[specta::specta]
pub async fn run_performance_diagnostics(app: AppHandle) -> Result<PerformanceReport, String> {
    let device = tauri::async_runtime::spawn_blocking(|| inspect_device(true))
        .await
        .map_err(|error| format!("Device benchmark failed: {error}"))?;
    let checks = diagnostic_checks(&app, &device);
    Ok(PerformanceReport {
        adaptive_enabled: get_settings(&app).adaptive_performance_enabled,
        device,
        latency: latency_stats(),
        checks,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn apply_adaptive_performance(app: AppHandle) -> Result<DeviceProfile, String> {
    let device = tauri::async_runtime::spawn_blocking(|| inspect_device(true))
        .await
        .map_err(|error| format!("Device benchmark failed: {error}"))?;
    apply_profile(&app, &device);
    Ok(device)
}

#[tauri::command]
#[specta::specta]
pub fn change_adaptive_performance_setting(app: AppHandle, enabled: bool) -> Result<(), String> {
    let mut settings = get_settings(&app);
    settings.adaptive_performance_enabled = enabled;
    write_settings(&app, settings);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn clear_performance_history() {
    if let Ok(mut samples) = LATENCY_SAMPLES.lock() {
        samples.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percentile_is_bounded_and_stable() {
        assert_eq!(percentile(&[], 95, 100), 0);
        assert_eq!(percentile(&[10], 95, 100), 10);
        assert_eq!(percentile(&[10, 20, 30, 40], 1, 2), 30);
        assert_eq!(percentile(&[10, 20, 30, 40], 95, 100), 40);
    }
}
