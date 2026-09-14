//! Epic's public promotions feed: the games discounted or given away this week.
//!
//! This is the one Epic source that needs neither a key nor a browser. Its
//! GraphQL store search sits behind a Cloudflare challenge when asked for
//! "everything on sale", so without IsThereAnyDeal this short list is what the
//! store's Epic shelf shows.

use crate::market::{Deal, MarketItem, Price};

const FEED: &str = "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=fr&country=FR&allowCountries=FR";

pub fn current(client: &reqwest::blocking::Client) -> Option<Vec<MarketItem>> {
    let value = client
        .get(FEED)
        .send()
        .ok()?
        .error_for_status()
        .ok()?
        .json::<serde_json::Value>()
        .ok()?;
    Some(parse(&value))
}

fn parse(value: &serde_json::Value) -> Vec<MarketItem> {
    let Some(elements) = value
        .pointer("/data/Catalog/searchStore/elements")
        .and_then(|v| v.as_array())
    else {
        return Vec::new();
    };

    elements.iter().filter_map(describe).collect()
}

/// A promotion running now, on a base game. The feed also lists next week's
/// giveaways, add-ons and bundles.
fn describe(element: &serde_json::Value) -> Option<MarketItem> {
    if element.get("offerType")?.as_str()? != "BASE_GAME" {
        return None;
    }
    let running = element
        .pointer("/promotions/promotionalOffers/0/promotionalOffers")
        .and_then(|v| v.as_array())
        .is_some_and(|offers| !offers.is_empty());
    if !running {
        return None;
    }

    let total = element.pointer("/price/totalPrice")?;
    let discounted = total.get("discountPrice")?.as_i64()?;
    let original = total.get("originalPrice")?.as_i64()?;
    if original <= 0 || discounted >= original {
        return None;
    }
    let cut = ((original - discounted) * 100 + original / 2) / original;

    let fmt = |field: &str| {
        total
            .pointer(&format!("/fmtPrice/{field}"))
            .and_then(|v| v.as_str())
            .map(str::to_string)
    };
    let current = if discounted == 0 {
        "Gratuit".to_string()
    } else {
        fmt("discountPrice")?
    };

    let slug = element
        .pointer("/catalogNs/mappings/0/pageSlug")
        .or_else(|| element.pointer("/offerMappings/0/pageSlug"))
        .or_else(|| element.get("productSlug"))
        .and_then(|v| v.as_str())
        .map(|slug| slug.trim_end_matches("/home"))
        .filter(|slug| !slug.is_empty());

    let title = element.get("title")?.as_str()?.trim().to_string();
    let cover = element
        .get("keyImages")
        .and_then(|v| v.as_array())
        .and_then(|images| {
            images
                .iter()
                .find(|image| image.get("type").and_then(|v| v.as_str()) == Some("OfferImageTall"))
        })
        .and_then(|image| image.get("url")?.as_str())
        .map(|url| format!("{url}?resize=1&w=360&h=540&quality=medium"));

    Some(MarketItem {
        id: format!("epic:{}", element.get("id")?.as_str()?),
        appid: None,
        name: title,
        cover_url: cover,
        header_url: None,
        short_description: element
            .get("description")
            .and_then(|v| v.as_str())
            .map(str::to_string)
            .filter(|text| !text.is_empty()),
        developers: Vec::new(),
        publishers: Vec::new(),
        release_date: None,
        coming_soon: false,
        free: false,
        price: Some(Price {
            current,
            original: fmt("originalPrice"),
            discount: cut,
        }),
        screenshots: Vec::new(),
        store_url: None,
        deal: Some(Deal {
            store: "epic",
            url: slug.map(|slug| format!("https://store.epicgames.com/fr/p/{slug}")),
        }),
    })
}

#[cfg(test)]
mod tests {
    use super::parse;

    #[test]
    fn keeps_running_discounts_on_base_games() {
        let value: serde_json::Value = serde_json::from_str(
            r#"{"data":{"Catalog":{"searchStore":{"elements":[
              {"id":"g2","title":"Ghostrunner 2","offerType":"BASE_GAME","description":"Parkour.",
               "catalogNs":{"mappings":[{"pageSlug":"ghostrunner-2","pageType":"productHome"}]},
               "keyImages":[{"type":"OfferImageTall","url":"https://cdn1.epicgames.com/tall.jpg"}],
               "price":{"totalPrice":{"discountPrice":799,"originalPrice":3999,
                 "fmtPrice":{"originalPrice":"39,99 €","discountPrice":"7,99 €"}}},
               "promotions":{"promotionalOffers":[{"promotionalOffers":[{"startDate":"x"}]}]}},
              {"id":"free","title":"Astral Ascent","offerType":"BASE_GAME",
               "productSlug":"astral-ascent/home",
               "price":{"totalPrice":{"discountPrice":0,"originalPrice":2450,
                 "fmtPrice":{"originalPrice":"24,50 €","discountPrice":"0"}}},
               "promotions":{"promotionalOffers":[{"promotionalOffers":[{"startDate":"x"}]}]}},
              {"id":"next","title":"Next week","offerType":"BASE_GAME",
               "price":{"totalPrice":{"discountPrice":1999,"originalPrice":1999}},
               "promotions":{"promotionalOffers":[],"upcomingPromotionalOffers":[{}]}},
              {"id":"dlc","title":"Add-on","offerType":"ADD_ON",
               "price":{"totalPrice":{"discountPrice":1,"originalPrice":2}},
               "promotions":{"promotionalOffers":[{"promotionalOffers":[{}]}]}}
            ]}}}}"#,
        )
        .unwrap();

        let items = parse(&value);
        assert_eq!(items.len(), 2);

        let ghostrunner = &items[0];
        let price = ghostrunner.price.as_ref().unwrap();
        assert_eq!(price.current, "7,99 €");
        assert_eq!(price.original.as_deref(), Some("39,99 €"));
        assert_eq!(price.discount, 80);
        assert_eq!(
            ghostrunner.deal.as_ref().unwrap().url.as_deref(),
            Some("https://store.epicgames.com/fr/p/ghostrunner-2")
        );

        let free = &items[1];
        assert_eq!(free.price.as_ref().unwrap().current, "Gratuit");
        assert_eq!(
            free.deal.as_ref().unwrap().url.as_deref(),
            Some("https://store.epicgames.com/fr/p/astral-ascent")
        );
    }
}
