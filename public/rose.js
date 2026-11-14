// Shared rendering helpers for the creator and viewer pages.

const BACKGROUNDS = {
  blush:    { label: 'Blush',    css: 'linear-gradient(160deg, #fff1f2 0%, #fbcfe8 100%)', dark: false },
  midnight: { label: 'Midnight', css: 'radial-gradient(circle at 50% 30%, #283552 0%, #0b1020 75%)', dark: true },
  sunset:   { label: 'Sunset',   css: 'linear-gradient(160deg, #fff7ed 0%, #fed7aa 50%, #fda4af 100%)', dark: false },
  lavender: { label: 'Lavender', css: 'linear-gradient(160deg, #f5f3ff 0%, #c4b5fd 100%)', dark: false },
  mint:     { label: 'Mint',     css: 'linear-gradient(160deg, #f0fdf4 0%, #a7f3d0 100%)', dark: false },
  cream:    { label: 'Cream',    css: '#faf6ef', dark: false },
};

const ROSE_COLORS = [
  { name: 'Red', hex: '#c8102e' },
  { name: 'Pink', hex: '#f472b6' },
  { name: 'White', hex: '#f5efe6' },
  { name: 'Yellow', hex: '#facc15' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Lavender', hex: '#a78bfa' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Black', hex: '#2a1520' },
];

function hexToHsl(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

function shade(hex, dl) {
  const [h, s, l] = hexToHsl(hex);
  const nl = Math.max(4, Math.min(96, l + dl));
  return `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${nl.toFixed(1)}%)`;
}

function isDarkHex(hex) {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] < 0.35;
}

function resolveBackground(bg) {
  if (BACKGROUNDS[bg]) return BACKGROUNDS[bg];
  return { css: bg, dark: isDarkHex(bg) };
}

// Builds the bloom from rings of petals: big pale petals outside, smaller darker ones
// toward a spiral centre, squashed vertically for a 3/4 view.
function rosette(c, u) {
  const CX = 100, CY = 86, SQUASH = 0.74;
  const rings = [
    { n: 7, W: 58, L: 64, r: 10, dy: 14, off: 0,  g: [c.l1, c.d1] },
    { n: 6, W: 48, L: 50, r: 7,  dy: 6,  off: 26, g: [c.l1, c.d2] },
    { n: 5, W: 38, L: 38, r: 5,  dy: -1, off: 8,  g: [c.base, c.d2] },
    { n: 4, W: 28, L: 26, r: 3,  dy: -7, off: 50, g: [c.d1, c.d3] },
  ];
  const jitter = (i, k) => Math.sin(i * 12.9898 + k * 78.233) * 0.5; // deterministic -0.5..0.5
  const petal = (W, L) =>
    `M0 0 C ${-0.62 * W} ${-0.12 * L}, ${-0.7 * W} ${-0.78 * L}, ${-0.32 * W} ${-0.98 * L} ` +
    `C ${-0.14 * W} ${-1.06 * L}, ${0.02 * W} ${-0.92 * L}, ${0.16 * W} ${-0.99 * L} ` +
    `C ${0.46 * W} ${-1.08 * L}, ${0.72 * W} ${-0.72 * L}, ${0.6 * W} ${-0.2 * L} ` +
    `C ${0.52 * W} ${-0.04 * L}, ${0.2 * W} 0, 0 0 Z`;
  const lip = (W, L) =>
    `M${-0.42 * W} ${-0.84 * L} C ${-0.22 * W} ${-0.97 * L}, ${0.04 * W} ${-0.86 * L}, ${0.16 * W} ${-0.92 * L} ` +
    `C ${0.34 * W} ${-0.99 * L}, ${0.52 * W} ${-0.84 * L}, ${0.54 * W} ${-0.7 * L}`;
  const crease = (W, L) => `M${0.04 * W} ${-0.12 * L} C ${0.1 * W} ${-0.4 * L}, ${-0.04 * W} ${-0.58 * L}, ${0.02 * W} ${-0.74 * L}`;

  let defs = '', out = '';
  rings.forEach((ring, ri) => {
    defs += `<linearGradient id="r${ri}${u}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${ring.g[0]}"/><stop offset="1" stop-color="${ring.g[1]}"/></linearGradient>`;
    for (let i = 0; i < ring.n; i++) {
      const a = ring.off + (360 / ring.n) * i + jitter(i, ri) * 10;
      const s = 1 + jitter(i + 3, ri) * 0.12;
      const W = ring.W * s, L = ring.L * s;
      out += `<g transform="translate(${CX} ${CY + ring.dy}) scale(1 ${SQUASH}) rotate(${a.toFixed(1)}) translate(0 ${-ring.r})">
        <path d="${petal(W, L)}" fill="url(#r${ri}${u})" stroke="${c.line}" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
        <path d="${lip(W, L)}" fill="none" stroke="${c.l2}" stroke-width="2.6" stroke-linecap="round" opacity="0.85" vector-effect="non-scaling-stroke"/>
        <path d="${crease(W, L)}" fill="none" stroke="${c.d2}" stroke-width="1.2" stroke-linecap="round" opacity="0.4" vector-effect="non-scaling-stroke"/>
      </g>`;
    }
  });
  // spiral centre
  const cy = CY - 9;
  out += `<path d="M${CX - 15} ${cy + 3} C ${CX - 16} ${cy - 12}, ${CX + 4} ${cy - 16}, ${CX + 12} ${cy - 6} C ${CX + 3} ${cy - 10}, ${CX - 8} ${cy - 7}, ${CX - 8} ${cy + 5} Z"
      fill="${c.base}" stroke="${c.line}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M${CX + 15} ${cy + 1} C ${CX + 16} ${cy + 12}, ${CX - 2} ${cy + 14}, ${CX - 11} ${cy + 6} C ${CX - 2} ${cy + 8}, ${CX + 8} ${cy + 6}, ${CX + 8} ${cy - 5} Z"
      fill="${c.d1}" stroke="${c.line}" stroke-width="1.6" stroke-linejoin="round"/>
    <ellipse cx="${CX}" cy="${cy}" rx="8" ry="6.5" fill="${c.d3}" stroke="${c.line}" stroke-width="1.4"/>
    <path d="M${CX - 1} ${cy} C ${CX - 1} ${cy - 3}, ${CX + 4} ${cy - 3}, ${CX + 4} ${cy} C ${CX + 4} ${cy + 4}, ${CX - 5} ${cy + 4}, ${CX - 5} ${cy - 1} C ${CX - 5} ${cy - 5}, ${CX + 5} ${cy - 6}, ${CX + 7} ${cy - 1}"
      fill="none" stroke="${c.l1}" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="${CX + 26}" cy="${CY + 30}" r="3.2" fill="#fff" opacity="0.55"/>
    <circle cx="${CX + 25}" cy="${CY + 29}" r="1.1" fill="#fff"/>`;
  return `<defs>${defs}</defs>${out}`;
}

function roseSVG(color) {
  const u = Math.random().toString(36).slice(2, 8); // unique gradient ids per render
  const c = {
    base: color,
    l1: shade(color, 10),
    l2: shade(color, 22),
    d1: shade(color, -10),
    d2: shade(color, -22),
    d3: shade(color, -32),
    line: shade(color, -42),
  };
  const leafLine = '#1f4d1f';

  return `
<svg class="rose" viewBox="0 0 200 320" xmlns="http://www.w3.org/2000/svg" aria-label="A rose">
  <defs>
    <linearGradient id="lf${u}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6cc04a"/><stop offset="1" stop-color="#2f8a3a"/>
    </linearGradient>
    <linearGradient id="st${u}" x1="0" x2="1">
      <stop offset="0" stop-color="#2f6b2f"/><stop offset="1" stop-color="#4f9a3f"/>
    </linearGradient>
  </defs>

  <g class="stem">
    <path d="M100 150 C 96 196, 108 244, 98 312" fill="none" stroke="${leafLine}" stroke-width="8" stroke-linecap="round"/>
    <path d="M100 150 C 96 196, 108 244, 98 312" fill="none" stroke="url(#st${u})" stroke-width="5" stroke-linecap="round"/>
    <path d="M103 214 C 120 196, 152 194, 166 204 C 152 224, 122 230, 103 214 Z" fill="url(#lf${u})" stroke="${leafLine}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M104 213 C 124 208, 146 204, 164 204 M122 209 l 6 -8 M136 206 l 6 -7 M128 210 l 6 7 M142 207 l 6 6" fill="none" stroke="${leafLine}" stroke-width="1.1" stroke-linecap="round"/>
    <path d="M99 258 C 82 238, 50 236, 36 246 C 50 266, 80 272, 99 258 Z" fill="url(#lf${u})" stroke="${leafLine}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M98 257 C 78 252, 56 248, 38 246 M80 253 l -6 -8 M66 250 l -6 -7 M74 254 l -6 7 M60 251 l -6 6" fill="none" stroke="${leafLine}" stroke-width="1.1" stroke-linecap="round"/>
    <path d="M104 178 l 9 -5 l -6 9 Z M96 234 l -9 -4 l 6 8 Z" fill="#2f6b2f" stroke="${leafLine}" stroke-width="1"/>
  </g>

  <g class="bloom">
    <!-- leaves tucked under the bloom -->
    <path d="M80 138 C 60 128, 32 132, 18 148 C 38 162, 66 160, 84 148 Z" fill="url(#lf${u})" stroke="${leafLine}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M82 143 C 62 145, 40 147, 20 148" fill="none" stroke="${leafLine}" stroke-width="1.1"/>
    <path d="M120 138 C 140 128, 168 132, 182 148 C 162 162, 134 160, 116 148 Z" fill="url(#lf${u})" stroke="${leafLine}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M118 143 C 138 145, 160 147, 180 148" fill="none" stroke="${leafLine}" stroke-width="1.1"/>
    ${rosette(c, u)}
  </g>
</svg>`;
}

function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Calls onTick(remainingMs) every second; calls onExpire when it hits zero.
function startCountdown(remainingMs, onTick, onExpire) {
  const end = performance.now() + remainingMs;
  const tick = () => {
    const left = end - performance.now();
    if (left <= 0) { onTick(0); clearInterval(timer); onExpire && onExpire(); return; }
    onTick(left);
  };
  const timer = setInterval(tick, 1000);
  tick();
  return () => clearInterval(timer);
}
