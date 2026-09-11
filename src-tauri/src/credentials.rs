//! Les cles d'API, rangees hors du depot.
//!
//! IsThereAnyDeal demande une inscription pour ses prix. Sa cle vit a cote
//! de la cle de signature de l'updater, dans `%USERPROFILE%\.gamlib\`, et pour
//! la meme raison : un secret dans le depot est un secret publie.
//!
//! Elle est lue a la demande, jamais journalisee, et son absence n'est pas une
//! erreur : l'application marche sans, avec moins de sources. C'est ce qui
//! permet de la construire et de la lancer sur une machine qui ne l'a pas.

use std::path::PathBuf;

/// `%USERPROFILE%\.gamlib`, ou rien si la variable manque.
fn dir() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE").map(|home| PathBuf::from(home).join(".gamlib"))
}

fn read(name: &str) -> Option<String> {
    let text = std::fs::read_to_string(dir()?.join(name)).ok()?;
    let trimmed = text.trim().to_string();
    (!trimmed.is_empty()).then_some(trimmed)
}

/// La cle IsThereAnyDeal : une ligne, telle que leur portail la donne.
pub fn itad_key() -> Option<String> {
    read("itad.key")
}

