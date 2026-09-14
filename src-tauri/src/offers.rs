//! Le meme jeu, chez les autres.
//!
//! Steam donne son prix avec sa fiche ; les trois autres sources demandent
//! chacune leur requete, et n'ont ni la meme forme ni la meme franchise :
//!
//! - **Epic** publie un GraphQL ouvert, en GET, avec les prix deja formates
//!   dans la monnaie du pays. C'est la source propre du lot.
//! - **Instant Gaming** rend une page Vue, mais elle porte ses resultats en
//!   clair : `window.searchResults` est le JSON d'Algolia, prix public et
//!   remise compris.
//! - **Ubisoft** rend sa recherche cote serveur : le prix est dans le HTML,
//!   dans la carte qui porte le titre.
//!
//! **EA n'a pas de source.** Sa boutique est une application qui parle a une
//! API fermee ; rien de public ne rend un prix. Le bouton EA reste donc un
//! lien de recherche, et la fiche le dit plutot que de laisser croire a un
//! echec de chargement.
//!
//! Trois requetes, donc, et lancees ensemble : bout a bout elles feraient
//! attendre plusieurs secondes pour une information secondaire.
//!
//! Deux d'entre elles lisent du HTML, ce qui est fragile par nature. Chaque
//! source echoue donc pour son propre compte : une mise en page changee chez
//! Ubisoft laisse Epic et Instant Gaming intacts, et la fiche montre
//! simplement un lien de recherche la ou le prix manque.

use crate::itad::{self, ShopDeal};
use crate::market::Price;
use crate::steam_store::percent_encode;
use serde::Serialize;

const EPIC_GRAPHQL: &str = "https://store.epicgames.com/graphql";
const IG_SEARCH: &str = "https://www.instant-gaming.com/fr/rechercher/?q=";
const UBI_SEARCH: &str = "https://store.ubisoft.com/fr/search?q=";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreOffer {
    /// Identifiant de boutique, tel que l'interface les nomme.
    pub store: String,
    pub price: Option<Price>,
    /// Page du jeu, quand la boutique l'a nommee. Sinon l'interface garde son
    /// lien de recherche.
    pub url: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Offers {
    /// Les cinq boutiques que la fiche nomme deja.
    pub stores: Vec<StoreOffer>,
    /// Les autres, celles qu'on ne connaissait pas : GOG, Fanatical, Humble…
    pub elsewhere: Vec<ShopDeal>,
    pub history_low: Option<String>,
    /// Vrai quand la cle ITAD a repondu. L'interface s'en sert pour dire
    /// pourquoi une ligne reste vide plutot que de laisser croire a une panne.
    pub aggregated: bool,
}

/// Le nom d'une boutique chez ITAD, ramene a nos cinq quand c'en est une.
pub(crate) fn our_store(shop: &str) -> Option<&'static str> {
    match key(shop).as_str() {
        "steam" => Some("steam"),
        "epicgamestore" | "epicgamesstore" | "epicgames" | "epic" => Some("epic"),
        "ubisoftstore" | "ubisoftconnect" | "uplay" | "ubisoft" => Some("ubisoft"),
        "eaapp" | "eastore" | "origin" | "ea" => Some("ea"),
        "instantgaming" => Some("instant-gaming"),
        _ => None,
    }
}

/// Le titre, reduit a ce qui permet de le reconnaitre ailleurs.
///
/// Les boutiques ne s'accordent ni sur les symboles (`Battlefield™ 6`), ni sur
/// la ponctuation (`Assassin's` contre `Assassin’s`), ni sur la casse. Ne
/// restent que les lettres et les chiffres.
fn key(title: &str) -> String {
    title
        .chars()
        .filter_map(|c| {
            let c = match c {
                'à' | 'â' | 'ä' | 'á' | 'ã' | 'å' => 'a',
                'ç' => 'c',
                'é' | 'è' | 'ê' | 'ë' => 'e',
                'î' | 'ï' | 'í' | 'ì' => 'i',
                'ô' | 'ö' | 'ó' | 'ò' | 'õ' => 'o',
                'ù' | 'û' | 'ü' | 'ú' => 'u',
                'ÿ' | 'ý' => 'y',
                'ñ' => 'n',
                other => other,
            };
            c.is_alphanumeric().then(|| c.to_ascii_lowercase())
        })
        .collect()
}

