//! Empreinte machine stable pour l'activation de licence en ligne.
//!
//! On dérive un identifiant machine stable (MachineGuid Windows, repli
//! `/etc/machine-id` / hostname) puis on le hache — aucun identifiant brut n'est
//! transmis. La fonction edge d'activation attend un hex de 16 à 64 caractères
//! (`^[a-f0-9]{16,64}$`) ; on renvoie 32 caractères. Ne panique jamais : repli
//! déterministe si la source n'est pas lisible.

use sha2::{Digest, Sha256};

/// Empreinte hexadécimale (32 caractères) de la machine.
pub fn fingerprint() -> String {
    let ident = raw_machine_id();
    let mut hasher = Sha256::new();
    hasher.update(format!("nova:{}", ident).as_bytes());
    let digest = hasher.finalize();
    let hex: String = digest.iter().map(|b| format!("{:02x}", b)).collect();
    // sha256 → 64 hex ; on tronque à 32 (toujours valide vis-à-vis de la regex).
    hex[..32].to_string()
}

#[cfg(windows)]
fn raw_machine_id() -> String {
    use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_64KEY};
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    if let Ok(key) =
        hklm.open_subkey_with_flags(r"SOFTWARE\Microsoft\Cryptography", KEY_READ | KEY_WOW64_64KEY)
    {
        if let Ok(guid) = key.get_value::<String, _>("MachineGuid") {
            if !guid.trim().is_empty() {
                return guid;
            }
        }
    }
    fallback_ident()
}

#[cfg(not(windows))]
fn raw_machine_id() -> String {
    if let Ok(id) = std::fs::read_to_string("/etc/machine-id") {
        let id = id.trim().to_string();
        if !id.is_empty() {
            return id;
        }
    }
    fallback_ident()
}

fn fallback_ident() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "nova-unknown-host".to_string())
}
