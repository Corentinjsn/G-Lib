mod artwork;
mod binvdf;
mod cache;
mod collections;
mod flags;
mod launcher;
mod market;
mod models;
mod offers;
mod playtime;
mod scanners;
mod steam_store;
mod vdf;
mod watcher;

use models::{Game, ScanResult};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

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

/// One offline pass over the launchers, with the user's own marks folded
/// back in. Shared by the sync command and by the watcher.
fn rescan(dir: &std::path::Path) -> ScanResult {
    let mut result = scanners::scan_all();
    playtime::apply(&mut result.games, &playtime::load(dir));
    flags::apply(&mut result.games, &flags::load(dir));
    artwork::attach_cached(&mut result.games, &cache::covers_dir(dir));
    let _ = cache::save(dir, &result);
    result
}

/// Re-read every launcher. Filesystem and registry work, so it runs off the UI thread.
#[tauri::command]
async fn scan_library(app: AppHandle, library: State<'_, Library>) -> Result<ScanResult, String> {
    let dir = data_dir(&app)?;
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut result = scanners::scan_all();
        playtime::apply(&mut result.games, &playtime::load(&dir));
        flags::apply(&mut result.games, &flags::load(&dir));
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
        flags::apply(&mut result.games, &flags::load(&dir));
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

#[tauri::command]
fn list_flags(app: AppHandle) -> Result<flags::FlagMap, String> {
    Ok(flags::load(&data_dir(&app)?))
}

/// Marks are applied to the library in memory as well as saved, so the grid
/// reflects the change without waiting for the next sync.
#[tauri::command]
fn set_game_flag(
    app: AppHandle,
    library: State<'_, Library>,
    game_id: String,
    name: String,
    value: bool,
) -> Result<ScanResult, String> {
    let dir = data_dir(&app)?;
    let updated = flags::set(&dir, &game_id, &name, value).map_err(|e| format!("{e:#}"))?;

    let mut current = library
        .0
        .lock()
        .map_err(|_| "bibliotheque verrouillee".to_string())?;
    flags::apply(&mut current.games, &updated);
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

/// The uninstall flow belongs to the launcher; we only hand the game over.
#[tauri::command]
fn uninstall_game(library: State<'_, Library>, id: String) -> Result<(), String> {
    let game = find_game(&library, &id)?;
    let entry = game
        .uninstall
        .ok_or_else(|| format!("{} ne publie pas de desinstallation", game.name))?;
    launcher::uninstall(&entry).map_err(|e| format!("{e:#}"))
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

/// Cherche un jeu a acheter. Le reseau, donc hors du fil de l'interface.
#[tauri::command]
async fn search_market(query: String) -> Result<Vec<market::MarketItem>, String> {
    tauri::async_runtime::spawn_blocking(move || market::search(&query))
        .await
        .map_err(|e| format!("recherche interrompue : {e}"))?
}

/// Ce que le meme jeu coute chez Epic, Ubisoft et Instant Gaming.
///
/// Separe de `search_market` : trois requetes de plus par jeu, dont deux
/// lisent une page entiere. On ne les lance que pour la fiche ouverte, pas
/// pour chacun des douze resultats d'une recherche.
#[tauri::command]
async fn store_offers(name: String) -> Result<Vec<offers::StoreOffer>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let client = steam_store::client().ok_or_else(|| "client http indisponible".to_string())?;
        Ok(offers::lookup(&client, &name))
    })
    .await
    .map_err(|e| format!("recherche interrompue : {e}"))?
}

/// Ouvre une page de boutique dans le navigateur.
///
/// L'adresse est construite par l'interface, donc verifiee ici : seules les
/// boutiques que l'application connait passent. Une commande qui ouvrirait
/// n'importe quelle URL demandee par la page serait une passerelle vers le
/// shell.
#[tauri::command]
fn open_store_url(url: String) -> Result<(), String> {
    launcher::open_store_url(&url).map_err(|e| format!("{e:#}"))
}

/// Passe de la fenetre de demarrage a l'application.
///
/// L'ordre compte : on montre la principale avant de fermer la petite, sinon
/// il existe un instant ou aucune fenetre n'est visible — et la fermeture de
/// la fenetre de demarrage vaut alors « quitter » (voir `setup`).
#[tauri::command]
fn finish_splash(app: AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
    if let Some(splash) = app.get_webview_window("splash") {
        let _ = splash.close();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Reopening at the size and place it was left is the kind of thing a
        // daily-use application is expected to do.
        //
        // DECORATIONS is deliberately absent: it is part of the default set,
        // and restoring it put the system title bar back over the one the
        // application draws itself. What the window looks like is the
        // application's decision, not a piece of session state.
        //
        // VISIBLE l'est aussi, depuis que la fenetre principale demarre
        // cachee : la restaurer visible la ferait paraitre vide a cote de la
        // fenetre de demarrage.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        - tauri_plugin_window_state::StateFlags::DECORATIONS
                        - tauri_plugin_window_state::StateFlags::VISIBLE,
                )
                .build(),
        )
        .manage(Library::default())
        .setup(|app| {
            // La fenetre principale demarre cachee et c'est le frontend qui la
            // revele quand il a quelque chose a montrer. Si la petite fenetre
            // n'existe pas — configuration changee, creation refusee — plus
            // personne ne la revelerait : on la montre tout de suite.
            match app.get_webview_window("splash") {
                None => {
                    if let Some(main) = app.get_webview_window("main") {
                        let _ = main.show();
                    }
                }
                Some(splash) => {
                    // Fermer la fenetre de demarrage quand elle est seule a
                    // l'ecran, c'est renoncer au demarrage. Sans cela le
                    // processus survivrait sans aucune fenetre visible.
                    let handle = app.handle().clone();
                    splash.on_window_event(move |event| {
                        if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                            let shown = handle
                                .get_webview_window("main")
                                .and_then(|main| main.is_visible().ok())
                                == Some(true);
                            if !shown {
                                handle.exit(0);
                            }
                        }
                    });
                }
            }

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

            // A game appearing or disappearing on disk should reach the grid on
            // its own; being told to press Sync is not an answer.
            if let Ok(dir) = app.path().app_data_dir() {
                let handle = app.handle().clone();
                watcher::watch(move || {
                    let result = rescan(&dir);
                    if let Ok(mut library) = handle.state::<Library>().0.lock() {
                        *library = result.clone();
                    }
                    let _ = handle.emit("library-changed", result);
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
            uninstall_game,
            refresh_playtime,
            list_flags,
            set_game_flag,
            list_collections,
            create_collection,
            rename_collection,
            delete_collection,
            set_collection_membership,
            finish_splash,
            search_market,
            store_offers,
            open_store_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
