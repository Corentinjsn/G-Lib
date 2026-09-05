/**
 * The Gamlib mark, drawn rather than loaded.
 *
 * `public/GAMLIB.png` is one flat image, so its three cards cannot move
 * independently. Rebuilt as SVG they can: during an update they fan open and
 * closed while the G holds the centre, which is the difference between an
 * application that is working and one that looks stuck.
 *
 * Colours are the logo's own two, swapped for a dark background: the cards take
 * the cream that the G has in the original, and the G takes the ground colour —
 * exactly what the application icon does with its badge.
 */
export function LogoMark({
  className = "size-24",
  animated = false,
}: {
  className?: string;
  animated?: boolean;
}) {
  const skin = { fill: "#f6f4f0", stroke: "#0b0d12", strokeWidth: 3 };

  // The two behind are broad, squarer cards; the one in front is the narrow
  // stadium that carries the G. Getting that contrast right is what makes the
  // silhouette read as a fanned hand rather than three identical fingers.
  const back = { x: 47, y: 8, width: 56, height: 84, rx: 16 };
  const front = { x: 53, y: 4, width: 44, height: 90, rx: 22 };

  return (
    <svg
      viewBox="0 0 150 112"
      role="img"
      aria-label="Gamlib"
      className={className}
    >
      <title>Gamlib</title>
      {/* The pivot sits well below the cards: turning about a distant point
          spreads them sideways, which is what opens the fan instead of merely
          tilting three shapes on the spot. */}
      <g className={animated ? "logo-card-left" : undefined}>
        <rect {...back} {...skin} transform="rotate(-21 75 96)" />
      </g>
      <g className={animated ? "logo-card-right" : undefined}>
        <rect {...back} {...skin} transform="rotate(21 75 96)" />
      </g>

      <g className={animated ? "logo-card-front" : undefined}>
        <rect {...front} {...skin} />
        <text
          x="75"
          y="49"
          textAnchor="middle"
          dominantBaseline="central"
          fill="#0b0d12"
          fontSize="46"
          fontWeight="700"
          fontFamily='"League Spartan Variable", "Segoe UI", system-ui, sans-serif'
        >
          G
        </text>
      </g>
    </svg>
  );
}
