//! Steam: `libraryfolders.vdf` lists the library roots, and each root holds one
//! `appmanifest_<appid>.acf` per installed app.

use crate::models::{Game, Platform};
use crate::scanners::clean_title;
use crate::vdf;
use anyhow::{anyhow, Result};
use std::path::{Path, PathBuf};
use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
use winreg::RegKey;

/// Runtimes and redistributables that ship as apps but are not games.
const BLOCKED_APPIDS: &[&str] = &[
    "228980",  // Steamworks Common Redistributables
    "1070560", // Steam Linux Runtime 1.0
    "1391110", // Steam Linux Runtime 2.0 (soldier)
    "1493710", // Proton Experimental
    "1628350", // Steam Linux Runtime 3.0 (sniper)
    "2180100", // Proton Hotfix
];

/// `StateFlags` bit meaning "fully installed".
const STATE_FULLY_INSTALLED: u64 = 4;

/// Locate the Steam client, preferring the registry over a hardcoded path.
pub fn steam_root() -> Option<PathBuf> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(key) = hkcu.open_subkey(r"Software\Valve\Steam") {
        if let Ok(path) = key.get_value::<String, _>("SteamPath") {
            let path = PathBuf::from(path.replace('/', "\\"));
            if path.is_dir() {
                return Some(path);
            }
        }
    }

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    for subkey in [r"SOFTWARE\WOW6432Node\Valve\Steam", r"SOFTWARE\Valve\Steam"] {
        if let Ok(key) = hklm.open_subkey(subkey) {
            if let Ok(path) = key.get_value::<String, _>("InstallPath") {
                let path = PathBuf::from(path.replace('/', "\\"));
                if path.is_dir() {
                    return Some(path);
                }
            }
        }
    }

    let fallback = PathBuf::from(r"C:\Program Files (x86)\Steam");
    fallback.is_dir().then_some(fallback)
}

/// Every library root, starting with the Steam install itself.
pub fn library_paths(root: &Path) -> Vec<PathBuf> {
    let mut paths = vec![root.to_path_buf()];

    let manifest = root.join("steamapps").join("libraryfolders.vdf");
    if let Ok(text) = std::fs::read_to_string(&manifest) {
        let parsed = vdf::parse(&text);
        // Entries live under a `libraryfolders` block keyed "0", "1", ...
        if let Some(folders) = parsed.get("libraryfolders") {
            for (_, entry) in folders.pairs() {
                // Newer clients nest a `path`; very old ones store the path directly.
                let path = entry
                    .get_str("path")
                    .or_else(|| entry.as_str())
                    .map(|p| PathBuf::from(p.replace('/', "\\")));
                if let Some(path) = path {
                    if path.is_dir() && !paths.contains(&path) {
                        paths.push(path);
                    }
                }
            }
        }
    }

    paths
}

/// Build a game from one `.acf` manifest. Returns `None` for anything that is
/// not a fully-installed, non-blocklisted game. Split out so it can be tested
/// against a real manifest without touching the machine's Steam install.
pub fn game_from_manifest(text: &str, library: &Path) -> Option<Game> {
    let state = vdf::parse(text);
    let state = state.get("AppState")?;

    let appid = state.get_str("appid")?.trim().to_string();
    if BLOCKED_APPIDS.contains(&appid.as_str()) {
        return None;
    }

    // Absent StateFlags is treated as installed: older manifests omit it.
    let flags = state.get_u64("StateFlags").unwrap_or(STATE_FULLY_INSTALLED);
    if flags & STATE_FULLY_INSTALLED == 0 {
        return None;
    }

    let name = clean_title(state.get_str("name").unwrap_or_default());
    if name.is_empty() {
        return None;
    }

    let installdir = state.get_str("installdir")?;
    let install_dir = library
        .join("steamapps")
        .join("common")
        .join(installdir.replace('/', "\\"));

    let mut game = Game::installed(
        Platform::Steam,
        &appid,
        name,
        install_dir,
        format!("steam://rungameid/{appid}"),
    );
    game.size_on_disk = state.get_u64("SizeOnDisk").filter(|&s| s > 0);
    game.last_played = state.get_i64("LastPlayed").filter(|&t| t > 0);
    Some(game)
}

/// Every appid the account holds a licence for, read from the client's own
/// `packageinfo.vdf`.
///
/// This is the licence list, not a heuristic: every installed game appears in
/// it. It also grants DLC, soundtracks and tools, so the caller has to ask the
/// store which of these appids are actually games.
pub fn owned_appids() -> Vec<u32> {
    let Some(root) = steam_root() else {
        return Vec::new();
    };
    let path = root.join("appcache").join("packageinfo.vdf");
    let Ok(bytes) = std::fs::read(&path) else {
        return Vec::new();
    };
    crate::binvdf::owned_appids(&bytes)
}

/// Hands an appid to the client's install flow.
pub fn install_uri(appid: u32) -> String {
    format!("steam://install/{appid}")
}

pub fn scan() -> Result<Vec<Game>> {
    let root = steam_root().ok_or_else(|| anyhow!("Steam n'est pas installe sur cette machine"))?;

    let mut games = Vec::new();
    for library in library_paths(&root) {
        let steamapps = library.join("steamapps");
        let Ok(entries) = std::fs::read_dir(&steamapps) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let is_manifest = path
                .file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with("appmanifest_") && n.ends_with(".acf"));
            if !is_manifest {
                continue;
            }
            if let Ok(text) = std::fs::read_to_string(&path) {
                if let Some(game) = game_from_manifest(&text, &library) {
                    games.push(game);
                }
            }
        }
    }

    // The same appid can appear in two libraries after a move; keep one.
    games.sort_by(|a, b| a.platform_id.cmp(&b.platform_id));
    games.dedup_by(|a, b| a.platform_id == b.platform_id);
    Ok(games)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SIEGE_ACF: &str = include_str!("../../tests/fixtures/appmanifest_359550.acf");

    #[test]
    fn reads_a_real_manifest() {
        let library = Path::new(r"F:\SteamLibrary");
        let game = game_from_manifest(SIEGE_ACF, library).expect("should parse");
        assert_eq!(game.id, "steam:359550");
        assert_eq!(game.name, "Tom Clancy's Rainbow Six Siege");
        assert_eq!(game.action_uri, "steam://rungameid/359550");
        assert_eq!(game.size_on_disk, Some(51071355985));
        assert_eq!(game.last_played, Some(1771013925));
        assert!(game.installed);
        assert_eq!(
            game.install_dir.as_deref(),
            Some(Path::new(
                r"F:\SteamLibrary\steamapps\common\Tom Clancy's Rainbow Six Siege"
            ))
        );
    }

    #[test]
    fn rejects_redistributables() {
        let acf = r#""AppState" { "appid" "228980" "name" "Steamworks Common Redistributables"
                     "installdir" "Steamworks Shared" "StateFlags" "4" }"#;
        assert!(game_from_manifest(acf, Path::new("F:\\")).is_none());
    }

    #[test]
    fn rejects_partially_installed_apps() {
        // StateFlags 1026 = update started, bit 4 not set.
        let acf = r#""AppState" { "appid" "12345" "name" "Half Downloaded"
                     "installdir" "Half" "StateFlags" "1026" }"#;
        assert!(game_from_manifest(acf, Path::new("F:\\")).is_none());
    }
}
