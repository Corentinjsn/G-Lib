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

    result
        .games
        .sort_by_key(|g| (g.name.to_lowercase(), g.id.clone()));
    result
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
                game.launch_uri
            );
        }
    }
    for error in &result.errors {
        println!("\n[erreur] {}: {}", error.platform.slug(), error.message);
    }
}
