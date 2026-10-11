/* GhostTab — toy-ghost character renderer.
   Code-native stand-ins for 3D vinyl-toy renders: soft radial shading,
   pastel backdrops, whimsical accessories. Swap for real renders later
   by replacing ghostSVG() output with <img> tags of the same aspect. */

let _uid = 0;

const shade = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
};

/* Ghost body: dome head + wavy hem, centered at x=144 in a 288x368 frame */
const BODY = 'M59 176 C59 104 98 70 144 70 C190 70 229 104 229 176 L229 292 ' +
  'C229 312 214 320 205 304 C196 290 184 292 178 306 C171 322 156 324 150 308 ' +
  'C144 292 130 292 124 308 C117 324 101 322 96 306 C90 290 78 290 72 304 ' +
  'C64 320 59 310 59 292 Z';

function face(v, id) {
  const ink = v.dark ? '#f4f4f2' : '#232326';
  const eyeY = 182;
  let s = '';
  if (v.eyes === 'sun') {
    s += `<g><rect x="96" y="${eyeY - 16}" width="42" height="30" rx="13" fill="#1d1e22"/>
      <rect x="150" y="${eyeY - 16}" width="42" height="30" rx="13" fill="#1d1e22"/>
      <rect x="136" y="${eyeY - 8}" width="16" height="5" rx="2.5" fill="#1d1e22"/>
      <rect x="104" y="${eyeY - 11}" width="12" height="5" rx="2.5" fill="#ffffff" opacity=".35"/>
      <rect x="158" y="${eyeY - 11}" width="12" height="5" rx="2.5" fill="#ffffff" opacity=".35"/></g>`;
  } else {
    s += `<ellipse cx="121" cy="${eyeY}" rx="7.5" ry="10" fill="${ink}"/>
      <ellipse cx="167" cy="${eyeY}" rx="7.5" ry="10" fill="${ink}"/>
      <circle cx="123.5" cy="${eyeY - 4}" r="2.4" fill="#fff" opacity=".9"/>
      <circle cx="169.5" cy="${eyeY - 4}" r="2.4" fill="#fff" opacity=".9"/>`;
  }
  if (v.eyes === 'round') {
    const c = v.frame || '#c9a27a';
    s += `<g fill="none" stroke="${c}" stroke-width="4.5"><circle cx="121" cy="${eyeY}" r="18"/><circle cx="167" cy="${eyeY}" r="18"/>
      <path d="M139 ${eyeY - 2} Q144 ${eyeY - 7} 149 ${eyeY - 2}"/></g>`;
  }
  if (!v.mask) {
    s += `<ellipse cx="104" cy="208" rx="11" ry="6" fill="#f2a7a0" opacity="${v.dark ? .35 : .55}"/>
      <ellipse cx="184" cy="208" rx="11" ry="6" fill="#f2a7a0" opacity="${v.dark ? .35 : .55}"/>`;
    if (v.mouth === 'o') s += `<ellipse cx="144" cy="214" rx="6" ry="7.5" fill="${ink}"/>`;
    else if (v.mouth === 'gum') s += `<circle cx="146" cy="218" r="17" fill="url(#gum${id})"/><circle cx="140" cy="211" r="4" fill="#fff" opacity=".7"/>`;
    else s += `<path d="M134 210 Q144 220 154 210" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`;
  } else {
    s += `<path d="M88 196 L72 186 M200 196 L216 186" stroke="#e9e6df" stroke-width="3"/>
      <rect x="96" y="194" width="96" height="44" rx="16" fill="url(#mask${id})"/>
      <path d="M104 206 H184 M104 216 H184 M104 226 H184" stroke="#d7d3cb" stroke-width="2"/>`;
  }
  return s;
}

