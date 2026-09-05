//! Notices when the library changes on disk, so the grid does not have to be
//! told.
//!
//! Installing or removing a game rewrites a file in a directory we already
//! know: a `.acf` manifest for Steam, a `.item` for Epic. Watching those
//! directories turns "uninstall a game, come back, wonder why it is still
//! there" into the grid simply losing a card.
//!
//! EA and Ubisoft record their games in the registry instead, which this does
//! not watch. They are covered by the scan that runs whenever the window
//! regains focus.

use crate::scanners::steam;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::{Duration, Instant};

/// A launcher writes several files for one install. Waiting for the flurry to
/// stop turns a dozen events into a single rescan.
const SETTLE: Duration = Duration::from_millis(1500);

/// Directories whose contents say which games exist.
fn watched_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = steam::steam_root()
        .map(|root| {
            steam::library_paths(&root)
                .into_iter()
                .map(|library| library.join("steamapps"))
                .collect()
        })
        .unwrap_or_default();

    let program_data =
        std::env::var("PROGRAMDATA").unwrap_or_else(|_| r"C:\ProgramData".to_string());
    dirs.push(
        PathBuf::from(program_data)
            .join("Epic")
            .join("EpicGamesLauncher")
            .join("Data")
            .join("Manifests"),
    );

    dirs.retain(|dir| dir.is_dir());
    dirs
}

/// Only the files that decide whether a game is installed. Steam rewrites
/// plenty of others in the same directory while downloading, and reacting to
/// those would mean rescanning throughout an install.
fn is_interesting(path: &std::path::Path) -> bool {
    let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
        return false;
    };
    (name.starts_with("appmanifest_") && name.ends_with(".acf")) || name.ends_with(".item")
}

/// Watch until the application exits, calling `on_change` once per burst.
pub fn watch<F>(mut on_change: F)
where
    F: FnMut() + Send + 'static,
{
    std::thread::spawn(move || {
        let dirs = watched_dirs();
        if dirs.is_empty() {
            return;
        }

        let (tx, rx) = mpsc::channel();
        let Ok(mut watcher) = RecommendedWatcher::new(tx, notify::Config::default()) else {
            return;
        };
        for dir in &dirs {
            // A directory that cannot be watched is not worth abandoning the
            // others for.
            let _ = watcher.watch(dir, RecursiveMode::NonRecursive);
        }

        let mut pending: Option<Instant> = None;
        loop {
            // Waking on the settle interval keeps the burst logic simple: any
            // event pushes the deadline out, and the rescan happens once the
            // directory has been quiet for long enough.
            match rx.recv_timeout(SETTLE) {
                Ok(Ok(event)) => {
                    if event.paths.iter().any(|p| is_interesting(p)) {
                        pending = Some(Instant::now());
                    }
                }
                Ok(Err(_)) => {}
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => return,
            }

            if pending.is_some_and(|at| at.elapsed() >= SETTLE) {
                pending = None;
                on_change();
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::is_interesting;
    use std::path::Path;

    #[test]
    fn reacts_to_the_files_that_define_a_library() {
        assert!(is_interesting(Path::new(
            r"F:\SteamLibrary\steamapps\appmanifest_359550.acf"
        )));
        assert!(is_interesting(Path::new(r"C:\...\Manifests\ABCD.item")));
    }

    #[test]
    fn ignores_the_churn_of_a_download() {
        assert!(!is_interesting(Path::new(
            r"F:\SteamLibrary\steamapps\downloading\359550\chunk.bin"
        )));
        assert!(!is_interesting(Path::new(
            r"F:\SteamLibrary\steamapps\libraryfolders.vdf"
        )));
    }
}
