//! Client for Steam's public store endpoints. No API key, no login.
//!
//! Two endpoints carry the whole feature set we need:
//!
//! - `SearchApps` turns a title into an appid, which is how EA and Ubisoft
//!   games find cover art they do not publish themselves.
//! - `IStoreBrowseService/GetItems` turns appids into names, types and asset
//!   paths. It takes many ids per call, and it is the only way to reach cover
//!   art for recent titles: the old flat
//!   `.../apps/<appid>/library_600x900.jpg` route now 404s for them.

use std::time::Duration;

const ASSET_HOST: &str = "https://shared.cloudflare.steamstatic.com/store_item_assets/";
const SEARCH: &str = "https://steamcommunity.com/actions/SearchApps/";
const GET_ITEMS: &str = "https://api.steampowered.com/IStoreBrowseService/GetItems/v1/";

/// Ids per `GetItems` call. Steam accepts more, but this keeps request URLs
/// short and spreads the work into progress the UI can show.
pub const ITEMS_PER_CALL: usize = 50;

/// `store_items[].type` for a game, as opposed to a DLC, soundtrack or tool.
const TYPE_GAME: i64 = 0;

pub fn client() -> Option<reqwest::blocking::Client> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent("GAMLIB/0.1")
        .build()
        .ok()
}

#[derive(Debug, Clone)]
pub struct StoreItem {
    pub appid: u32,
    pub name: String,
    /// Cover art, best first. Empty when the store publishes none.
    pub cover_urls: Vec<String>,
}

pub fn percent_encode(value: &str) -> String {
    let mut out = String::new();
    for byte in value.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*byte as char)
            }
            other => out.push_str(&format!("%{other:02X}")),
        }
    }
    out
}

/// Portrait cover URLs for one store item, best first.
fn cover_urls(assets: &serde_json::Value) -> Vec<String> {
    let Some(url_format) = assets.get("asset_url_format").and_then(|v| v.as_str()) else {
        return Vec::new();
    };
    let Some(capsule) = assets.get("library_capsule").and_then(|v| v.as_str()) else {
        return Vec::new();
    };

    // The 2x variant is 600x900 against the base 300x450 -- worth having on a
    // high-DPI display, but it is not published for every app.
    let retina = capsule.replace(".jpg", "_2x.jpg");
    [retina.as_str(), capsule]
        .iter()
        .map(|name| format!("{ASSET_HOST}{}", url_format.replace("${FILENAME}", name)))
        .collect()
}

/// Look up a batch of appids. Entries that are not visible games -- DLC,
/// soundtracks, tools, delisted apps -- are dropped, so the caller can treat
/// the result as a library.
pub fn get_items(client: &reqwest::blocking::Client, appids: &[u32]) -> Vec<StoreItem> {
    if appids.is_empty() {
        return Vec::new();
    }

    let ids = appids
        .iter()
        .map(|id| format!(r#"{{"appid":{id}}}"#))
        .collect::<Vec<_>>()
        .join(",");
    let input_json = format!(
        r#"{{"ids":[{ids}],"context":{{"language":"english","country_code":"FR"}},"data_request":{{"include_assets":true}}}}"#
    );
    let url = format!("{GET_ITEMS}?input_json={}", percent_encode(&input_json));

    let Ok(response) = client.get(&url).send() else {
        return Vec::new();
    };
    let Ok(value) = response.json::<serde_json::Value>() else {
        return Vec::new();
    };
    let Some(items) = value
        .pointer("/response/store_items")
        .and_then(|v| v.as_array())
    else {
        return Vec::new();
    };

    items
        .iter()
        .filter(|item| item.get("visible").and_then(|v| v.as_bool()) == Some(true))
        .filter(|item| item.get("type").and_then(|v| v.as_i64()) == Some(TYPE_GAME))
        .filter_map(|item| {
            let appid = item.get("appid").or_else(|| item.get("id"))?.as_u64()? as u32;
            let name = item.get("name")?.as_str()?.trim().to_string();
            if name.is_empty() {
                return None;
            }
            let null = serde_json::Value::Null;
            Some(StoreItem {
                appid,
                name,
                cover_urls: cover_urls(item.get("assets").unwrap_or(&null)),
            })
        })
        .collect()
}

/// Raw `(appid, name)` search hits for a title.
pub fn search_apps(client: &reqwest::blocking::Client, term: &str) -> Vec<(String, String)> {
    let url = format!("{SEARCH}{}", percent_encode(term));
    let Ok(response) = client.get(&url).send() else {
        return Vec::new();
    };
    let Ok(value) = response.json::<serde_json::Value>() else {
        return Vec::new();
    };
    value
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    Some((
                        item.get("appid")?.as_str()?.to_string(),
                        item.get("name")?.as_str()?.to_string(),
                    ))
                })
                .collect()
        })
        .unwrap_or_default()
}
