/**
 * Login-page scene: a Precon lorry delivering a ready-made precast sump. It
 * drives in once, then cruises while the town and water slide past. Pure
 * SVG + CSS (keyframes in globals.css, classes "ls-*"); no libraries. With
 * "reduce motion" on, it is a still picture.
 */

// One 400-wide tile of each background layer; two copies side by side scroll seamlessly.
const HILLS = "M0 112 C40 92 80 92 120 104 S200 118 240 100 S330 86 400 108 V124 H0Z";
const WAVE = "M0 146 C25 141 50 141 75 146 S125 151 150 146 S200 141 225 146 S275 151 300 146 S350 141 375 146 S400 148 400 146 V160 H0Z";

/** Houses with rooftop water tanks: the homes our sumps serve. [x, width, height] */
const HOUSES: [number, number, number][] = [
  [26, 34, 22],
  [96, 26, 30],
  [176, 40, 18],
  [262, 28, 26],
  [336, 34, 20],
];

function Wheel({ cx }: { cx: number }) {
  return (
    <g className="ls-wheel">
      <circle cx={cx} cy={113} r={11} fill="#0b1324" />
      <circle cx={cx} cy={113} r={6.2} fill="#cbd5e1" />
      <path d={`M${cx} 107.6 V118.4 M${cx - 5.4} 113 H${cx + 5.4}`} stroke="#64748b" strokeWidth={1.4} />
      <circle cx={cx} cy={113} r={2} fill="#334155" />
    </g>
  );
}

export function DeliveryScene({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 160"
      className={`ls-scene h-auto w-full ${className}`}
      role="img"
      aria-label="A Precon lorry delivering a precast concrete sump"
    >
      <defs>
        <radialGradient id="ls-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#7dd3fc" stopOpacity="0.55" />
          <stop offset="1" stopColor="#7dd3fc" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ls-concrete" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f1f4f8" />
          <stop offset="1" stopColor="#b9c2ce" />
        </linearGradient>
        <linearGradient id="ls-beam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fde68a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fde68a" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="ls-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0ea5e9" stopOpacity="0.55" />
          <stop offset="1" stopColor="#2557eb" stopOpacity="0.25" />
        </linearGradient>
      </defs>

      {/* Sky glow */}
      <circle cx="318" cy="42" r="46" fill="url(#ls-sun)" />
      <circle cx="318" cy="42" r="11" fill="#e0f2fe" opacity="0.5" />

      {/* Far hills (slow) */}
      <g className="ls-far">
        <path d={HILLS} fill="#ffffff" opacity="0.06" />
        <path d={HILLS} fill="#ffffff" opacity="0.06" transform="translate(400 0)" />
      </g>

      {/* Town with rooftop tanks (medium) */}
      <g className="ls-mid" fill="#ffffff" opacity="0.1">
        {[0, 400].map((dx) =>
          HOUSES.map(([x, w, h]) => (
            <g key={`${dx}-${x}`} transform={`translate(${dx} 0)`}>
              <rect x={x} y={124 - h} width={w} height={h} rx={1.5} />
              <rect x={x + w - 11} y={124 - h - 7} width={8} height={6} rx={1.5} />
            </g>
          )),
        )}
      </g>

      {/* Road */}
      <rect x="0" y="124" width="400" height="16" fill="#071a33" opacity="0.6" />
      <line x1="0" y1="124.5" x2="400" y2="124.5" stroke="#ffffff" strokeOpacity="0.18" />
      <line className="ls-dash" x1="-30" y1="132" x2="430" y2="132" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="1.6" strokeDasharray="16 14" />

      {/* Water */}
      <g className="ls-wave">
        <path d={WAVE} fill="url(#ls-water)" />
        <path d={WAVE} fill="url(#ls-water)" transform="translate(400 0)" />
      </g>

      {/* The lorry */}
      <g transform="translate(108 0)">
        <g className="ls-lorry">
          <ellipse cx="90" cy="125" rx="88" ry="2.6" fill="#000000" opacity="0.28" />

          <g className="ls-speed" stroke="#ffffff" strokeLinecap="round" strokeOpacity="0.5" strokeWidth="1.5">
            <line x1="-26" y1="68" x2="-8" y2="68" />
            <line x1="-34" y1="82" x2="-10" y2="82" />
            <line x1="-22" y1="96" x2="-6" y2="96" />
          </g>

          <g className="ls-bob">
            {/* Headlight beam */}
            <path className="ls-beam" d="M175 84 L218 76 L218 98 L175 90 Z" fill="url(#ls-beam)" />

            {/* Chassis and flatbed */}
            <rect x="4" y="100" width="168" height="6" rx="2" fill="#0b2545" />
            <rect x="0" y="94" width="122" height="7" rx="1.5" fill="#1e3aaf" />

            {/* Precast sump, strapped down */}
            <rect x="10" y="56" width="100" height="38" rx="2" fill="url(#ls-concrete)" />
            <rect x="6" y="50" width="108" height="7" rx="1.5" fill="#d6dce4" />
            <rect x="48" y="44" width="24" height="6.5" rx="1.5" fill="#a5aebb" />
            <rect x="56" y="41.5" width="8" height="2.6" rx="1" fill="#8892a2" />
            <path d="M43 57.5 V93.5 M77 57.5 V93.5" stroke="#a9b2bf" strokeWidth="0.8" />
            <path d="M24 50 V94 M96 50 V94" stroke="#0f4c81" strokeWidth="2" strokeOpacity="0.85" />
            <path d="M60 66.5 c-2.2 3 -3.4 4.8 -3.4 6.3 a3.4 3.4 0 0 0 6.8 0 c0 -1.5 -1.2 -3.3 -3.4 -6.3 Z" fill="#0ea5e9" />
            <text x="60" y="86" textAnchor="middle" fontSize="6.6" fontWeight="700" letterSpacing="2.2" fill="#5b6778">
              PRECON
            </text>

            {/* Cab */}
            <rect x="119" y="52" width="3" height="42" rx="1" fill="#94a3b8" />
            <path d="M124 100 V66 Q124 58 132 58 H156 Q162 58 165 64 L172 79 Q174 83 174 87 V100 Z" fill="#2557eb" />
            <path d="M146 64 H157 Q160 64 162 68 L167 79 H146 Z" fill="#d6ecff" opacity="0.95" />
            <path d="M144 63 V99" stroke="#1d45d8" strokeWidth="1" />
            <rect x="137" y="80" width="5" height="1.6" rx="0.8" fill="#bfd5fe" />
            <rect x="124" y="88" width="50" height="3" fill="#0ea5e9" />
            <rect x="170" y="94" width="7" height="7" rx="1.5" fill="#cbd5e1" />
            <rect x="171" y="83" width="4" height="5" rx="1" fill="#fde68a" />
          </g>

          <Wheel cx={32} />
          <Wheel cx={62} />
          <Wheel cx={152} />
        </g>
      </g>
    </svg>
  );
}
