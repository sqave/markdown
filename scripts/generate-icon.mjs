import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
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