/// Un prix affiche, ramene a un nombre pour pouvoir etre compare.
///
/// Sert a departager les editions : a titre egal, la moins chere est
/// l'edition standard, celle dont on parle quand on dit « le prix du jeu ».
fn amount(formatted: &str) -> Option<f64> {
    let digits: String = formatted
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == ',' || *c == '.')
        .collect();
    digits.replace(',', ".").parse().ok()
}

/// Les entites HTML que les pages de boutique emploient.
fn decode_entities(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut rest = value;

    while let Some(start) = rest.find('&') {
        out.push_str(&rest[..start]);
        let tail = &rest[start..];
        let Some(end) = tail.find(';').filter(|end| *end <= 8) else {
            out.push('&');
            rest = &tail[1..];
            continue;
        };

        let entity = &tail[1..end];
        let decoded = match entity {
            "amp" => Some('&'),
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" | "rsquo" | "lsquo" => Some('\''),
            "nbsp" => Some(' '),
            "eacute" => Some('é'),
            "Eacute" => Some('É'),
            "egrave" => Some('è'),
            "agrave" => Some('à'),
            "ccedil" => Some('ç'),
            _ => entity
                .strip_prefix('#')
                .and_then(|number| number.parse::<u32>().ok())
                .and_then(char::from_u32),
        };

        match decoded {
            Some(c) => {
                out.push(c);
                rest = &tail[end + 1..];
            }
            None => {
                out.push('&');
                rest = &tail[1..];
            }
        }
    }

    out.push_str(rest);
    out
}

/// Garde la meilleure des offres qui portent exactement ce titre.
///
/// L'egalite est exigee : un prefixe ferait passer *Hollow Knight: Silksong*
/// pour *Hollow Knight*, et afficher le prix d'un autre jeu est pire que de
/// n'en afficher aucun.
fn best(wanted: &str, found: Vec<(String, Price, Option<String>)>) -> Option<(Price, Option<String>)> {
    let wanted = key(wanted);
    found
        .into_iter()
        .filter(|(title, _, _)| key(title) == wanted)
        .min_by(|a, b| {
            let left = amount(&a.1.current).unwrap_or(f64::MAX);
            let right = amount(&b.1.current).unwrap_or(f64::MAX);
            left.total_cmp(&right)
        })
        .map(|(_, price, url)| (price, url))
}

