//! La boutique : trouver un jeu qu'on n'a pas encore.
//!
//! La bibliotheque repond a « qu'est-ce que je possede » ; ceci repond a
//! « qu'est-ce qui existe, et ou l'acheter ». Deux appels publics de Steam
//! suffisent, sans cle ni compte :
//!
//! - `storesearch` classe les titres par pertinence et rend leurs appids. La
//!   recherche de la communaute (`SearchApps`, utilisee ailleurs pour
//!   retrouver une jaquette) ne rend que les correspondances quasi exactes :
//!   bon pour resoudre un nom connu, inutilisable pour chercher.
//! - `GetItems` decrit ces appids : nom, jaquette, resume, studio, date,
//!   prix et remise en cours, le tout en francais et en euros.
//!
//! Steam est la seule des quatre plateformes a publier tout cela. Pour les
//! autres boutiques, l'application n'invente pas de prix : elle emmene chez
//! elles avec le titre deja saisi, ce que fait `stores.ts` cote interface.

use crate::steam_store::{client, percent_encode, ASSET_HOST};
use serde::Serialize;

const SEARCH: &str = "https://store.steampowered.com/api/storesearch/";
const GET_ITEMS: &str = "https://api.steampowered.com/IStoreBrowseService/GetItems/v1/";

/// Resultats gardes par recherche. Au-dela, on fait defiler une liste que
/// personne ne lit : les dix premiers de Steam sont deja tries par pertinence.
const MAX_RESULTS: usize = 12;

