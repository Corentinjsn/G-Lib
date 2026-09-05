use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// A store/launcher GAMLIB can scan.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Platform {
    Steam,
    Epic,
    Ea,
    Ubisoft,
}

impl Platform {
    pub fn slug(self) -> &'static str {
        match self {
            Platform::Steam => "steam",
            Platform::Epic => "epic",
            Platform::Ea => "ea",
            Platform::Ubisoft => "ubisoft",
        }
    }
}

/// One installed game, normalized across every platform.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Game {
    /// Stable cross-platform key, e.g. `steam:359550`.
    pub id: String,
    pub platform: Platform,
    /// appid / AppName / contentID / uplay install id.
    pub platform_id: String,
    pub name: String,
    pub install_dir: PathBuf,
    pub size_on_disk: Option<u64>,
    /// Unix epoch seconds. Steam only for now.
    pub last_played: Option<i64>,
    /// Absolute path to the cached cover on disk, once fetched.
    pub cover_path: Option<PathBuf>,
    /// Built at scan time: each scanner knows how its platform launches.
    pub launch_uri: String,
}

impl Game {
    pub fn new(
        platform: Platform,
        platform_id: impl Into<String>,
        name: impl Into<String>,
        install_dir: impl Into<PathBuf>,
        launch_uri: impl Into<String>,
    ) -> Self {
        let platform_id = platform_id.into();
        Game {
            id: format!("{}:{}", platform.slug(), platform_id),
            platform,
            platform_id,
            name: name.into(),
            install_dir: install_dir.into(),
            size_on_disk: None,
            last_played: None,
            cover_path: None,
            launch_uri: launch_uri.into(),
        }
    }
}

/// Result of a full scan. Per-platform failures are reported rather than
/// propagated, so one missing launcher never costs us the other three.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub games: Vec<Game>,
    pub errors: Vec<ScanError>,
    /// Unix epoch seconds of the scan that produced this.
    pub scanned_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanError {
    pub platform: Platform,
    pub message: String,
}
