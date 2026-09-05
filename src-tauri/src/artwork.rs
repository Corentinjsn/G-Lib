//! Covers.
//!
//! Every game gets art from the cheapest source that can supply it:
//!
//! - A scanner that already knows a URL -- Epic from its local catalogue, and
//!   any owned Steam game named by the store -- hands it over directly.
//! - Installed **Steam** games are served from the client's own `librarycache`:
//!   instant, offline, and exactly what Steam displays. Otherwise the store's
//!   asset endpoint is asked.
//! - **EA and Ubisoft** publish no free art. Most of their titles also ship on
//!   Steam, so the game is looked up there by name. A title with no confident
//!   match keeps the generated placeholder rather than risk showing the wrong
//!   game's cover.
//!
//! Art is cached in the app's own data directory and served through Tauri's
//! asset protocol, which keeps the CSP closed to remote hosts.

use crate::models::{Game, Platform};
use crate::scanners::steam::steam_root;
use crate::steam_store;
use std::path::{Path, PathBuf};

/// Filenames the Steam client uses locally, best first. The first two are
/// portrait; `library_header` is landscape and only worth taking as a last
/// resort.
const LOCAL_ART_NAMES: [&str; 3] = [
    "library_600x900.jpg",
    "library_capsule.jpg",
    "library_header.jpg",
];

/// How many covers to work on at once. Enough that a first run finishes in a
/// few seconds, small enough to stay polite to Steam's endpoints.
const PARALLEL_FETCHES: usize = 8;

/// Below this, the response was a placeholder rather than real art: Steam
/// answers some misses with a ~1.5 KB image instead of a 404.
const MIN_ART_BYTES: usize = 5_000;

/// How many shortened variants of a title to try before giving up.
const MAX_SEARCH_ATTEMPTS: usize = 4;

fn cover_file(covers_dir: &Path, game: &Game) -> PathBuf {
    covers_dir.join(format!("{}_{}.jpg", game.platform.slug(), game.platform_id))
}

/// Point games at art already sitting in the cache. Cheap, no network.
pub fn attach_cached(games: &mut [Game], covers_dir: &Path) {
    for game in games.iter_mut() {
        let path = cover_file(covers_dir, game);
        game.cover_path = path.is_file().then_some(path);
    }
}

/// Where a cover still has to come from.
enum CoverSource {
    /// Already resolved by the scanner.
    Urls(Vec<String>),
    /// Ask Steam's store for this appid's art.
    SteamApp(u32),
    /// Find the game on Steam by name first, then ask for its art.
    SteamTitle(String),
}

/// Comparison key for titles across stores: no trademark marks, no punctuation,
/// no case. `EA SPORTS FC 26` and `EA Sports FC(tm) 26` collapse to one key.
fn title_key(title: &str) -> String {
    title
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .flat_map(|c| c.to_lowercase())
        .collect()
}

/// Pick the Steam app that is really this game, from a search response.
///
/// An exact key match wins. Failing that, the longest Steam title that is a
/// prefix of ours is taken: that is what rescues editions the Steam store does
/// not carry under the same name, such as an "X" or "Open Beta" suffix. The
/// fallback is only reachable when nothing matched exactly, so a sequel is
/// never dragged down onto its predecessor.
fn best_match(results: &[(String, String)], wanted: &str) -> Option<String> {
    let wanted_key = title_key(wanted);
    if wanted_key.is_empty() {
        return None;
    }

    if let Some((appid, _)) = results
        .iter()
        .find(|(_, name)| title_key(name) == wanted_key)
    {
        return Some(appid.clone());
    }

    results
        .iter()
        .filter_map(|(appid, name)| {
            let key = title_key(name);
            (key.len() >= 3 && wanted_key.starts_with(&key)).then_some((key.len(), appid.clone()))
        })
        .max_by_key(|(len, _)| *len)
        .map(|(_, appid)| appid)
}

/// Search terms to try for a title, most faithful first.
fn search_terms(title: &str) -> Vec<String> {
    let mut terms = vec![title.to_string()];

    // Steam's search chokes on trailing punctuation: a title ending in a full
    // stop finds nothing until the punctuation is dropped.
    let plain: String = title
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || c.is_whitespace())
        .collect();
    let words: Vec<&str> = plain.split_whitespace().collect();
    let plain = words.join(" ");
    if !plain.is_empty() && plain != *title {
        terms.push(plain);
    }

    // Then drop trailing words one at a time. An edition the store does not
    // carry -- an open beta, a re-release suffix -- returns nothing under its
    // full name but finds the base game once the suffix is gone. This only
    // widens the search; `best_match` still refuses anything that is not a
    // prefix of the full title.
    for drop in 1..words.len() {
        if terms.len() >= MAX_SEARCH_ATTEMPTS {
            break;
        }
        terms.push(words[..words.len() - drop].join(" "));
    }

    terms
}

/// Steam appid for a game we only know by name.
fn steam_appid_for_title(client: &reqwest::blocking::Client, title: &str) -> Option<u32> {
    search_terms(title)
        .iter()
        .find_map(|term| best_match(&steam_store::search_apps(client, term), title))
        .and_then(|appid| appid.parse().ok())
}

/// Best art the Steam client has already cached for this app, if any.
///
/// Layout is `librarycache/<appid>/<hash>/<name>.jpg`, one hash directory per
/// asset, so every subdirectory has to be checked for each candidate name.
fn local_steam_art(librarycache: &Path, appid: &str) -> Option<PathBuf> {
    let entries = std::fs::read_dir(librarycache.join(appid)).ok()?;
    let dirs: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .collect();

    LOCAL_ART_NAMES.iter().find_map(|name| {
        dirs.iter()
            .map(|dir| dir.join(name))
            .find(|candidate| candidate.is_file())
    })
}

