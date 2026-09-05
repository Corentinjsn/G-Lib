//! Parser for Valve's *binary* KeyValues, and for the `packageinfo.vdf` file
//! built on top of it.
//!
//! This is a different format from the text `.vdf`/`.acf` files handled in
//! [`crate::vdf`]: values are typed and length-free, keys are NUL-terminated,
//! and objects end with a sentinel byte.

use std::collections::HashMap;

/// Magic of the current `packageinfo.vdf` revision, which carries a PICS token
/// after the change number. Older revisions omit it.
const MAGIC_V28: u32 = 0x0656_5528;

const TYPE_OBJECT: u8 = 0x00;
const TYPE_STRING: u8 = 0x01;
const TYPE_INT32: u8 = 0x02;
const TYPE_FLOAT32: u8 = 0x03;
const TYPE_POINTER: u8 = 0x06;
const TYPE_UINT64: u8 = 0x07;
const TYPE_END: u8 = 0x08;

#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Object(HashMap<String, Value>),
    Str(String),
    Int(i32),
    /// A 32-bit "pointer", which Valve uses as just another integer.
    Pointer(i32),
    Float(f32),
    UInt(u64),
}

impl Value {
    pub fn get(&self, key: &str) -> Option<&Value> {
        match self {
            Value::Object(map) => map.get(key),
            _ => None,
        }
    }

    pub fn as_object(&self) -> Option<&HashMap<String, Value>> {
        match self {
            Value::Object(map) => Some(map),
            _ => None,
        }
    }

    pub fn as_i32(&self) -> Option<i32> {
        match self {
            Value::Int(v) | Value::Pointer(v) => Some(*v),
            _ => None,
        }
    }
}

struct Cursor<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl<'a> Cursor<'a> {
    fn take(&mut self, n: usize) -> Option<&'a [u8]> {
        let slice = self.bytes.get(self.pos..self.pos + n)?;
        self.pos += n;
        Some(slice)
    }

    fn u32(&mut self) -> Option<u32> {
        Some(u32::from_le_bytes(self.take(4)?.try_into().ok()?))
    }

    fn i32(&mut self) -> Option<i32> {
        Some(i32::from_le_bytes(self.take(4)?.try_into().ok()?))
    }

    fn f32(&mut self) -> Option<f32> {
        Some(f32::from_le_bytes(self.take(4)?.try_into().ok()?))
    }

    fn u64(&mut self) -> Option<u64> {
        Some(u64::from_le_bytes(self.take(8)?.try_into().ok()?))
    }

    fn u8(&mut self) -> Option<u8> {
        let byte = *self.bytes.get(self.pos)?;
        self.pos += 1;
        Some(byte)
    }

    /// NUL-terminated string. Valve writes UTF-8 but is not strict about it.
    fn cstring(&mut self) -> Option<String> {
        let start = self.pos;
        let end = self.bytes[start..].iter().position(|&b| b == 0)? + start;
        let text = String::from_utf8_lossy(&self.bytes[start..end]).into_owned();
        self.pos = end + 1;
        Some(text)
    }

    fn object(&mut self) -> Option<Value> {
        let mut map = HashMap::new();
        loop {
            match self.u8()? {
                TYPE_END => return Some(Value::Object(map)),
                TYPE_OBJECT => {
                    let key = self.cstring()?;
                    map.insert(key, self.object()?);
                }
                TYPE_STRING => {
                    let key = self.cstring()?;
                    let value = self.cstring()?;
                    map.insert(key, Value::Str(value));
                }
                TYPE_INT32 => {
                    let key = self.cstring()?;
                    map.insert(key, Value::Int(self.i32()?));
                }
                TYPE_POINTER => {
                    let key = self.cstring()?;
                    map.insert(key, Value::Pointer(self.i32()?));
                }
                TYPE_FLOAT32 => {
                    let key = self.cstring()?;
                    map.insert(key, Value::Float(self.f32()?));
                }
                TYPE_UINT64 => {
                    let key = self.cstring()?;
                    map.insert(key, Value::UInt(self.u64()?));
                }
                // An unknown type means the layout has shifted under us; there
                // is no length prefix to skip by, so stop rather than guess.
                _ => return None,
            }
        }
    }
}

