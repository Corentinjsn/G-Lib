import { describe, expect, test } from "bun:test";
import { arrivals, guessStore, looksLikeKey, normalizeKey } from "./activation";

describe("normalizeKey", () => {
  test("puts a pasted key in its printed form", () => {
    expect(normalizeKey("  abcde fghij\tklmno ")).toBe("ABCDE-FGHIJ-KLMNO");
    expect(normalizeKey("abcd–efgh—ijkl__mnop")).toBe("ABCD-EFGH-IJKL-MNOP");
    expect(normalizeKey("-AB!CD-")).toBe("ABCD");
  });
});

describe("guessStore", () => {
  test("recognises each store's groups", () => {
    expect(guessStore("AAAAA-BBBBB-CCCCC")).toBe("steam");
    expect(guessStore("AAAAA-BBBBB-CCCCC-DDDDD-EEEEE")).toBe("steam");
    expect(guessStore("AAAAA-BBBBB-CCCCC-DDDDD")).toBe("epic");
    expect(guessStore("AAAA-BBBB-CCCC-DDDD-EEEE")).toBe("ea");
    expect(guessStore("AAAA-BBBB-CCCC-DDDD")).toBe("ubisoft");
    expect(guessStore("AAA-BBBB-CCCC-DDDD")).toBe("ubisoft");
  });

  test("does not guess from an unknown shape", () => {
    expect(guessStore("AAAAAAAAAAAAAAA")).toBeNull();
    expect(guessStore("AA-BB")).toBeNull();
    expect(guessStore("")).toBeNull();
  });
});

describe("looksLikeKey", () => {
  test("wants at least fifteen letters and digits", () => {
    expect(looksLikeKey("AAAAA-BBBBB-CCCCC")).toBe(true);
    expect(looksLikeKey("AAAAA-BBBBB")).toBe(false);
  });
});

describe("arrivals", () => {
  test("lists only the games that were not there before", () => {
    const before = new Set(["steam:1", "epic:a"]);
    const now = [{ id: "steam:1" }, { id: "steam:2" }, { id: "epic:a" }];
    expect(arrivals(before, now)).toEqual([{ id: "steam:2" }]);
  });
});
