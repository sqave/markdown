import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';

mkdirSync('build', { recursive: true });

// macOS icon canvas is 1024x1024, artwork area ~824x824 centered (80% of canvas)
// with Apple's continuous-curvature squircle (superellipse) shape
const canvas = 1024;
const iconSize = 824;
const offset = (canvas - iconSize) / 2; // 100px padding on each side

// Apple's squircle uses a superellipse (n≈5) for continuous curvature corners
// This SVG path approximates Apple's icon mask shape
function appleSquirclePath(x, y, w, h) {
  const r = w * 0.225; // corner radius ~22.5% of width
  return `
    M ${x + r},${y}
    L ${x + w - r},${y}
    C ${x + w - r * 0.04},${y} ${x + w},${y + r * 0.04} ${x + w},${y + r}
    L ${x + w},${y + h - r}
    C ${x + w},${y + h - r * 0.04} ${x + w - r * 0.04},${y + h} ${x + w - r},${y + h}
    L ${x + r},${y + h}
    C ${x + r * 0.04},${y + h} ${x},${y + h - r * 0.04} ${x},${y + h - r}
    L ${x},${y + r}
    C ${x},${y + r * 0.04} ${x + r * 0.04},${y} ${x + r},${y}
    Z
  `;
}

const squircleMask = Buffer.from(
  `<svg width="${canvas}" height="${canvas}">
    <path d="${appleSquirclePath(offset, offset, iconSize, iconSize)}" fill="white"/>
  </svg>`
);

// Resize icon artwork to fit inside the squircle area, then composite onto padded canvas
const iconArtwork = await sharp(readFileSync('icon.svg'))
  .resize(iconSize, iconSize)
  .png()
  .toBuffer();

const paddedIcon = await sharp({
  create: { width: canvas, height: canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
})
  .composite([{ input: iconArtwork, left: offset, top: offset }])
  .png()
  .toBuffer();

// Apply squircle mask
await sharp(paddedIcon)
  .composite([{ input: await sharp(squircleMask).resize(canvas, canvas).png().toBuffer(), blend: 'dest-in' }])
  .png()
  .toFile('build/icon.png');

console.log(`Generated build/icon.png (${canvas}×${canvas}, macOS squircle with padding)`);
