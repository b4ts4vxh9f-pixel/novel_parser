// inspect_font.js
// Usage: node inspect_font.js ./path/to/font.woff2

import fs from "fs";
import * as fontkit from "fontkit";   // ← FIXED: namespace import
import fontMapping from "../../public/fonts/mapping.js";


if (process.argv.length < 3) {
    console.error("Usage: node inspect_font.js <font-file>");
    process.exit(1);
}

const fontPath = process.argv[2];

if (!fs.existsSync(fontPath)) {
    console.error(`File not found: ${fontPath}`);
    process.exit(1);
}

const font = fontkit.openSync(fontPath);

console.log(`Loaded font: ${font.fullName}`);
console.log(`Glyphs: ${font.numGlyphs}`);
console.log("------------------------------------------------------");

const parsed = {}
let failed = []

for (let glyphId = 0; glyphId < font.numGlyphs; glyphId++) {
    const glyph = font.getGlyph(glyphId);

    const bbox = glyph.bbox || { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const { minX, minY, maxX, maxY } = bbox;

    const width = maxX - minX;
    const height = maxY - minY;
    const advancewidth = glyph.advanceWidth;
    const key = `${width}x${height}`;
    const anvKey = `${advancewidth}x${key}`;
    let glyphMapping;
    glyphMapping = fontMapping[key] || fontMapping[anvKey];

    if (!glyphMapping) {
        failed.push(glyphId)
    } else {
        console.log("Glyph:", glyphId, glyphMapping);
        parsed[glyphMapping] = glyphId;
        console.log("Decoded:", glyphMapping);
    }

    const codepoints = glyph.codePoints?.map(cp =>
        "U+" + cp.toString(16).toUpperCase()
    ) || [];

    console.log({
        id: glyphId,
        name: glyph.name,
        codepoints,
        advanceWidth: glyph.advanceWidth,
        bbox,
        width,
        height,
    });
}

console.log("------------------------------------------------------");
console.log("Parsed:", parsed, "Failed:", failed)