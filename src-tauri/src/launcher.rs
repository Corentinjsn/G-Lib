//! Launching a game means handing its platform URI to the shell, exactly as
//! clicking a `steam://` link would. `ShellExecuteW` is used directly rather
//! than shelling out through `cmd /C start`, which would flash a console window
//! and mangle URIs containing `&`.

use anyhow::{anyhow, Result};
use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::path::Path;
use windows_sys::Win32::UI::Shell::ShellExecuteW;
use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

fn to_wide(value: &str) -> Vec<u16> {
    OsStr::new(value).encode_wide().chain(Some(0)).collect()
}

/// Ask the shell to open `target`, which may be a URI or a filesystem path.
fn shell_open(target: &str) -> Result<()> {
    let operation = to_wide("open");
    let file = to_wide(target);

    let code = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            operation.as_ptr(),
            file.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    } as isize;

    // ShellExecuteW returns a value greater than 32 on success; anything at or
    // below that is one of the legacy SE_ERR_* codes.
    if code > 32 {
        return Ok(());
    }
    Err(match code {
        2 => anyhow!("cible introuvable : {target}"),
        31 => anyhow!(
            "aucune application n'est associee a ce lien. Le launcher est-il installe ? ({target})"
        ),
        other => anyhow!("le shell a refuse d'ouvrir {target} (code {other})"),
    })
}

pub fn launch_uri(uri: &str) -> Result<()> {
    shell_open(uri)
}

pub fn open_folder(path: &Path) -> Result<()> {
    if !path.is_dir() {
        return Err(anyhow!("dossier introuvable : {}", path.display()));
    }
    shell_open(&path.to_string_lossy())
}
