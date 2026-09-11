//! IGDB: the games Steam has never heard of.
//!
//! The store search runs on Steam's own catalogue, which is excellent at what
//! it covers and blind to everything else. A game sold only on the Epic store,
//! or only by Ubisoft, simply does not exist in it -- and "not found" is the
//! worst possible answer to "does this game exist".
//!
//! IGDB is a catalogue of games rather than of a shop's inventory, so it knows
//! them all. It carries no prices at all, which is why it comes *after* Steam
//! rather than instead of it: a Steam entry brings its price, its French
//! summary and its screenshots, and is always preferred when both know a
//! title.
//!
//! Access is free but needs a Twitch application (see `credentials`). Without
//! one the search falls back to Steam alone, which is what it was before.

use crate::credentials::Igdb;
use crate::steam_store::percent_encode;
use serde::Serialize;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

const TOKEN_URL: &str = "https://id.twitch.tv/oauth2/token";
const GAMES_URL: &str = "https://api.igdb.com/v4/games";
const IMAGE_HOST: &str = "https://images.igdb.com/igdb/image/upload";

/// `game_type` of a main game, as opposed to a season, a DLC or a bundle.
const MAIN_GAME: i64 = 0;

/// `external_game_source` of Steam, the only one we can turn into a price.
const SOURCE_STEAM: i64 = 1;

/// Results asked of IGDB. Most are dropped -- a title search matches every
/// season and expansion -- so the net has to be wider than what we keep.
const SEARCH_LIMIT: usize = 20;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IgdbGame {
    pub id: u64,
    pub name: String,
    pub cover_url: Option<String>,
    pub summary: Option<String>,
    /// Release date, in epoch seconds.
    pub release_date: Option<i64>,
    pub companies: Vec<String>,
    /// Present when IGDB knows the game is also on Steam. Lets the caller drop
    /// it in favour of the richer Steam entry, and lets the price lookup work.
    pub steam_appid: Option<u32>,
}

/// The bearer token, and the moment it stops being worth trying.
struct Token {
    value: String,
    until: Instant,
}

fn cache() -> &'static Mutex<Option<Token>> {
    static CACHE: OnceLock<Mutex<Option<Token>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

/// A bearer token for IGDB, minted from the Twitch application.
///
/// Twitch hands out tokens valid for about two months, so this is fetched once
/// per run at most. The expiry is kept short of the real one: a token that
/// dies mid-request costs a failed search, and a minute of margin costs
/// nothing.
fn token(client: &reqwest::blocking::Client, creds: &Igdb) -> Option<String> {
    let mut held = cache().lock().ok()?;
    if let Some(token) = held.as_ref() {
        if Instant::now() < token.until {
            return Some(token.value.clone());
        }
    }

    let url = format!(
        "{TOKEN_URL}?client_id={}&client_secret={}&grant_type=client_credentials",
        percent_encode(&creds.client_id),
        percent_encode(&creds.client_secret)
    );
    let response = client
        .post(&url)
        .send()
        .ok()?
        .json::<serde_json::Value>()
        .ok()?;

    let value = response.get("access_token")?.as_str()?.to_string();
    let lifetime = response
        .get("expires_in")
        .and_then(|v| v.as_u64())
        .unwrap_or(3600);

    *held = Some(Token {
        value: value.clone(),
        until: Instant::now() + Duration::from_secs(lifetime.saturating_sub(60)),
    });
    Some(value)
}

/// The names of the companies that published the game.
fn publishers(node: Option<&serde_json::Value>) -> Vec<String> {
    node.and_then(|value| value.as_array())
        .map(|list| {
            list.iter()
                .filter(|entry| entry.get("publisher").and_then(|v| v.as_bool()) == Some(true))
                .filter_map(|entry| {
                    Some(entry.pointer("/company/name")?.as_str()?.to_string())
                })
                .collect()
        })
        .unwrap_or_default()
}

fn describe(item: &serde_json::Value) -> Option<IgdbGame> {
    let name = item.get("name")?.as_str()?.trim().to_string();
    if name.is_empty() {
        return None;
    }

    Some(IgdbGame {
        id: item.get("id")?.as_u64()?,
        name,
        // `t_cover_big_2x` is 528x704, which is the size the grid draws.
        cover_url: item
            .pointer("/cover/image_id")
            .and_then(|v| v.as_str())
            .map(|id| format!("{IMAGE_HOST}/t_cover_big_2x/{id}.jpg")),
        summary: item
            .get("summary")
            .and_then(|v| v.as_str())
            .map(|text| text.trim().to_string()),
        release_date: item.get("first_release_date").and_then(|v| v.as_i64()),
        companies: publishers(item.get("involved_companies")),
        steam_appid: item
            .get("external_games")
            .and_then(|v| v.as_array())
            .and_then(|list| {
                list.iter()
                    .filter(|entry| {
                        entry.get("external_game_source").and_then(|v| v.as_i64())
                            == Some(SOURCE_STEAM)
                    })
                    .find_map(|entry| entry.get("uid")?.as_str()?.parse().ok())
            }),
    })
}

/// Games whose title matches, main games only.
pub fn search(client: &reqwest::blocking::Client, creds: &Igdb, term: &str) -> Vec<IgdbGame> {
    let Some(token) = token(client, creds) else {
        return Vec::new();
    };

    // Apicalypse, IGDB's own query language: a body of statements, not JSON.
    // The term goes inside quotes, so quotes and backslashes are stripped
    // rather than escaped -- a title carrying either is not worth a parser.
    let safe: String = term.chars().filter(|c| *c != '\\' && *c != '"').collect();
    let body = format!(
        r#"search "{safe}"; where game_type = {MAIN_GAME}; fields name,summary,first_release_date,cover.image_id,external_games.uid,external_games.external_game_source,involved_companies.publisher,involved_companies.company.name; limit {SEARCH_LIMIT};"#
    );

    let Ok(response) = client
        .post(GAMES_URL)
        .header("Client-ID", &creds.client_id)
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/json")
        .body(body)
        .send()
    else {
        return Vec::new();
    };

    response
        .json::<serde_json::Value>()
        .ok()
        .and_then(|value| {
            Some(
                value
                    .as_array()?
                    .iter()
                    .filter_map(describe)
                    .collect::<Vec<_>>(),
            )
        })
        .unwrap_or_default()
}
