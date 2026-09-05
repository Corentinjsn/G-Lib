//! On-disk state, so the app can paint before it has done any work.
//!
//! Two files: the last scan, and what the Steam store said about each owned
//! appid. The second matters more than it looks -- a licence list runs to
//! hundreds of appids, most of them DLC and tools, and re-asking the store
//! about them on every launch would be both slow and rude.

use crate::models::{ScanResult, SCHEMA_VERSION};
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

pub fn library_file(data_dir: &Path) -> PathBuf {
    data_dir.join("library.json")
}

pub fn store_file(data_dir: &Path) -> PathBuf {
    data_dir.join("steam-store.json")
}

pub fn covers_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("covers")
}

/// The last scan, or nothing if it was written by a different shape.
pub fn load(data_dir: &Path) -> Option<ScanResult> {
    let text = std::fs::read_to_string(library_file(data_dir)).ok()?;
    let cached: ScanResult = serde_json::from_str(&text).ok()?;
    (cached.schema_version == SCHEMA_VERSION).then_some(cached)
}

pub fn save(data_dir: &Path, result: &ScanResult) -> Result<()> {
    std::fs::create_dir_all(data_dir)?;
    std::fs::write(library_file(data_dir), serde_json::to_vec_pretty(result)?)?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreEntry {
    pub name: String,
    #[serde(default)]
    pub cover_urls: Vec<String>,
}

/// What the store said about each appid we asked about.
///
/// `None` records "asked, and it is not a game" -- a DLC, a soundtrack, a tool,
/// a delisted app. Keeping those negatives is the whole point: without them the
/// several hundred non-games in a licence list would be re-queried forever.
pub type StoreCache = HashMap<String, Option<StoreEntry>>;

pub fn load_store(data_dir: &Path) -> StoreCache {
    std::fs::read_to_string(store_file(data_dir))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

pub fn save_store(data_dir: &Path, cache: &StoreCache) -> Result<()> {
    std::fs::create_dir_all(data_dir)?;
    std::fs::write(store_file(data_dir), serde_json::to_vec_pretty(cache)?)?;
    Ok(())
}
