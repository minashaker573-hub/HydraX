/**
 * HYDRAX Mobile — app icon generator.
 *
 * Writes the launcher, adaptive and web icons from the HYDRAX droplet
 * mark, so the app does not ship the Expo template's placeholder artwork and
 * so the icons are reproducible rather than binary blobs nobody can edit.
 *
 * Pure Node: a tiny PNG encoder over the built-in `zlib`, with 3x3
 * supersampling for the edges. No image dependency, in keeping with the rest
 * of this repository.
 *
 *   npm run icons
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

const INK = [0x0a, 0x0d, 0x0c];
const ACCENT = [0x2f, 0xbf, 0x6e];
const WHITE = [0xff, 0xff, 0xff];

/* --------------------------------------------------------------- PNG ----- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

/** rgba: Uint8Array of width * height * 4. */
function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------ geometry --- */

/**
 * Coverage of the HYDRAX droplet at a point, in a 0..1 unit square.
 * Bottom is a circle; above the circle's centre the width tapers to the tip.
 */
function dropletHit(x, y) {
  const cx = 0.5;
  const cy = 0.63;
  const r = 0.26;
  const tipY = 0.14;

  if (y >= cy) {
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= r * r;
  }
  if (y < tipY) return false;
  const s = (cy - y) / (cy - tipY); // 0 at the circle's centre, 1 at the tip
  const halfWidth = r * Math.pow(1 - s, 0.8);
  return Math.abs(x - cx) <= halfWidth;
}

/** Rounded-rect coverage in the same unit square. */
function roundedRectHit(x, y, radius) {
  const inset = 0;
  const min = inset;
  const max = 1 - inset;
  if (x < min || x > max || y < min || y > max) return false;

  const nx = Math.min(Math.max(x, min + radius), max - radius);
  const ny = Math.min(Math.max(y, min + radius), max - radius);
  const dx = x - nx;
  const dy = y - ny;
  return dx * dx + dy * dy <= radius * radius;
}

const SAMPLES = 3;

/**
 * Renders one icon. `shade(u, v)` returns [r, g, b, a] with a in 0..255 for a
 * point in the unit square; edges are supersampled 3x3.
 */
function render(size, shade) {
  const rgba = new Uint8Array(size * size * 4);
  const step = 1 / (size * SAMPLES);

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const u = (px * SAMPLES + sx + 0.5) * step;
          const v = (py * SAMPLES + sy + 0.5) * step;
          const [cr, cg, cb, ca] = shade(u, v);
          r += cr * ca;
          g += cg * ca;
          b += cb * ca;
          a += ca;
        }
      }

      const n = SAMPLES * SAMPLES;
      const index = (py * size + px) * 4;
      rgba[index] = a === 0 ? 0 : Math.round(r / a);
      rgba[index + 1] = a === 0 ? 0 : Math.round(g / a);
      rgba[index + 2] = a === 0 ? 0 : Math.round(b / a);
      rgba[index + 3] = Math.round(a / n);
    }
  }
  return rgba;
}

/* ---------------------------------------------------------------- art ---- */

/** Full launcher icon: droplet on the HYDRAX charcoal, rounded. */
const launcher = (u, v) => {
  if (!roundedRectHit(u, v, 0.22)) return [0, 0, 0, 0];
  // The mark sits at 74% so it keeps a margin inside the rounded square
  // instead of running into the corners.
  const scaled = (c) => (c - 0.5) / 0.74 + 0.5;
  const x = scaled(u);
  const y = scaled(v);
  const inside = x >= 0 && x <= 1 && y >= 0 && y <= 1 && dropletHit(x, y);
  return inside ? [...ACCENT, 255] : [...INK, 255];
};

/** Adaptive foreground: droplet only, inside Android's 66% safe zone. */
const adaptiveForeground = (u, v) => {
  const scaled = (c) => (c - 0.5) / 0.66 + 0.5;
  const x = scaled(u);
  const y = scaled(v);
  if (x < 0 || x > 1 || y < 0 || y > 1) return [0, 0, 0, 0];
  return dropletHit(x, y) ? [...ACCENT, 255] : [0, 0, 0, 0];
};

const adaptiveMonochrome = (u, v) => {
  const shaded = adaptiveForeground(u, v);
  return shaded[3] === 0 ? shaded : [...WHITE, 255];
};

const adaptiveBackground = () => [...INK, 255];

// No separate splash asset: Expo SDK 57 draws the launch screen from `icon`
// and `backgroundColor` in app.json, which are already the branded mark on the
// HYDRAX charcoal. A second image would be the same artwork maintained twice.

const OUTPUTS = [
  ['icon.png', 1024, launcher],
  ['android-icon-foreground.png', 1024, adaptiveForeground],
  ['android-icon-background.png', 1024, adaptiveBackground],
  ['android-icon-monochrome.png', 1024, adaptiveMonochrome],
  ['favicon.png', 64, launcher],
];

for (const [name, size, shade] of OUTPUTS) {
  const png = encodePng(size, size, render(size, shade));
  writeFileSync(join(ASSETS, name), png);
  console.log(`wrote assets/${name} (${size}x${size}, ${png.length} bytes)`);
}
