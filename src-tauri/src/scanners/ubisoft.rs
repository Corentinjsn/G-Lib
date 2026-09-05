//! Ubisoft Connect: installs are registered under the launcher's registry key,
//! and the matching `Uplay Install <id>` uninstall entry carries the title.

use crate::models::{Game, Platform};
use crate::scanners::clean_title;
use crate::scanners::ea::estimated_size;
use anyhow::{anyhow, Result};
use std::path::PathBuf;
use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_READ};
use winreg::RegKey;

const INSTALLS_KEYS: [&str; 2] = [
    r"SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs",
    r"SOFTWARE\Ubisoft\Launcher\Installs",
];

const UNINSTALL_KEYS: [&str; 2] = [
    r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
    r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
];

/// The `Uplay Install <id>` uninstall entry, which holds the title and size.
fn uninstall_entry(hklm: &RegKey, install_id: &str) -> Option<RegKey> {
    UNINSTALL_KEYS.iter().find_map(|base| {
        hklm.open_subkey_with_flags(format!(r"{base}\Uplay Install {install_id}"), KEY_READ)
            .ok()
    })
}

/// Last resort when the uninstall entry is missing: name the game after its
/// install folder, which Ubisoft names after the title.
fn name_from_path(dir: &std::path::Path) -> Option<String> {
    dir.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.to_string())
        .filter(|n| !n.is_empty())
}

pub fn scan() -> Result<Vec<Game>> {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

    let installs = INSTALLS_KEYS
        .iter()
        .find_map(|k| hklm.open_subkey_with_flags(k, KEY_READ).ok())
        .ok_or_else(|| anyhow!("Ubisoft Connect n'est pas installe sur cette machine"))?;

    let mut games = Vec::new();
    for install_id in installs.enum_keys().flatten() {
        let Ok(entry) = installs.open_subkey_with_flags(&install_id, KEY_READ) else {
            continue;
        };
        let install_dir: String = entry.get_value("InstallDir").unwrap_or_default();
        if install_dir.trim().is_empty() {
            continue;
        }
        let install_dir = PathBuf::from(
            install_dir
                .replace('/', std::path::MAIN_SEPARATOR_STR)
                .trim_end_matches(std::path::is_separator),
        );

        let uninstall = uninstall_entry(&hklm, &install_id);
        let raw_name = uninstall
            .as_ref()
            .and_then(|k| k.get_value::<String, _>("DisplayName").ok())
            .filter(|n| !n.trim().is_empty())
            .or_else(|| name_from_path(&install_dir))
            .unwrap_or_else(|| format!("Ubisoft {install_id}"));

        let mut game = Game::new(
            Platform::Ubisoft,
            &install_id,
            clean_title(&raw_name),
            install_dir,
            // Trailing `0` is the launch parameter slot Ubisoft Connect expects.
            format!("uplay://launch/{install_id}/0"),
        );
        game.size_on_disk = uninstall.as_ref().and_then(estimated_size);
        games.push(game);
    }

    Ok(games)
}