/// `store_items[].type` d'un jeu, par opposition a un DLC ou une bande-son.
const TYPE_GAME: i64 = 0;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Price {
    /// Prix a payer, deja formate par Steam dans la monnaie du pays.
    pub current: String,
    /// Prix barre, present seulement pendant une remise.
    pub original: Option<String>,
    /// Pourcentage de remise, 0 hors promotion.
    pub discount: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketItem {
    pub appid: u32,
    pub name: String,
    /// Jaquette portrait, la meme forme que les cartes de la bibliotheque.
    pub cover_url: Option<String>,
    /// Banniere paysage, pour la fiche.
    pub header_url: Option<String>,
    pub short_description: Option<String>,
    pub developers: Vec<String>,
    pub publishers: Vec<String>,
    /// Date de sortie Steam, en secondes epoch.
    pub release_date: Option<i64>,
    pub coming_soon: bool,
    pub free: bool,
    pub price: Option<Price>,
    pub screenshots: Vec<String>,
    pub store_url: String,
}

/// Les appids que Steam juge pertinents pour ce terme, dans son ordre.
fn search_ids(client: &reqwest::blocking::Client, term: &str) -> Vec<u32> {
    let url = format!(
        "{SEARCH}?term={}&l=french&cc=FR",
        percent_encode(term.trim())
    );
    let Ok(response) = client.get(&url).send() else {
        return Vec::new();
    };
    let Ok(value) = response.json::<serde_json::Value>() else {
        return Vec::new();
    };

    value
        .get("items")
        .and_then(|items| items.as_array())
        .map(|items| {
            items
                .iter()
                .filter(|item| item.get("type").and_then(|v| v.as_str()) == Some("app"))
                .filter_map(|item| Some(item.get("id")?.as_u64()? as u32))
                .take(MAX_RESULTS)
                .collect()
        })
        .unwrap_or_default()
}

/// Une URL d'asset a partir du format que l'item porte lui-meme.
fn asset(assets: &serde_json::Value, key: &str) -> Option<String> {
    let format = assets.get("asset_url_format")?.as_str()?;
    let name = assets.get(key)?.as_str()?;
    Some(format!("{ASSET_HOST}{}", format.replace("${FILENAME}", name)))
}

fn names(node: Option<&serde_json::Value>) -> Vec<String> {
    node.and_then(|value| value.as_array())
        .map(|list| {
            list.iter()
                .filter_map(|entry| Some(entry.get("name")?.as_str()?.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

fn price(item: &serde_json::Value) -> Option<Price> {
    let option = item.get("best_purchase_option")?;
    let current = option.get("formatted_final_price")?.as_str()?.to_string();
    let discount = option
        .get("discount_pct")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    Some(Price {
        current,
        // Le prix barre n'a de sens que pendant une remise : hors promotion
        // Steam rend les deux, identiques.
        original: if discount > 0 {
            option
                .get("formatted_original_price")
                .and_then(|v| v.as_str())
                .map(str::to_string)
        } else {
            None
        },
        discount,
    })
}

fn describe(item: &serde_json::Value) -> Option<MarketItem> {
    if item.get("visible").and_then(|v| v.as_bool()) != Some(true) {
        return None;
    }
    if item.get("type").and_then(|v| v.as_i64()) != Some(TYPE_GAME) {
        return None;
    }

    let appid = item.get("appid")?.as_u64()? as u32;
    let name = item.get("name")?.as_str()?.trim().to_string();
    if name.is_empty() {
        return None;
    }

    let null = serde_json::Value::Null;
    let assets = item.get("assets").unwrap_or(&null);
    let basic = item.get("basic_info").unwrap_or(&null);
    let release = item.get("release").unwrap_or(&null);

    Some(MarketItem {
        appid,
        name,
        // Le 2x est en 600x900 contre 300x450 : il vaut le detour sur un
        // ecran dense, mais tous les jeux ne le publient pas.
        cover_url: asset(assets, "library_capsule_2x")
            .or_else(|| asset(assets, "library_capsule"))
            .or_else(|| asset(assets, "header")),
        header_url: asset(assets, "header").or_else(|| asset(assets, "main_capsule")),
        short_description: basic
            .get("short_description")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        developers: names(basic.get("developers")),
        publishers: names(basic.get("publishers")),
        release_date: release.get("steam_release_date").and_then(|v| v.as_i64()),
        coming_soon: release.get("is_coming_soon").and_then(|v| v.as_bool()) == Some(true),
        free: item.get("is_free").and_then(|v| v.as_bool()) == Some(true),
        price: price(item),
        screenshots: item
            .pointer("/screenshots/all_ages_screenshots")
            .and_then(|v| v.as_array())
            .map(|list| {
                list.iter()
                    .filter_map(|shot| {
                        Some(format!("{ASSET_HOST}{}", shot.get("filename")?.as_str()?))
                    })
                    .take(4)
                    .collect()
            })
            .unwrap_or_default(),
        store_url: format!("https://store.steampowered.com/app/{appid}/"),
    })
}

/// Decrit une liste d'appids, dans l'ordre demande.
fn items(client: &reqwest::blocking::Client, appids: &[u32]) -> Vec<MarketItem> {
    if appids.is_empty() {
        return Vec::new();
    }

    let ids = appids
        .iter()
        .map(|id| format!(r#"{{"appid":{id}}}"#))
        .collect::<Vec<_>>()
        .join(",");
    let input_json = format!(
        r#"{{"ids":[{ids}],"context":{{"language":"french","country_code":"FR"}},"data_request":{{"include_assets":true,"include_release":true,"include_basic_info":true,"include_screenshots":true,"include_all_purchase_options":true}}}}"#
    );
    let url = format!("{GET_ITEMS}?input_json={}", percent_encode(&input_json));

    let Ok(response) = client.get(&url).send() else {
        return Vec::new();
    };
    let Ok(value) = response.json::<serde_json::Value>() else {
        return Vec::new();
    };
    let Some(list) = value
        .pointer("/response/store_items")
        .and_then(|v| v.as_array())
    else {
        return Vec::new();
    };

    let described: Vec<MarketItem> = list.iter().filter_map(describe).collect();

    // GetItems ne garantit pas l'ordre, et celui de la recherche est le seul
    // qui veut dire quelque chose : c'est le classement par pertinence.
    appids
        .iter()
        .filter_map(|id| described.iter().find(|item| item.appid == *id).cloned())
        .collect()
}

/// Cherche un jeu a acheter. Une requete pour le classement, une pour les
/// fiches.
pub fn search(term: &str) -> Result<Vec<MarketItem>, String> {
    if term.trim().is_empty() {
        return Ok(Vec::new());
    }
    let client = client().ok_or_else(|| "client http indisponible".to_string())?;
    Ok(items(&client, &search_ids(&client, term)))
}
