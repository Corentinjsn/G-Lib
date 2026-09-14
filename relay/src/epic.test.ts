import { describe, expect, test } from "bun:test";
import {
  authorizeUrl,
  exchangeCode,
  friendsOf,
  isValidState,
  refresh,
  seal,
  unseal,
  EPIC_RETURN_PATH,
} from "./epic";

const ORIGIN = "https://relay.example.workers.dev";
const CONFIG = { clientId: "client", clientSecret: "secret", deploymentId: "deployment" };

describe("authorizeUrl", () => {
  test("asks for the two scopes and comes back to the relay with the state", () => {
    const url = new URL(authorizeUrl("client", ORIGIN, "s".repeat(40)));
    expect(url.origin).toBe("https://www.epicgames.com");
    expect(url.searchParams.get("scope")).toBe("basic_profile friends_list");
    expect(url.searchParams.get("redirect_uri")).toBe(ORIGIN + EPIC_RETURN_PATH);
    expect(url.searchParams.get("state")).toBe("s".repeat(40));
  });
});

describe("isValidState", () => {
  test("wants a long random token and nothing else", () => {
    expect(isValidState("a".repeat(32))).toBe(true);
    expect(isValidState("short")).toBe(false);
    expect(isValidState("a".repeat(31) + "<")).toBe(false);
    expect(isValidState(null)).toBe(false);
  });
});

describe("tokens", () => {
  test("the code is exchanged with the client secret, never sent elsewhere", async () => {
    let seen: { url: string; auth: string | null; body: URLSearchParams } | null = null;
    const epic = (async (url: string, init?: RequestInit) => {
      seen = {
        url,
        auth: new Headers(init?.headers).get("Authorization"),
        body: new URLSearchParams(String(init?.body)),
      };
      return Response.json({ access_token: "a", refresh_token: "r", account_id: "id" });
    }) as unknown as typeof fetch;

    const tokens = await exchangeCode(CONFIG, "code", ORIGIN, epic);
    expect(tokens?.account_id).toBe("id");
    expect(seen!.url).toBe("https://api.epicgames.dev/epic/oauth/v2/token");
    expect(seen!.auth).toBe(`Basic ${btoa("client:secret")}`);
    expect(seen!.body.get("grant_type")).toBe("authorization_code");
    expect(seen!.body.get("deployment_id")).toBe("deployment");
  });

  test("a refused refresh means signed out, not an outage", async () => {
    const epic = (async () => new Response("", { status: 400 })) as unknown as typeof fetch;
    expect(await refresh(CONFIG, "old", epic)).toBeNull();
  });
});

describe("sealing", () => {
  test("round-trips, and is unreadable or refused with the wrong secret or a changed byte", async () => {
    const sealed = await seal("secret", { refreshToken: "refresh", accountId: "account" });
    expect(sealed).not.toContain("refresh");
    expect(await unseal("secret", sealed)).toEqual({ refreshToken: "refresh", accountId: "account" });
    expect(await unseal("other", sealed)).toBeNull();

    const [v, iv, cipher] = sealed.split(".");
    const flipped = cipher.slice(0, -2) + (cipher.at(-2) === "A" ? "B" : "A") + cipher.at(-1);
    expect(await unseal("secret", [v, iv, flipped].join("."))).toBeNull();
    expect(await unseal("secret", "garbage")).toBeNull();
  });

  test("two seals of the same session differ", async () => {
    const session = { refreshToken: "refresh", accountId: "account" };
    expect(await seal("secret", session)).not.toBe(await seal("secret", session));
  });
});

describe("friendsOf", () => {
  test("names friends and sorts them", async () => {
    const epic = (async (url: string) => {
      if (url.includes("/friends/v1/")) {
        return Response.json({ friends: [{ accountId: "b" }, { accountId: "a" }] });
      }
      return Response.json([
        { accountId: "a", displayName: "Zed" },
        { accountId: "b", displayName: "Amy" },
      ]);
    }) as unknown as typeof fetch;
    expect(await friendsOf("token", "me", epic)).toEqual([
      { id: "b", name: "Amy" },
      { id: "a", name: "Zed" },
    ]);
  });
});
