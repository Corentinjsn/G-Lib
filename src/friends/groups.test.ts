import { describe, expect, test } from "bun:test";
import type { SteamFriend } from "../lib/api";
import { groupFriends } from "./groups";

const friend = (name: string, state: number, game: string | null = null): SteamFriend => ({
  id: name,
  name,
  avatar: null,
  state,
  game,
  profileUrl: null,
});

describe("groupFriends", () => {
  test("puts each friend in one group, sorted by name", () => {
    const groups = groupFriends([
      friend("Zoé", 1),
      friend("Ana", 0),
      friend("Bob", 1, "PEAK"),
      friend("Cid", 3),
    ]);
    expect(groups.playing.map((f) => f.name)).toEqual(["Bob"]);
    expect(groups.online.map((f) => f.name)).toEqual(["Cid", "Zoé"]);
    expect(groups.offline.map((f) => f.name)).toEqual(["Ana"]);
  });
});
