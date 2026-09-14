//! The friends window and the sign-ins behind it.
//!
//! A small window of its own, like Steam's friends list: it sits next to a game
//! or another app without the library having to stay open in front.

use crate::steam_account::{self, FriendsError, Profile};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

const FRIENDS_WINDOW: &str = "friends";
const STEAM_LOGIN_WINDOW: &str = "steam-login";

/// Sent to every window when an account signs in or out.
const ACCOUNTS_CHANGED: &str = "accounts-changed";

#[tauri::command]
pub fn open_friends(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(FRIENDS_WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, FRIENDS_WINDOW, WebviewUrl::App("friends.html".into()))
        .title("Amis — G-Lib")
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
    steam: Option<Profile>,
}

#[tauri::command]
pub fn accounts() -> Accounts {
    Accounts {
        steam: steam_account::account(),
    }
}

/// Opens Steam's sign-in page and waits for it to come back.
///
/// The window is an ordinary browser view on steamcommunity.com, with no access
/// to the application. When Steam redirects to the relay, that navigation is
/// stopped and its query string -- the signed assertion -- is taken from the
/// URL, so the page never has to talk to G-Lib at all.
#[tauri::command]
pub async fn steam_sign_in(app: AppHandle) -> Result<Profile, String> {
    if let Some(existing) = app.get_webview_window(STEAM_LOGIN_WINDOW) {
        let _ = existing.set_focus();
        return Err("La connexion à Steam est déjà ouverte.".into());
    }

    let url: tauri::Url = steam_account::login_url()
        .parse()
        .map_err(|e| format!("adresse du relais invalide : {e}"))?;

    // Some(query) when Steam came back, None when the user closed the window.
    let (sender, receiver) = std::sync::mpsc::channel::<Option<String>>();
    let on_return = sender.clone();

    let window = WebviewWindowBuilder::new(&app, STEAM_LOGIN_WINDOW, WebviewUrl::External(url))
        .title("Connexion à Steam")
        .inner_size(520.0, 760.0)
        .center()
        .on_navigation(move |url| {
            if steam_account::is_return(url) {
                let _ = on_return.send(Some(url.query().unwrap_or_default().to_string()));
                return false;
            }
            true
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
        .map_err(|e| format!("connexion interrompue : {e}"))?;

    if let Some(window) = app.get_webview_window(STEAM_LOGIN_WINDOW) {
        let _ = window.close();
    }
    let Some(query) = outcome else {
        return Err("cancelled".into());
    };

    let profile = tauri::async_runtime::spawn_blocking(move || {
        steam_account::complete_sign_in(&query)
    })
    .await
    .map_err(|e| format!("connexion interrompue : {e}"))??;

    let _ = app.emit(ACCOUNTS_CHANGED, ());
    Ok(profile)
}

#[tauri::command]
pub fn steam_sign_out(app: AppHandle) {
    steam_account::sign_out();
    let _ = app.emit(ACCOUNTS_CHANGED, ());
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum FriendsAnswer {
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
pub async fn steam_friends(app: AppHandle) -> FriendsAnswer {
    let answer = tauri::async_runtime::spawn_blocking(steam_account::friends).await;
    match answer {
        Ok(Ok(found)) => FriendsAnswer::Ready {
            visibility: found.visibility,
            friends: found.friends,
        },
        Ok(Err(FriendsError::SignedOut)) => {
            // The token may just have been dropped as expired.
            let _ = app.emit(ACCOUNTS_CHANGED, ());
            FriendsAnswer::SignedOut
        }
        Ok(Err(FriendsError::Unavailable(message))) => FriendsAnswer::Unavailable { message },
        Err(e) => FriendsAnswer::Unavailable {
            message: e.to_string(),
        },
    }
}
