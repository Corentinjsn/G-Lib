//! The store's front page: what is on sale at each store, and what Steam
//! sells most.
//!
//! Every shelf is filled independently and in parallel. A store that does not
//! answer loses its own shelf, not the page.
//!
//! - Steam needs no key: `featuredcategories` lists its specials, top sellers
//!   and new releases by appid, and `market::items` describes them.
//! - Epic, EA and Ubisoft come from IsThereAnyDeal when there is a key. Without
//!   one, Epic still has a public promotions feed; EA and Ubisoft have none,
//!   and their shelves say so instead of staying empty.

use crate::market::{self, Deal, MarketItem};
use crate::{epic_promotions, itad};
use serde::Serialize;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

const FEATURED: &str = "https://store.steampowered.com/api/featuredcategories?cc=FR&l=french";

/// Games per shelf. A row wider than the window scrolls; past this, nobody
/// scrolls that far.
const PER_SHELF: usize = 20;

/// Prices move daily, not by the minute. Opening the store twice in a row
/// should not cost a dozen requests.
const FRESH_FOR: Duration = Duration::from_secs(30 * 60);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ShelfState {
    Ready,
    /// The store answered with nothing on sale.
    Empty,
    /// Only IsThereAnyDeal knows this store's prices, and there is no key.
    NeedsKey,
    Unavailable,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Shelf {
    pub id: &'static str,
    pub title: &'static str,
    /// The platform the shelf is about, for its icon. None for Steam's
    /// charts, which are about Steam but not about a discount.
    pub store: Option<&'static str>,
    pub state: ShelfState,
    pub items: Vec<MarketItem>,
}

fn shelf(
    id: &'static str,
    title: &'static str,
    store: Option<&'static str>,
    items: Option<Vec<MarketItem>>,
) -> Shelf {
    let state = match &items {
        None => ShelfState::Unavailable,
        Some(list) if list.is_empty() => ShelfState::Empty,
        Some(_) => ShelfState::Ready,
    };
    Shelf {
        id,
        title,
        store,
        state,
        items: items.unwrap_or_default(),
    }
}

/// The appids of one of `featuredcategories`' lists, in its order, deduplicated.
fn featured_ids(value: &serde_json::Value, list: &str) -> Vec<u32> {
    let mut seen = std::collections::HashSet::new();
    value
        .pointer(&format!("/{list}/items"))
        .and_then(|v| v.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| Some(item.get("id")?.as_u64()? as u32))
                .filter(|id| seen.insert(*id))
                .collect()
        })
        .unwrap_or_default()
}

fn steam_shelves(client: &reqwest::blocking::Client) -> [Shelf; 3] {
    let featured = client
        .get(FEATURED)
        .send()
        .ok()
        .and_then(|response| response.json::<serde_json::Value>().ok());

    let Some(featured) = featured else {
        return [
            shelf("steam", "Promos Steam", Some("steam"), None),
            shelf("top-sellers", "Meilleures ventes", None, None),
            shelf("new-releases", "Nouveautés", None, None),
        ];
    };

    let specials = featured_ids(&featured, "specials");
    let top = featured_ids(&featured, "top_sellers");
    let new = featured_ids(&featured, "new_releases");

    // One GetItems call for all three: it takes up to 50 appids, and
    // `describe` drops what is not a game -- hardware in the top sellers.
    let mut all: Vec<u32> = Vec::new();
    for id in specials.iter().chain(&top).chain(&new) {
        if !all.contains(id) {
            all.push(*id);
        }
    }
    let described = all
        .chunks(crate::steam_store::ITEMS_PER_CALL)
        .flat_map(|chunk| market::items(client, chunk))
        .collect::<Vec<_>>();
    let pick = |ids: &[u32]| -> Vec<MarketItem> {
        ids.iter()
            .filter_map(|id| described.iter().find(|item| item.appid == Some(*id)).cloned())
            .take(PER_SHELF)
            .collect()
    };

    [
        shelf("steam", "Promos Steam", Some("steam"), Some(pick(&specials))),
        shelf("top-sellers", "Meilleures ventes", None, Some(pick(&top))),
        shelf("new-releases", "Nouveautés", None, Some(pick(&new))),
    ]
}

fn from_itad(deal: itad::TrendingDeal, store: &'static str) -> MarketItem {
    MarketItem {
        id: format!("itad:{}", deal.id),
        appid: None,
        name: deal.title,
        cover_url: deal.boxart,
        header_url: None,
        short_description: None,
        developers: Vec::new(),
        publishers: Vec::new(),
        release_date: None,
        coming_soon: false,
        free: false,
        price: Some(deal.price),
        screenshots: Vec::new(),
        store_url: None,
        deal: Some(Deal {
            store,
            url: deal.url,
        }),
    }
}

