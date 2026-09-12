/**
 * The G-Lib mark.
 *
 * The outline below is `public/GAMLIB.svg` verbatim -- the traced original,
 * not a reconstruction. Three attempts at redrawing it by hand each came close
 * and stayed wrong; the drawing is the drawing, so it is used as such.
 *
 * One consequence, accepted: it is a single path, so the three cards can no
 * longer fan open and closed during an update. The mark still breathes and
 * still carries its halo, which is what says the application is working.
 *
 * The G is a hole rather than a shape, so it shows whatever sits behind the
 * mark. The cards follow `currentColor`, so a caller sets the tone with a text
 * colour and the mark weighs the same as what surrounds it.
 */
export function LogoMark({
  className = "size-24",
  animated = false,
}: {
  className?: string;
  animated?: boolean;
}) {
  return (
    <svg
      // Frame tight on the drawing, which fills x 14..605, y 0..488 of the
      // file's 623 x 519.
      viewBox="10 -4 600 497"
      role="img"
      aria-label="G-Lib"
      className={`${className} ${animated ? "logo-breathe" : ""}`}
    >
      <title>G-Lib</title>
      {/* The transform is the traced file's own: tenths of a unit, Y flipped. */}
      <g
        transform="translate(0,519) scale(0.1,-0.1)"
        fill="currentColor"
        stroke="none"
      >
        <path
          d="
  M2525 5183 c-68 -10 -188 -45 -263 -76 -213 -91 -398 -279 -488 -500 -68
  -167 -64 -72 -64 -1715 0 -1449 1 -1489 20 -1570 87 -364 375 -636 749
  -707 l76 -15 -105 5 c-409 17 -763 312 -860 717 -19 81 -20 120 -20 1573
  0 1453 1 1492 20 1573 48 201 167 390 323 514 35 27 43 38 30 38 -22 0
  -1001 -174 -1078 -191 -80 -18 -194 -67 -275 -117 -102 -63 -241 -205
  -305 -313 -82 -140 -135 -327 -135 -482 0 -41 476 -2741 510 -2894 77
  -342 388 -630 748 -693 82 -14 228 -14 317 0 212 34 922 163 992 180 99
  24 197 66 188 80 -4 7 49 10 158 10 160 0 166 -1 228 -29 110 -50 190
  -68 723 -166 574 -105 626 -110 793 -76 98 20 217 68 311 123 87 51 259
  228 310 319 84 151 86 159 359 1629 252 1357 257 1388 257 1515 0 258
  -90 473 -273 656 -145 145 -286 217 -517 264 -159 32 -988 184 -991 182
  -1 -1 29 -28 67 -59 128 -107 241 -287 292 -463 l23 -80 0 -1520 0 -1520
  -23 -80 c-86 -301 -315 -544 -607 -645 -76 -26 -213 -50 -279 -49 l-51 1
  72 13 c352 64 620 301 739 655 l29 85 0 1540 0 1540 -29 85 c-90 268
  -253 458 -491 571 -201 96 -176 93 -855 95 -327 1 -608 0 -625 -3z m825
  -1088 c160 -26 310 -84 430 -165 75 -51 212 -180 208 -196 -4 -16 -309
  -354 -319 -354 -5 0 -22 20 -38 44 -67 97 -187 180 -308 211 -90 23 -225
  19 -305 -9 -179 -63 -339 -264 -382 -478 -20 -99 -20 -269 0 -361 52
  -240 243 -450 443 -487 276 -51 547 116 568 352 l6 58 -252 0 -251 0 0
  195 0 195 510 0 510 0 0 -228 c0 -256 -9 -312 -74 -462 -129 -299 -409
  -508 -764 -570 -139 -24 -381 -7 -509 36 -291 98 -545 343 -663 639 -153
  381 -98 849 137 1160 219 290 496 431 848 434 61 1 153 -6 205 -14z
"
        />
      </g>
    </svg>
  );
}
