import {
  authorizeUrl,
  exchangeCode,
  friendsOf as epicFriendsOf,
  isValidState,
  refresh,
  seal,
  unseal,
  displayNames,
  type EpicConfig,
} from "./epic";
import {
  claimedSteamId,
  friendsOf,
  issueToken,
  loginUrl,
  readToken,
  summaries,
  toFriend,
  verifyWithSteam,
} from "./steam";

export interface Env {
  /** The Steam Web API key. A Cloudflare secret, never in the repository. */
  STEAM_API_KEY: string;
  /** Signs Steam tokens and seals Epic sessions. Rotating it signs everyone out. */
  SESSION_SECRET: string;
  /** Epic Account Services client. Cloudflare secrets, like the rest. */
  EPIC_CLIENT_ID?: string;
  EPIC_CLIENT_SECRET?: string;
  EPIC_DEPLOYMENT_ID?: string;
  /** Per-address request limit, declared in wrangler.toml. */
  LIMITER?: RateLimit;
}

/** Friends change by the minute; the Steam API allows 100,000 calls a day. */
const FRIENDS_CACHE_SECONDS = 60;

/** Nothing the app sends comes close: an OpenID query string is ~1 KB. */
const MAX_BODY_BYTES = 8 * 1024;

/**
 * Headers on every response. The relay is called by the app, not by pages:
 * no CORS headers are ever sent, so no website can read what it answers.
 */
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=31536000",
  "Cache-Control": "no-store",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });

const page = (text: string) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><title>G-Lib</title><body style="font-family:system-ui;background:#0b0d12;color:#e6e9ef;display:grid;place-items:center;height:100vh;margin:0"><p>${text}</p>`,
    {
      headers: {
        ...SECURITY_HEADERS,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      },
    },
  );

const redirect = (location: string) =>
  new Response(null, { status: 302, headers: { ...SECURITY_HEADERS, Location: location } });

function bearer(request: Request): string | null {
  const header = request.headers.get("Authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

/** The request body, or null past the size any legitimate call has. */
async function smallBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("Content-Length") ?? "0");
  if (declared > MAX_BODY_BYTES) return null;
  const text = await request.text();
  return text.length > MAX_BODY_BYTES ? null : text;
}

function epicConfig(env: Env): EpicConfig | null {
  if (!env.EPIC_CLIENT_ID || !env.EPIC_CLIENT_SECRET || !env.EPIC_DEPLOYMENT_ID) return null;
  return {
    clientId: env.EPIC_CLIENT_ID,
    clientSecret: env.EPIC_CLIENT_SECRET,
    deploymentId: env.EPIC_DEPLOYMENT_ID,
  };
}

// --- Steam ------------------------------------------------------------------

async function steamSession(request: Request, env: Env, origin: string) {
  // The app forwards the query string Steam put on the return URL.
  const body = await smallBody(request);
  if (body === null) return json({ error: "too_large" }, 413);
  const params = new URLSearchParams(body.replace(/^\?/, ""));
  const steamId = claimedSteamId(params, origin);
  if (!steamId || !(await verifyWithSteam(params))) {
    return json({ error: "invalid_assertion" }, 401);
  }

  const [me] = await summaries(env.STEAM_API_KEY, [steamId]);
  const profile = me ? toFriend(me) : null;
  return json({
    token: await issueToken(env.SESSION_SECRET, steamId),
    profile: {
      id: steamId,
      name: profile?.name ?? steamId,
      avatar: profile?.avatar ?? null,
    },
  });
}

async function steamFriends(request: Request, env: Env, ctx: ExecutionContext) {
  const token = bearer(request);
  const steamId = token ? await readToken(env.SESSION_SECRET, token) : null;
  if (!steamId) return json({ error: "signed_out" }, 401);

  // Keyed by account, never by token: the cache must not become a way to read
  // someone else's list.
  const cacheKey = new Request(`https://cache.g-lib/steam/friends/${steamId}`);
  const hit = await caches.default.match(cacheKey);
  if (hit) return json(await hit.json());

  const result = await friendsOf(env.STEAM_API_KEY, steamId);
  const stored = new Response(JSON.stringify(result), {
    headers: { "Cache-Control": `max-age=${FRIENDS_CACHE_SECONDS}` },
  });
  ctx.waitUntil(caches.default.put(cacheKey, stored));
  return json(result);
}