/// Every appid granted by a licence in `packageinfo.vdf`.
///
/// The file is a flat sequence of packages, each wrapping a single object named
/// after its own package id. A package that fails to parse ends the walk: the
/// entries are not length-prefixed, so there is no way to resync.
pub fn owned_appids(bytes: &[u8]) -> Vec<u32> {
    let mut cursor = Cursor { bytes, pos: 0 };
    let Some(magic) = cursor.u32() else {
        return Vec::new();
    };
    if cursor.u32().is_none() {
        return Vec::new();
    }

    let mut appids: Vec<u32> = Vec::new();
    while cursor.pos < bytes.len() {
        let Some(package_id) = cursor.u32() else {
            break;
        };
        if package_id == u32::MAX {
            break;
        }
        if cursor.take(20).is_none() || cursor.u32().is_none() {
            break;
        }
        if magic == MAGIC_V28 && cursor.u64().is_none() {
            break;
        }
        let Some(root) = cursor.object() else { break };

        // The root holds one child, named after the package id.
        let Some(map) = root.as_object() else { break };
        let package = match map.values().next() {
            Some(inner) if map.len() == 1 => inner,
            _ => &root,
        };

        if let Some(Value::Object(apps)) = package.get("appids") {
            appids.extend(apps.values().filter_map(|v| v.as_i32()).map(|id| id as u32));
        }
    }

    appids.sort_unstable();
    appids.dedup();
    appids
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a `packageinfo.vdf` in memory: real files carry the user's whole
    /// licence list, which has no place in a fixture.
    struct Builder {
        bytes: Vec<u8>,
    }

    impl Builder {
        fn new(magic: u32) -> Self {
            let mut bytes = Vec::new();
            bytes.extend(magic.to_le_bytes());
            bytes.extend(1u32.to_le_bytes()); // universe
            Builder { bytes }
        }

        fn key(&mut self, kind: u8, name: &str) {
            self.bytes.push(kind);
            self.bytes.extend(name.as_bytes());
            self.bytes.push(0);
        }

        fn package(mut self, package_id: u32, appids: &[u32], magic: u32) -> Self {
            self.bytes.extend(package_id.to_le_bytes());
            self.bytes.extend([0u8; 20]); // sha1
            self.bytes.extend(7u32.to_le_bytes()); // change number
            if magic == MAGIC_V28 {
                self.bytes.extend(0u64.to_le_bytes()); // pics token
            }

            self.key(TYPE_OBJECT, &package_id.to_string());
            self.key(TYPE_INT32, "packageid");
            self.bytes.extend((package_id as i32).to_le_bytes());
            self.key(TYPE_OBJECT, "appids");
            for (index, appid) in appids.iter().enumerate() {
                self.key(TYPE_INT32, &index.to_string());
                self.bytes.extend((*appid as i32).to_le_bytes());
            }
            self.bytes.push(TYPE_END); // appids
            self.bytes.push(TYPE_END); // package
            self.bytes.push(TYPE_END); // root
            self
        }

        fn finish(mut self) -> Vec<u8> {
            self.bytes.extend(u32::MAX.to_le_bytes());
            self.bytes
        }
    }

    #[test]
    fn collects_appids_across_packages() {
        let bytes = Builder::new(MAGIC_V28)
            .package(1001, &[440, 570], MAGIC_V28)
            .package(1002, &[359550], MAGIC_V28)
            .finish();

        assert_eq!(owned_appids(&bytes), vec![440, 570, 359550]);
    }

    #[test]
    fn deduplicates_appids_granted_by_several_licences() {
        let bytes = Builder::new(MAGIC_V28)
            .package(1001, &[440], MAGIC_V28)
            .package(1002, &[440, 620], MAGIC_V28)
            .finish();

        assert_eq!(owned_appids(&bytes), vec![440, 620]);
    }

    #[test]
    fn reads_the_older_revision_without_a_pics_token() {
        const MAGIC_V27: u32 = 0x0656_5527;
        let bytes = Builder::new(MAGIC_V27)
            .package(1001, &[730], MAGIC_V27)
            .finish();

        assert_eq!(owned_appids(&bytes), vec![730]);
    }

    #[test]
    fn truncated_data_yields_what_was_read_rather_than_panicking() {
        let full = Builder::new(MAGIC_V28)
            .package(1001, &[440], MAGIC_V28)
            .package(1002, &[620], MAGIC_V28)
            .finish();

        // Cut mid-way through the second package.
        let cut = &full[..full.len() - 12];
        assert_eq!(owned_appids(cut), vec![440]);
        assert!(owned_appids(&[]).is_empty());
        assert!(owned_appids(&[0, 1, 2]).is_empty());
    }
}
