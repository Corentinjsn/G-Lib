//! Sign-in tokens, kept in the Windows Credential Manager.
//!
//! A token is what lets G-Lib ask for a user's friends without asking them to
//! sign in again. It does not belong in a JSON file next to the library: the
//! Credential Manager encrypts it for the Windows account, and the user can see
//! and remove it under "Windows Credentials" like any other.

use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use windows_sys::Win32::Security::Credentials::{
    CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE,
    CRED_TYPE_GENERIC,
};

fn wide(value: &str) -> Vec<u16> {
    OsStr::new(value).encode_wide().chain(Some(0)).collect()
}

/// `G-Lib/steam`, `G-Lib/epic`: one entry per account kind.
fn target(name: &str) -> Vec<u16> {
    wide(&format!("G-Lib/{name}"))
}

pub fn save(name: &str, secret: &str) -> Result<(), String> {
    let mut target = target(name);
    let mut user = wide("G-Lib");
    let mut blob = secret.as_bytes().to_vec();

    let credential = CREDENTIALW {
        Type: CRED_TYPE_GENERIC,
        TargetName: target.as_mut_ptr(),
        CredentialBlobSize: blob.len() as u32,
        CredentialBlob: blob.as_mut_ptr(),
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        UserName: user.as_mut_ptr(),
        ..Default::default()
    };
    let written = unsafe { CredWriteW(&credential, 0) };
    if written == 0 {
        return Err(format!(
            "impossible d'enregistrer la connexion : {}",
            std::io::Error::last_os_error()
        ));
    }
    Ok(())
}

pub fn load(name: &str) -> Option<String> {
    let target = target(name);
    let mut found: *mut CREDENTIALW = std::ptr::null_mut();
    let read = unsafe { CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut found) };
    if read == 0 || found.is_null() {
        return None;
    }
    let secret = unsafe {
        let credential = &*found;
        let bytes = std::slice::from_raw_parts(
            credential.CredentialBlob,
            credential.CredentialBlobSize as usize,
        );
        let text = String::from_utf8(bytes.to_vec()).ok();
        CredFree(found as *const _);
        text
    };
    secret
}

pub fn delete(name: &str) {
    let target = target(name);
    unsafe {
        CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_secret_round_trips_and_goes_away() {
        // A name no real account uses, removed at the end either way.
        let name = "test-round-trip";
        delete(name);
        assert_eq!(load(name), None);

        save(name, "v1.token").expect("written");
        assert_eq!(load(name).as_deref(), Some("v1.token"));

        delete(name);
        assert_eq!(load(name), None);
    }
}
