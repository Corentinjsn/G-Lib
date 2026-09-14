/**
 * Epic sign-in and friends, through Epic Account Services' web API.
 *
 * Epic signs in with OAuth: its own page, then a one-time code. Turning that
 * code into tokens takes the client secret, which is why this lives here: the
 * installer carries no Epic credential at all.
 *
 * The app never holds Epic's tokens either. What it keeps is a sealed blob --
 * the refresh token and account id, encrypted with a key only this relay has.
 * A copy stolen from the machine is useless without going through the relay,
 * and says nothing about the account to whoever reads it.
 */

const AUTHORIZE = "https://www.epicgames.com/id/authorize";
const API = "https://api.epicgames.dev";
export const EPIC_RETURN_PATH = "/epic/return";

/** Epic's friends endpoint wants both. Presence is not in the web API. */
const SCOPES = "basic_profile friends_list";

/** The accounts lookup takes at most 50 ids per call. */
const ACCOUNTS_BATCH = 50;
const MAX_FRIENDS = 300;

export interface EpicConfig {
  clientId: string;
  clientSecret: string;
  deploymentId: string;
}

/** Epic's sign-in page. `state` comes from the app and comes back unchanged. */
export function authorizeUrl(clientId: string, origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: SCOPES,
    redirect_uri: origin + EPIC_RETURN_PATH,
    state,
  });
  return `${AUTHORIZE}?${params}`;
}

/** A state the app generated: long, random, URL-safe. Anything else is refused. */
export function isValidState(state: string | null): state is string {
  return state !== null && /^[A-Za-z0-9_-]{32,128}$/.test(state);
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  refresh_expires_at?: string;
  account_id: string;
}

async function token(
  config: EpicConfig,
  form: Record<string, string>,
  fetcher: typeof fetch,
): Promise<TokenResponse | null> {
  const response = await fetcher(`${API}/epic/oauth/v2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ ...form, deployment_id: config.deploymentId }),
  });
  // A refused code or an expired refresh token: the user signs in again.
  if (response.status === 400 || response.status === 401) return null;
  if (!response.ok) throw new Error(`epic token ${response.status}`);
  const data = (await response.json()) as Partial<TokenResponse>;
  if (!data.access_token || !data.refresh_token || !data.account_id) return null;
  return data as TokenResponse;
}

export function exchangeCode(
  config: EpicConfig,
  code: string,
  origin: string,
  fetcher: typeof fetch = fetch,
) {
  return token(
    config,
    {
      grant_type: "authorization_code",
      code,
      redirect_uri: origin + EPIC_RETURN_PATH,
    },
    fetcher,
  );
}

export function refresh(config: EpicConfig, refreshToken: string, fetcher: typeof fetch = fetch) {
  return token(config, { grant_type: "refresh_token", refresh_token: refreshToken }, fetcher);
}

/** Display names for account ids, in batches of 50. */
export async function displayNames(
  accessToken: string,
  ids: string[],
  fetcher: typeof fetch = fetch,
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (let i = 0; i < ids.length; i += ACCOUNTS_BATCH) {
    const query = ids
      .slice(i, i + ACCOUNTS_BATCH)
      .map((id) => `accountId=${encodeURIComponent(id)}`)
      .join("&");
    const response = await fetcher(`${API}/epic/id/v2/accounts?${query}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error(`epic accounts ${response.status}`);
    const accounts = (await response.json()) as { accountId: string; displayName?: string }[];
    for (const account of accounts) {
      if (account.displayName) names.set(account.accountId, account.displayName);
    }
  }
  return names;
}

export interface EpicFriend {
  id: string;
  name: string;
}

export async function friendsOf(
  accessToken: string,
  accountId: string,
  fetcher: typeof fetch = fetch,
): Promise<EpicFriend[]> {
  const response = await fetcher(
    `${API}/epic/friends/v1/${encodeURIComponent(accountId)}/friends`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) throw new Error(`epic friends ${response.status}`);
  const data = (await response.json()) as
    | { friends?: { accountId: string }[] }
    | { accountId: string }[];
  const list = Array.isArray(data) ? data : (data.friends ?? []);
  const ids = list.map((friend) => friend.accountId).slice(0, MAX_FRIENDS);
  const names = await displayNames(accessToken, ids, fetcher);
  return ids
    .map((id) => ({ id, name: names.get(id) ?? "Joueur Epic" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// --- Sealing ---------------------------------------------------------------

const encoder = new TextEncoder();

function toBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  try {
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

/** An AES-GCM key derived from the session secret, for this purpose only. */
async function sealingKey(secret: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const raw = await crypto.subtle.sign("HMAC", base, encoder.encode("g-lib/epic-seal/v1"));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export interface EpicSession {
  refreshToken: string;
  accountId: string;
}

export async function seal(secret: string, session: EpicSession): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = encoder.encode(JSON.stringify([session.refreshToken, session.accountId]));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await sealingKey(secret), plain),
  );
  return `e1.${toBase64url(iv)}.${toBase64url(cipher)}`;
}

/** The session inside a sealed token, or null if it was tampered with. */
export async function unseal(secret: string, sealed: string): Promise<EpicSession | null> {
  const [version, ivText, cipherText, ...rest] = sealed.split(".");
  if (version !== "e1" || rest.length > 0) return null;
  const iv = fromBase64url(ivText ?? "");
  const cipher = fromBase64url(cipherText ?? "");
  if (!iv || iv.length !== 12 || !cipher) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      await sealingKey(secret),
      cipher,
    );
    const [refreshToken, accountId] = JSON.parse(new TextDecoder().decode(plain));
    if (typeof refreshToken !== "string" || typeof accountId !== "string") return null;
    return { refreshToken, accountId };
  } catch {
    return null;
  }
}
