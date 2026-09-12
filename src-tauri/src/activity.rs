//! What a game is doing right now.
//!
//! The playtime watcher already knows which games have a process running -- it
//! has to, to measure a session. That knowledge stopped at the disk. Here it
//! reaches the grid: a running game says so, and its Play button stops
//! offering to start it a second time.
//!
//! Launching is not instant. Clicking Play hands a URI to Steam or Ubisoft
//! Connect, which may itself have to start, so the game's process appears
//! seconds later -- and in that window nothing would stop a second click. The
//! state therefore has three values, not two: a game is `Launching` from the
//! click until a process shows up, then `Running` until it goes away.
//!
//! A launch that never becomes a process -- the launcher asked a question, the
//! user said no, the game failed to start -- would otherwise leave the button
//! dead for good. `LAUNCH_GRACE` is how long the application is willing to
//! believe in a launch it cannot see.

use crate::models::{Activity, Game};
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// How long a game stays `Launching` without a process to show for it.
///
/// Long enough for a cold Steam to start and open a game, short enough that a
/// launch the user cancelled does not lock the button for the session.
const LAUNCH_GRACE: Duration = Duration::from_secs(120);

#[derive(Default)]
pub struct State {
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    /// Games with a live process, as last seen by the watcher.
    running: HashSet<String>,
    /// Games handed to their launcher, and when.
    launching: HashMap<String, Instant>,
}

impl State {
    /// Marks a game as launching. Answers false when it is already on its way
    /// or already up, which is the whole point: one launch at a time.
    pub fn begin_launch(&self, id: &str) -> bool {
        let Ok(mut inner) = self.inner.lock() else {
            return false;
        };
        inner.forget_stale();
        if inner.running.contains(id) || inner.launching.contains_key(id) {
            return false;
        }
        inner.launching.insert(id.to_string(), Instant::now());
        true
    }

    /// A launch that failed before it began. Without this a refused URI would
    /// hold the button for two minutes.
    pub fn cancel_launch(&self, id: &str) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.launching.remove(id);
        }
    }

    /// The watcher's view of the world. Returns true when it differs from what
    /// was known, which is what decides whether the grid needs telling.
    pub fn observe(&self, running: HashSet<String>) -> bool {
        let Ok(mut inner) = self.inner.lock() else {
            return false;
        };
        // A game that is up is no longer merely on its way.
        for id in &running {
            inner.launching.remove(id);
        }
        let stale = inner.forget_stale();
        if inner.running == running {
            return stale;
        }
        inner.running = running;
        true
    }

    /// Stamps the library with what each game is doing.
    pub fn apply(&self, games: &mut [Game]) {
        let Ok(mut inner) = self.inner.lock() else {
            return;
        };
        inner.forget_stale();
        for game in games.iter_mut() {
            game.activity = if inner.running.contains(&game.id) {
                Activity::Running
            } else if inner.launching.contains_key(&game.id) {
                Activity::Launching
            } else {
                Activity::Idle
            };
        }
    }
}

impl Inner {
    /// Drops launches old enough to be considered lost. Returns true when it
    /// dropped any, so the caller knows the grid has something to unlearn.
    fn forget_stale(&mut self) -> bool {
        let before = self.launching.len();
        self.launching
            .retain(|_, since| since.elapsed() < LAUNCH_GRACE);
        self.launching.len() != before
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_game_cannot_be_launched_twice() {
        let state = State::default();
        assert!(state.begin_launch("steam:1"));
        // The second click, while the launcher is still waking up.
        assert!(!state.begin_launch("steam:1"));
        // Another game is unaffected.
        assert!(state.begin_launch("steam:2"));
    }

    #[test]
    fn a_running_game_is_not_launched_again() {
        let state = State::default();
        state.observe(HashSet::from(["steam:1".to_string()]));
        assert!(!state.begin_launch("steam:1"));
    }

    #[test]
    fn seeing_the_process_ends_the_launch() {
        let state = State::default();
        state.begin_launch("steam:1");
        assert!(state.observe(HashSet::from(["steam:1".to_string()])));

        let mut games = vec![game("steam:1")];
        state.apply(&mut games);
        assert_eq!(games[0].activity, Activity::Running);
    }

    #[test]
    fn a_cancelled_launch_frees_the_button() {
        let state = State::default();
        state.begin_launch("steam:1");
        state.cancel_launch("steam:1");
        assert!(state.begin_launch("steam:1"));
    }

    #[test]
    fn nothing_to_tell_when_nothing_moved() {
        let state = State::default();
        let up = HashSet::from(["steam:1".to_string()]);
        assert!(state.observe(up.clone()));
        assert!(!state.observe(up));
    }

    fn game(id: &str) -> Game {
        Game {
            id: id.to_string(),
            platform: crate::models::Platform::Steam,
            platform_id: "1".into(),
            name: "Test".into(),
            installed: true,
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
            action_uri: String::new(),
            activity: Activity::Idle,
        }
    }
}
