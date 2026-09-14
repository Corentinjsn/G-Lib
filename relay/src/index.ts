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
  /** Signs the app's tokens. A Cloudflare secret; rotating it signs everyone out. */
  SESSION_SECRET: string;
}

/** Friends change by the minute; the Steam API allows 100,000 calls a day. */
const FRIENDS_CACHE_SECONDS = 60;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

const page = (title: string) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><title>G-Lib</title><body style="font-family:system-ui;background:#0b0d12;color:#e6e9ef;display:grid;place-items:center;height:100vh;margin:0"><p>${title}</p>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );

function bearer(request: Request): string | null {
  const header = request.headers.get("Authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

async function signIn(request: Request, env: Env, origin: string) {
  // The app forwards the query string Steam put on the return URL.
  const body = (await request.text()).replace(/^\?/, "");
  const params = new URLSearchParams(body);
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

async function friends(request: Request, env: Env, ctx: ExecutionContext) {
  const token = bearer(request);
  const steamId = token ? await readToken(env.SESSION_SECRET, token) : null;
  if (!steamId) return json({ error: "signed_out" }, 401);

  // Keyed by account, never by token: the cache must not become a way to read
  // someone else's list.
  const cacheKey = new Request(`https://cache.g-lib/steam/friends/${steamId}`);
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return json(await hit.json());

  const result = await friendsOf(env.STEAM_API_KEY, steamId);
  const stored = new Response(JSON.stringify(result), {
    headers: { "Cache-Control": `max-age=${FRIENDS_CACHE_SECONDS}` },
  });
  ctx.waitUntil(cache.put(cacheKey, stored));
  return json(result);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const origin = url.origin;

    try {
      if (request.method === "GET" && url.pathname === "/steam/login") {
        return Response.redirect(loginUrl(origin), 302);
      }
      // The app stops the sign-in window before it gets here. A browser that
      // does arrive is told where to look.
      if (request.method === "GET" && url.pathname === "/steam/return") {
        return page("Connexion reçue. Vous pouvez revenir à G-Lib.");
      }
      if (request.method === "POST" && url.pathname === "/steam/session") {
        return await signIn(request, env, origin);
      }
      if (request.method === "GET" && url.pathname === "/steam/friends") {
        return await friends(request, env, ctx);
      }
      if (url.pathname === "/") {
        return page("G-Lib relay.");
      }
      return json({ error: "not_found" }, 404);
    } catch (cause) {
      console.error(cause);
      return json({ error: "steam_unavailable" }, 502);
    }
  },
};
