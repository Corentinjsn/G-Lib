//! The last scan is kept on disk so the grid can paint instantly at startup,
//! before a fresh scan has had a chance to run.

use crate::models::ScanResult;
use anyhow::Result;
use std::path::{Path, PathBuf};

pub fn library_file(data_dir: &Path) -> PathBuf {
    data_dir.join("library.json")
}

pub fn covers_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("covers")
}

pub fn load(data_dir: &Path) -> Option<ScanResult> {
    let text = std::fs::read_to_string(library_file(data_dir)).ok()?;
    serde_json::from_str(&text).ok()
}

pub fn save(data_dir: &Path, result: &ScanResult) -> Result<()> {
    std::fs::create_dir_all(data_dir)?;
    std::fs::write(library_file(data_dir), serde_json::to_vec_pretty(result)?)?;
    Ok(())
}
