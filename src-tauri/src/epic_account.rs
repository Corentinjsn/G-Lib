//! The user's Epic Games account, as far as friends are concerned.
//!
//! Epic signs in with OAuth: its own page, then a one-time code that the relay
//! trades for tokens with the client secret it keeps. The app never sees Epic's
//! tokens; it keeps a sealed blob only the relay can open, and replaces it
//! with the fresh one each answer brings.

use crate::{credential_store, relay};
use serde::{Deserialize, Serialize};

const STORE_NAME: &str = "epic";

pub const RETURN_PATH: &str = "/epic/return";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub name: String,
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
}

#[derive(Deserialize)]
struct FriendsResponse {
    friends: Vec<Friend>,
    token: String,
}

/// A random value the sign-in must come back with. Without it, a page could
/// send the window back to the relay with a code for someone else's account.
pub fn new_state() -> String {
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use base64::Engine;
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("the system random source is available");
    URL_SAFE_NO_PAD.encode(bytes)
}

pub fn login_url(state: &str) -> String {
    format!("{}?state={state}", relay::url("/epic/login"))
}

/// Epic's sign-in can hand over to Google, Apple, Xbox, PlayStation, Nintendo
/// or Steam, so the window is not held to Epic's hosts. It is held to HTTPS:
/// no `file:`, no custom protocols, nothing unencrypted.
pub fn may_navigate(url: &tauri::Url) -> bool {
    url.scheme() == "https"
}

/// The code in Epic's redirect, if the state is the one this sign-in sent.
pub fn code_from_return(url: &tauri::Url, state: &str) -> Result<String, String> {
    let mut code = None;
    let mut returned_state = None;
    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "code" => code = Some(value.into_owned()),
            "state" => returned_state = Some(value.into_owned()),
            "error" => return Err("cancelled".into()),
            _ => {}
        }
    }
    if returned_state.as_deref() != Some(state) {
        return Err("La connexion Epic n'a pas pu être vérifiée. Réessayez.".into());
    }
    code.filter(|code| !code.is_empty())
        .ok_or_else(|| "cancelled".to_string())
}

fn stored() -> Option<Stored> {
    serde_json::from_str(&credential_store::load(STORE_NAME)?).ok()
}

fn store(stored: &Stored) -> Result<(), String> {
    credential_store::save(
        STORE_NAME,
        &serde_json::to_string(stored).map_err(|e| e.to_string())?,
    )
}

pub fn account() -> Option<Profile> {
    stored().map(|stored| stored.profile)
}

pub fn sign_out() {
    credential_store::delete(STORE_NAME);
}

pub fn complete_sign_in(code: &str) -> Result<Profile, String> {
    if !code.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("La connexion Epic n'a pas pu être vérifiée. Réessayez.".into());
    }
    let response = relay::client()?
        .post(relay::url("/epic/session"))
        .header("Content-Type", "application/x-www-form-urlencoded")
        // Epic codes are URL-safe already; the relay refuses anything else.
        .body(format!("code={code}"))
        .send()
        .map_err(|_| "relais injoignable".to_string())?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err("Epic n'a pas confirmé la connexion. Réessayez.".into());
    }
    if response.status() == reqwest::StatusCode::SERVICE_UNAVAILABLE {
        return Err("La connexion Epic n'est pas encore activée sur le relais.".into());
    }
    if !response.status().is_success() {
        return Err(format!("le relais a répondu {}", response.status()));
    }
    let signed: Stored = response
        .json()
        .map_err(|_| "réponse du relais illisible".to_string())?;
    store(&signed)?;
    Ok(signed.profile)
}

pub use crate::steam_account::FriendsError;

pub fn friends() -> Result<Vec<Friend>, FriendsError> {
    let Some(stored) = stored() else {
        return Err(FriendsError::SignedOut);
    };
    let response = relay::client()
        .map_err(FriendsError::Unavailable)?
        .get(relay::url("/epic/friends"))
        .bearer_auth(&stored.token)
        .send()
        .map_err(|_| FriendsError::Unavailable("relais injoignable".into()))?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        sign_out();
        return Err(FriendsError::SignedOut);
    }
    if !response.status().is_success() {
        return Err(FriendsError::Unavailable(format!(
            "Epic indisponible ({})",
            response.status()
        )));
    }
    let answer: FriendsResponse = response
        .json()
        .map_err(|_| FriendsError::Unavailable("réponse illisible".into()))?;

    // Epic's refresh token turns over on every use: the old seal is spent.
    let _ = store(&Stored {
        token: answer.token,
        profile: stored.profile,
    });
    Ok(answer.friends)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn states_are_long_random_and_url_safe() {
        let a = new_state();
        assert_eq!(a.len(), 43);
        assert!(a.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
        assert_ne!(a, new_state());
    }

    #[test]
    fn a_return_is_accepted_only_with_its_own_state() {
        let url = |query: &str| {
            let mut url = tauri::Url::parse(&relay::url(RETURN_PATH)).unwrap();
            url.set_query(Some(query));
            url
        };
        assert_eq!(code_from_return(&url("code=abc123&state=S"), "S").unwrap(), "abc123");
        assert!(code_from_return(&url("code=abc123&state=OTHER"), "S").is_err());
        assert!(code_from_return(&url("code=abc123"), "S").is_err());
        assert_eq!(
            code_from_return(&url("error=access_denied&state=S"), "S").unwrap_err(),
            "cancelled"
        );
    }

    #[test]
    fn the_sign_in_window_stays_on_https() {
        let ok = |url: &str| may_navigate(&tauri::Url::parse(url).unwrap());
        assert!(ok("https://www.epicgames.com/id/login"));
        assert!(ok("https://accounts.google.com/o/oauth2/auth"));
        assert!(!ok("http://www.epicgames.com/id/login"));
        assert!(!ok("file:///C:/"));
        assert!(!ok("com.epicgames.launcher://apps"));
    }
}
