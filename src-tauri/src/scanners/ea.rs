//! EA: games register a normal Windows uninstall entry, and every EA title
//! carries an `__Installer\installerdata.xml` holding the content (offer) id
//! that the EA app needs to launch it.

use crate::models::{Game, Platform};
use crate::scanners::clean_title;
use anyhow::{anyhow, Result};
use quick_xml::events::Event;
use quick_xml::Reader;
use std::path::{Path, PathBuf};
use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
use winreg::RegKey;

const UNINSTALL: &str = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall";
const UNINSTALL_WOW64: &str = r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall";

/// Both registry views plus the per-user hive: EA titles land in any of them
/// depending on how they were installed.
fn uninstall_roots() -> Vec<RegKey> {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    [
        hklm.open_subkey_with_flags(UNINSTALL, KEY_READ),
        hklm.open_subkey_with_flags(UNINSTALL_WOW64, KEY_READ),
        hkcu.open_subkey_with_flags(UNINSTALL, KEY_READ),
    ]
    .into_iter()
    .flatten()
    .collect()
}

/// `EstimatedSize` is the only size an uninstall entry carries: a DWORD of
/// kilobytes. Approximate, but far better than showing nothing.
pub fn estimated_size(entry: &RegKey) -> Option<u64> {
    entry
        .get_value::<u32, _>("EstimatedSize")
        .ok()
        .map(|kb| u64::from(kb) * 1024)
        .filter(|&bytes| bytes > 0)
}

/// What we can learn from an EA install's manifest.
#[derive(Debug, Default, PartialEq)]
pub struct InstallerData {
    pub content_id: Option<String>,
    /// `en_US` title, used only when the registry has no display name.
    pub title: Option<String>,
}

/// Pull the content id and fallback title out of `installerdata.xml`.
///
/// The file is UTF-8 and routinely contains `™`; it must not be read through a
/// legacy codepage or titles come out as `Battlefieldâ„¢ 1`.
pub fn parse_installerdata(text: &str) -> InstallerData {
    let mut reader = Reader::from_str(text);
    reader.config_mut().trim_text(true);

    let mut out = InstallerData::default();
    let mut in_content_id = false;
    let mut in_en_us_title = false;

    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => match e.name().as_ref() {
                "contentID" => in_content_id = true,
                "gameTitle" => {
                    in_en_us_title = e
                        .attributes()
                        .flatten()
                        .any(|a| a.key.as_ref() == "locale" && a.value.as_ref() == "en_US");
                }
                _ => {}
            },
            Ok(Event::Text(t)) => {
                let value = t.xml10_content().trim().to_string();
                if value.is_empty() {
                } else if in_content_id && out.content_id.is_none() {
                    out.content_id = Some(value);
                } else if in_en_us_title && out.title.is_none() {
                    out.title = Some(value);
                }
            }
            Ok(Event::End(_)) => {
                in_content_id = false;
                in_en_us_title = false;
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }

    out
}

fn read_installerdata(install_dir: &Path) -> Option<InstallerData> {
    let path = install_dir.join("__Installer").join("installerdata.xml");
    let bytes = std::fs::read(&path).ok()?;
    Some(parse_installerdata(&String::from_utf8_lossy(&bytes)))
}

pub fn scan() -> Result<Vec<Game>> {
    let roots = uninstall_roots();
    if roots.is_empty() {
        return Err(anyhow!("registre des programmes installes inaccessible"));
    }

    let mut games: Vec<Game> = Vec::new();
    for root in roots {
        for name in root.enum_keys().flatten() {
            let Ok(entry) = root.open_subkey_with_flags(&name, KEY_READ) else {
                continue;
            };
            let install_location: String = entry.get_value("InstallLocation").unwrap_or_default();
            if install_location.trim().is_empty() {
                continue;
            }
            let install_dir =
                PathBuf::from(install_location.trim_end_matches(std::path::is_separator));

            // The presence of installerdata.xml is what actually marks an EA
            // title -- far steadier than matching on the Publisher string.
            let Some(data) = read_installerdata(&install_dir) else {
                continue;
            };
            let Some(content_id) = data.content_id else {
                continue;
            };

            let display_name: String = entry.get_value("DisplayName").unwrap_or_default();
            let title = clean_title(if display_name.trim().is_empty() {
                data.title.as_deref().unwrap_or_default()
            } else {
                &display_name
            });
            if title.is_empty() {
                continue;
            }

            if games.iter().any(|g| g.platform_id == content_id) {
                continue;
            }

            let mut game = Game::installed(
                Platform::Ea,
                &content_id,
                title,
                install_dir,
                format!("origin2://game/launch?offerIds={content_id}"),
            );
            game.size_on_disk = estimated_size(&entry);
            // EA ne publie pas d'URI de desinstallation ; la ligne de
            // commande laissee par l'installeur fait le meme travail.
            game.uninstall = entry
                .get_value::<String, _>("UninstallString")
                .ok()
                .filter(|s| !s.trim().is_empty());
            games.push(game);
        }
    }

    Ok(games)
}

#[cfg(test)]
mod tests {
    use super::*;

    const BF1: &str = include_str!("../../tests/fixtures/ea_installerdata.xml");

    #[test]
    fn reads_content_id_and_title_from_a_real_manifest() {
        let data = parse_installerdata(BF1);
        assert_eq!(data.content_id.as_deref(), Some("1026023"));
        // Read as UTF-8 the trademark survives intact...
        assert_eq!(data.title.as_deref(), Some("Battlefield\u{2122} 1"));
        // ...and only the display layer strips it.
        assert_eq!(clean_title(&data.title.unwrap()), "Battlefield 1");
    }

    #[test]
    fn missing_fields_are_absent_rather_than_fatal() {
        assert_eq!(
            parse_installerdata("<DiPManifest/>"),
            InstallerData::default()
        );
        assert_eq!(parse_installerdata("not xml at all").content_id, None);
    }
}
