import sharp from 'sharp';
import { readFileSync, mkdirSync, rmSync } from 'fs';
import { execSync } from 'child_process';

mkdirSync('build', { recursive: true });

// Full-bleed 1024x1024 — macOS applies its own squircle mask automatically
const size = 1024;

await sharp(readFileSync('icon.svg'))
  .resize(size, size)
  .png()
  .toFile('build/icon.png');

console.log(`Generated build/icon.png (${size}×${size}, full-bleed)`);

// Generate .icns for macOS (requires macOS with sips + iconutil)
if (process.platform === 'darwin') {
  const iconsetDir = 'build/icon.iconset';
  mkdirSync(iconsetDir, { recursive: true });
  for (const size of [16, 32, 128, 256, 512]) {
    execSync(`sips -z ${size} ${size} build/icon.png --out ${iconsetDir}/icon_${size}x${size}.png`, { stdio: 'ignore' });
    const d = size * 2;
    execSync(`sips -z ${d} ${d} build/icon.png --out ${iconsetDir}/icon_${size}x${size}@2x.png`, { stdio: 'ignore' });
  }
  execSync('iconutil -c icns build/icon.iconset -o build/icon.icns');
  rmSync(iconsetDir, { recursive: true });
  console.log('Generated build/icon.icns');
}
