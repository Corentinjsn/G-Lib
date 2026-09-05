mod artwork;
mod cache;
mod launcher;
mod models;
mod scanners;
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

/// Download any covers still missing, then return the library with art attached.
#[tauri::command]
async fn fetch_covers(app: AppHandle, library: State<'_, Library>) -> Result<ScanResult, String> {
    let dir = data_dir(&app)?;
    let current = library
        .0
        .lock()
        .map_err(|_| "bibliotheque verrouillee".to_string())?
        .clone();

    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut result = current;
        artwork::fetch_missing(&mut result.games, &cache::covers_dir(&dir));
        let _ = cache::save(&dir, &result);
        result
    })
    .await
    .map_err(|e| format!("recuperation des jaquettes interrompue : {e}"))?;

    *library.0.lock().map_err(|_| "bibliotheque verrouillee")? = result.clone();
    Ok(result)
}

#[tauri::command]
fn launch_game(library: State<'_, Library>, id: String) -> Result<(), String> {
    let game = find_game(&library, &id)?;
    launcher::launch_uri(&game.launch_uri).map_err(|e| format!("{e:#}"))
}

#[tauri::command]
fn open_install_dir(library: State<'_, Library>, id: String) -> Result<(), String> {
    let game = find_game(&library, &id)?;
    launcher::open_folder(&game.install_dir).map_err(|e| format!("{e:#}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Library::default())
        .invoke_handler(tauri::generate_handler![
            load_cached_library,
            scan_library,
            fetch_covers,
            launch_game,
            open_install_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