fn epic(client: &reqwest::blocking::Client, title: &str) -> Option<(Price, Option<String>)> {
    let query = "query q($country:String!,$keywords:String,$locale:String,$count:Int){Catalog{searchStore(country:$country,keywords:$keywords,locale:$locale,count:$count){elements{title productSlug offerType price(country:$country){totalPrice{discountPrice originalPrice fmtPrice(locale:$locale){originalPrice discountPrice}}}}}}}";
    // Le titre part dans un litteral JSON ecrit a la main : les deux
    // caracteres qui pourraient en sortir n'y entrent pas.
    let variables = format!(
        r#"{{"country":"FR","keywords":"{}","locale":"fr-FR","count":20}}"#,
        title.replace(['\\', '"'], "")
    );
    let url = format!(
        "{EPIC_GRAPHQL}?query={}&variables={}",
        percent_encode(query),
        percent_encode(&variables)
    );

    let value = client.get(&url).send().ok()?.json::<serde_json::Value>().ok()?;
    let elements = value
        .pointer("/data/Catalog/searchStore/elements")?
        .as_array()?;

    let found = elements
        .iter()
        // Un DLC porte parfois le titre de son jeu.
        .filter(|item| item.get("offerType").and_then(|v| v.as_str()) != Some("ADD_ON"))
        .filter_map(|item| {
            let name = item.get("title")?.as_str()?.to_string();
            let total = item.pointer("/price/totalPrice")?;
            let now = total.get("discountPrice")?.as_i64()?;
            let before = total.get("originalPrice")?.as_i64().unwrap_or(now);

            // Les prix formates sont ceux de la boutique, monnaie comprise ;
            // les entiers en centimes ne servent qu'a calculer la remise.
            let current = if now == 0 {
                "Gratuit".to_string()
            } else {
                total
                    .pointer("/fmtPrice/discountPrice")?
                    .as_str()?
                    .to_string()
            };
            let discount = if before > now && before > 0 {
                (before - now) * 100 / before
            } else {
                0
            };

            let page = item
                .get("productSlug")
                .and_then(|v| v.as_str())
                .map(|slug| {
                    format!(
                        "https://store.epicgames.com/fr/p/{}",
                        slug.trim_end_matches("/home")
                    )
                });

            Some((
                name,
                Price {
                    current,
                    original: (discount > 0)
                        .then(|| {
                            total
                                .pointer("/fmtPrice/originalPrice")
                                .and_then(|v| v.as_str())
                                .map(str::to_string)
                        })
                        .flatten(),
                    discount,
                },
                page,
            ))
        })
        .collect();

    best(title, found)
}

fn instant_gaming(
    client: &reqwest::blocking::Client,
    title: &str,
) -> Option<(Price, Option<String>)> {
    let url = format!("{IG_SEARCH}{}", percent_encode(title));
    let page = client.get(&url).send().ok()?.text().ok()?;

    // La page est rendue par Vue, mais elle porte le JSON d'Algolia en clair
    // pour eviter un aller-retour au chargement. On le lit la plutot que de
    // parler a Algolia avec une cle publiee dans une page qui peut changer.
    let marker = "window.searchResults = ";
    let start = page.find(marker)? + marker.len();
    let json = &page[start..];
    let mut depth = 0usize;
    let end = json.char_indices().find_map(|(index, c)| {
        match c {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(index + 1);
                }
            }
            _ => {}
        }
        None
    })?;

    let value: serde_json::Value = serde_json::from_str(&json[..end]).ok()?;
    let hits = value.get("hits")?.as_array()?;

    let found = hits
        .iter()
        .filter(|hit| hit.get("is_dlc").and_then(|v| v.as_i64()) != Some(1))
        // Le catalogue est aussi celui des consoles, et il garde les fiches
        // en rupture — dont le prix tombe a zero.
        .filter(|hit| hit.get("has_stock").and_then(|v| v.as_i64()) == Some(1))
        .filter(|hit| {
            hit.get("platform_names")
                .and_then(|v| v.as_array())
                .is_some_and(|names| {
                    names.iter().any(|name| name.as_str() == Some("PC"))
                })
        })
        .filter_map(|hit| {
            let name = hit.get("name")?.as_str()?.to_string();
            let now = hit.get("price")?.as_str()?;
            if amount(now).unwrap_or(0.0) <= 0.0 {
                return None;
            }
            let before = hit.get("retail").and_then(|v| v.as_str());
            let discount = hit.get("discount").and_then(|v| v.as_i64()).unwrap_or(0);

            let page = match (
                hit.get("prod_id").and_then(|v| v.as_i64()),
                hit.get("seo_name").and_then(|v| v.as_str()),
            ) {
                (Some(id), Some(slug)) => {
                    Some(format!("https://www.instant-gaming.com/fr/{id}-acheter-{slug}/"))
                }
                _ => None,
            };

            Some((
                name,
                Price {
                    // `price_formatted` est la mise en forme du site, entite
                    // insecable comprise ; `price` n'est qu'un nombre.
                    current: hit
                        .get("price_formatted")
                        .and_then(|v| v.as_str())
                        .map(decode_entities)
                        .unwrap_or_else(|| format!("{now} €")),
                    original: (discount > 0)
                        .then(|| before.map(|value| format!("{value} €")))
                        .flatten(),
                    discount,
                },
                page,
            ))
        })
        .collect();

    best(title, found)
}

