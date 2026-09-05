import { describe, expect, test } from "bun:test";
import { formatAgo, formatPlaytime, formatSize, normalize } from "./format";

describe("formatSize", () => {
  test("passe aux gigaoctets et perd la décimale au-delà de dix", () => {
    expect(formatSize(51_071_355_985)).toBe("48 Go");
    expect(formatSize(2_000_000_000)).toBe("1.9 Go");
    expect(formatSize(300_000_000)).toBe("286 Mo");
  });

  test("une taille absente ou nulle n'affiche rien", () => {
    expect(formatSize(null)).toBeNull();
    expect(formatSize(0)).toBeNull();
  });
});

describe("formatPlaytime", () => {
  test("minutes puis heures", () => {
    expect(formatPlaytime(1_800)).toBe("30 min");
    expect(formatPlaytime(9_000)).toBe("2.5 h");
    expect(formatPlaytime(180_000)).toBe("50 h");
  });

  test("moins d'une minute ne vaut pas la peine d'être affiché", () => {
    expect(formatPlaytime(30)).toBeNull();
    expect(formatPlaytime(null)).toBeNull();
  });
});

describe("formatAgo", () => {
  const now = () => Math.floor(Date.now() / 1000);

  test("les paliers se suivent", () => {
    expect(formatAgo(now())).toBe("à l'instant");
    expect(formatAgo(now() - 600)).toBe("il y a 10 min");
    expect(formatAgo(now() - 7_200)).toBe("il y a 2 h");
  });

  test("aucune date ne donne rien", () => {
    expect(formatAgo(null)).toBeNull();
    expect(formatAgo(0)).toBeNull();
  });
});

describe("normalize", () => {
  test("efface casse et accents, ce qui fait tout l'intérêt de la recherche", () => {
    expect(normalize("Pokémon")).toBe("pokemon");
    expect(normalize("ELDEN RING")).toBe("elden ring");
  });
});
