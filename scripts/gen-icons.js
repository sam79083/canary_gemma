// One-off PWA icon generator (no deps — pure Node with built-in zlib).
// Draws a rounded-square gradient + white chat bubble + green dots.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const OUT = path.join(__dirname, "..", "public");
fs.mkdirSync(OUT, { recursive: true });

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function writePng(file, w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.slice(y * w * 4, (y + 1) * w * 4)).copy(raw, y * (w * 4 + 1) + 1);
  }
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", (() => { const b = Buffer.alloc(13); b.writeUInt32BE(w); b.writeUInt32BE(h, 4); b[8] = 8; b[9] = 6; return b; })()),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
  console.log("wrote", file, png.length + "B");
}

function lerp(a, b, t) { return a + (b - a) * t; }

function draw(size) {
  const px = new Uint8Array(size * size * 4);
  const R = size / 4.6; // corner radius
  // Gradient: deep blue -> teal, diagonal.
  const c0 = [35, 131, 230], c1 = [46, 160, 140];
  const cx = size / 2, cy = size / 2;
  // Bubble geometry (fractions of size).
  const bw = 0.56 * size, bh = 0.42 * size;
  const bx0 = cx - bw / 2, by0 = cy - bh / 2 - size * 0.03;
  const br = 0.1 * size;
  const tailX = cx - bw * 0.22, tailY = by0 + bh, tailLen = size * 0.13;
  const inBubble = (x, y) => {
    const nx = Math.min(Math.max(x, bx0 + br), bx0 + bw - br);
    const ny = Math.min(Math.max(y, by0 + br), by0 + bh - br);
    if ((x - nx) ** 2 + (y - ny) ** 2 > br * br) {
      // tail triangle
      if (y >= tailY && y <= tailY + tailLen) {
        const tt = (y - tailY) / tailLen;
        const tx0 = tailX - size * 0.02 * (1 - tt);
        const tx1 = tailX + size * 0.1 * (1 - tt);
        if (x >= tx0 && x <= tx1) return true;
      }
      return false;
    }
    return true;
  };
  const dots = [-0.16, 0, 0.16].map((o) => ({ x: cx + o * size, y: by0 + bh / 2, r: size * 0.038 }));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Rounded-square mask.
      const qx = Math.min(Math.max(x, R), size - R);
      const qy = Math.min(Math.max(y, R), size - R);
      const i = (y * size + x) * 4;
      if ((x - qx) ** 2 + (y - qy) ** 2 > R * R) {
        px[i + 3] = 0;
        continue;
      }
      const t = (x + y) / (2 * size);
      let r = lerp(c0[0], c1[0], t), g = lerp(c0[1], c1[1], t), b = lerp(c0[2], c1[2], t);
      if (inBubble(x, y)) { r = 255; g = 255; b = 255; }
      for (const d of dots) {
        if ((x - d.x) ** 2 + (y - d.y) ** 2 <= d.r * d.r) {
          const k = 0.25 + 0.75 * ((x + y) / (2 * size));
          r = 35 * k + 40; g = 131 * k + 40; b = 200 * k + 40;
        }
      }
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
    }
  }
  return px;
}

for (const s of [180, 192, 512]) {
  const name = s === 180 ? "apple-touch-icon.png" : `icon-${s}.png`;
  writePng(path.join(OUT, name), s, s, draw(s));
}
