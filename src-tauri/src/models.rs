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

/// One game in the library, normalized across every platform.
///
/// A game is either installed and launchable, or owned and installable. The
/// two share everything else, so they are the same type with `installed`
/// telling them apart rather than two parallel shapes the UI would have to
/// merge.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Game {
    /// Stable cross-platform key, e.g. `steam:359550`.
    pub id: String,
    pub platform: Platform,
    /// appid / AppName / contentID / uplay install id.
    pub platform_id: String,
    pub name: String,
    pub installed: bool,
    /// Only meaningful when installed.
    pub install_dir: Option<PathBuf>,
    pub size_on_disk: Option<u64>,
    /// Unix epoch seconds of the last launch, from the store when it says so
    /// and from our own session tracking otherwise.
    pub last_played: Option<i64>,
    /// Seconds played, as measured by GAMLIB itself. No store exposes this
    /// locally, so it only counts sessions seen since the app was installed.
    pub playtime_seconds: Option<u64>,
    /// Absolute path to the cached cover on disk, once fetched.
    pub cover_path: Option<PathBuf>,
    /// Where the cover can be downloaded, best first, when the scanner already
    /// knows. Saves the artwork pass a lookup it would otherwise repeat.
    pub cover_urls: Vec<String>,
    /// The launcher reports a pending update for this installed game.
    pub needs_update: bool,
    /// Hands the game to its launcher's uninstall flow: a URI for the stores
    /// that publish one, a command line for those that only leave an uninstall
    /// entry behind. `None` where neither exists.
    pub uninstall: Option<String>,
    /// Marked by the user. Set from `flags.json` after every scan, never by a
    /// scanner.
    pub favorite: bool,
    /// Hidden games stay out of every view but the one that lists them.
    pub hidden: bool,
    /// Hands the game to its launcher: to play it, or to install it.
    pub action_uri: String,
}

impl Game {
    fn base(
        platform: Platform,
        platform_id: impl Into<String>,
        name: impl Into<String>,
        action_uri: impl Into<String>,
    ) -> Self {
        let platform_id = platform_id.into();
        Game {
            id: format!("{}:{}", platform.slug(), platform_id),
            platform,
            platform_id,
            name: name.into(),
            installed: false,
            install_dir: None,
            size_on_disk: None,
            last_played: None,
            playtime_seconds: None,
            needs_update: false,
            uninstall: None,
            favorite: false,
            hidden: false,
            cover_path: None,
            cover_urls: Vec::new(),
            action_uri: action_uri.into(),
        }
    }

    /// A game present on disk. `action_uri` launches it.
    pub fn installed(
        platform: Platform,
        platform_id: impl Into<String>,
        name: impl Into<String>,
        install_dir: impl Into<PathBuf>,
        launch_uri: impl Into<String>,
    ) -> Self {
        Game {
            installed: true,
            install_dir: Some(install_dir.into()),
            ..Game::base(platform, platform_id, name, launch_uri)
        }
    }

    /// A game the account owns but has not installed. `action_uri` installs it.
    pub fn owned(
        platform: Platform,
        platform_id: impl Into<String>,
        name: impl Into<String>,
        install_uri: impl Into<String>,
    ) -> Self {
        Game::base(platform, platform_id, name, install_uri)
    }
}

/// Shape of the cached library on disk.
///
/// Bump this whenever `Game` gains, loses or repurposes a field. A cache
/// written by an older shape is then discarded on purpose, instead of failing
/// to deserialize and being dropped in silence — which is what happened twice
/// while the model was still moving.
pub const SCHEMA_VERSION: u32 = 2;

/// Result of a full scan. Per-platform failures are reported rather than
/// propagated, so one missing launcher never costs us the other three.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    /// Zero when read from a cache written before versioning existed.
    #[serde(default)]
    pub schema_version: u32,
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
