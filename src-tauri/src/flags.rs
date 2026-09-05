//! Per-game marks the user sets by hand: favourite, and hidden.
//!
//! Kept apart from [`crate::collections`] because the semantics differ. A list
//! is a place you put a game; these are properties of the game itself, and
//! `hidden` removes it from every view rather than adding it to one.
//!
//! Like lists, they live in their own file rather than on `Game`: each sync
//! rebuilds the library from the launchers, and anything carried on a `Game`
//! would be wiped with it.

use crate::models::Game;
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Flags {
    #[serde(default)]
    pub favorite: bool,
    #[serde(default)]
    pub hidden: bool,
}

impl Flags {
    /// A game with nothing set need not be stored at all.
    fn is_empty(self) -> bool {
        self == Flags::default()
    }
}

pub type FlagMap = HashMap<String, Flags>;

fn file(data_dir: &Path) -> PathBuf {
    data_dir.join("flags.json")
}

pub fn load(data_dir: &Path) -> FlagMap {
    std::fs::read_to_string(file(data_dir))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn save(data_dir: &Path, flags: &FlagMap) -> Result<()> {
    std::fs::create_dir_all(data_dir)?;
    std::fs::write(file(data_dir), serde_json::to_vec_pretty(flags)?)?;
    Ok(())
}

pub fn apply(games: &mut [Game], flags: &FlagMap) {
    for game in games.iter_mut() {
        let marks = flags.get(&game.id).copied().unwrap_or_default();
        game.favorite = marks.favorite;
        game.hidden = marks.hidden;
    }
}

/// Set one mark on one game. Entries that fall back to every default are
/// dropped, so the file stays a record of deliberate choices.
pub fn set(data_dir: &Path, game_id: &str, name: &str, value: bool) -> Result<FlagMap> {
    let mut flags = load(data_dir);
    let entry = flags.entry(game_id.to_string()).or_default();

    match name {
        "favorite" => entry.favorite = value,
        "hidden" => entry.hidden = value,
        other => return Err(anyhow!("marque inconnue : {other}")),
    }

    if entry.is_empty() {
        flags.remove(game_id);
    }

    save(data_dir, &flags)?;
    Ok(flags)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Platform;
    use crate::scanners::now_epoch;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("gamlib-flags-{tag}-{}", now_epoch()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn sets_marks_independently() {
        let dir = temp_dir("set");

        let flags = set(&dir, "steam:1", "favorite", true).unwrap();
        assert!(flags["steam:1"].favorite);
        assert!(!flags["steam:1"].hidden);

        let flags = set(&dir, "steam:1", "hidden", true).unwrap();
        assert!(flags["steam:1"].favorite, "l'autre marque est preservee");
        assert!(flags["steam:1"].hidden);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn forgets_a_game_once_every_mark_is_cleared() {
        let dir = temp_dir("clear");
        set(&dir, "steam:1", "favorite", true).unwrap();
        let flags = set(&dir, "steam:1", "favorite", false).unwrap();
        assert!(flags.is_empty(), "aucune entree neutre n'est conservee");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn refuses_an_unknown_mark() {
        let dir = temp_dir("unknown");
        assert!(set(&dir, "steam:1", "starred", true).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn applies_marks_to_a_scanned_library() {
        let mut flags = FlagMap::new();
        flags.insert(
            "steam:1".into(),
            Flags {
                favorite: true,
                hidden: false,
            },
        );

        let mut games = vec![
            Game::installed(Platform::Steam, "1", "Marque", r"F:\a", "steam://"),
            Game::installed(Platform::Steam, "2", "Neutre", r"F:\b", "steam://"),
        ];
        apply(&mut games, &flags);

        assert!(games[0].favorite);
        assert!(!games[1].favorite);
        assert!(!games[0].hidden);
    }
}