// --- Epic -------------------------------------------------------------------

async function epicSession(request: Request, env: Env, config: EpicConfig, origin: string) {
  const body = await smallBody(request);
  if (body === null) return json({ error: "too_large" }, 413);
  const code = new URLSearchParams(body).get("code") ?? "";
  if (!/^[A-Za-z0-9_-]{8,256}$/.test(code)) return json({ error: "invalid_code" }, 400);

  const tokens = await exchangeCode(config, code, origin);
  if (!tokens) return json({ error: "invalid_code" }, 401);

  const names = await displayNames(tokens.access_token, [tokens.account_id]);
  return json({
    token: await seal(env.SESSION_SECRET, {
      refreshToken: tokens.refresh_token,
      accountId: tokens.account_id,
    }),
    profile: {
      id: tokens.account_id,
      name: names.get(tokens.account_id) ?? "Compte Epic",
      avatar: null,
    },
  });
}

async function epicFriends(request: Request, env: Env, config: EpicConfig) {
  const sealed = bearer(request);
  const session = sealed ? await unseal(env.SESSION_SECRET, sealed) : null;
  if (!session) return json({ error: "signed_out" }, 401);

  const tokens = await refresh(config, session.refreshToken);
  if (!tokens || tokens.account_id !== session.accountId) {
    return json({ error: "signed_out" }, 401);
  }

  const friends = await epicFriendsOf(tokens.access_token, tokens.account_id);
  // Epic hands out a new refresh token each time; the app keeps the new seal.
  return json({
    friends,
    token: await seal(env.SESSION_SECRET, {
      refreshToken: tokens.refresh_token,
      accountId: tokens.account_id,
    }),
  });
}

// --- Routing ----------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const origin = url.origin;
    const route = `${request.method} ${url.pathname}`;

    // One budget per address for everything but the landing page: enough for
    // a sign-in and a friends window, far too little to hammer Steam or Epic
    // with this relay's credentials.
    if (url.pathname !== "/" && env.LIMITER) {
      const address = request.headers.get("CF-Connecting-IP") ?? "unknown";
      const { success } = await env.LIMITER.limit({ key: address });
      if (!success) return json({ error: "rate_limited" }, 429);
    }

    try {
      switch (route) {
        case "GET /":
          return page("G-Lib relay.");

        case "GET /steam/login":
          return redirect(loginUrl(origin));
        // The app stops its sign-in window before either return page loads.
        case "GET /steam/return":
        case "GET /epic/return":
          return page("Connexion reçue. Vous pouvez revenir à G-Lib.");
        case "POST /steam/session":
          return await steamSession(request, env, origin);
        case "GET /steam/friends":
          return await steamFriends(request, env, ctx);
      }

      if (url.pathname.startsWith("/epic/")) {
        const config = epicConfig(env);
        if (!config) return json({ error: "epic_not_configured" }, 503);
        switch (route) {
          case "GET /epic/login": {
            const state = url.searchParams.get("state");
            if (!isValidState(state)) return json({ error: "invalid_state" }, 400);
            return redirect(authorizeUrl(config.clientId, origin, state));
          }
          case "POST /epic/session":
            return await epicSession(request, env, config, origin);
          case "GET /epic/friends":
            return await epicFriends(request, env, config);
        }
      }

      return json({ error: "not_found" }, 404);
    } catch (cause) {
      // Only the message: a thrown fetch error could carry a URL, and Steam's
      // URLs carry the key.
      console.error(route, cause instanceof Error ? cause.message.slice(0, 80) : "error");
      return json({ error: "upstream_unavailable" }, 502);
    }
  },
};
