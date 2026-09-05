//! User-made lists of games, stored next to the library cache.
//!
//! A game may belong to any number of lists, so membership lives on the list
//! rather than on the game: a rescan rebuilds the library from the launchers
//! every time, and anything stored on a `Game` would be wiped with it.

use crate::scanners::now_epoch;
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: String,
    pub name: String,
    /// `Game::id` values. Entries for games that are no longer in the library
    /// are kept: a game can come back, and dropping them would quietly empty a
    /// list the day a launcher fails to scan.
    #[serde(default)]
    pub game_ids: Vec<String>,
}

fn file(data_dir: &Path) -> PathBuf {
    data_dir.join("collections.json")
}

pub fn load(data_dir: &Path) -> Vec<Collection> {
    std::fs::read_to_string(file(data_dir))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn save(data_dir: &Path, collections: &[Collection]) -> Result<()> {
    std::fs::create_dir_all(data_dir)?;
    std::fs::write(file(data_dir), serde_json::to_vec_pretty(collections)?)?;
    Ok(())
}

/// Unique enough for a local file: the clock only has to separate two lists
/// made in the same session, and a suffix settles same-second creations.
fn new_id(existing: &[Collection]) -> String {
    let stamp = now_epoch();
    (0..)
        .map(|n| {
            if n == 0 {
                format!("c{stamp}")
            } else {
                format!("c{stamp}-{n}")
            }
        })
        .find(|id| !existing.iter().any(|c| &c.id == id))
        .expect("an unused id always exists")
}

fn clean_name(name: &str) -> Result<String> {
    let name = name.trim();
    if name.is_empty() {
        return Err(anyhow!("le nom de la liste ne peut pas etre vide"));
    }
    Ok(name.chars().take(60).collect())
}

pub fn create(data_dir: &Path, name: &str) -> Result<Vec<Collection>> {
    let mut collections = load(data_dir);
    let name = clean_name(name)?;
    let id = new_id(&collections);
    collections.push(Collection {
        id,
        name,
        game_ids: Vec::new(),
    });
    save(data_dir, &collections)?;
    Ok(collections)
}

pub fn rename(data_dir: &Path, id: &str, name: &str) -> Result<Vec<Collection>> {
    let mut collections = load(data_dir);
    let name = clean_name(name)?;
    let target = collections
        .iter_mut()
        .find(|c| c.id == id)
        .ok_or_else(|| anyhow!("liste inconnue : {id}"))?;
    target.name = name;
    save(data_dir, &collections)?;
    Ok(collections)
}

pub fn delete(data_dir: &Path, id: &str) -> Result<Vec<Collection>> {
    let mut collections = load(data_dir);
    collections.retain(|c| c.id != id);
    save(data_dir, &collections)?;
    Ok(collections)
}

/// Add or remove one game from one list.
pub fn set_membership(
    data_dir: &Path,
    id: &str,
    game_id: &str,
    member: bool,
) -> Result<Vec<Collection>> {
    let mut collections = load(data_dir);
    let target = collections
        .iter_mut()
        .find(|c| c.id == id)
        .ok_or_else(|| anyhow!("liste inconnue : {id}"))?;

    let present = target.game_ids.iter().any(|g| g == game_id);
    match (member, present) {
        (true, false) => target.game_ids.push(game_id.to_string()),
        (false, true) => target.game_ids.retain(|g| g != game_id),
        _ => {}
    }

    save(data_dir, &collections)?;
    Ok(collections)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("gamlib-collections-{tag}-{}", now_epoch()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn creates_renames_and_deletes() {
        let dir = temp_dir("crud");

        let made = create(&dir, "  À finir  ").unwrap();
        assert_eq!(made.len(), 1);
        assert_eq!(made[0].name, "À finir", "le nom est trimme");

        let id = made[0].id.clone();
        let renamed = rename(&dir, &id, "Coop").unwrap();
        assert_eq!(renamed[0].name, "Coop");

        assert!(delete(&dir, &id).unwrap().is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_game_can_belong_to_several_lists() {
        let dir = temp_dir("membership");
        create(&dir, "À finir").unwrap();
        let lists = create(&dir, "Coop").unwrap();
        let (first, second) = (lists[0].id.clone(), lists[1].id.clone());

        set_membership(&dir, &first, "steam:359550", true).unwrap();
        let lists = set_membership(&dir, &second, "steam:359550", true).unwrap();
        assert_eq!(lists[0].game_ids, vec!["steam:359550"]);
        assert_eq!(lists[1].game_ids, vec!["steam:359550"]);

        // Adding twice is a no-op rather than a duplicate.
        let lists = set_membership(&dir, &first, "steam:359550", true).unwrap();
        assert_eq!(lists[0].game_ids.len(), 1);

        let lists = set_membership(&dir, &first, "steam:359550", false).unwrap();
        assert!(lists[0].game_ids.is_empty());
        assert_eq!(lists[1].game_ids.len(), 1, "les listes sont independantes");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn refuses_a_blank_name_and_unknown_ids() {
        let dir = temp_dir("errors");
        assert!(create(&dir, "   ").is_err());
        assert!(rename(&dir, "c1", "Nom").is_err());
        assert!(set_membership(&dir, "c1", "steam:1", true).is_err());
        // Deleting something that is not there is not worth an error.
        assert!(delete(&dir, "c1").is_ok());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
