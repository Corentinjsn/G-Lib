//! The G-Lib relay: the small server that holds the Steam Web API key and the
//! Epic client secret, so that the installer holds neither. Its code is in
//! `relay/` at the root of the repository.

use std::time::Duration;

/// The deployed relay. `GLIB_RELAY_URL` points a development build elsewhere,
/// such as `wrangler dev`.
const RELAY: &str = "https://g-lib-relay.janson-corentin.workers.dev";

pub fn base() -> String {
    std::env::var("GLIB_RELAY_URL")
        .ok()
        .filter(|url| !url.is_empty())
        .unwrap_or_else(|| RELAY.to_string())
        .trim_end_matches('/')
        .to_string()
}

pub fn url(path: &str) -> String {
    format!("{}{path}", base())
}

pub fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent(concat!("G-Lib/", env!("CARGO_PKG_VERSION")))
        // The relay is always HTTPS; a redirect elsewhere is not followed with
        // a token attached.
        .redirect(reqwest::redirect::Policy::none())
        .https_only(true)
        .build()
        .map_err(|e| format!("client http indisponible : {e}"))
}

/// Whether `url` is the relay's `path`. Compared by scheme, host, port and
/// exact path, never by prefix: `…/steam/return.evil` or a look-alike host
/// must not count.
pub fn is_at(url: &tauri::Url, path: &str) -> bool {
    let Ok(relay) = tauri::Url::parse(&base()) else {
        return false;
    };
    url.scheme() == relay.scheme()
        && url.host_str() == relay.host_str()
        && url.port_or_known_default() == relay.port_or_known_default()
        && url.path() == path
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_exact_relay_path_counts() {
        let relay = tauri::Url::parse(&base()).unwrap();
        let at = |path: &str| {
            let mut url = relay.clone();
            url.set_path(path);
            url.set_query(Some("openid.mode=id_res"));
            url
        };
        assert!(is_at(&at("/steam/return"), "/steam/return"));
        assert!(!is_at(&at("/steam/return.evil"), "/steam/return"));
        assert!(!is_at(&at("/epic/return"), "/steam/return"));
        assert!(!is_at(
            &tauri::Url::parse("https://steamcommunity.com/steam/return?x=1").unwrap(),
            "/steam/return"
        ));
        let mut lookalike = relay.clone();
        lookalike
            .set_host(Some(&format!("{}.evil.example", relay.host_str().unwrap())))
            .unwrap();
        lookalike.set_path("/steam/return");
        assert!(!is_at(&lookalike, "/steam/return"));
        let mut plain = relay.clone();
        plain.set_scheme("http").unwrap();
        plain.set_path("/steam/return");
        assert!(!is_at(&plain, "/steam/return"));
    }
}
