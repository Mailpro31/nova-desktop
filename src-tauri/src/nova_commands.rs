//! Nova Commands — couche native de capture de sélection et de restitution.
//!
//! # Pourquoi un second chemin presse-papiers
//!
//! La dictée utilise [`crate::clipboard::paste_via_clipboard`], qui **laisse
//! volontairement** le texte dicté dans le presse-papiers : garde-fou « jamais
//! de texte perdu » si la frappe de collage est interceptée. Ce comportement
//! est une contrainte produit et n'est pas modifié ici.
//!
//! Nova Commands a besoin de l'inverse — le presse-papiers de l'utilisateur
//! doit être rendu intact. Les deux chemins sont donc **séparés** et ne
//! partagent aucune fonction : les factoriser affaiblirait l'un ou l'autre.
//!
//! # Limites connues (documentées, pas contournées)
//!
//! * **Préservation texte uniquement.** `tauri-plugin-clipboard-manager`
//!   n'expose que `read_text`/`write_text`/`read_image`. Il ne permet ni
//!   d'énumérer les formats, ni de restaurer du RTF, du HTML, des fichiers.
//!   Conséquence assumée : si le presse-papiers contient autre chose que du
//!   texte, la capture est **refusée** plutôt que de détruire son contenu.
//! * **Windows uniquement.** La détection fiable d'un changement de
//!   presse-papiers repose sur `GetClipboardSequenceNumber`. Sans équivalent
//!   sûr ailleurs, les autres plateformes renvoient `Unsupported` au lieu de
//!   deviner.
//! * **Le délai avant restauration est une heuristique.** Rien ne garantit
//!   qu'une application ait consommé le presse-papiers ; voir `PASTE_SETTLE`.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use enigo::Enigo;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_specta::Event;

use crate::input::{self, EnigoState};

/// Intervalle de scrutation du presse-papiers après Ctrl+C.
/// Court pour rester réactif, jamais une boucle serrée : chaque tour dort.
const POLL_INTERVAL: Duration = Duration::from_millis(15);

/// Échéance stricte de la capture. Au-delà, on considère qu'aucune sélection
/// n'a été copiée (champ vide, application lente, ou Ctrl+C intercepté).
const CAPTURE_DEADLINE: Duration = Duration::from_millis(900);

/// Délai laissé à l'application cible pour consommer le presse-papiers après
/// la frappe de collage, avant restauration.
///
/// **Heuristique.** Aucune API ne signale qu'une application a fini de lire le
/// presse-papiers. Certaines le lisent de façon différée. Une valeur trop
/// courte restaurerait avant lecture et collerait l'ancien contenu ; trop
/// longue, elle laisserait le résultat exposé. 250 ms est un compromis à
/// valider sur applications réelles.
const PASTE_SETTLE: Duration = Duration::from_millis(250);

/// Garde de concurrence : une seule commande à la fois.
///
/// Empêche le double déclenchement rapide et deux séquences presse-papiers
/// concurrentes. **Limite assumée :** cette garde ne couvre pas le pipeline de
/// dictée, qui n'est pas modifié (voir en-tête du module) ; une dictée lancée
/// pendant une commande peut donc encore écrire dans le presse-papiers. La
/// fenêtre est étroite et la fonctionnalité expérimentale.
static COMMAND_IN_FLIGHT: AtomicBool = AtomicBool::new(false);

/// Relâche automatiquement la garde, y compris en cas d'erreur ou de panique.
struct CommandGuard;

impl CommandGuard {
    fn acquire() -> Option<Self> {
        COMMAND_IN_FLIGHT
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .ok()
            .map(|_| CommandGuard)
    }
}

impl Drop for CommandGuard {
    fn drop(&mut self) {
        COMMAND_IN_FLIGHT.store(false, Ordering::SeqCst);
    }
}

/// Fenêtre à laquelle la sélection appartient, mémorisée avant toute prise de
/// focus par l'interface Nova.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct TargetWindow {
    /// Nom du processus, à visée de diagnostic uniquement.
    pub process: String,
    /// Identité forte de la cible.
    pub pid: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct SelectionCapture {
    pub text: String,
    pub target: TargetWindow,
}

/// État du presse-papiers avant capture, tel qu'on est capable de le rendre.
#[derive(Debug, Clone, PartialEq)]
pub enum ClipboardSnapshot {
    /// Vide : rien à restaurer, la capture est sans risque.
    Empty,
    /// Texte : restaurable intégralement.
    Text(String),
    /// Autre chose (image, fichiers, format riche) : **non restaurable**.
    NonText,
}

