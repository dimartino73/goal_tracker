// Ritar ikonerna utan beroenden: en grön rundad ruta med en ring och en bock.
// Körs med `npm run icons`. PNG skrivs för hand med node:zlib.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

function crc32(buf) {
  let c, crc = ~0;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, px) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = px(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}

const GREEN = [28, 124, 93], WHITE = [255, 255, 255];

// Avstånd till linjesegment, för bocken.
function seg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// `inset` skalar motivet så att det håller sig inom maskable-ikonens säkra yta.
function painter(size, { rounded, inset }) {
  return (x, y) => {
    const u = x / size, v = y / size;
    if (rounded) {
      const r = 0.22, cx = Math.min(Math.max(u, r), 1 - r), cy = Math.min(Math.max(v, r), 1 - r);
      if (Math.hypot(u - cx, v - cy) > r) return [0, 0, 0, 0];
    }
    const s = (u - 0.5) / inset, t = (v - 0.5) / inset; // -0.5..0.5 inom motivet
    const ring = Math.abs(Math.hypot(s, t) - 0.3);
    const check = Math.min(seg(s, t, -0.14, 0.01, -0.04, 0.11), seg(s, t, -0.04, 0.11, 0.15, -0.09));
    const w = 0.035;
    const onRing = ring < w, onCheck = check < w;
    return onRing || onCheck ? [...WHITE, 255] : [...GREEN, 255];
  };
}

function write(name, size, opts) {
  writeFileSync(`public/icons/${name}`, png(size, painter(size, opts)));
  console.log("skrev", name);
}
write("icon-192.png", 192, { rounded: true, inset: 1 });
write("icon-512.png", 512, { rounded: true, inset: 1 });
write("icon-512-maskable.png", 512, { rounded: false, inset: 1.35 });
write("apple-touch-icon.png", 180, { rounded: false, inset: 1 });

writeFileSync("public/icons/icon.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#1c7c5d"/>
  <circle cx="50" cy="50" r="30" fill="none" stroke="#fff" stroke-width="7"/>
  <path d="M36 51l10 10 19-19" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`);
console.log("skrev icon.svg");
