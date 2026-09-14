/// Every command the frontend can call, declared so that each window gets
/// only the ones its capability lists (`capabilities/*.json`). Without this
/// manifest, any window could call any command: the friends window could
/// launch or uninstall a game.
const COMMANDS: &[&str] = &[
    // The library window.
    "load_cached_library",
    "scan_library",
    "fetch_catalog",
    "launch_game",
    "open_install_dir",
    "uninstall_game",
    "refresh_playtime",
    "list_flags",
    "set_game_flag",
    "list_collections",
    "create_collection",
    "rename_collection",
    "delete_collection",
    "set_collection_membership",
    "finish_splash",
    "search_market",
    "market_home",
    "store_offers",
    "open_store_url",
    "open_redeem",
    "open_friends",
    // The friends window.
    "accounts",
    "steam_sign_in",
    "steam_sign_out",
    "steam_friends",
    "epic_sign_in",
    "epic_sign_out",
    "epic_friends",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
