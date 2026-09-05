import { describe, expect, test } from "bun:test";
import {
  installCounts,
  paletteRank,
  searchPalette,
  selectGames,
  universe,
} from "./library";
import type { Collection, Game } from "../types";

function game(overrides: Partial<Game> & { id: string; name: string }): Game {
  return {
    platform: "steam",
    platformId: overrides.id.split(":")[1] ?? "0",
    installed: true,
    installDir: null,
    sizeOnDisk: null,
    lastPlayed: null,
    playtimeSeconds: null,
    needsUpdate: false,
    uninstall: null,
    favorite: false,
    hidden: false,
    coverPath: null,
    coverUrls: [],
    actionUri: "steam://",
    ...overrides,
  };
}

const eldenRing = game({ id: "steam:1", name: "Elden Ring", lastPlayed: 300 });
const fragpunk = game({
  id: "epic:2",
  name: "FragPunk",
  platform: "epic",
  installed: false,
});
const hades = game({
  id: "steam:3",
  name: "Hades",
  favorite: true,
  playtimeSeconds: 7200,
});
const junk = game({ id: "steam:4", name: "Vieux Truc", hidden: true });
const games = [eldenRing, fragpunk, hades, junk];

const soiree: Collection = {
  id: "c1",
  name: "Soirée",
  gameIds: ["steam:1", "epic:2"],
};

const base = {
  installFilter: "all" as const,
  selection: { kind: "all" } as const,
  collections: [soiree],
  query: "",
  sort: "name" as const,
};

describe("universe", () => {
  test("écarte les jeux masqués de toute vue ordinaire", () => {
    expect(universe(games, { kind: "all" }).map((g) => g.id)).not.toContain(
      "steam:4",
    );
  });

  test("la vue masqués ne montre qu'eux", () => {
    expect(universe(games, { kind: "hidden" }).map((g) => g.id)).toEqual([
      "steam:4",
    ]);
  });
});

describe("selectGames", () => {
  test("le filtre d'installation s'applique avant tout le reste", () => {
    const found = selectGames(games, { ...base, installFilter: "installed" });
    expect(found.map((g) => g.id)).toEqual(["steam:1", "steam:3"]);
  });

  test("un jeu masqué reste absent même s'il est dans une liste", () => {
    const withJunk: Collection = { ...soiree, gameIds: ["steam:4"] };
    const found = selectGames(games, {
      ...base,
      collections: [withJunk],
      selection: { kind: "collection", id: "c1" },
    });
    expect(found).toEqual([]);
  });

  test("la vue favoris ne garde que les favoris", () => {
    const found = selectGames(games, {
      ...base,
      selection: { kind: "favorites" },
    });
    expect(found.map((g) => g.id)).toEqual(["steam:3"]);
  });

  test("une liste ne garde que ses membres", () => {
    const found = selectGames(games, {
      ...base,
      selection: { kind: "collection", id: "c1" },
    });
    expect(found.map((g) => g.id)).toEqual(["steam:1", "epic:2"]);
  });

  test("une liste inconnue ne renvoie rien plutôt que tout", () => {
    const found = selectGames(games, {
      ...base,
      selection: { kind: "collection", id: "disparue" },
    });
    expect(found).toEqual([]);
  });

  test("la recherche ignore la casse et les accents", () => {
    expect(selectGames(games, { ...base, query: "ELDEN" })).toHaveLength(1);
    expect(selectGames(games, { ...base, query: "  hades  " })).toHaveLength(1);
  });

  test("les tris classent du plus grand au plus petit", () => {
    const played = selectGames(games, { ...base, sort: "lastPlayed" });
    expect(played[0].id).toBe("steam:1");

    const playtime = selectGames(games, { ...base, sort: "playtime" });
    expect(playtime[0].id).toBe("steam:3");
  });

  test("ne modifie pas la liste reçue", () => {
    const order = games.map((g) => g.id);
    selectGames(games, { ...base, sort: "playtime" });
    expect(games.map((g) => g.id)).toEqual(order);
  });
});

describe("installCounts", () => {
  test("ne compte jamais les jeux masqués", () => {
    expect(installCounts(games)).toEqual({
      installed: 2,
      all: 3,
      notInstalled: 1,
    });
  });
});

describe("paletteRank", () => {
  test("classe un début de titre devant un début de mot devant le reste", () => {
    expect(paletteRank("Elden Ring", "eld")).toBe(0);
    expect(paletteRank("Elden Ring", "ring")).toBe(1);
    expect(paletteRank("Elden Ring", "ing")).toBe(2);
  });

  test("ignore casse et accents", () => {
    expect(paletteRank("Pokémon Écarlate", "pokemon e")).toBe(0);
  });

  test("rend null quand rien ne correspond", () => {
    expect(paletteRank("Hades", "zzz")).toBeNull();
  });
});

describe("searchPalette", () => {
  test("ignore la sélection de la barre latérale mais pas les jeux masqués", () => {
    const names = searchPalette(games, "").map((entry) => entry.name);
    expect(names).toContain("FragPunk");
    expect(names).not.toContain("Vieux Truc");
  });

  test("place les jeux installés avant les autres", () => {
    const owned = game({
      id: "steam:5",
      name: "Ame",
      installed: false,
    });
    // "Ame" gagnerait sur le nom comme sur le rang ; l'installation prime.
    const ranked = searchPalette([owned, hades], "a");
    expect(ranked.map((entry) => entry.name)).toEqual(["Hades", "Ame"]);
  });

  test("propose les plus récemment joués quand le champ est vide", () => {
    const older = game({ id: "steam:6", name: "Ancien", lastPlayed: 100 });
    expect(searchPalette([older, eldenRing], "")[0].name).toBe("Elden Ring");
  });
});
