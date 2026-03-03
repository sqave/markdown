import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
mkdirSync('build', { recursive: true });

// Full-bleed 1024x1024 — macOS applies its own squircle mask automatically
const size = 1024;

await sharp(readFileSync('icon.svg'))
  .resize(size, size)
  .png()
  .toFile('build/icon.png');

console.log(`Generated build/icon.png (${size}×${size}, full-bleed)`);

// Use Tauri CLI to generate all platform icons from the 1024x1024 PNG
execSync('npx tauri icon build/icon.png', { stdio: 'inherit' });
console.log('Generated all icons in src-tauri/icons/');

// Regenerate .icns with native iconutil to avoid legacy mask types (s8mk, l8mk)
// that prevent macOS from applying the squircle mask on some systems
const iconsetDir = 'build/AppIcon.iconset';
mkdirSync(iconsetDir, { recursive: true });
for (const s of [16, 32, 64, 128, 256, 512]) {
  execSync(`sips -z ${s} ${s} build/icon.png --out ${iconsetDir}/icon_${s}x${s}.png`, { stdio: 'pipe' });
}
for (const s of [16, 32, 128, 256, 512]) {
  execSync(`sips -z ${s * 2} ${s * 2} build/icon.png --out ${iconsetDir}/icon_${s}x${s}@2x.png`, { stdio: 'pipe' });
}
execSync('iconutil -c icns build/AppIcon.iconset -o src-tauri/icons/icon.icns', { stdio: 'inherit' });
console.log('Regenerated icon.icns with native iconutil (no legacy masks)');

// Strip the 'info' metadata block that iconutil injects — it contains a phantom
// assetcatalog-reference that causes macOS 14 Sonoma to render a square icon.
// .icns format: 4-byte magic ('icns') + 4-byte total size, then entries each with
// 4-byte type + 4-byte size (inclusive) + data.
const icnsPath = 'src-tauri/icons/icon.icns';
const icns = readFileSync(icnsPath);
const magic = icns.toString('ascii', 0, 4);
if (magic === 'icns') {
  const chunks = [];
  let offset = 8; // skip header
  while (offset < icns.length) {
    const type = icns.toString('ascii', offset, offset + 4);
    const size = icns.readUInt32BE(offset + 4);
    if (type !== 'info') {
      chunks.push(icns.subarray(offset, offset + size));
    }
    offset += size;
  }
  const bodyLen = chunks.reduce((sum, c) => sum + c.length, 0);
  const cleaned = Buffer.alloc(8 + bodyLen);
  cleaned.write('icns', 0, 4, 'ascii');
  cleaned.writeUInt32BE(8 + bodyLen, 4);
  let pos = 8;
  for (const chunk of chunks) {
    chunk.copy(cleaned, pos);
    pos += chunk.length;
  }
  writeFileSync(icnsPath, cleaned);
  console.log('Stripped info block from icon.icns');
}