fn download(client: &reqwest::blocking::Client, urls: &[String], target: &Path) -> bool {
    for url in urls {
        let Ok(response) = client.get(url).send() else {
            continue;
        };
        if !response.status().is_success() {
            continue;
        }
        let Ok(bytes) = response.bytes() else {
            continue;
        };
        if bytes.len() < MIN_ART_BYTES {
            continue;
        }
        if std::fs::write(target, &bytes).is_ok() {
            return true;
        }
    }
    false
}

fn store_art(client: &reqwest::blocking::Client, appid: u32) -> Vec<String> {
    steam_store::get_items(client, &[appid])
        .into_iter()
        .next()
        .map(|item| item.cover_urls)
        .unwrap_or_default()
}

fn fetch_one(client: &reqwest::blocking::Client, source: &CoverSource, target: &Path) -> bool {
    let urls = match source {
        CoverSource::Urls(urls) => urls.clone(),
        CoverSource::SteamApp(appid) => store_art(client, *appid),
        CoverSource::SteamTitle(title) => match steam_appid_for_title(client, title) {
            Some(appid) => store_art(client, appid),
            None => Vec::new(),
        },
    };
    download(client, &urls, target)
}

/// Fill in any missing covers, then attach every cached path.
pub fn fetch_missing(games: &mut [Game], covers_dir: &Path) {
    if std::fs::create_dir_all(covers_dir).is_err() {
        return;
    }

    let librarycache = steam_root().map(|root| root.join("appcache").join("librarycache"));
    let mut tasks: Vec<(CoverSource, PathBuf)> = Vec::new();

    for game in games.iter() {
        let target = cover_file(covers_dir, game);
        if target.is_file() {
            continue;
        }

        if !game.cover_urls.is_empty() {
            tasks.push((CoverSource::Urls(game.cover_urls.clone()), target));
            continue;
        }

        match game.platform {
            Platform::Steam => {
                let copied = librarycache
                    .as_ref()
                    .and_then(|cache| local_steam_art(cache, &game.platform_id))
                    .is_some_and(|source| std::fs::copy(source, &target).is_ok());
                if !copied {
                    if let Ok(appid) = game.platform_id.parse() {
                        tasks.push((CoverSource::SteamApp(appid), target));
                    }
                }
            }
            // Epic art comes from the local catalogue, so an Epic game with no
            // URL by now has no catalogue entry; the placeholder is honest.
            Platform::Epic => {}
            Platform::Ea | Platform::Ubisoft => {
                tasks.push((CoverSource::SteamTitle(game.name.clone()), target));
            }
        }
    }

    if !tasks.is_empty() {
        if let Some(client) = steam_store::client() {
            for chunk in tasks.chunks(PARALLEL_FETCHES) {
                std::thread::scope(|scope| {
                    for (source, target) in chunk {
                        let client = &client;
                        scope.spawn(move || fetch_one(client, source, target));
                    }
                });
            }
        }
    }

    attach_cached(games, covers_dir);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn results(pairs: &[(&str, &str)]) -> Vec<(String, String)> {
        pairs
            .iter()
            .map(|(id, name)| (id.to_string(), name.to_string()))
            .collect()
    }

    #[test]
    fn ignores_trademarks_and_case_when_matching() {
        assert_eq!(title_key("EA SPORTS FC\u{2122} 26"), "easportsfc26");
        assert_eq!(title_key("F1\u{00ae} 25"), "f125");
        assert_eq!(title_key("skate."), "skate");
    }

    #[test]
    fn prefers_the_exact_title_over_a_neighbour() {
        let found = best_match(
            &results(&[
                ("2669320", "EA SPORTS FC\u{2122} 25"),
                ("3405690", "EA SPORTS FC\u{2122} 26"),
                ("4080220", "EA SPORTS FC\u{2122} 27"),
            ]),
            "EA SPORTS FC 26",
        );
        assert_eq!(found.as_deref(), Some("3405690"));
    }

    #[test]
    fn falls_back_to_the_base_game_for_an_edition_steam_lacks() {
        // Ubisoft ships a "Siege X" edition; the Steam store lists only "Siege".
        let found = best_match(
            &results(&[("359550", "Rainbow Six Siege")]),
            "Rainbow Six Siege X",
        );
        assert_eq!(found.as_deref(), Some("359550"));
    }

    #[test]
    fn never_drags_a_sequel_onto_its_predecessor() {
        // The sequel matches exactly, so the prefix fallback never fires.
        let found = best_match(
            &results(&[("400", "Portal"), ("620", "Portal 2")]),
            "Portal 2",
        );
        assert_eq!(found.as_deref(), Some("620"));
    }

    #[test]
    fn refuses_an_unrelated_title() {
        let found = best_match(&results(&[("730", "Counter-Strike 2")]), "Fortnite");
        assert_eq!(found, None);
    }

    #[test]
    fn shortens_a_title_the_store_does_not_carry() {
        // The store has no "Open Beta" entry, so the search has to walk back to
        // the base game before it finds anything at all.
        let terms = search_terms("Battlefield 6 Open Beta");
        assert_eq!(terms[0], "Battlefield 6 Open Beta");
        assert!(terms.contains(&"Battlefield 6".to_string()));

        let found = best_match(
            &results(&[("2807960", "Battlefield\u{2122} 6")]),
            "Battlefield 6 Open Beta",
        );
        assert_eq!(found.as_deref(), Some("2807960"));
    }

    #[test]
    fn a_single_word_title_is_never_shortened_away() {
        assert_eq!(search_terms("Fortnite"), vec!["Fortnite".to_string()]);
    }
}
