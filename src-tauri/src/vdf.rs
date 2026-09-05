//! Minimal parser for Valve's KeyValues text format (`.vdf`, `.acf`).
//!
//! The format is a nesting of `"key" "value"` pairs and `"key" { ... }` blocks,
//! with `//` line comments. That is the whole grammar, so a hand-rolled parser
//! is smaller and more predictable here than pulling in a dependency.

#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Str(String),
    /// Pairs, not a map: Valve files may repeat a key and order can matter.
    Obj(Vec<(String, Value)>),
}

impl Value {
    /// First value stored under `key`, case-insensitively (Valve is
    /// inconsistent: `LastPlayed` vs `lastplayed` across client versions).
    pub fn get(&self, key: &str) -> Option<&Value> {
        match self {
            Value::Obj(pairs) => pairs
                .iter()
                .find(|(k, _)| k.eq_ignore_ascii_case(key))
                .map(|(_, v)| v),
            Value::Str(_) => None,
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Value::Str(s) => Some(s),
            Value::Obj(_) => None,
        }
    }

    pub fn pairs(&self) -> &[(String, Value)] {
        match self {
            Value::Obj(pairs) => pairs,
            Value::Str(_) => &[],
        }
    }

    /// Convenience for the many numeric fields stored as quoted strings.
    pub fn get_u64(&self, key: &str) -> Option<u64> {
        self.get(key)?.as_str()?.parse().ok()
    }

    pub fn get_i64(&self, key: &str) -> Option<i64> {
        self.get(key)?.as_str()?.parse().ok()
    }

    pub fn get_str(&self, key: &str) -> Option<&str> {
        self.get(key)?.as_str()
    }
}

/// Byte value of a backslash, the VDF string-escape marker.
const BACKSLASH: u8 = 0x5c;
enum Token {
    Str(String),
    Open,
    Close,
}

struct Lexer<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl<'a> Lexer<'a> {
    fn new(input: &'a str) -> Self {
        Lexer {
            bytes: input.as_bytes(),
            pos: 0,
        }
    }

    fn skip_trivia(&mut self) {
        loop {
            while self.pos < self.bytes.len() && self.bytes[self.pos].is_ascii_whitespace() {
                self.pos += 1;
            }
            // `//` line comment
            if self.pos + 1 < self.bytes.len()
                && self.bytes[self.pos] == b'/'
                && self.bytes[self.pos + 1] == b'/'
            {
                while self.pos < self.bytes.len() && self.bytes[self.pos] != b'\n' {
                    self.pos += 1;
                }
                continue;
            }
            return;
        }
    }

    fn next_token(&mut self) -> Option<Token> {
        self.skip_trivia();
        let &b = self.bytes.get(self.pos)?;
        match b {
            b'{' => {
                self.pos += 1;
                Some(Token::Open)
            }
            b'}' => {
                self.pos += 1;
                Some(Token::Close)
            }
            b'"' => {
                self.pos += 1;
                let mut out = Vec::new();
                while let Some(&c) = self.bytes.get(self.pos) {
                    match c {
                        b'"' => {
                            self.pos += 1;
                            break;
                        }
                        BACKSLASH => {
                            self.pos += 1;
                            let esc = self.bytes.get(self.pos).copied().unwrap_or(BACKSLASH);
                            out.push(match esc {
                                b'n' => b'\n',
                                b't' => b'\t',
                                other => other,
                            });
                            self.pos += 1;
                        }
                        other => {
                            out.push(other);
                            self.pos += 1;
                        }
                    }
                }
                Some(Token::Str(String::from_utf8_lossy(&out).into_owned()))
            }
            // Bare (unquoted) token: runs until whitespace or a brace.
            _ => {
                let start = self.pos;
                while let Some(&c) = self.bytes.get(self.pos) {
                    if c.is_ascii_whitespace() || c == b'{' || c == b'}' {
                        break;
                    }
                    self.pos += 1;
                }
                Some(Token::Str(
                    String::from_utf8_lossy(&self.bytes[start..self.pos]).into_owned(),
                ))
            }
        }
    }
}

fn parse_pairs(lexer: &mut Lexer) -> Vec<(String, Value)> {
    let mut pairs = Vec::new();
    loop {
        let key = match lexer.next_token() {
            None | Some(Token::Close) => break,
            // A stray `{` at this position is malformed; skip it rather than bail.
            Some(Token::Open) => continue,
            Some(Token::Str(k)) => k,
        };
        match lexer.next_token() {
            None => break,
            Some(Token::Open) => pairs.push((key, Value::Obj(parse_pairs(lexer)))),
            Some(Token::Str(v)) => pairs.push((key, Value::Str(v))),
            // Key with no value right before a block close: keep it as empty.
            Some(Token::Close) => {
                pairs.push((key, Value::Str(String::new())));
                break;
            }
        }
    }
    pairs
}

/// Parse a whole file into a root object holding its top-level pairs.
pub fn parse(input: &str) -> Value {
    // Strip a UTF-8 BOM: Steam writes one on some files.
    let input = input.strip_prefix('\u{feff}').unwrap_or(input);
    Value::Obj(parse_pairs(&mut Lexer::new(input)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_nested_blocks_and_lookups() {
        let src = r#"
            "AppState"
            {
                "appid"  "359550"
                "name"   "Tom Clancy's Rainbow Six Siege"
                "InstalledDepots"
                {
                    "359551" { "manifest" "123" }
                }
            }
        "#;
        let root = parse(src);
        let app = root.get("AppState").unwrap();
        assert_eq!(app.get_str("appid"), Some("359550"));
        // Lookup is case-insensitive.
        assert_eq!(app.get_str("APPID"), Some("359550"));
        assert_eq!(app.get_u64("appid"), Some(359550));
        assert!(app.get("InstalledDepots").unwrap().get("359551").is_some());
    }

    const LIBRARY_FOLDERS: &str = include_str!("../tests/fixtures/libraryfolders.vdf");

    #[test]
    fn unescapes_windows_paths_from_a_real_libraryfolders_file() {
        let root = parse(LIBRARY_FOLDERS);
        let folders = root.get("libraryfolders").expect("root block");

        // Steam stores the path with doubled separators; we hand back the real one.
        let first = folders.get("0").expect("first library");
        assert_eq!(first.get_str("path"), Some(r"C:\Program Files (x86)\Steam"));

        // Sibling libraries parse too, each with its own apps block.
        let second = folders.get("1").expect("second library");
        assert!(second
            .get_str("path")
            .is_some_and(|p| p.contains("SteamLibrary")));
        assert!(!second.get("apps").expect("apps block").pairs().is_empty());
    }

    #[test]
    fn empty_input_yields_empty_object() {
        assert_eq!(parse(""), Value::Obj(vec![]));
    }
}