/// La carte vend-elle le jeu, ou quelque chose qui porte son nom ?
///
/// Le sous-titre porte l'edition : « Edition Standard », « Edition Deluxe »,
/// « Pack Scorpion du desert ». Seule la premiere forme — ou son absence —
/// designe le jeu au prix dont on parle.
fn is_base_edition(card: &str) -> bool {
    let Some(at) = card.find("class=\"card-subtitle\"") else {
        return true;
    };
    let tail = &card[at..];
    let (Some(open), Some(close)) = (tail.find('>'), tail.find("</div>")) else {
        return true;
    };
    if close <= open {
        return true;
    }
    let subtitle = key(&decode_entities(&tail[open + 1..close]));
    subtitle.is_empty() || subtitle.contains("standard")
}

fn ubisoft(client: &reqwest::blocking::Client, title: &str) -> Option<(Price, Option<String>)> {
    let url = format!("{UBI_SEARCH}{}", percent_encode(title));
    let page = client.get(&url).send().ok()?.text().ok()?;

    // Pas de parseur HTML pour deux balises : la recherche Ubisoft rend ses
    // cartes cote serveur, chacune avec un titre puis un prix. On avance de
    // titre en titre, et on prend le premier prix qui suit.
    let mut found = Vec::new();
    let mut rest = page.as_str();

    while let Some(start) = rest.find("class=\"prod-title\"") {
        let after = &rest[start..];
        let Some(open) = after.find('>') else { break };
        let Some(close) = after[open..].find("</div>") else {
            break;
        };
        let name = decode_entities(after[open + 1..open + close].trim());

        // La carte suivante commence a son propre titre : au-dela, le prix
        // appartiendrait a un autre jeu.
        let card_end = after[1..]
            .find("class=\"prod-title\"")
            .map_or(after.len(), |next| next + 1);
        let card = &after[..card_end];

        // Le titre de la carte est celui du jeu, quoi qu'elle vende : le
        // « Pack Scorpion du desert » s'appelle *Assassin's Creed Mirage*
        // comme le jeu, et coute 14,99 €. Sans le sous-titre, ce prix
        // passerait pour celui du jeu. Ne restent donc que les cartes qui
        // annoncent l'edition standard, ou qui n'annoncent rien.
        if !is_base_edition(card) {
            rest = &after[card_end..];
            continue;
        }

        if let Some(price_at) = card.find("class=\"price-sales") {
            let tail = &card[price_at..];
            if let (Some(open), Some(close)) = (tail.find('>'), tail.find("</span>")) {
                if close > open {
                    let raw = decode_entities(tail[open + 1..close].trim());
                    if amount(&raw).is_some() {
                        found.push((
                            name,
                            Price {
                                current: raw,
                                original: None,
                                discount: 0,
                            },
                            None,
                        ));
                    }
                }
            }
        }

        rest = &after[card_end..];
    }

    best(title, found)
}

