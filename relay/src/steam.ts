/**
 * Steam sign-in and friends, the part of G-Lib that cannot live in the app.
 *
 * Signing in to Steam is OpenID: Steam's own page, then a redirect carrying a
 * signed assertion of the account id. That much needs no secret. The friends
 * list does: it comes from the Steam Web API, whose key must stay private, so
 * it sits here and never ships in the installer.
 *
 * The relay only ever answers about the account that signed in. It checks the
 * assertion with Steam itself, then hands the app a token bound to that one
 * account; a token is the only way to ask for friends.
 */

export const STEAM_OPENID = "https://steamcommunity.com/openid/login";
const OPENID_NS = "http://specs.openid.net/auth/2.0";
const CLAIMED_ID = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

/** Where Steam sends the browser back. The app intercepts it before it loads. */
export const RETURN_PATH = "/steam/return";

/** How long a sign-in lasts before the app has to ask again. */
const TOKEN_DAYS = 90;

/** Steam's sign-in page, set to come back to this relay. */
export function loginUrl(origin: string): string {
  const params = new URLSearchParams({
    "openid.ns": OPENID_NS,
    "openid.mode": "checkid_setup",
    "openid.return_to": origin + RETURN_PATH,
    "openid.realm": origin,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  return `${STEAM_OPENID}?${params}`;
}

/**
 * The account id an assertion claims, if the assertion is shaped like one Steam
 * would send to this relay. Shape only: `verifyWithSteam` checks the signature.
 */
export function claimedSteamId(
  params: URLSearchParams,
  origin: string,
): string | null {
  if (params.get("openid.ns") !== OPENID_NS) return null;
  if (params.get("openid.mode") !== "id_res") return null;
  if (params.get("openid.op_endpoint") !== STEAM_OPENID) return null;
  // An assertion made for another site must not sign in here.
  if (params.get("openid.return_to") !== origin + RETURN_PATH) return null;

  const claimed = params.get("openid.claimed_id") ?? "";
  if (params.get("openid.identity") !== claimed) return null;
  return CLAIMED_ID.exec(claimed)?.[1] ?? null;
}

/**
 * Asks Steam whether it really signed this assertion. Steam answers once per
 * nonce, which also stops a captured assertion from being replayed.
 */
export async function verifyWithSteam(
  params: URLSearchParams,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  const body = new URLSearchParams(params);
  body.set("openid.mode", "check_authentication");
  const response = await fetcher(STEAM_OPENID, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) return false;
  const text = await response.text();
  return /^is_valid\s*:\s*true\s*$/m.test(text);
}

const encoder = new TextEncoder();

function base64url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64url(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
}

/** A token saying "this is Steam account `steamId`", good for 90 days. */
export async function issueToken(
  secret: string,
  steamId: string,
  now = Date.now(),
): Promise<string> {
  const expires = Math.floor(now / 1000) + TOKEN_DAYS * 24 * 3600;
  const payload = `v1.${steamId}.${expires}`;
  return `${payload}.${await hmac(secret, payload)}`;
}

/** The account a token speaks for, or null if it is forged or expired. */
export async function readToken(
  secret: string,
  token: string,
  now = Date.now(),
): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const [, steamId, expires, signature] = parts;
  if (!/^\d{17}$/.test(steamId) || !/^\d+$/.test(expires)) return null;

  const expected = await hmac(secret, `v1.${steamId}.${expires}`);
  if (!constantTimeEqual(expected, signature)) return null;
  if (Number(expires) * 1000 < now) return null;
  return steamId;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface Friend {
  id: string;
  name: string;
  avatar: string | null;
  /** Steam's persona state: 0 offline, 1 online, 2 busy, 3 away, 4 snooze,
      5 looking to trade, 6 looking to play. */
  state: number;
  /** The game being played, when Steam shows it. */
  game: string | null;
  profileUrl: string | null;
}

export interface Profile {
  id: string;
  name: string;
  avatar: string | null;
}

const API = "https://api.steampowered.com";
/** GetPlayerSummaries takes at most 100 ids per call. */
const SUMMARY_BATCH = 100;
/** Past this, a friends list is not read in a small window anyway. */
const MAX_FRIENDS = 300;

interface Summary {
  steamid: string;
  personaname?: string;
  avatarmedium?: string;
  personastate?: number;
  gameextrainfo?: string;
  profileurl?: string;
}

export async function summaries(
  key: string,
  ids: string[],
  fetcher: typeof fetch = fetch,
): Promise<Summary[]> {
  const all: Summary[] = [];
  for (let i = 0; i < ids.length; i += SUMMARY_BATCH) {
    const batch = ids.slice(i, i + SUMMARY_BATCH).join(",");
    const response = await fetcher(
      `${API}/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(key)}&steamids=${batch}`,
    );
    if (!response.ok) throw new Error(`GetPlayerSummaries ${response.status}`);
    const data = (await response.json()) as { response?: { players?: Summary[] } };
    all.push(...(data.response?.players ?? []));
  }
  return all;
}

export function toFriend(summary: Summary): Friend {
  return {
    id: summary.steamid,
    name: summary.personaname ?? summary.steamid,
    avatar: summary.avatarmedium ?? null,
    state: summary.personastate ?? 0,
    game: summary.gameextrainfo ?? null,
    profileUrl: summary.profileurl ?? null,
  };
}

/** In game first, then online, then offline; by name within each. */
export function sortFriends(friends: Friend[]): Friend[] {
  const rank = (friend: Friend) => (friend.game ? 0 : friend.state > 0 ? 1 : 2);
  return [...friends].sort(
    (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name),
  );
}

export type FriendsResult =
  | { visibility: "public"; friends: Friend[] }
  | { visibility: "private"; friends: [] };

export async function friendsOf(
  key: string,
  steamId: string,
  fetcher: typeof fetch = fetch,
): Promise<FriendsResult> {
  const response = await fetcher(
    `${API}/ISteamUser/GetFriendList/v1/?key=${encodeURIComponent(key)}&steamid=${steamId}&relationship=friend`,
  );
  // Steam answers 401 when the friends list is not public.
  if (response.status === 401 || response.status === 403) {
    return { visibility: "private", friends: [] };
  }
  if (!response.ok) throw new Error(`GetFriendList ${response.status}`);

  const data = (await response.json()) as {
    friendslist?: { friends?: { steamid: string }[] };
  };
  const ids = (data.friendslist?.friends ?? [])
    .map((friend) => friend.steamid)
    .slice(0, MAX_FRIENDS);
  const players = await summaries(key, ids, fetcher);
  return { visibility: "public", friends: sortFriends(players.map(toFriend)) };
}
