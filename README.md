# G-Lib

**One library for every game you own.** Steam, Epic Games, EA and Ubisoft
Connect in a single grid — launch, install or uninstall without opening four
launchers.

*[Version française](README.fr.md)*

![The library](docs/screenshots/library.jpg)

---

## What it does

**Finds your games by itself.** All scanning is local — files and the Windows
registry. No login, no proprietary API, no token. Installed games *and* games
you own without having installed them.

**Keeps up on its own.** Install or remove a game and its card appears or
disappears; nothing to click.

**Remembers what you play.** No store exposes playtime locally, so G-Lib
measures its own by watching processes — last session and total hours, for all
four platforms alike.

**Finds a game to buy, and where it is cheapest.**

![The store](docs/screenshots/store.jpg)

The catalogue comes from Steam, extended by IGDB for the games Steam does not
sell. Prices come from IsThereAnyDeal — some thirty shops at once, with the
discount and the lowest price ever — plus Instant Gaming, which no aggregator
covers.

**Shows who is playing.** A small friends window, like Steam's, lists your
Steam friends in game, online and offline. You sign in on Steam's own page;
G-Lib never sees your password and you never create an API key.

**Answers to the keyboard.** `Ctrl+K` opens a palette that searches the whole
library whatever the filters, launches on Enter, and opens the game's actions
on `Tab`. The grid takes arrows or `hjkl`, `gg`/`G`, `Ctrl+D`/`Ctrl+U`.

![The launch palette](docs/screenshots/palette.jpg)

---

## Install

Download the latest `G-Lib_x.y.z_x64-setup.exe` from
[Releases](https://github.com/Corentinjsn/G-Lib/releases) and run it. Windows
only. The application updates itself from then on.

## Optional keys

G-Lib works with none of these. Each adds a source, and each is free.

| Key | What it adds | Where to get it |
|---|---|---|
| `%USERPROFILE%\.gamlib\itad.key` | Prices from ~30 shops, discounts, lowest price ever | [isthereanydeal.com/apps/my](https://isthereanydeal.com/apps/my/) |
| `%USERPROFILE%\.gamlib\igdb.json` | The games Steam does not sell | [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) |

`igdb.json` holds `{ "clientId": "...", "clientSecret": "..." }`. Keys live
outside the repository, deliberately.

## Privacy and security

- **The library stays on your machine.** Scanning reads launcher files and the
  registry; nothing about your games is sent anywhere.
- **Signing in is optional** and only used for the friends window. It happens
  on the store's official page, in a private window with no access to the app.
- **No secret ships in the installer.** The Steam Web API key lives in a small
  relay ([`relay/`](relay/)), a Cloudflare Worker that checks your sign-in
  with Steam and only ever answers about your own account. It stores nothing.
- **Your sign-in token** is kept in the Windows Credential Manager, not in a
  file. *Sign out* deletes it.
- **Each window can only do its own job**: the friends window has no access to
  your library, and store links only open known store sites.

## Build it yourself

Requires [Bun](https://bun.sh), Rust stable, MSVC build tools and WebView2.

```bash
bun install
bun run tauri dev      # run it
bun run tauri build    # produce the installer
bun test               # the view logic
cd src-tauri && cargo test
```

## How it works

Where each launcher hides its games, how cover art is found without an API key,
how playtime is measured, and why the price lookup refuses an approximate title
match: **[the long version](docs/how-it-works.fr.md)** (in French).

## Built with

[Tauri 2](https://tauri.app) · React · TypeScript · Rust · Tailwind CSS · Bun.
Store icons from [Simple Icons](https://simpleicons.org) (CC0).

Not affiliated with Valve, Epic Games, Electronic Arts or Ubisoft.
