//! The user's Steam account, as far as friends are concerned.
//!
//! Signing in happens on Steam's own page, in a window G-Lib opens; the
//! password never passes through the application. What comes back is an
//! OpenID assertion, which the relay checks with Steam before issuing a token
//! for that one account.

use crate::{credential_store, relay};
use serde::{Deserialize, Serialize};

/// Credential Manager entry for the Steam sign-in.
const STORE_NAME: &str = "steam";

pub const LOGIN_PATH: &str = "/steam/login";
pub const RETURN_PATH: &str = "/steam/return";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub avatar: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct Stored {
    token: String,
    profile: Profile,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Friend {
    pub id: String,
    pub name: String,
    pub avatar: Option<String>,
    pub state: u8,
    pub game: Option<String>,
    pub profile_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Friends {
    /// "public", or "private" when Steam will not show the list.
    pub visibility: String,
    pub friends: Vec<Friend>,
}

/// Where the sign-in window may go: Steam's own sites, and the relay it
/// returns to. A link on the page to anywhere else is not followed inside a
/// window that is about to receive a sign-in.
pub fn may_navigate(url: &tauri::Url) -> bool {
    if url.scheme() != "https" {
        return false;
    }
    let host = url.host_str().unwrap_or_default();
    host == "steamcommunity.com"
        || host == "store.steampowered.com"
        || host == "login.steampowered.com"
        || host == "help.steampowered.com"
        || relay::is_at(url, LOGIN_PATH)
        || relay::is_at(url, RETURN_PATH)
}

fn stored() -> Option<Stored> {
    serde_json::from_str(&credential_store::load(STORE_NAME)?).ok()
}

pub fn account() -> Option<Profile> {
    stored().map(|stored| stored.profile)
}

pub fn sign_out() {
    credential_store::delete(STORE_NAME);
}

/// Hands the assertion Steam returned to the relay, and keeps the token.
pub fn complete_sign_in(query: &str) -> Result<Profile, String> {
    let response = relay::client()?
        .post(relay::url("/steam/session"))
        .header("Content-Type", "text/plain")
        .body(query.to_string())
        .send()
        .map_err(|_| "relais injoignable".to_string())?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err("Steam n'a pas confirmé la connexion. Réessayez.".into());
    }
    if !response.status().is_success() {
        return Err(format!("le relais a répondu {}", response.status()));
    }
    let signed: Stored = response
        .json()
        .map_err(|_| "réponse du relais illisible".to_string())?;
    credential_store::save(
        STORE_NAME,
        &serde_json::to_string(&signed).map_err(|e| e.to_string())?,
    )?;
    Ok(signed.profile)
}

#[derive(Debug)]
pub enum FriendsError {
    SignedOut,
    Unavailable(String),
}

pub fn friends() -> Result<Friends, FriendsError> {
    let Some(stored) = stored() else {
        return Err(FriendsError::SignedOut);
    };
    let response = relay::client()
        .map_err(FriendsError::Unavailable)?
        .get(relay::url("/steam/friends"))
        .bearer_auth(&stored.token)
        .send()
        .map_err(|_| FriendsError::Unavailable("relais injoignable".into()))?;

    // An expired or revoked token: forget it, the user signs in again.
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        sign_out();
        return Err(FriendsError::SignedOut);
    }
    if !response.status().is_success() {
        return Err(FriendsError::Unavailable(format!(
            "Steam indisponible ({})",
            response.status()
        )));
    }
    response
        .json()
        .map_err(|_| FriendsError::Unavailable("réponse illisible".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_sign_in_window_stays_on_steam() {
        let ok = |url: &str| may_navigate(&tauri::Url::parse(url).unwrap());
        assert!(ok("https://steamcommunity.com/openid/login?openid.mode=checkid_setup"));
        assert!(ok("https://login.steampowered.com/jwt/finalizelogin"));
        assert!(ok(&relay::url(RETURN_PATH)));
        assert!(!ok("http://steamcommunity.com/openid/login"));
        assert!(!ok("https://steamcommunity.com.evil.example/"));
        assert!(!ok("https://example.com/"));
        assert!(!ok("file:///C:/Windows/"));
    }
}
