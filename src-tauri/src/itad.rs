//! IsThereAnyDeal : le meme jeu, chez tout le monde, en une requete.
//!
//! Les trois sources ecrites a la main — le GraphQL d'Epic, la page d'Instant
//! Gaming, le HTML d'Ubisoft — repondent chacune pour une boutique, et deux
//! d'entre elles lisent une mise en page qui peut changer du jour au
//! lendemain. ITAD repond pour une cinquantaine de boutiques a la fois, en
//! JSON, dans la monnaie du pays.
//!
//! Surtout, il n'y a plus de titre a faire correspondre : nos fiches viennent
//! de Steam, donc portent un appid, et ITAD sait le resoudre. Le rapprochement
//! par nom exact — celui qui abandonne des qu'une boutique ecrit
//! `Battlefield™ 6` autrement — ne sert plus que de repli.
//!
//! La cle vit hors du depot (voir `credentials`). Sans elle, ce module ne fait
//! rien et les sources ecrites a la main restent seules.

use crate::market::Price;
use crate::steam_store::percent_encode;
use serde::Serialize;

const LOOKUP: &str = "https://api.isthereanydeal.com/games/lookup/v1";
const PRICES: &str = "https://api.isthereanydeal.com/games/prices/v3";
const SHOPS: &str = "https://api.isthereanydeal.com/service/shops/v1";
const DEALS: &str = "https://api.isthereanydeal.com/deals/v2";

