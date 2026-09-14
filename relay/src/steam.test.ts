import { describe, expect, test } from "bun:test";
import {
  claimedSteamId,
  friendsOf,
  issueToken,
  loginUrl,
  readToken,
  RETURN_PATH,
  sortFriends,
  STEAM_OPENID,
  verifyWithSteam,
  type Friend,
} from "./steam";

const ORIGIN = "https://relay.example.workers.dev";
const ID = "76561190000000000";

function assertion(overrides: Record<string, string> = {}) {
  return new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "id_res",
    "openid.op_endpoint": STEAM_OPENID,
    "openid.claimed_id": `https://steamcommunity.com/openid/id/${ID}`,
    "openid.identity": `https://steamcommunity.com/openid/id/${ID}`,
    "openid.return_to": ORIGIN + RETURN_PATH,
    "openid.response_nonce": "2026-09-14T00:00:00Zabc",
    "openid.assoc_handle": "1234567890",
    "openid.signed": "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
    "openid.sig": "c2ln",
    ...overrides,
  });
}

describe("loginUrl", () => {
  test("sends Steam back to this relay", () => {
    const url = new URL(loginUrl(ORIGIN));
    expect(url.origin + url.pathname).toBe(STEAM_OPENID);
    expect(url.searchParams.get("openid.return_to")).toBe(ORIGIN + RETURN_PATH);
    expect(url.searchParams.get("openid.realm")).toBe(ORIGIN);
  });
});

describe("claimedSteamId", () => {
  test("reads the account from a well-formed assertion", () => {
    expect(claimedSteamId(assertion(), ORIGIN)).toBe(ID);
  });

  test("refuses an assertion made for another site", () => {
    expect(
      claimedSteamId(assertion({ "openid.return_to": "https://evil.example/steam/return" }), ORIGIN),
    ).toBeNull();
  });

  test("refuses another provider, a mismatched identity or a bad id", () => {
    expect(claimedSteamId(assertion({ "openid.op_endpoint": "https://evil.example/openid" }), ORIGIN)).toBeNull();
    expect(
      claimedSteamId(assertion({ "openid.identity": "https://steamcommunity.com/openid/id/76561190000000001" }), ORIGIN),
    ).toBeNull();
    const bad = "https://steamcommunity.com/openid/id/123";
    expect(claimedSteamId(assertion({ "openid.claimed_id": bad, "openid.identity": bad }), ORIGIN)).toBeNull();
    expect(claimedSteamId(assertion({ "openid.mode": "cancel" }), ORIGIN)).toBeNull();
  });
});

describe("verifyWithSteam", () => {
  test("asks Steam with check_authentication and trusts only is_valid:true", async () => {
    let sent: URLSearchParams | null = null;
    const steam = (answer: string) =>
      (async (_url: string, init?: RequestInit) => {
        sent = new URLSearchParams(String(init?.body));
        return new Response(answer);
      }) as unknown as typeof fetch;

    expect(await verifyWithSteam(assertion(), steam("ns:http://specs.openid.net/auth/2.0\nis_valid:true\n"))).toBe(true);
    expect(sent!.get("openid.mode")).toBe("check_authentication");
    expect(await verifyWithSteam(assertion(), steam("ns:http://specs.openid.net/auth/2.0\nis_valid:false\n"))).toBe(false);
  });
});

describe("tokens", () => {
  test("round-trip for the account they were issued to", async () => {
    const token = await issueToken("secret", ID);
    expect(await readToken("secret", token)).toBe(ID);
  });

  test("are refused when forged, re-targeted or expired", async () => {
    const token = await issueToken("secret", ID, 0);
    expect(await readToken("other-secret", await issueToken("secret", ID))).toBeNull();

    const [v, , expires, signature] = (await issueToken("secret", ID)).split(".");
    expect(await readToken("secret", [v, "76561190000000001", expires, signature].join("."))).toBeNull();

    // Issued at the epoch, so long expired.
    expect(await readToken("secret", token)).toBeNull();
    expect(await readToken("secret", "garbage")).toBeNull();
  });
});

describe("friendsOf", () => {
  test("says when the list is private", async () => {
    const steam = (async () => new Response("", { status: 401 })) as unknown as typeof fetch;
    expect(await friendsOf("key", ID, steam)).toEqual({ visibility: "private", friends: [] });
  });

  test("describes friends and puts those in game first", async () => {
    const steam = (async (url: string) => {
      if (url.includes("GetFriendList")) {
        return Response.json({ friendslist: { friends: [{ steamid: "1" }, { steamid: "2" }, { steamid: "3" }] } });
      }
      return Response.json({
        response: {
          players: [
            { steamid: "1", personaname: "Zoé", personastate: 0 },
            { steamid: "2", personaname: "Bob", personastate: 1 },
            { steamid: "3", personaname: "Ana", personastate: 1, gameextrainfo: "PEAK" },
          ],
        },
      });
    }) as unknown as typeof fetch;

    const result = await friendsOf("key", ID, steam);
    expect(result.visibility).toBe("public");
    expect(result.friends.map((friend) => friend.name)).toEqual(["Ana", "Bob", "Zoé"]);
    expect(result.friends[0].game).toBe("PEAK");
  });
});

describe("sortFriends", () => {
  test("in game, online, offline", () => {
    const friend = (name: string, state: number, game: string | null = null): Friend => ({
      id: name,
      name,
      avatar: null,
      state,
      game,
      profileUrl: null,
    });
    const sorted = sortFriends([friend("c", 0), friend("b", 3), friend("a", 1, "X")]);
    expect(sorted.map((f) => f.name)).toEqual(["a", "b", "c"]);
  });
});
