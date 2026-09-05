mod artwork;
mod binvdf;
mod cache;
mod collections;
mod launcher;
mod models;
mod playtime;
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
        playtime::apply(&mut result.games, &playtime::load(&dir));
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
        playtime::apply(&mut result.games, &playtime::load(&dir));
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

/// Re-reads the session log and folds it back into the library in memory.
///
/// Cheap enough to call whenever the window regains focus, which is exactly
/// when the user has just come back from playing something.
#[tauri::command]
fn refresh_playtime(app: AppHandle, library: State<'_, Library>) -> Result<ScanResult, String> {
    let dir = data_dir(&app)?;
    let sessions = playtime::load(&dir);
    let mut current = library
        .0
        .lock()
        .map_err(|_| "bibliotheque verrouillee".to_string())?;
    playtime::apply(&mut current.games, &sessions);
    Ok(current.clone())
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

/// Every command below returns the full list, so the frontend never has to
/// guess what the file now holds.
#[tauri::command]
fn list_collections(app: AppHandle) -> Result<Vec<collections::Collection>, String> {
    Ok(collections::load(&data_dir(&app)?))
}

#[tauri::command]
fn create_collection(app: AppHandle, name: String) -> Result<Vec<collections::Collection>, String> {
    collections::create(&data_dir(&app)?, &name).map_err(|e| format!("{e:#}"))
}

#[tauri::command]
fn rename_collection(
    app: AppHandle,
    id: String,
    name: String,
) -> Result<Vec<collections::Collection>, String> {
    collections::rename(&data_dir(&app)?, &id, &name).map_err(|e| format!("{e:#}"))
}

#[tauri::command]
fn delete_collection(app: AppHandle, id: String) -> Result<Vec<collections::Collection>, String> {
    collections::delete(&data_dir(&app)?, &id).map_err(|e| format!("{e:#}"))
}

#[tauri::command]
fn set_collection_membership(
    app: AppHandle,
    id: String,
    game_id: String,
    member: bool,
) -> Result<Vec<collections::Collection>, String> {
    collections::set_membership(&data_dir(&app)?, &id, &game_id, member)
        .map_err(|e| format!("{e:#}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(Library::default())
        .setup(|app| {
            // Watching processes is how every platform gets a play history,
            // so it starts with the app rather than with the first scan.
            if let Ok(dir) = app.path().app_data_dir() {
                let handle = app.handle().clone();
                playtime::watch(dir, move || {
                    handle
                        .state::<Library>()
                        .0
                        .lock()
                        .map(|library| library.games.clone())
                        .unwrap_or_default()
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_cached_library,
            scan_library,
            fetch_catalog,
            launch_game,
            open_install_dir,
            refresh_playtime,
            list_collections,
            create_collection,
            rename_collection,
            delete_collection,
            set_collection_membership
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