function hat(v, id) {
  const c = v.hatColor, d = shade(c, -28), l = shade(c, 22);
  switch (v.hat) {
    case 'bucket':
      return `<path d="M88 100 C90 52 198 52 200 100 Z" fill="url(#hat${id})"/>
        <rect x="88" y="88" width="112" height="14" fill="${v.band}"/>
        <ellipse cx="144" cy="104" rx="104" ry="20" fill="${d}"/>
        <ellipse cx="144" cy="100" rx="98" ry="16" fill="${c}"/>
        <rect x="88" y="86" width="112" height="14" fill="${v.band}"/>
        <path d="M150 88 l6 6 l-6 6 l-6 -6 z" fill="#fff" opacity=".85"/>`;
    case 'cap':
      return `<path d="M76 118 C74 52 214 52 212 118 Z" fill="url(#hat${id})"/>
        <path d="M150 112 C190 106 236 112 252 124 C236 134 186 130 150 124 Z" fill="${d}"/>
        <circle cx="144" cy="62" r="6" fill="${d}"/>
        <circle cx="144" cy="92" r="13" fill="${v.band}"/><circle cx="144" cy="92" r="6" fill="${shade(v.band, -30)}"/>`;
    case 'beanie':
      return `<path d="M70 124 C66 46 222 46 218 124 Z" fill="url(#hat${id})"/>
        <rect x="64" y="106" width="160" height="30" rx="14" fill="${v.band}"/>
        ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => `<rect x="${72 + i * 15}" y="110" width="5" height="22" rx="2.5" fill="${shade(v.band, -18)}"/>`).join('')}
        <circle cx="144" cy="46" r="20" fill="${l}"/><circle cx="138" cy="40" r="7" fill="#fff" opacity=".35"/>`;
    case 'beret':
      return `<ellipse cx="136" cy="86" rx="82" ry="30" fill="url(#hat${id})"/>
        <path d="M134 56 q4 -14 12 -12" stroke="${d}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    case 'propeller':
      return `<path d="M86 112 C84 58 204 58 202 112 Z" fill="url(#hat${id})"/>
        <path d="M86 112 C84 58 144 58 144 62 L144 112 Z" fill="${v.band}" opacity=".9"/>
        <rect x="141" y="36" width="6" height="26" fill="#555"/>
        <ellipse cx="116" cy="36" rx="30" ry="6" fill="${v.band}"/><ellipse cx="172" cy="36" rx="30" ry="6" fill="${c}"/>
        <circle cx="144" cy="36" r="6" fill="#333"/>`;
    case 'phones':
      return `<path d="M62 176 C62 70 226 70 226 176" fill="none" stroke="${c}" stroke-width="12" stroke-linecap="round"/>
        <rect x="44" y="160" width="30" height="52" rx="14" fill="url(#hat${id})"/>
        <rect x="214" y="160" width="30" height="52" rx="14" fill="url(#hat${id})"/>`;
    case 'hood':
      return `<path d="M52 196 C46 70 242 70 236 196 L226 196 C230 96 58 96 62 196 Z" fill="url(#hat${id})"/>`;
    default: return '';
  }
}

function neck(v) {
  if (v.neck === 'scarf') {
    const c = v.neckColor, d = shade(c, -26);
    return `<path d="M64 244 C100 262 188 262 224 244 L224 266 C188 284 100 284 64 266 Z" fill="${c}"/>
      <path d="M170 262 L196 262 L200 318 L176 320 Z" fill="${d}"/>
      ${[0, 1, 2].map(i => `<rect x="${178 + i * 7}" y="318" width="4" height="10" rx="2" fill="${d}"/>`).join('')}`;
  }
  if (v.neck === 'badge') {
    return `<path d="M100 236 Q144 270 188 236" fill="none" stroke="#c9a96a" stroke-width="3"/>
      <circle cx="144" cy="262" r="16" fill="#e6c77d"/><circle cx="144" cy="262" r="11" fill="none" stroke="#b8954c" stroke-width="2"/>
      <text x="144" y="267" text-anchor="middle" font-family="Inter,Arial" font-size="12" font-weight="700" fill="#8a6a2c">402</text>`;
  }
  if (v.neck === 'tie') {
    return `<path d="M136 236 L152 236 L148 246 L156 290 L144 302 L132 290 L140 246 Z" fill="${v.neckColor}"/>`;
  }
  return '';
}

/* v: { bg, body, hat, hatColor, band, eyes, frame, mouth, mask, neck, neckColor, dark } */
function ghostSVG(v, { w = 288, h = 368, label = '', fit = 'xMidYMid slice' } = {}) {
  const id = ++_uid;
  const body = v.body || '#f6f1e9';
  const hi = shade(body, 26), lo = shade(body, -40);
  const bg = v.bg;
  return `<svg viewBox="0 0 288 368" width="${w}" height="${h}" preserveAspectRatio="${fit}" role="img" aria-label="${label || 'GhostTab agent character'}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg${id}" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="${shade(bg, 16)}"/><stop offset="1" stop-color="${shade(bg, -14)}"/></radialGradient>
    <radialGradient id="b${id}" cx="36%" cy="28%" r="78%"><stop offset="0" stop-color="${hi}"/><stop offset=".55" stop-color="${body}"/><stop offset="1" stop-color="${lo}"/></radialGradient>
    <radialGradient id="hat${id}" cx="35%" cy="25%" r="80%"><stop offset="0" stop-color="${shade(v.hatColor || '#ccc', 30)}"/><stop offset="1" stop-color="${shade(v.hatColor || '#ccc', -24)}"/></radialGradient>
    <radialGradient id="gum${id}" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#ffd3e4"/><stop offset="1" stop-color="#e88db0"/></radialGradient>
    <linearGradient id="mask${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e4e0d8"/></linearGradient>
    <filter id="soft${id}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>
  </defs>
  <rect width="288" height="368" fill="url(#bg${id})"/>
  <ellipse cx="144" cy="346" rx="78" ry="10" fill="#000" opacity=".16" filter="url(#soft${id})"/>
  <g class="ghost-bob">
    <path d="${BODY}" transform="translate(4 8)" fill="#000" opacity=".12" filter="url(#soft${id})"/>
    <path d="${BODY}" fill="url(#b${id})"/>
    <ellipse cx="112" cy="112" rx="26" ry="16" fill="#fff" opacity="${v.dark ? .12 : .35}" transform="rotate(-24 112 112)"/>
    ${neck(v)}
    ${face(v, id)}
    ${hat(v, id)}
  </g>
</svg>`;
}

/* The cast. Backdrops echo the reference's muted painterly scenes. */
const CAST = [
  { bg: '#b893b8', hat: 'bucket', hatColor: '#f1d9c0', band: '#7c8a3c', eyes: 'round', frame: '#e9c9a8', mouth: 'o' },
  { bg: '#a3a3a3', hat: 'cap', hatColor: '#f3ece0', band: '#e2553f', mouth: 'gum', neck: 'tie', neckColor: '#d44a35' },
  { bg: '#d8a596', hat: 'beanie', hatColor: '#f4e7b3', band: '#efe0a0', eyes: 'round', frame: '#b98d5f', mouth: 'smile', body: '#cfe6d3' },
  { bg: '#c9b6d6', hat: 'bucket', hatColor: '#3e5bd8', band: '#c6a2d6', mask: true },
  { bg: '#a9c7b8', hat: 'beanie', hatColor: '#f6f0e4', band: '#efc23a', mask: true, body: '#f6e3a4' },
  { bg: '#c7b39f', hat: 'propeller', hatColor: '#f0c24a', band: '#e05b3a', eyes: 'round', frame: '#3a3a3a', mouth: 'smile', body: '#f1c96b' },
  { bg: '#d8b7d1', hat: 'beret', hatColor: '#c9b8e8', eyes: 'round', frame: '#6b6bd6', mouth: 'o', neck: 'scarf', neckColor: '#3247a8', body: '#f2d5e6' },
  { bg: '#c9c2b8', hat: 'beanie', hatColor: '#e98a9b', band: '#7fc0c9', mouth: 'smile', neck: 'scarf', neckColor: '#e98a9b', body: '#b9dce8' },
  { bg: '#d98a4e', hat: 'cap', hatColor: '#5a3a2a', band: '#f0e6d6', mouth: 'smile', neck: 'badge', body: '#8a5a3c' },
  { bg: '#d4c4a8', hat: 'bucket', hatColor: '#e9d6b4', band: '#4f8a4a', eyes: 'round', frame: '#6b4a2a', mouth: 'smile', body: '#7fae6a' },
  { bg: '#9aa7bf', hat: 'phones', hatColor: '#f2f0ea', mouth: 'gum', body: '#f7f3ee' },
  { bg: '#e2b9a5', hat: 'hood', hatColor: '#e46a4a', eyes: 'sun', mouth: 'smile', body: '#f9ecd8' },
  { bg: '#b4bfa1', hat: 'beret', hatColor: '#2b2d33', eyes: 'sun', mouth: 'o', neck: 'badge', body: '#e9e4f6' },
  { bg: '#aeb8cf', hat: 'cap', hatColor: '#2f4f9a', band: '#f3d34a', eyes: 'round', frame: '#f3d34a', mouth: 'smile', body: '#f7d7c4' },
];

/* Hero pieces for the feature cards */
const RARE = { bg: '#e5cce0', hat: 'bucket', hatColor: '#2b2c30', band: '#1d1e22', eyes: 'sun', mouth: 'smile', body: '#2e2f34', dark: true, neck: 'badge' };
const MASKED = { bg: '#8d9876', hat: 'bucket', hatColor: '#e9d6b0', band: '#6f8a4a', eyes: 'round', frame: '#9a6a3a', mask: true };
const FOOTER = { bg: '#c7b19c', hat: 'cap', hatColor: '#4f7a46', band: '#f2e8d6', mouth: 'smile', neck: 'tie', neckColor: '#4f7a46' };

/* Toy chain-coins for the "fund from any chain" card */
function coinSVG(kind) {
  const C = {
    sol: { face: '#1f1f24', rim: '#0f0f12', mark: `<g transform="translate(36 34)"><path d="M6 0 H42 L36 8 H0 Z" fill="#9b6cf0"/><path d="M0 14 H36 L42 22 H6 Z" fill="#5fd3b0"/><path d="M6 28 H42 L36 36 H0 Z" fill="#7aa6f0"/></g>`, name: 'Solana' },
    tempo: { face: '#f4f1ea', rim: '#cfc8bb', mark: `<text x="60" y="76" text-anchor="middle" font-family="Playfair Display, Georgia, serif" font-size="46" font-weight="600" fill="#212529">T</text>`, name: 'Tempo' },
    eth: { face: '#a0b1cd', rim: '#7c8fb0', mark: `<g transform="translate(60 26)"><path d="M0 0 L18 30 L0 40 L-18 30 Z" fill="#2e3550"/><path d="M0 44 L18 34 L0 60 L-18 34 Z" fill="#4a5578"/></g>`, name: 'Ethereum' },
    zec: { face: '#efc23a', rim: '#c79a1a', mark: `<g transform="translate(60 56)" fill="#212529"><rect x="-3" y="-30" width="6" height="10"/><rect x="-3" y="20" width="6" height="10"/><path d="M-16 -20 H16 V-12 L-6 12 H16 V20 H-16 V12 L6 -12 H-16 Z"/></g>`, name: 'Zcash' },
  }[kind];
  const id = ++_uid;
  return `<svg viewBox="0 0 120 128" role="img" aria-label="${C.name} toy coin" xmlns="http://www.w3.org/2000/svg">
    <defs><radialGradient id="cf${id}" cx="35%" cy="28%" r="80%"><stop offset="0" stop-color="${shade(C.face, 30)}"/><stop offset="1" stop-color="${shade(C.face, -18)}"/></radialGradient>
    <filter id="cs${id}"><feGaussianBlur stdDeviation="4"/></filter></defs>
    <ellipse cx="60" cy="118" rx="40" ry="6" fill="#000" opacity=".18" filter="url(#cs${id})"/>
    <ellipse cx="60" cy="66" rx="52" ry="52" fill="${C.rim}"/>
    <ellipse cx="60" cy="60" rx="52" ry="52" fill="url(#cf${id})"/>
    <ellipse cx="60" cy="60" rx="44" ry="44" fill="none" stroke="${shade(C.face, -22)}" stroke-width="2"/>
    ${C.mark}
    <ellipse cx="40" cy="32" rx="16" ry="8" fill="#fff" opacity=".25" transform="rotate(-30 40 32)"/>
  </svg>`;
}

window.GT = { ghostSVG, coinSVG, CAST, RARE, MASKED, FOOTER };
