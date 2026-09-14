//! The user's Steam account, as far as friends are concerned.
//!
//! Signing in happens on Steam's own page, in a window G-Lib opens; the
//! password never passes through the application. What comes back is an
//! OpenID assertion, which the G-Lib relay checks with Steam before issuing a
//! token for that one account. The relay holds the Steam Web API key, so the
//! installer never does (see `relay/` at the root of the repository).

use crate::credential_store;
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// The deployed relay. `GLIB_RELAY_URL` points a development build elsewhere,
/// such as `wrangler dev`.
const RELAY: &str = "https://g-lib-relay.workers.dev";

/// Credential Manager entry for the Steam sign-in.
const STORE_NAME: &str = "steam";

pub fn relay() -> String {
    std::env::var("GLIB_RELAY_URL")
        .ok()
        .filter(|url| !url.is_empty())
        .unwrap_or_else(|| RELAY.to_string())
        .trim_end_matches('/')
        .to_string()
}

pub fn login_url() -> String {
    format!("{}/steam/login", relay())
}

/// Whether a navigation is Steam sending the sign-in window back to the relay.
/// Compared by origin and path, never by prefix: `…/steam/return.evil` or
/// another host must not count.
pub fn is_return(url: &tauri::Url) -> bool {
    let Ok(relay) = tauri::Url::parse(&relay()) else {
        return false;
    };
    url.scheme() == relay.scheme()
        && url.host_str() == relay.host_str()
        && url.port_or_known_default() == relay.port_or_known_default()
        && url.path() == "/steam/return"
}

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

fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent(concat!("G-Lib/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| format!("client http indisponible : {e}"))
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
    let response = client()?
        .post(format!("{}/steam/session", relay()))
        .header("Content-Type", "text/plain")
        .body(query.to_string())
        .send()
        .map_err(|e| format!("relais injoignable : {e}"))?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err("Steam n'a pas confirmé la connexion. Réessayez.".into());
    }
    if !response.status().is_success() {
        return Err(format!("le relais a répondu {}", response.status()));
    }
    let signed: Stored = response
        .json()
        .map_err(|e| format!("réponse du relais illisible : {e}"))?;
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
    let response = client()
        .map_err(FriendsError::Unavailable)?
        .get(format!("{}/steam/friends", relay()))
        .bearer_auth(&stored.token)
        .send()
        .map_err(|e| FriendsError::Unavailable(format!("relais injoignable : {e}")))?;

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
        .map_err(|e| FriendsError::Unavailable(format!("réponse illisible : {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_relay_return_path_counts() {
        let relay = tauri::Url::parse(&relay()).unwrap();
        let at = |path: &str| {
            let mut url = relay.clone();
            url.set_path(path);
            url.set_query(Some("openid.mode=id_res"));
            url
        };
        assert!(is_return(&at("/steam/return")));
        assert!(!is_return(&at("/steam/return.evil")));
        assert!(!is_return(&at("/steam/login")));
        assert!(!is_return(
            &tauri::Url::parse("https://steamcommunity.com/steam/return?x=1").unwrap()
        ));
        assert!(!is_return(
            &tauri::Url::parse("http://g-lib-relay.workers.dev.evil.example/steam/return").unwrap()
        ));
    }
}
