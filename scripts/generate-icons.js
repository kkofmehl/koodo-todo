#!/usr/bin/env node
/**
 * Generates PWA PNG icons without external dependencies.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.join(__dirname, '..', 'public', 'icons');

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function drawIcon(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const radius = size * 0.42;

  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter none
    for (let x = 0; x < size; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const i = rowStart + 1 + x * 4;

      if (dist > radius + 0.5) {
        raw[i] = 0;
        raw[i + 1] = 0;
        raw[i + 2] = 0;
        raw[i + 3] = 0;
        continue;
      }

      // Deep navy lacquer base with blue gloss highlight
      const edge = Math.max(0, 1 - dist / radius);
      const highlight = Math.max(0, 1 - Math.sqrt((dx + size * 0.12) ** 2 + (dy + size * 0.18) ** 2) / (radius * 0.85));
      const r = clamp(11 + edge * 30 + highlight * 90);
      const g = clamp(15 + edge * 40 + highlight * 110);
      const b = clamp(26 + edge * 70 + highlight * 160);

      // Simple "K" glyph in the center
      const nx = (x - cx) / size;
      const ny = (y - cy) / size;
      const inStem = Math.abs(nx + 0.08) < 0.06 && Math.abs(ny) < 0.22;
      const inUpperArm = Math.abs(ny + nx * 0.95 + 0.02) < 0.055 && nx > -0.05 && nx < 0.18 && ny < 0.02;
      const inLowerArm = Math.abs(ny - nx * 0.95 - 0.02) < 0.055 && nx > -0.05 && nx < 0.18 && ny > -0.02;
      const glyph = inStem || inUpperArm || inLowerArm;

      if (glyph) {
        raw[i] = 244;
        raw[i + 1] = 247;
        raw[i + 2] = 255;
        raw[i + 3] = 255;
      } else {
        raw[i] = r;
        raw[i + 1] = g;
        raw[i + 2] = b;
        raw[i + 3] = dist > radius - 0.8 ? clamp((radius + 0.5 - dist) * 255) : 255;
      }
    }
  }

  return raw;
}

function writePng(filePath, size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(drawIcon(size), { level: 9 });
  const png = Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(filePath, png);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
writePng(path.join(OUT_DIR, 'icon-192.png'), 192);
writePng(path.join(OUT_DIR, 'icon-512.png'), 512);
writePng(path.join(OUT_DIR, 'apple-touch-icon.png'), 180);
console.log('Wrote icons to', OUT_DIR);