/// Ce que le meme jeu coute ailleurs. Toutes les requetes partent ensemble.
///
/// ITAD repond pour une cinquantaine de boutiques et n'a pas de titre a
/// deviner : quand il repond, sa valeur l'emporte. Les trois sources ecrites a
/// la main restent le repli — pour une cle absente, une boutique qu'il ne
/// suit pas, ou un jeu qu'il ne connait pas encore.
pub fn lookup(
    client: &reqwest::blocking::Client,
    title: &str,
    appid: Option<u32>,
    itad_key: Option<&str>,
) -> Offers {
    let (epic_offer, ig_offer, ubi_offer, aggregate) = std::thread::scope(|scope| {
        let a = scope.spawn(|| epic(client, title));
        let b = scope.spawn(|| instant_gaming(client, title));
        let c = scope.spawn(|| ubisoft(client, title));
        let d = scope.spawn(|| itad_key.and_then(|key| itad::deals(client, key, appid, title)));
        (
            a.join().unwrap_or(None),
            b.join().unwrap_or(None),
            c.join().unwrap_or(None),
            d.join().unwrap_or(None),
        )
    });

    let scraped = [
        ("epic", epic_offer),
        ("instant-gaming", ig_offer),
        ("ubisoft", ubi_offer),
    ];

    let mut stores: Vec<StoreOffer> = Vec::new();
    let mut elsewhere: Vec<ShopDeal> = Vec::new();

    for deal in aggregate.as_ref().map(|d| d.shops.clone()).unwrap_or_default() {
        match our_store(&deal.shop) {
            // Steam donne son prix avec la fiche ; le repeter ici ne ferait
            // que risquer deux montants qui se contredisent.
            Some("steam") => {}
            Some(store) => stores.push(StoreOffer {
                store: store.to_string(),
                price: Some(deal.price),
                url: deal.url,
            }),
            None => elsewhere.push(deal),
        }
    }

    for (store, offer) in scraped {
        if stores.iter().any(|known| known.store == store) {
            continue;
        }
        if let Some((price, url)) = offer {
            stores.push(StoreOffer {
                store: store.to_string(),
                price: Some(price),
                url,
            });
        }
    }

    // La moins chere en tete : c'est la seule raison de lire cette liste.
    elsewhere.sort_by(|a, b| {
        let left = amount(&a.price.current).unwrap_or(f64::MAX);
        let right = amount(&b.price.current).unwrap_or(f64::MAX);
        left.total_cmp(&right)
    });

    Offers {
        stores,
        elsewhere,
        history_low: aggregate.as_ref().and_then(|d| d.history_low.clone()),
        aggregated: aggregate.is_some(),
    }
}

#[cfg(test)]
mod tests {
    use super::{amount, decode_entities, is_base_edition, key};

    #[test]
    fn titles_survive_the_marks_stores_disagree_on() {
        assert_eq!(key("Battlefield™ 6"), key("Battlefield 6"));
        assert_eq!(key("Assassin's Creed"), key("Assassin’s Creed"));
        assert_eq!(key("Hollow Knight"), key("hollow  knight"));
        assert_eq!(key("Pokémon"), key("Pokemon"));
        // Une suite n'est pas son ainee.
        assert_ne!(key("Hollow Knight"), key("Hollow Knight: Silksong"));
    }

    #[test]
    fn prices_are_compared_as_numbers() {
        assert_eq!(amount("29,99 €"), Some(29.99));
        assert_eq!(amount("7.79"), Some(7.79));
        assert_eq!(amount("Gratuit"), None);
    }

    #[test]
    fn a_pack_named_after_its_game_is_not_the_game() {
        // Le sous-titre est la seule chose qui les distingue : les deux
        // cartes s'appellent « Assassin's Creed Mirage ».
        assert!(is_base_edition(
            r#"<div class="card-subtitle"> &Eacute;dition Standard </div>"#
        ));
        assert!(!is_base_edition(
            r#"<div class="card-subtitle"> Pack Scorpion du d&eacute;sert </div>"#
        ));
        assert!(!is_base_edition(
            r#"<div class="card-subtitle"> &Eacute;dition Deluxe </div>"#
        ));
        // Une carte sans sous-titre ne vend rien d'autre que son jeu.
        assert!(is_base_edition(r#"<div class="card-price">29,99</div>"#));
    }

    #[test]
    fn html_entities_are_read_back() {
        assert_eq!(decode_entities("Assassin&#39;s Creed"), "Assassin's Creed");
        assert_eq!(decode_entities("29,99&nbsp;&#8364;"), "29,99 €");
        assert_eq!(decode_entities("&Eacute;dition"), "Édition");
        // Une esperluette seule n'est pas une entite.
        assert_eq!(decode_entities("Rock & Roll"), "Rock & Roll");
    }
}