fn promo_title(store: &'static str) -> &'static str {
    match store {
        "epic" => "Promos Epic Games",
        "ea" => "Promos EA",
        _ => "Promos Ubisoft",
    }
}

fn store_shelf(
    client: &reqwest::blocking::Client,
    key: Option<&str>,
    shops: &[(&'static str, u64)],
    store: &'static str,
) -> Shelf {
    let title = promo_title(store);
    match key {
        Some(key) => {
            let items = shops
                .iter()
                .find(|(ours, _)| *ours == store)
                .and_then(|(_, shop)| itad::trending(client, key, *shop, PER_SHELF))
                .map(|deals| deals.into_iter().map(|deal| from_itad(deal, store)).collect());
            shelf(store, title, Some(store), items)
        }
        None if store == "epic" => shelf(
            store,
            title,
            Some(store),
            epic_promotions::current(client).map(|list| {
                list.into_iter().take(PER_SHELF).collect()
            }),
        ),
        None => Shelf {
            id: store,
            title,
            store: Some(store),
            state: ShelfState::NeedsKey,
            items: Vec::new(),
        },
    }
}

fn build(key: Option<&str>) -> Vec<Shelf> {
    let Some(client) = crate::steam_store::client() else {
        return Vec::new();
    };
    let client = &client;

    std::thread::scope(|scope| {
        let steam = scope.spawn(|| steam_shelves(client));
        let stores = scope.spawn(|| {
            let shops = key.map(|_| itad::shop_ids(client)).unwrap_or_default();
            let shops = &shops;
            std::thread::scope(|inner| {
                let handles = ["epic", "ea", "ubisoft"]
                    .map(|store| inner.spawn(move || store_shelf(client, key, shops, store)));
                handles.map(|handle| handle.join().ok())
            })
        });

        let [specials, top, new] = steam.join().unwrap_or_else(|_| {
            [
                shelf("steam", "Promos Steam", Some("steam"), None),
                shelf("top-sellers", "Meilleures ventes", None, None),
                shelf("new-releases", "Nouveautés", None, None),
            ]
        });
        let others = stores.join().unwrap_or([None, None, None]);

        let mut shelves = vec![specials];
        shelves.extend(others.into_iter().flatten());
        shelves.push(top);
        shelves.push(new);
        shelves
    })
}

struct Cached {
    at: Instant,
    with_key: bool,
    shelves: Vec<Shelf>,
}

static CACHE: OnceLock<Mutex<Option<Cached>>> = OnceLock::new();

/// The front page, from memory when it is recent enough.
///
/// A shelf that failed is not worth remembering: the next visit tries again.
pub fn home(key: Option<&str>) -> Vec<Shelf> {
    let cache = CACHE.get_or_init(|| Mutex::new(None));
    if let Ok(guard) = cache.lock() {
        if let Some(cached) = guard.as_ref() {
            // Adding a key must show its shelves without waiting half an hour.
            if cached.at.elapsed() < FRESH_FOR && cached.with_key == key.is_some() {
                return cached.shelves.clone();
            }
        }
    }

    let shelves = build(key);
    let complete = !shelves.is_empty()
        && shelves
            .iter()
            .all(|shelf| shelf.state != ShelfState::Unavailable);
    if complete {
        if let Ok(mut guard) = cache.lock() {
            *guard = Some(Cached {
                at: Instant::now(),
                with_key: key.is_some(),
                shelves: shelves.clone(),
            });
        }
    }
    shelves
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn featured_lists_keep_order_and_drop_repeats() {
        let value: serde_json::Value = serde_json::from_str(
            r#"{"specials":{"items":[{"id":3},{"id":1},{"id":3},{"id":2}]},"top_sellers":{"items":[]}}"#,
        )
        .unwrap();
        assert_eq!(featured_ids(&value, "specials"), vec![3, 1, 2]);
        assert!(featured_ids(&value, "top_sellers").is_empty());
        assert!(featured_ids(&value, "coming_soon").is_empty());
    }

    #[test]
    fn a_shelf_says_why_it_is_empty() {
        assert_eq!(shelf("ea", "Promos EA", Some("ea"), None).state, ShelfState::Unavailable);
        assert_eq!(shelf("ea", "Promos EA", Some("ea"), Some(Vec::new())).state, ShelfState::Empty);
    }
}

/// Diagnostic against the live stores, not a unit test:
/// `cargo test -- --ignored --nocapture store_home_live`
#[cfg(test)]
#[test]
#[ignore]
fn store_home_live() {
    for key in [crate::credentials::itad_key(), None] {
        println!("\n--- {} ---", if key.is_some() { "with ITAD key" } else { "without key" });
        for shelf in build(key.as_deref()) {
            let names: Vec<String> = shelf
                .items
                .iter()
                .take(5)
                .map(|item| {
                    format!(
                        "{} ({})",
                        item.name,
                        item.price.as_ref().map(|p| p.current.as_str()).unwrap_or("-")
                    )
                })
                .collect();
            println!("{:<18} {:?} {:>2} | {}", shelf.title, shelf.state, shelf.items.len(), names.join(", "));
        }
    }
}
