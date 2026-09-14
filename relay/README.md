# G-Lib relay

A Cloudflare Worker that holds what the desktop app must not: the Steam Web API
key (and, later, the Epic Account Services client secret). Users sign in with
their own account and never create a key.

## What it does

| Route | |
|---|---|
| `GET /steam/login` | Redirects to Steam's OpenID sign-in page. |
| `POST /steam/session` | Takes the assertion Steam returned, checks its shape and freshness, asks Steam to confirm it, and issues an HMAC token bound to that one account (30 days). |
| `GET /steam/friends` | With that token, returns the account's friends and their status. Cached per account for a minute. |
| `/epic/*` | Epic sign-in and friends. Answers `503` until the Epic secrets are set. |

It stores nothing. Tokens are stateless; Epic refresh tokens travel back to the
app sealed with AES-GCM, readable only by the relay.

Every response carries security headers and no CORS headers, request bodies are
capped at 8 KB, and a per-address rate limit is declared in `wrangler.toml`.

## Deploy

```bash
bun install
bunx wrangler login
bunx wrangler secret put STEAM_API_KEY
bunx wrangler secret put SESSION_SECRET   # 32+ random bytes; rotating it signs everyone out
bunx wrangler deploy
bun test
```

The app points at the deployed URL in `src-tauri/src/relay.rs`.
