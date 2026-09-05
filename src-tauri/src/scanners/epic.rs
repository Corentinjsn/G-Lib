//! Epic: one JSON `.item` manifest per installed app under ProgramData, plus a
//! base64-encoded store catalogue holding the cover art.

use crate::models::{Game, Platform};
use crate::scanners::clean_title;
use anyhow::{anyhow, Result};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde::Deserialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

fn epic_data_dir() -> PathBuf {
    let program_data =
        std::env::var("PROGRAMDATA").unwrap_or_else(|_| r"C:\ProgramData".to_string());
    Path::new(&program_data)
        .join("Epic")
        .join("EpicGamesLauncher")
        .join("Data")
}

fn manifests_dir() -> PathBuf {
    epic_data_dir().join("Manifests")
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct EpicManifest {
    pub display_name: String,
    pub install_location: String,
    pub app_name: String,
    pub catalog_namespace: String,
    pub catalog_item_id: String,
    #[serde(default)]
    pub main_game_app_name: String,
    #[serde(default)]
    pub app_categories: Vec<String>,
    #[serde(default)]
    pub install_size: u64,
    #[serde(rename = "bIsApplication", default)]
    pub is_application: bool,
    #[serde(rename = "bIsIncompleteInstall", default)]
    pub is_incomplete_install: bool,
}

/// Convert a manifest into a game, or `None` if it is a DLC, a plugin, or an
/// unfinished install. Epic ships engines and tools through the same folder.
pub fn game_from_manifest(manifest: &EpicManifest) -> Option<Game> {
    if !manifest.is_application || manifest.is_incomplete_install {
        return None;
    }
    if !manifest.app_categories.iter().any(|c| c == "games") {
        return None;
    }
    // A DLC points its MainGameAppName at the base game rather than itself.
    if !manifest.main_game_app_name.is_empty() && manifest.main_game_app_name != manifest.app_name {
        return None;
    }
    if manifest.install_location.trim().is_empty() {
        return None;
    }

    let launch_uri = format!(
        "com.epicgames.launcher://apps/{}%3A{}%3A{}?action=launch&silent=true",
        manifest.catalog_namespace, manifest.catalog_item_id, manifest.app_name
    );

    let mut game = Game::new(
        Platform::Epic,
        &manifest.app_name,
        clean_title(&manifest.display_name),
        PathBuf::from(manifest.install_location.replace('/', "\\")),
        launch_uri,
    );
    game.size_on_disk = (manifest.install_size > 0).then_some(manifest.install_size);
    Some(game)
}

pub fn scan() -> Result<Vec<Game>> {
    let dir = manifests_dir();
    let entries = std::fs::read_dir(&dir).map_err(|e| {
        anyhow!(
            "dossier de manifests Epic illisible ({}): {e}",
            dir.display()
        )
    })?;

    let mut games = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("item") {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(&path) else {
            continue;
        };
        // A single unreadable manifest must not sink the whole platform.
        if let Ok(manifest) = serde_json::from_str::<EpicManifest>(&text) {
            if let Some(game) = game_from_manifest(&manifest) {
                games.push(game);
            }
        }
    }
    Ok(games)
}

/// Epic keeps the store catalogue for everything in the account, base64-encoded
/// JSON, next to the manifests. It carries `DieselGameBoxTall` -- the same 2:3
/// art the launcher shows -- so Epic games get exact cover art with no name
/// guessing and no store API.
///
/// Returns cover URLs keyed by *both* the catalogue id and every release's
/// app name, because a manifest identifies its game by app name while the
/// catalogue entry is keyed by catalogue id.
pub fn catalog_covers() -> HashMap<String, String> {
    let mut covers = HashMap::new();

    let path = epic_data_dir().join("Catalog").join("catcache.bin");
    let Ok(encoded) = std::fs::read(&path) else {
        return covers;
    };
    // The file is one base64 blob, sometimes with trailing whitespace.
    let trimmed: Vec<u8> = encoded
        .into_iter()
        .filter(|b| !b.is_ascii_whitespace())
        .collect();
    let Ok(decoded) = BASE64.decode(trimmed) else {
        return covers;
    };
    let Ok(entries) = serde_json::from_slice::<Vec<CatalogEntry>>(&decoded) else {
        return covers;
    };

    for entry in entries {
        let Some(image) = entry
            .key_images
            .iter()
            .find(|image| image.image_type == "DieselGameBoxTall")
        else {
            continue;
        };
        // Epic's CDN resizes on demand; full-size art runs to several MB.
        let url = format!("{}?resize=1&w=600&h=900&quality=medium", image.url);

        for key in std::iter::once(entry.id.clone())
            .chain(entry.release_info.iter().filter_map(|r| r.app_id.clone()))
        {
            covers.entry(key).or_insert_with(|| url.clone());
        }
    }

    covers
}

#[derive(Debug, Deserialize)]
struct CatalogEntry {
    id: String,
    #[serde(default, rename = "keyImages")]
    key_images: Vec<CatalogImage>,
    #[serde(default, rename = "releaseInfo")]
    release_info: Vec<CatalogRelease>,
}

#[derive(Debug, Deserialize)]
struct CatalogImage {
    #[serde(rename = "type")]
    image_type: String,
    url: String,
}

#[derive(Debug, Deserialize)]
struct CatalogRelease {
    #[serde(default, rename = "appId")]
    app_id: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    const FRAGPUNK: &str = include_str!("../../tests/fixtures/epic_fragpunk.item");

    #[test]
    fn reads_a_real_manifest() {
        let manifest: EpicManifest = serde_json::from_str(FRAGPUNK).expect("valid json");
        let game = game_from_manifest(&manifest).expect("should be a game");
        assert_eq!(game.name, "FragPunk");
        assert_eq!(game.id, "epic:467ee0aa2bae403cb88bd033f13d8317");
        assert_eq!(game.install_dir, Path::new(r"F:\FragPunkFgux4"));
        assert_eq!(game.size_on_disk, Some(37162586456));
        assert!(game
            .launch_uri
            .starts_with("com.epicgames.launcher://apps/0d2e23cbeacc43a085345b3e565a3114%3A"));
        assert!(game.launch_uri.ends_with("?action=launch&silent=true"));
    }

    #[test]
    fn rejects_dlc_entries() {
        let mut manifest: EpicManifest = serde_json::from_str(FRAGPUNK).unwrap();
        manifest.main_game_app_name = "some-other-base-game".into();
        assert!(game_from_manifest(&manifest).is_none());
    }

    #[test]
    fn rejects_non_game_applications() {
        let mut manifest: EpicManifest = serde_json::from_str(FRAGPUNK).unwrap();
        manifest.app_categories = vec!["engines".into()];
        assert!(game_from_manifest(&manifest).is_none());
    }
}
