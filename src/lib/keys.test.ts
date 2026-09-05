import { describe, expect, test } from "bun:test";
import { gridMotion, listStep, type GridShape } from "./keys";

const shape = (overrides: Partial<GridShape> = {}): GridShape => ({
  index: 10,
  count: 40,
  columns: 5,
  rows: 4,
  pendingG: false,
  ...overrides,
});

const press = (key: string, ctrl = false) => ({ key, ctrl });

describe("gridMotion", () => {
  test("hjkl et les flèches mènent aux mêmes cases", () => {
    for (const [vim, arrow] of [
      ["l", "ArrowRight"],
      ["h", "ArrowLeft"],
      ["j", "ArrowDown"],
      ["k", "ArrowUp"],
    ]) {
      expect(gridMotion(press(vim), shape())).toEqual(
        gridMotion(press(arrow), shape()),
      );
    }
  });

  test("j descend d'une ligne, l d'une case", () => {
    expect(gridMotion(press("j"), shape())).toEqual({ kind: "move", to: 15 });
    expect(gridMotion(press("l"), shape())).toEqual({ kind: "move", to: 11 });
  });

  test("gg remonte en tête, G descend en fin", () => {
    expect(gridMotion(press("g"), shape())).toEqual({ kind: "await-g" });
    expect(gridMotion(press("g"), shape({ pendingG: true }))).toEqual({
      kind: "move",
      to: 0,
    });
    expect(gridMotion(press("G"), shape())).toEqual({ kind: "move", to: 39 });
  });

  test("un g en attente est consommé par la touche suivante", () => {
    // Sinon un g isolé resterait a guetter, et changerait le sens d'une touche
    // frappee bien plus tard.
    expect(gridMotion(press("j"), shape({ pendingG: true }))).toBeNull();
  });

  test("Ctrl+D et Ctrl+U bougent d'une demi-page, Ctrl+F et Ctrl+B d'une page", () => {
    expect(gridMotion(press("d", true), shape())).toEqual({
      kind: "move",
      to: 20,
    });
    expect(gridMotion(press("u", true), shape())).toEqual({
      kind: "move",
      to: 0,
    });
    expect(gridMotion(press("f", true), shape())).toEqual({
      kind: "move",
      to: 30,
    });
    expect(gridMotion(press("b", true), shape())).toEqual({
      kind: "move",
      to: -10,
    });
  });

  test("0 et $ vont aux extrémités de la ligne courante", () => {
    expect(gridMotion(press("0"), shape({ index: 12 }))).toEqual({
      kind: "move",
      to: 10,
    });
    expect(gridMotion(press("$"), shape({ index: 12 }))).toEqual({
      kind: "move",
      to: 14,
    });
  });

  test("sans sélection, la première touche se pose sur la première carte", () => {
    expect(gridMotion(press("k"), shape({ index: -1 }))).toEqual({
      kind: "move",
      to: 0,
    });
  });

  test("une grille vide n'accepte aucun mouvement", () => {
    expect(gridMotion(press("j"), shape({ count: 0 }))).toBeNull();
  });

  test("ignore les touches sans usage ici", () => {
    expect(gridMotion(press("z"), shape())).toBeNull();
    expect(gridMotion(press("x", true), shape())).toBeNull();
  });
});

describe("listStep", () => {
  test("les flèches et les touches Ctrl d'un picker parcourent la liste", () => {
    expect(listStep(press("ArrowDown"))).toBe(1);
    expect(listStep(press("ArrowUp"))).toBe(-1);
    expect(listStep(press("j", true))).toBe(1);
    expect(listStep(press("n", true))).toBe(1);
    expect(listStep(press("k", true))).toBe(-1);
    expect(listStep(press("p", true))).toBe(-1);
  });

  test("les lettres nues reviennent au champ de saisie", () => {
    // Sinon taper « jak » dans la palette deplacerait le surlignage au lieu
    // d'ecrire.
    expect(listStep(press("j"))).toBe(0);
    expect(listStep(press("k"))).toBe(0);
  });
});