/// Prix retenus par jeu. Au-dela, on liste des boutiques que personne ne lit.
const CAPACITY: usize = 12;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShopDeal {
    /// Le nom que la boutique porte chez ITAD : « GOG », « Fanatical »…
    pub shop: String,
    pub price: Price,
    pub url: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Deals {
    pub shops: Vec<ShopDeal>,
    /// Le plus bas jamais vu, toutes boutiques confondues.
    pub history_low: Option<String>,
}

/// Un montant, ecrit comme le pays l'ecrit.
///
/// ITAD rend un nombre et un code de monnaie ; l'euro se met derriere, avec
/// une virgule, et le reste garde son code plutot que d'inventer un symbole.
pub(crate) fn format(amount: f64, currency: &str) -> String {
    // Un jeu gratuit a bien un prix chez ITAD, et il vaut zero. « 0,00 € »
    // se lit comme un bug ; le mot se lit comme une information.
    if amount == 0.0 {
        return "Gratuit".to_string();
    }
    match currency {
        "EUR" => format!("{amount:.2} €").replace('.', ","),
        "USD" => format!("{amount:.2} $"),
        "GBP" => format!("£{amount:.2}"),
        other => format!("{amount:.2} {other}"),
    }
}

fn money(node: &serde_json::Value) -> Option<String> {
    Some(format(
        node.get("amount")?.as_f64()?,
        node.get("currency").and_then(|v| v.as_str()).unwrap_or(""),
    ))
}

/// L'identifiant ITAD du jeu.
///
/// Par l'appid Steam quand la fiche en a un — c'est exact et sans ambiguite —
/// et par le titre sinon, pour les jeux que Steam ne vend pas.
fn lookup(
    client: &reqwest::blocking::Client,
    key: &str,
    appid: Option<u32>,
    title: &str,
) -> Option<String> {
    let query = match appid {
        Some(appid) => format!("appid={appid}"),
        None => format!("title={}", percent_encode(title)),
    };
    let url = format!("{LOOKUP}?key={}&{query}", percent_encode(key));
    let value = client
        .get(&url)
        .send()
        .ok()?
        .json::<serde_json::Value>()
        .ok()?;

    if value.get("found").and_then(|v| v.as_bool()) != Some(true) {
        return None;
    }
    Some(value.pointer("/game/id")?.as_str()?.to_string())
}

/// Les prix du jour pour ce jeu, la meilleure offre de chaque boutique.
pub fn deals(
    client: &reqwest::blocking::Client,
    key: &str,
    appid: Option<u32>,
    title: &str,
) -> Option<Deals> {
    let id = lookup(client, key, appid, title)?;
    let url = format!(
        "{PRICES}?key={}&country=FR&capacity={CAPACITY}",
        percent_encode(key)
    );

    let value = client
        .post(&url)
        .json(&vec![id])
        .send()
        .ok()?
        .json::<serde_json::Value>()
        .ok()?;

    // La reponse est une liste, un element par jeu demande.
    let game = value.as_array()?.first()?;

    let shops = game
        .get("deals")
        .and_then(|v| v.as_array())
        .map(|list| {
            list.iter()
                .filter_map(|deal| {
                    let shop = deal.pointer("/shop/name")?.as_str()?.to_string();
                    let current = money(deal.get("price")?)?;
                    let cut = deal.get("cut").and_then(|v| v.as_i64()).unwrap_or(0);
                    Some(ShopDeal {
                        shop,
                        price: Price {
                            current,
                            // Le prix barre n'a de sens que pendant une
                            // remise : hors promotion, les deux sont egaux.
                            original: (cut > 0)
                                .then(|| deal.get("regular").and_then(money))
                                .flatten(),
                            discount: cut,
                        },
                        // Le lien est verifie ici, pas au clic : un bouton
                        // affiche ne doit pas echouer sous le doigt.
                        url: deal
                            .get("url")
                            .and_then(|v| v.as_str())
                            .filter(|url| crate::launcher::is_store_url(url))
                            .map(str::to_string),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Some(Deals {
        shops,
        history_low: game.pointer("/historyLow/all").and_then(money),
    })
}

/// A discounted game, as a store's promotions list gives it.
#[derive(Debug, Clone)]
pub struct TrendingDeal {
    pub id: String,
    pub title: String,
    pub boxart: Option<String>,
    pub price: Price,
    pub url: Option<String>,
}

/// ITAD's numeric id for each of our stores, looked up by name rather than
/// written down: the names are what `offers::our_store` already knows.
pub fn shop_ids(client: &reqwest::blocking::Client) -> Vec<(&'static str, u64)> {
    let Some(list) = client
        .get(format!("{SHOPS}?country=FR"))
        .send()
        .ok()
        .and_then(|response| response.json::<serde_json::Value>().ok())
    else {
        return Vec::new();
    };
    list.as_array()
        .map(|shops| {
            shops
                .iter()
                .filter_map(|shop| {
                    let store = crate::offers::our_store(shop.get("title")?.as_str()?)?;
                    Some((store, shop.get("id")?.as_u64()?))
                })
                .collect()
        })
        .unwrap_or_default()
}

/// What sells at a discount in one shop right now, most talked-about first.
///
/// `-trending` rather than the deepest cut: sorted by cut, the list is
/// artbooks and titles nobody has heard of at 90 %.
pub fn trending(
    client: &reqwest::blocking::Client,
    key: &str,
    shop: u64,
    limit: usize,
) -> Option<Vec<TrendingDeal>> {
    let url = format!(
        "{DEALS}?key={}&country=FR&shops={shop}&limit=40&sort=-trending",
        percent_encode(key)
    );
    let value = client
        .get(&url)
        .send()
        .ok()?
        .error_for_status()
        .ok()?
        .json::<serde_json::Value>()
        .ok()?;
    Some(parse_trending(&value, limit))
}

fn parse_trending(value: &serde_json::Value, limit: usize) -> Vec<TrendingDeal> {
    let Some(list) = value.get("list").and_then(|v| v.as_array()) else {
        return Vec::new();
    };
    list.iter()
        .filter(|entry| entry.get("type").and_then(|v| v.as_str()) == Some("game"))
        .filter(|entry| entry.get("mature").and_then(|v| v.as_bool()) != Some(true))
        .filter_map(|entry| {
            let deal = entry.get("deal")?;
            let cut = deal.get("cut").and_then(|v| v.as_i64()).unwrap_or(0);
            Some(TrendingDeal {
                id: entry.get("id")?.as_str()?.to_string(),
                title: entry.get("title")?.as_str()?.trim().to_string(),
                boxart: entry
                    .pointer("/assets/boxart")
                    .and_then(|v| v.as_str())
                    .map(str::to_string),
                price: Price {
                    current: money(deal.get("price")?)?,
                    original: (cut > 0).then(|| deal.get("regular").and_then(money)).flatten(),
                    discount: cut,
                },
                url: deal
                    .get("url")
                    .and_then(|v| v.as_str())
                    .filter(|url| crate::launcher::is_store_url(url))
                    .map(str::to_string),
            })
        })
        .take(limit)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{format, parse_trending};

    #[test]
    fn trending_keeps_games_only() {
        let value: serde_json::Value = serde_json::from_str(
            r#"{"list":[
              {"id":"a","title":"Artbook","type":"dlc","mature":false,
               "deal":{"price":{"amount":1,"currency":"EUR"},"regular":{"amount":2,"currency":"EUR"},"cut":50}},
              {"id":"b","title":"SILENT HILL 2","type":"game","mature":false,
               "assets":{"boxart":"https://assets.isthereanydeal.com/b/boxart.jpg"},
               "deal":{"price":{"amount":27.99,"currency":"EUR"},"regular":{"amount":69.99,"currency":"EUR"},"cut":60,
                       "url":"https://itad.link/b/"}},
              {"id":"c","title":"Adult","type":"game","mature":true,
               "deal":{"price":{"amount":1,"currency":"EUR"},"regular":{"amount":2,"currency":"EUR"},"cut":50}},
              {"id":"d","title":"Free","type":"game","mature":false,
               "deal":{"price":{"amount":0,"currency":"EUR"},"regular":{"amount":24.5,"currency":"EUR"},"cut":100,
                       "url":"https://evil.example/"}}
            ]}"#,
        )
        .unwrap();

        let deals = parse_trending(&value, 10);
        assert_eq!(deals.len(), 2);
        assert_eq!(deals[0].title, "SILENT HILL 2");
        assert_eq!(deals[0].price.current, "27,99 €");
        assert_eq!(deals[0].price.original.as_deref(), Some("69,99 €"));
        assert_eq!(deals[0].url.as_deref(), Some("https://itad.link/b/"));
        assert_eq!(deals[1].price.current, "Gratuit");
        // A link outside the allow-list is dropped, not followed.
        assert_eq!(deals[1].url, None);
        assert_eq!(parse_trending(&value, 1).len(), 1);
    }

    #[test]
    fn amounts_are_written_the_way_the_country_writes_them() {
        assert_eq!(format(14.79, "EUR"), "14,79 €");
        assert_eq!(format(7.0, "EUR"), "7,00 €");
        assert_eq!(format(19.99, "USD"), "19.99 $");
        // Une monnaie qu'on ne sait pas ecrire garde son code.
        assert_eq!(format(120.0, "PLN"), "120.00 PLN");
        assert_eq!(format(0.0, "EUR"), "Gratuit");
    }
}
