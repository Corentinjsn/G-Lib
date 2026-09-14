//! The friends window and the sign-ins behind it.
//!
//! A small window of its own, like Steam's friends list: it sits next to a game
//! or another app without the library having to stay open in front.

use crate::{epic_account, relay, steam_account};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

const FRIENDS_WINDOW: &str = "friends";
const SIGN_IN_WINDOW: &str = "sign-in";

/// Sent to every window when an account signs in or out.
const ACCOUNTS_CHANGED: &str = "accounts-changed";

/// Async on purpose: on Windows, a window built from a synchronous command
/// deadlocks the event loop that has to create it.
#[tauri::command]
pub async fn open_friends(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(FRIENDS_WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, FRIENDS_WINDOW, WebviewUrl::App("friends.html".into()))
        .title("Amis — G-Lib")
        // The same drawn title bar as the library, not the system one.
        .decorations(false)
        .inner_size(340.0, 680.0)
        .min_inner_size(280.0, 400.0)
        .background_color(tauri::window::Color(11, 13, 18, 255))
        .build()
        .map(|_| ())
        .map_err(|e| format!("fenêtre d'amis impossible : {e}"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Accounts {
    steam: Option<steam_account::Profile>,
    epic: Option<epic_account::Profile>,
}

#[tauri::command]
pub fn accounts() -> Accounts {
    Accounts {
        steam: steam_account::account(),
        epic: epic_account::account(),
    }
}

/// Opens a store's sign-in page and waits for it to come back to `return_path`.
///
/// The window is a plain browser view on the store's site:
/// - it has no capability, so the page cannot call into G-Lib;
/// - it is private (incognito): no cookie or session outlives it;
/// - `may_navigate` keeps it on the sites a sign-in needs;
/// - the redirect back to the relay is stopped before it loads, and only its
///   URL is read.
///
/// Returns the return URL, or None if the user closed the window.
async fn sign_in_window(
    app: &AppHandle,
    title: &str,
    start: String,
    return_path: &'static str,
    may_navigate: fn(&tauri::Url) -> bool,
) -> Result<Option<tauri::Url>, String> {
    if let Some(existing) = app.get_webview_window(SIGN_IN_WINDOW) {
        let _ = existing.set_focus();
        return Err("Une connexion est déjà en cours.".into());
    }
    let url: tauri::Url = start
        .parse()
        .map_err(|_| "adresse du relais invalide".to_string())?;

    let (sender, receiver) = std::sync::mpsc::channel::<Option<tauri::Url>>();
    let on_return = sender.clone();

    let window = WebviewWindowBuilder::new(app, SIGN_IN_WINDOW, WebviewUrl::External(url))
        .title(title)
        .inner_size(520.0, 760.0)
        .center()
        .incognito(true)
        .on_navigation(move |url| {
            if relay::is_at(url, return_path) {
                let _ = on_return.send(Some(url.clone()));
                return false;
            }
            may_navigate(url)
        })
        .build()
        .map_err(|e| format!("fenêtre de connexion impossible : {e}"))?;

    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            let _ = sender.send(None);
        }
    });

    let outcome = tauri::async_runtime::spawn_blocking(move || receiver.recv().ok().flatten())
        .await
        .map_err(|_| "connexion interrompue".to_string())?;

    if let Some(window) = app.get_webview_window(SIGN_IN_WINDOW) {
        let _ = window.close();
    }
    Ok(outcome)
}

#[tauri::command]
pub async fn steam_sign_in(app: AppHandle) -> Result<steam_account::Profile, String> {
    let returned = sign_in_window(
        &app,
        "Connexion à Steam",
        relay::url(steam_account::LOGIN_PATH),
        steam_account::RETURN_PATH,
        steam_account::may_navigate,
    )
    .await?
    .ok_or_else(|| "cancelled".to_string())?;

    let query = returned.query().unwrap_or_default().to_string();
    let profile = tauri::async_runtime::spawn_blocking(move || {
        steam_account::complete_sign_in(&query)
    })
    .await
    .map_err(|_| "connexion interrompue".to_string())??;

    let _ = app.emit(ACCOUNTS_CHANGED, ());
    Ok(profile)
}

#[tauri::command]
pub async fn epic_sign_in(app: AppHandle) -> Result<epic_account::Profile, String> {
    let state = epic_account::new_state();
    let returned = sign_in_window(
        &app,
        "Connexion à Epic Games",
        epic_account::login_url(&state),
        epic_account::RETURN_PATH,
        epic_account::may_navigate,
    )
    .await?
    .ok_or_else(|| "cancelled".to_string())?;

    let code = epic_account::code_from_return(&returned, &state)?;
    let profile = tauri::async_runtime::spawn_blocking(move || {
        epic_account::complete_sign_in(&code)
    })
    .await
    .map_err(|_| "connexion interrompue".to_string())??;

    let _ = app.emit(ACCOUNTS_CHANGED, ());
    Ok(profile)
}

#[tauri::command]
pub fn steam_sign_out(app: AppHandle) {
    steam_account::sign_out();
    let _ = app.emit(ACCOUNTS_CHANGED, ());
}

#[tauri::command]
pub fn epic_sign_out(app: AppHandle) {
    epic_account::sign_out();
    let _ = app.emit(ACCOUNTS_CHANGED, ());
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum SteamFriendsAnswer {
    Ready {
        visibility: String,
        friends: Vec<steam_account::Friend>,
    },
    SignedOut,
    Unavailable {
        message: String,
    },
}

#[tauri::command]
pub async fn steam_friends(app: AppHandle) -> SteamFriendsAnswer {
    match tauri::async_runtime::spawn_blocking(steam_account::friends).await {
        Ok(Ok(found)) => SteamFriendsAnswer::Ready {
            visibility: found.visibility,
            friends: found.friends,
        },
        Ok(Err(steam_account::FriendsError::SignedOut)) => {
            // The token may just have been dropped as expired.
            let _ = app.emit(ACCOUNTS_CHANGED, ());
            SteamFriendsAnswer::SignedOut
        }
        Ok(Err(steam_account::FriendsError::Unavailable(message))) => {
            SteamFriendsAnswer::Unavailable { message }
        }
        Err(_) => SteamFriendsAnswer::Unavailable {
            message: "requête interrompue".into(),
        },
    }
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum EpicFriendsAnswer {
    Ready { friends: Vec<epic_account::Friend> },
    SignedOut,
    Unavailable { message: String },
}

#[tauri::command]
pub async fn epic_friends(app: AppHandle) -> EpicFriendsAnswer {
    match tauri::async_runtime::spawn_blocking(epic_account::friends).await {
        Ok(Ok(friends)) => EpicFriendsAnswer::Ready { friends },
        Ok(Err(epic_account::FriendsError::SignedOut)) => {
            let _ = app.emit(ACCOUNTS_CHANGED, ());
            EpicFriendsAnswer::SignedOut
        }
        Ok(Err(epic_account::FriendsError::Unavailable(message))) => {
            EpicFriendsAnswer::Unavailable { message }
        }
        Err(_) => EpicFriendsAnswer::Unavailable {
            message: "requête interrompue".into(),
        },
    }
}
