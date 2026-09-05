//! Play sessions, measured by watching processes.
//!
//! Only Steam tells us when a game was last played, which left the other three
//! platforms permanently at the bottom of any "recently played" sort. Rather
//! than chase four proprietary histories, GAMLIB keeps its own: every installed
//! game has an install directory, so a running process whose executable sits
//! under one of them *is* that game running.
//!
//! This works identically for all four stores, needs no authentication, and
//! also yields total playtime, which none of them expose locally.

use crate::models::Game;
use crate::scanners::now_epoch;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

/// How often to look at the process list. Long enough to be invisible in a
/// task manager, short enough that a five-minute session is not lost.
const POLL: Duration = Duration::from_secs(5);

/// Sessions shorter than this are noise: an installer, a crash on launch, a
/// launcher helper starting and stopping.
const MIN_SESSION_SECONDS: u64 = 30;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    /// Total seconds played, across all recorded sessions.
    pub seconds: u64,
    /// Unix epoch seconds of the most recent launch.
    pub last_played: i64,
}

pub type Playtime = HashMap<String, Session>;

fn file(data_dir: &Path) -> PathBuf {
    data_dir.join("playtime.json")
}

pub fn load(data_dir: &Path) -> Playtime {
    std::fs::read_to_string(file(data_dir))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

pub fn save(data_dir: &Path, playtime: &Playtime) -> Result<()> {
    std::fs::create_dir_all(data_dir)?;
    std::fs::write(file(data_dir), serde_json::to_vec_pretty(playtime)?)?;
    Ok(())
}

/// Fold recorded sessions into a freshly scanned library.
///
/// `last_played` takes whichever is newer: Steam writes its own timestamp, but
/// only once the client has flushed it, so ours can be ahead just after a game
/// closes.
pub fn apply(games: &mut [Game], playtime: &Playtime) {
    for game in games.iter_mut() {
        let Some(session) = playtime.get(&game.id) else {
            continue;
        };
        game.playtime_seconds = (session.seconds > 0).then_some(session.seconds);
        if session.last_played > game.last_played.unwrap_or(0) {
            game.last_played = Some(session.last_played);
        }
    }
}

/// The installed game a running executable belongs to, if any.
///
/// The longest matching directory wins: one game installed inside another's
/// folder would otherwise be credited to its neighbour.
fn owner_of(exe: &Path, games: &[(String, PathBuf)]) -> Option<String> {
    let exe = exe.to_string_lossy().to_lowercase();
    games
        .iter()
        .filter(|(_, dir)| {
            let dir = dir.to_string_lossy().to_lowercase();
            !dir.is_empty() && exe.starts_with(&dir)
        })
        .max_by_key(|(_, dir)| dir.as_os_str().len())
        .map(|(id, _)| id.clone())
}

/// One poll: returns the ids of games that currently have a process running.
fn running_games(system: &mut sysinfo::System, games: &[(String, PathBuf)]) -> Vec<String> {
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let mut running: Vec<String> = system
        .processes()
        .values()
        .filter_map(|process| process.exe())
        .filter_map(|exe| owner_of(exe, games))
        .collect();
    running.sort();
    running.dedup();
    running
}

/// Watches for play sessions until the application exits.
///
/// Runs on its own thread rather than the async runtime: it is a slow poll that
/// blocks on a system call, and it has to keep going while the UI is idle.
pub fn watch<F>(data_dir: PathBuf, mut library: F)
where
    F: FnMut() -> Vec<Game> + Send + 'static,
{
    std::thread::spawn(move || {
        let mut system = sysinfo::System::new();
        let mut started: HashMap<String, i64> = HashMap::new();

        loop {
            std::thread::sleep(POLL);

            let installed: Vec<(String, PathBuf)> = library()
                .into_iter()
                .filter_map(|game| Some((game.id, game.install_dir?)))
                .collect();
            if installed.is_empty() {
                continue;
            }

            let running = running_games(&mut system, &installed);
            let now = now_epoch();
            let mut playtime = load(&data_dir);
            let mut changed = false;

            for id in &running {
                if !started.contains_key(id) {
                    started.insert(id.clone(), now);
                    // Stamp the launch straight away: a session that is still
                    // running is exactly what "recently played" should show.
                    playtime.entry(id.clone()).or_default().last_played = now;
                    changed = true;
                }
            }

            let ended: Vec<String> = started
                .keys()
                .filter(|id| !running.contains(id))
                .cloned()
                .collect();
            for id in ended {
                let start = started.remove(&id).unwrap_or(now);
                let elapsed = (now - start).max(0) as u64;
                if elapsed >= MIN_SESSION_SECONDS {
                    playtime.entry(id).or_default().seconds += elapsed;
                    changed = true;
                }
            }

            if changed {
                let _ = save(&data_dir, &playtime);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Platform;

    fn games() -> Vec<(String, PathBuf)> {
        vec![
            (
                "steam:1".into(),
                PathBuf::from(r"F:\SteamLibrary\steamapps\common\Elden Ring"),
            ),
            ("epic:2".into(), PathBuf::from(r"F:\FragPunk")),
            // Deliberately nested inside another game's folder.
            (
                "steam:3".into(),
                PathBuf::from(r"F:\SteamLibrary\steamapps\common\Elden Ring\DLC"),
            ),
        ]
    }

    #[test]
    fn credits_the_game_owning_the_executable() {
        let found = owner_of(
            Path::new(r"F:\SteamLibrary\steamapps\common\Elden Ring\Game\eldenring.exe"),
            &games(),
        );
        assert_eq!(found.as_deref(), Some("steam:1"));
    }

    #[test]
    fn matches_regardless_of_case() {
        let found = owner_of(Path::new(r"f:\fragpunk\bin\FragPunk.exe"), &games());
        assert_eq!(found.as_deref(), Some("epic:2"));
    }

    #[test]
    fn the_deepest_match_wins() {
        let found = owner_of(
            Path::new(r"F:\SteamLibrary\steamapps\common\Elden Ring\DLC\dlc.exe"),
            &games(),
        );
        assert_eq!(found.as_deref(), Some("steam:3"));
    }

    #[test]
    fn ignores_processes_outside_every_library() {
        assert_eq!(
            owner_of(Path::new(r"C:\Windows\explorer.exe"), &games()),
            None
        );
    }

    #[test]
    fn keeps_the_newer_of_the_two_timestamps() {
        let mut game = Game::installed(Platform::Steam, "1", "Elden Ring", r"F:\x", "steam://");
        game.last_played = Some(1_000);

        let mut playtime = Playtime::new();
        playtime.insert(
            game.id.clone(),
            Session {
                seconds: 7_200,
                last_played: 2_000,
            },
        );

        let mut games = vec![game];
        apply(&mut games, &playtime);
        assert_eq!(games[0].last_played, Some(2_000));
        assert_eq!(games[0].playtime_seconds, Some(7_200));
    }

    #[test]
    fn never_moves_a_timestamp_backwards() {
        let mut game = Game::installed(Platform::Steam, "1", "Elden Ring", r"F:\x", "steam://");
        game.last_played = Some(9_000);

        let mut playtime = Playtime::new();
        playtime.insert(
            game.id.clone(),
            Session {
                seconds: 60,
                last_played: 2_000,
            },
        );

        let mut games = vec![game];
        apply(&mut games, &playtime);
        assert_eq!(
            games[0].last_played,
            Some(9_000),
            "Steam reste la reference"
        );
    }
}
