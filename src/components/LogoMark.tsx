/**
 * La marque de G-Lib, dessinee plutot que chargee.
 *
 * `public/GAMLIB.png` is one flat image, so its three cards cannot move
 * independently. Rebuilt as SVG they can: during an update they fan open and
 * closed while the G holds the centre, which is the difference between an
 * application that is working and one that looks stuck.
 *
 * Colours are the logo's own two, swapped for a dark background: the cards take
 * the cream that the G has in the original, and the G takes the ground colour —
 * exactly what the application icon does with its badge.
 *
 * The cards follow `currentColor`, so a caller sets the tone with a text colour
 * and the mark sits at the same weight as whatever surrounds it. The stroke and
 * the G stay on the ground colour: they are what keeps the three cards apart at
 * any size.
 */
export function LogoMark({
  className = "size-24",
  animated = false,
}: {
  className?: string;
  animated?: boolean;
}) {
  const skin = { fill: "currentColor", stroke: "#0b0d12", strokeWidth: 3 };

  // Three identical cards. Not "roughly identical": the numbers below are
  // measured off public/GAMLIB.png rather than judged by eye, because every
  // attempt at judging it by eye was wrong.
  //
  //   card       283 x 458 in the original -> 0.62, hence 56 x 90
  //   corners    the flat top spans 120 of the 283 -> radius 0.29 of the
  //              width, the same on all three. The middle card only looks
  //              rounder because the other two are tilted.
  //   the G      half the height of its card, three quarters of its width
  //
  // The fan is 13 degrees, not 21: the top edge of a side card drops 39
  // points over 168 in the original, which is the angle it is drawn at.
  const card = { x: 47, y: 8, width: 56, height: 90, rx: 16 };

  return (
    // The frame is tight on the drawing. The previous one left a quarter of
    // its width empty, so the mark came out a fifth smaller than the original
    // at the same box size -- the original fills its own frame at 95 %.
    <svg
      viewBox="14 4 122 105"
      role="img"
      aria-label="G-Lib"
      className={className}
    >
      <title>G-Lib</title>
      {/* The pivot sits far below the cards -- turning about a distant point
          spreads them sideways rather than tilting them on the spot. Its
          height is what sets how far they reach: 142 puts the outer tip of
          each card where the original has it. It has to match the
          transform-origin in index.css, which animates the same shapes. */}
      <g className={animated ? "logo-card-left" : undefined}>
        <rect {...card} {...skin} transform="rotate(-13 75 142)" />
      </g>
      <g className={animated ? "logo-card-right" : undefined}>
        <rect {...card} {...skin} transform="rotate(13 75 142)" />
      </g>

      <g className={animated ? "logo-card-front" : undefined}>
        <rect {...card} {...skin} />
        <text
          x="75"
          y="50"
          textAnchor="middle"
          dominantBaseline="central"
          fill="#0b0d12"
          fontSize="58"
          fontWeight="700"
          fontFamily='"League Spartan Variable", "Segoe UI", system-ui, sans-serif'
        >
          G
        </text>
      </g>
    </svg>
  );
}
