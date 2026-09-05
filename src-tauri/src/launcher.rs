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
    shell_run(target, None)
}

/// Same, with arguments. Kept separate from `shell_open` because the shell
/// wants the executable and its arguments apart, where an uninstall entry
/// stores them as one string.
fn shell_run(target: &str, params: Option<&str>) -> Result<()> {
    let operation = to_wide("open");
    let file = to_wide(target);
    let params = params.map(to_wide);

    let code = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            operation.as_ptr(),
            file.as_ptr(),
            params.as_ref().map_or(std::ptr::null(), |p| p.as_ptr()),
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

/// Split a command line into its executable and the rest.
///
/// An uninstall entry is one string: `"C:\...\setup.exe" /uninstall {GUID}`.
/// The shell wants the two apart, and the quoting rules are simple enough that
/// a full parser would be more code than it is worth.
fn split_command(line: &str) -> (String, Option<String>) {
    let line = line.trim();
    if let Some(rest) = line.strip_prefix('"') {
        if let Some((exe, args)) = rest.split_once('"') {
            let args = args.trim();
            return (
                exe.to_string(),
                (!args.is_empty()).then(|| args.to_string()),
            );
        }
    }
    match line.split_once(' ') {
        Some((exe, args)) => (exe.to_string(), Some(args.trim().to_string())),
        None => (line.to_string(), None),
    }
}

/// Hand a game to its uninstall flow: a URI for the stores that publish one,
/// the command line their installer left behind for those that do not.
pub fn uninstall(entry: &str) -> Result<()> {
    let looks_like_uri = entry.split_once("://").is_some_and(|(scheme, _)| {
        !scheme.is_empty()
            && scheme
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '.')
    });

    if looks_like_uri {
        return shell_open(entry);
    }

    let (exe, args) = split_command(entry);
    if exe.is_empty() {
        return Err(anyhow!("commande de desinstallation vide"));
    }
    shell_run(&exe, args.as_deref())
}

pub fn open_folder(path: &Path) -> Result<()> {
    if !path.is_dir() {
        return Err(anyhow!("dossier introuvable : {}", path.display()));
    }
    shell_open(&path.to_string_lossy())
}

#[cfg(test)]
mod tests {
    use super::split_command;

    #[test]
    fn splits_a_quoted_executable_from_its_arguments() {
        let (exe, args) = split_command(r#""C:\Program Files\EA\setup.exe" /uninstall {GUID}"#);
        assert_eq!(exe, r"C:\Program Files\EA\setup.exe");
        assert_eq!(args.as_deref(), Some("/uninstall {GUID}"));
    }

    #[test]
    fn handles_an_unquoted_path_without_spaces() {
        let (exe, args) = split_command(r"C:\games\unins000.exe /S");
        assert_eq!(exe, r"C:\games\unins000.exe");
        assert_eq!(args.as_deref(), Some("/S"));
    }

    #[test]
    fn an_executable_alone_carries_no_arguments() {
        let (exe, args) = split_command(r#""C:\a\b.exe""#);
        assert_eq!(exe, r"C:\a\b.exe");
        assert_eq!(args, None);
    }
}