impl ClipboardSnapshot {
    /// Une capture n'est sûre que si l'on saura rendre le presse-papiers.
    pub fn is_safe_to_overwrite(&self) -> bool {
        !matches!(self, ClipboardSnapshot::NonText)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", content = "detail")]
pub enum CommandError {
    /// Une autre commande est déjà en cours.
    Busy,
    /// Le presse-papiers contient un contenu non textuel qu'on ne saurait
    /// restaurer : on refuse plutôt que de le détruire.
    NonTextClipboard,
    /// Aucun texte n'a été copié dans le délai imparti.
    NoSelection,
    /// Plateforme sans détection fiable de changement de presse-papiers.
    Unsupported,
    /// La fenêtre cible n'est plus celle d'où venait la sélection.
    TargetChanged,
    Clipboard(String),
    Input(String),
}

// ─────────────────────────────────────────────────────────────────────────────
// Détection de changement : numéro de séquence Windows
// ─────────────────────────────────────────────────────────────────────────────

/// Numéro de séquence du presse-papiers.
///
/// Comparer l'ancien et le nouveau **contenu** ne suffit pas : copier une
/// sélection identique à ce qui s'y trouve déjà ne changerait rien de visible.
/// Windows incrémente ce compteur à chaque modification, quel que soit le
/// contenu — c'est le seul signal fiable.
#[cfg(target_os = "windows")]
fn clipboard_sequence() -> Option<u32> {
    use windows::Win32::System::DataExchange::GetClipboardSequenceNumber;
    // Sûr : lecture d'un compteur global, sans ouverture du presse-papiers.
    Some(unsafe { GetClipboardSequenceNumber() })
}

#[cfg(not(target_os = "windows"))]
fn clipboard_sequence() -> Option<u32> {
    None
}

/// Nature du contenu courant du presse-papiers.
///
/// Sur Windows, `CountClipboardFormats` et `IsClipboardFormatAvailable`
/// distinguent précisément « vide », « texte » et « autre » — ce que
/// `read_text()` seul ne permet pas (il échoue identiquement dans les deux
/// derniers cas).
#[cfg(target_os = "windows")]
fn snapshot_clipboard(app: &AppHandle) -> ClipboardSnapshot {
    use windows::Win32::System::DataExchange::{CountClipboardFormats, IsClipboardFormatAvailable};
    const CF_UNICODETEXT: u32 = 13;

    let (count, has_text) = unsafe {
        (
            CountClipboardFormats(),
            IsClipboardFormatAvailable(CF_UNICODETEXT).is_ok(),
        )
    };

    if count == 0 {
        return ClipboardSnapshot::Empty;
    }
    if has_text {
        return match app.clipboard().read_text() {
            Ok(text) => ClipboardSnapshot::Text(text),
            // Le format est annoncé mais illisible : traiter comme non
            // restaurable est le choix prudent.
            Err(_) => ClipboardSnapshot::NonText,
        };
    }
    ClipboardSnapshot::NonText
}

#[cfg(not(target_os = "windows"))]
fn snapshot_clipboard(app: &AppHandle) -> ClipboardSnapshot {
    match app.clipboard().read_text() {
        Ok(text) if !text.is_empty() => ClipboardSnapshot::Text(text),
        _ => ClipboardSnapshot::NonText,
    }
}

fn restore_clipboard(app: &AppHandle, snapshot: &ClipboardSnapshot) {
    match snapshot {
        ClipboardSnapshot::Text(text) => {
            let _ = app.clipboard().write_text(text.clone());
        }
        ClipboardSnapshot::Empty => {
            let _ = app.clipboard().clear();
        }
        // Jamais atteint : une capture n'est lancée que si le contenu est
        // restaurable (voir `is_safe_to_overwrite`).
        ClipboardSnapshot::NonText => {}
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Capture de sélection
// ─────────────────────────────────────────────────────────────────────────────

/// Capture le texte actuellement sélectionné dans l'application au premier plan.
///
/// Séquence : mémoriser la fenêtre cible → photographier le presse-papiers →
/// refuser si non restaurable → Ctrl+C → attendre un vrai changement de
/// séquence → lire → restaurer.
pub fn capture_selection(app: &AppHandle) -> Result<SelectionCapture, CommandError> {
    let _guard = CommandGuard::acquire().ok_or(CommandError::Busy)?;

    if clipboard_sequence().is_none() {
        return Err(CommandError::Unsupported);
    }

    // La fenêtre est relevée AVANT toute interaction : c'est elle qui détient
    // la sélection, et l'interface Nova prendra le focus juste après.
    let target = current_target_window();

    let snapshot = snapshot_clipboard(app);
    if !snapshot.is_safe_to_overwrite() {
        return Err(CommandError::NonTextClipboard);
    }

    let before = clipboard_sequence();

    {
        let state = app
            .try_state::<EnigoState>()
            .ok_or_else(|| CommandError::Input("Enigo not initialised".into()))?;
        let mut enigo: std::sync::MutexGuard<'_, Enigo> = state
            .0
            .lock()
            .map_err(|_| CommandError::Input("Enigo lock poisoned".into()))?;
        input::send_copy_ctrl_c(&mut enigo).map_err(CommandError::Input)?;
    }

    let captured = wait_for_clipboard_change(app, before);
    restore_clipboard(app, &snapshot);

    match captured {
        Some(text) if !text.trim().is_empty() => Ok(SelectionCapture { text, target }),
        _ => Err(CommandError::NoSelection),
    }
}

/// Scrutation courte avec échéance stricte — jamais un `sleep` fixe unique.
fn wait_for_clipboard_change(app: &AppHandle, before: Option<u32>) -> Option<String> {
    let deadline = Instant::now() + CAPTURE_DEADLINE;

    while Instant::now() < deadline {
        std::thread::sleep(POLL_INTERVAL);
        if clipboard_sequence() != before {
            // Le compteur a bougé : le contenu est celui de la sélection.
            return app.clipboard().read_text().ok();
        }
    }
    None
}

fn current_target_window() -> TargetWindow {
    let (process, pid) = crate::auto_style::foreground_window_identity();
    TargetWindow { process, pid }
}

// ─────────────────────────────────────────────────────────────────────────────
// Restitution
// ─────────────────────────────────────────────────────────────────────────────

/// Colle `result` en restaurant le presse-papiers de l'utilisateur.
///
/// Chemin **distinct** de celui de la dictée : ici la restauration est le
/// comportement attendu, là-bas son absence est le garde-fou.
///
/// Le collage est refusé si la fenêtre au premier plan n'est plus celle d'où
/// venait la sélection : coller aveuglément dans une autre application serait
/// pire que ne rien faire.
pub fn paste_preserving_clipboard(
    app: &AppHandle,
    result: &str,
    expected: &TargetWindow,
) -> Result<(), CommandError> {
    let _guard = CommandGuard::acquire().ok_or(CommandError::Busy)?;

    let current = current_target_window();
    if !same_target(&current, expected) {
        return Err(CommandError::TargetChanged);
    }

    let snapshot = snapshot_clipboard(app);
    if !snapshot.is_safe_to_overwrite() {
        return Err(CommandError::NonTextClipboard);
    }

    app.clipboard()
        .write_text(result.to_string())
        .map_err(|e| CommandError::Clipboard(e.to_string()))?;

    {
        let state = app
            .try_state::<EnigoState>()
            .ok_or_else(|| CommandError::Input("Enigo not initialised".into()))?;
        let mut enigo: std::sync::MutexGuard<'_, Enigo> = state
            .0
            .lock()
            .map_err(|_| CommandError::Input("Enigo lock poisoned".into()))?;
        input::send_paste_ctrl_v(&mut enigo).map_err(CommandError::Input)?;
    }

    std::thread::sleep(PASTE_SETTLE);
    restore_clipboard(app, &snapshot);

    Ok(())
}

/// Deux relevés désignent-ils la même fenêtre ?
///
/// Le PID est le critère fort ; le titre change au fil de l'édition (un
/// document « sans titre » devient « rapport.txt ») et ne peut pas servir
/// d'identité.
pub fn same_target(a: &TargetWindow, b: &TargetWindow) -> bool {
    a.pid != 0 && a.pid == b.pid
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests unitaires — logique pure, sans couche OS
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn non_text_clipboard_is_never_overwritten() {
        assert!(!ClipboardSnapshot::NonText.is_safe_to_overwrite());
        assert!(ClipboardSnapshot::Empty.is_safe_to_overwrite());
        assert!(ClipboardSnapshot::Text("x".into()).is_safe_to_overwrite());
    }

    #[test]
    fn target_identity_uses_pid_not_title() {
        let a = TargetWindow {
            process: "notepad.exe".into(),
            pid: 42,
        };
        let renamed = TargetWindow {
            process: "notepad.exe".into(),
            pid: 42,
        };
        let other = TargetWindow {
            process: "notepad.exe".into(),
            pid: 43,
        };

        assert!(same_target(&a, &renamed), "le titre ne fait pas l'identité");
        assert!(!same_target(&a, &other), "un autre PID est une autre cible");
    }

    #[test]
    fn unknown_pid_never_matches() {
        // pid 0 = fenêtre non identifiable (plateforme sans support, échec
        // d'API). On ne doit jamais considérer deux inconnues comme égales.
        let unknown = TargetWindow {
            process: String::new(),
            pid: 0,
        };
        assert!(!same_target(&unknown, &unknown));
    }

    #[test]
    fn command_guard_is_exclusive_and_released() {
        let first = CommandGuard::acquire();
        assert!(first.is_some(), "la première prise doit réussir");
        assert!(
            CommandGuard::acquire().is_none(),
            "une seconde commande doit être refusée"
        );
        drop(first);
        assert!(
            CommandGuard::acquire().is_some(),
            "la garde doit être relâchée après abandon"
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Surface Tauri
// ─────────────────────────────────────────────────────────────────────────────

/// Rapport de diagnostic du moteur, destiné au **test manuel sur Windows**.
///
/// Volontairement hors de l'interface utilisateur : il sert à valider la
/// couche native avant toute activation par défaut.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct CommandsDiagnostics {
    /// La plateforme fournit-elle une détection fiable de changement ?
    pub sequence_detection: bool,
    /// Nature du presse-papiers courant : `empty`, `text`, `non-text`.
    pub clipboard_kind: String,
    /// Le presse-papiers pourrait-il être restauré après capture ?
    pub clipboard_restorable: bool,
    pub foreground_process: String,
    pub foreground_pid: u32,
    /// Le réglage expérimental est-il actif ?
    pub enabled: bool,
}

fn commands_enabled(app: &AppHandle) -> bool {
    crate::settings::get_settings(app).nova_commands_enabled
}

/// Capture la sélection courante. Refuse si la fonctionnalité est désactivée.
#[tauri::command]
#[specta::specta]
pub fn nova_command_capture_selection(app: AppHandle) -> Result<SelectionCapture, CommandError> {
    if !commands_enabled(&app) {
        return Err(CommandError::Unsupported);
    }
    capture_selection(&app)
}

/// Colle un résultat en restaurant le presse-papiers.
///
/// **Expérimental.** N'est appelé que depuis l'action « Remplacer » d'un
/// aperçu : rien ne remplace automatiquement le texte de l'utilisateur.
#[tauri::command]
#[specta::specta]
pub fn nova_command_replace(
    app: AppHandle,
    result: String,
    target: TargetWindow,
) -> Result<(), CommandError> {
    if !commands_enabled(&app) {
        return Err(CommandError::Unsupported);
    }
    paste_preserving_clipboard(&app, &result, &target)
}

/// Résultat d'une capture déclenchée par le raccourci, poussé vers l'interface.
///
/// Un seul des deux champs est renseigné. Le texte capturé y transite parce que
/// l'interface doit l'afficher ; il n'est ni journalisé ni persisté.
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type, Event)]
pub struct NovaCommandCaptureEvent {
    pub capture: Option<SelectionCapture>,
    pub error: Option<CommandError>,
}

/// Point d'entrée du raccourci « command ».
///
/// **L'ordre est la partie critique.** La capture s'exécute pendant que
/// l'application de l'utilisateur est encore au premier plan ; la fenêtre Nova
/// n'est montrée qu'ensuite. L'ouvrir d'abord volerait le focus à la fenêtre
/// qui détient précisément la sélection à capturer.
///
/// Le travail part sur un fil dédié : la séquence comporte des attentes
/// (scrutation du presse-papiers) et ne doit pas bloquer le gestionnaire de
/// raccourcis.
pub fn trigger_command(app: &AppHandle) {
    if !commands_enabled(app) {
        return;
    }

    let app = app.clone();
    std::thread::spawn(move || {
        let event = match capture_selection(&app) {
            Ok(capture) => NovaCommandCaptureEvent {
                capture: Some(capture),
                error: None,
            },
            Err(error) => NovaCommandCaptureEvent {
                capture: None,
                // Seule la variante d'erreur est tracée, jamais de contenu.
                error: Some(error),
            },
        };

        if let Err(e) = event.emit(&app) {
            log::error!("Nova Commands: failed to emit capture event: {}", e);
        }
        crate::show_main_window(&app);
    });
}

/// État du moteur, pour la validation manuelle. Ne modifie rien.
#[tauri::command]
#[specta::specta]
pub fn nova_command_diagnostics(app: AppHandle) -> CommandsDiagnostics {
    let snapshot = snapshot_clipboard(&app);
    let (process, pid) = crate::auto_style::foreground_window_identity();

    CommandsDiagnostics {
        sequence_detection: clipboard_sequence().is_some(),
        clipboard_kind: match snapshot {
            ClipboardSnapshot::Empty => "empty",
            ClipboardSnapshot::Text(_) => "text",
            ClipboardSnapshot::NonText => "non-text",
        }
        .to_string(),
        clipboard_restorable: snapshot.is_safe_to_overwrite(),
        foreground_process: process,
        foreground_pid: pid,
        enabled: commands_enabled(&app),
    }
}
