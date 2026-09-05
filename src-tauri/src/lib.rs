mod artwork;
mod binvdf;
mod cache;
mod launcher;
mod models;
mod scanners;
mod steam_store;
mod vdf;

use models::{Game, ScanResult};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

/// The most recent scan, so `launch_game` can resolve an id to its URI without
/// trusting anything the frontend hands back.
#[derive(Default)]
struct Library(Mutex<ScanResult>);

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("dossier de donnees introuvable : {e}"))
}

fn find_game(library: &State<'_, Library>, id: &str) -> Result<Game, String> {
    library
        .0
        .lock()
        .map_err(|_| "bibliotheque verrouillee".to_string())?
        .games
        .iter()
        .find(|g| g.id == id)
        .cloned()
        .ok_or_else(|| format!("jeu inconnu : {id}"))
}

/// Previous scan straight off disk. Lets the grid paint before any scanning.
#[tauri::command]
fn load_cached_library(
    app: AppHandle,
    library: State<'_, Library>,
) -> Result<Option<ScanResult>, String> {
    let dir = data_dir(&app)?;
    let Some(mut cached) = cache::load(&dir) else {
        return Ok(None);
    };
    // Art may have been cleared since the cache was written.
    artwork::attach_cached(&mut cached.games, &cache::covers_dir(&dir));
    *library.0.lock().map_err(|_| "bibliotheque verrouillee")? = cached.clone();
    Ok(Some(cached))
}

/// Re-read every launcher. Filesystem and registry work, so it runs off the UI thread.
#[tauri::command]
async fn scan_library(app: AppHandle, library: State<'_, Library>) -> Result<ScanResult, String> {
    let dir = data_dir(&app)?;
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut result = scanners::scan_all();
        artwork::attach_cached(&mut result.games, &cache::covers_dir(&dir));
        let _ = cache::save(&dir, &result);
        result
    })
    .await
    .map_err(|e| format!("scan interrompu : {e}"))?;

    *library.0.lock().map_err(|_| "bibliotheque verrouillee")? = result.clone();
    Ok(result)
}

/// The half of the library that needs the network: the Steam games the account
/// owns but has not installed, whose appids only the store can turn into names,
/// and then every cover still missing.
///
/// Kept apart from `scan_library` so the grid can paint from disk first. The
/// store answers are cached, so this is only slow the first time.
#[tauri::command]
async fn fetch_catalog(app: AppHandle, library: State<'_, Library>) -> Result<ScanResult, String> {
    let dir = data_dir(&app)?;
    let current = library
        .0
        .lock()
        .map_err(|_| "bibliotheque verrouillee".to_string())?
        .clone();

    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut result = current;

        let mut store = cache::load_store(&dir);
        let owned = scanners::steam_owned_games(&mut store);
        let _ = cache::save_store(&dir, &store);
        scanners::merge_owned(&mut result.games, owned);
        scanners::sort_library(&mut result.games);

        artwork::fetch_missing(&mut result.games, &cache::covers_dir(&dir));
        let _ = cache::save(&dir, &result);
        result
    })
    .await
    .map_err(|e| format!("recuperation du catalogue interrompue : {e}"))?;

    *library.0.lock().map_err(|_| "bibliotheque verrouillee")? = result.clone();
    Ok(result)
}

/// Hands the game to its launcher: plays it if installed, installs it if not.
/// Which of the two is decided here rather than by the frontend, so a stale
/// grid can never ask us to launch something that is no longer on disk.
#[tauri::command]
fn launch_game(library: State<'_, Library>, id: String) -> Result<(), String> {
    let game = find_game(&library, &id)?;
    launcher::launch_uri(&game.action_uri).map_err(|e| format!("{e:#}"))
}

#[tauri::command]
fn open_install_dir(library: State<'_, Library>, id: String) -> Result<(), String> {
    let game = find_game(&library, &id)?;
    let dir = game
        .install_dir
        .ok_or_else(|| format!("{} n'est pas installe", game.name))?;
    launcher::open_folder(&dir).map_err(|e| format!("{e:#}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Library::default())
        .invoke_handler(tauri::generate_handler![
            load_cached_library,
            scan_library,
            fetch_catalog,
            launch_game,
            open_install_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
