pub mod ea;
pub mod epic;
pub mod steam;
pub mod ubisoft;

use crate::models::{Game, Platform, ScanError, ScanResult};
use std::time::{SystemTime, UNIX_EPOCH};

/// Tidy a store title for display: drop trademark marks and collapse spacing.
pub fn clean_title(raw: &str) -> String {
    let stripped: String = raw
        .chars()
        .filter(|c| !matches!(c, '\u{2122}' | '\u{00ae}' | '\u{00a9}'))
        .collect();
    stripped.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn now_epoch() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Run every scanner. A launcher that is missing or broken contributes an
/// entry in `errors`; it never costs us the other platforms' games.
pub fn scan_all() -> ScanResult {
    let mut result = ScanResult {
        schema_version: crate::models::SCHEMA_VERSION,
        scanned_at: now_epoch(),
        ..Default::default()
    };

    let runs: [(Platform, fn() -> anyhow::Result<Vec<Game>>); 4] = [
        (Platform::Steam, steam::scan),
        (Platform::Epic, epic::scan),
        (Platform::Ea, ea::scan),
        (Platform::Ubisoft, ubisoft::scan),
    ];

    for (platform, run) in runs {
        match run() {
            Ok(games) => result.games.extend(games),
            Err(err) => result.errors.push(ScanError {
                platform,
                message: format!("{err:#}"),
            }),
        }
    }

    // Epic's owned library is on disk, so it belongs to the offline scan.
    // Steam's needs the store to name its appids, and arrives later.
    merge_owned(&mut result.games, epic::owned_games());

    sort_library(&mut result.games);
    result
}

/// Add owned entries for games not already present. An installed game always
/// wins: it carries a real path, a size, and a URI that launches rather than
/// installs.
pub fn merge_owned(games: &mut Vec<Game>, owned: Vec<Game>) {
    let known: std::collections::HashSet<String> = games.iter().map(|g| g.id.clone()).collect();
    games.extend(owned.into_iter().filter(|g| !known.contains(&g.id)));
}

/// Installed games first, then alphabetical. Sorting by name alone would bury
/// what the user can actually play under everything they merely own.
pub fn sort_library(games: &mut [Game]) {
    games.sort_by_key(|g| (!g.installed, g.name.to_lowercase(), g.id.clone()));
}

/// Games the Steam account owns, named and illustrated by the store.
///
/// The licence list grants far more appids than it does games, so every answer
/// is cached -- including the negative ones, which are the majority.
///
/// `allow_network` distingue les deux usages. La synchronisation interroge le
/// store pour les appids qu'elle ne connait pas encore ; les passes hors ligne
/// — le retour sur la fenetre, le fichier qui change — se contentent du cache.
/// Elles doivent rester silencieuses et instantanees, mais elles ne peuvent
/// pas pour autant ignorer les jeux possedes : les oublier revenait a vider la
/// grille de tout ce qui n'est pas installe.
pub fn steam_owned_games(cache: &mut crate::cache::StoreCache, allow_network: bool) -> Vec<Game> {
    steam_owned_games_reporting(cache, allow_network, |_, _| {})
}

/// The same, telling `progress(done, total)` after each store call. Only the
/// appids the cache does not know count: they are what takes time, and on a
/// first run they are all of them.
pub fn steam_owned_games_reporting(
    cache: &mut crate::cache::StoreCache,
    allow_network: bool,
    mut progress: impl FnMut(usize, usize),
) -> Vec<Game> {
    use crate::cache::StoreEntry;

    let appids = steam::owned_appids();
    let unknown: Vec<u32> = appids
        .iter()
        .copied()
        .filter(|id| !cache.contains_key(&id.to_string()))
        .collect();

    if allow_network && !unknown.is_empty() {
        if let Some(client) = crate::steam_store::client() {
            let mut done = 0;
            progress(done, unknown.len());
            for chunk in unknown.chunks(crate::steam_store::ITEMS_PER_CALL) {
                let found: std::collections::HashMap<u32, crate::steam_store::StoreItem> =
                    crate::steam_store::get_items(&client, chunk)
                        .into_iter()
                        .map(|item| (item.appid, item))
                        .collect();
                for appid in chunk {
                    cache.insert(
                        appid.to_string(),
                        found.get(appid).map(|item| StoreEntry {
                            name: clean_title(&item.name),
                            cover_urls: item.cover_urls.clone(),
                        }),
                    );
                }
                done += chunk.len();
                progress(done, unknown.len());
            }
        }
    }

    appids
        .iter()
        .filter_map(|appid| {
            let entry = cache.get(&appid.to_string())?.as_ref()?;
            let mut game = Game::owned(
                Platform::Steam,
                appid.to_string(),
                &entry.name,
                steam::install_uri(*appid),
            );
            game.cover_urls = entry.cover_urls.clone();
            Some(game)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::clean_title;

    #[test]
    fn strips_trademark_marks_and_extra_spacing() {
        assert_eq!(clean_title("Battlefield\u{2122} 1"), "Battlefield 1");
        assert_eq!(clean_title("F1\u{00ae} 25"), "F1 25");
        assert_eq!(clean_title("  skate.  "), "skate.");
    }
}

/// Diagnostic : ce que voit une passe hors ligne — un retour sur la fenetre,
/// un fichier de launcher qui change.
///
/// Elle doit rendre les jeux installes **et** les possedes que le cache sait
/// nommer. Tant qu'elle ne rendait que les installes, revenir sur la fenetre
/// effacait de la grille tout ce qui n'etait pas installe.
///
/// `cargo test -- --ignored --nocapture offline_pass_keeps_owned`
#[cfg(test)]
#[test]
#[ignore]
fn offline_pass_keeps_owned() {
    let dir = std::path::PathBuf::from(std::env::var("APPDATA").expect("APPDATA"))
        .join("com.janso.gamlib");

    let mut result = scan_all();
    let installed = result.games.len();

    let mut store = crate::cache::load_store(&dir);
    let owned = steam_owned_games(&mut store, false);
    merge_owned(&mut result.games, owned);

    let total = result.games.len();
    println!(
        "
passe hors ligne : {installed} installes, {} possedes en plus, {total} au total",
        total - installed
    );
    assert!(
        total > installed,
        "la passe hors ligne n'a rendu aucun jeu possede : le cache du store est-il vide ?"
    );
}

/// Diagnostic: resolve this machine's Steam licences against the store.
/// Ignored by default -- it needs the network and depends on the account.
///
/// `cargo test -- --ignored --nocapture dump_steam_owned`
#[cfg(test)]
#[test]
#[ignore]
fn dump_steam_owned() {
    let appids = steam::owned_appids();
    let mut cache = crate::cache::StoreCache::new();
    let games = steam_owned_games(&mut cache, true);

    let named = cache.values().filter(|v| v.is_some()).count();
    println!(
        "\nlicences: {} appids | reconnus comme jeux: {} | ecartes: {}",
        appids.len(),
        named,
        cache.len() - named
    );
    for game in games.iter().take(20) {
        println!(
            "  {:<45} {}",
            game.name,
            if game.cover_urls.is_empty() {
                "(sans jaquette)"
            } else {
                "jaquette ok"
            }
        );
    }
    println!("  ... {} au total", games.len());
}

/// Diagnostic: dump what this machine actually reports. Ignored by default,
/// since it depends on which launchers are installed.
///
/// `cargo test -- --ignored --nocapture dump_real_library`
#[cfg(test)]
#[test]
#[ignore]
fn dump_real_library() {
    let result = scan_all();
    for platform in [
        Platform::Steam,
        Platform::Epic,
        Platform::Ea,
        Platform::Ubisoft,
    ] {
        let games: Vec<_> = result
            .games
            .iter()
            .filter(|g| g.platform == platform)
            .collect();
        println!("\n=== {} ({} jeux) ===", platform.slug(), games.len());
        for game in games {
            println!(
                "  {:<45} {:>9} Mo  {}",
                game.name,
                game.size_on_disk.unwrap_or(0) / 1_048_576,
                game.action_uri
            );
        }
    }
    for error in &result.errors {
        println!("\n[erreur] {}: {}", error.platform.slug(), error.message);
    }
}
