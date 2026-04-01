// Run: node generate-icons.js
// Generates simple SVG-based PNG icons using pure Node (no canvas needed)
// Uses the fact that Chrome accepts SVG for icons in dev mode via a workaround,
// but we'll just output minimal valid PNGs via raw binary.

const fs = require("fs");
const path = require("path");

// Minimal 1x1 red pixel PNG — we'll make a proper SVG icon instead
// For development, Chrome accepts a placeholder. Replace with real PNGs before publishing.

const svgIcon = (size) => `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.2)}" fill="#1a1a2e"/>
  <rect x="${size*0.15}" y="${size*0.15}" width="${size*0.33}" height="${size*0.33}" rx="${size*0.05}" fill="#e94560"/>
  <rect x="${size*0.52}" y="${size*0.15}" width="${size*0.33}" height="${size*0.33}" rx="${size*0.05}" fill="#e94560"/>
  <rect x="${size*0.15}" y="${size*0.52}" width="${size*0.33}" height="${size*0.33}" rx="${size*0.05}" fill="#e94560"/>
  <rect x="${size*0.52}" y="${size*0.52}" width="${size*0.33}" height="${size*0.33}" rx="${size*0.05}" fill="#e94560"/>
</svg>`;

const iconsDir = path.join(__dirname, "icons");
fs.mkdirSync(iconsDir, { recursive: true });

for (const size of [16, 48, 128]) {
  fs.writeFileSync(path.join(iconsDir, `icon${size}.svg`), svgIcon(size));
  console.log(`Generated icons/icon${size}.svg`);
}

console.log("\nNote: Chrome Manifest V3 requires PNG icons.");
console.log("Convert the SVGs to PNG using:");
console.log("  rsvg-convert -w 16 icons/icon16.svg -o icons/icon16.png");
console.log("  rsvg-convert -w 48 icons/icon48.svg -o icons/icon48.png");
console.log("  rsvg-convert -w 128 icons/icon128.svg -o icons/icon128.png");
console.log("\nOr for quick dev testing, update manifest.json to use .svg paths.");
