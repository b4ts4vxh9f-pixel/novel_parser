import opentype from 'opentype.js';
import fs from 'fs';
import fontMapping from "../../public/fonts/mapping.js";

export function solveFont(fontPath) {
    const buffer = fs.readFileSync(fontPath).buffer;
    const font = opentype.parse(buffer);
    const decoder = {};

    console.log(`Parsing font: ${font.names.fontFamily.en}`);

    // Iterate over the Character Map (Input Code -> Glyph Index)
    const cmap = font.tables.cmap.glyphIndexMap;

    for (let charCode in cmap) {
        const glyphIndex = cmap[charCode];
        const glyph = font.glyphs.get(glyphIndex);
        // console.log("glyph: ", glyph)
        // 1. Get Glyph Metrics
        // We round values because font compression can slightly shift coordinates
        const xMin = glyph.xMin || 0;
        const xMax = glyph.xMax || 0;
        const yMin = glyph.yMin || 0;
        const yMax = glyph.yMax || 0;
        const width = Math.round(xMax - xMin);
        const height = Math.round(yMax - yMin);
        const advWidth = Math.round(glyph.advanceWidth);

        // 2. Generate Keys to match your mapping.js format
        // Your map uses two formats: "Width x Height" and "AdvWidth x Width x Height"
        const key1 = `${width}x${height}`;
        const key2 = `${advWidth}x${width}x${height}`;

        // 3. Look up the Visual Letter
        // We check both key formats.
        let realLetter = fontMapping[key1] || fontMapping[key2];
        // console.log(`Glyph Index ${glyphIndex} [${key1}] -> Visual '${realLetter}'`);
        // Optional: Fuzzy matching if exact match fails (fonts change slightly)
        if (!realLetter) {
            console.log(`No exact match found for '${key1}' index: ${glyphIndex}, glyph: `, glyph);
            // realLetter = findClosestMatch(width, height); // Implementation optional
        }

        const inputChar = String.fromCharCode(charCode);
        // console.log(`inputChar: ${inputChar}, realLetter: ${realLetter}`);
        if (realLetter) {
            decoder[inputChar] = realLetter;
            // console.log(`Encoded '${inputChar}' -> Glyph Index ${glyphIndex} [${key1}] -> Visual '${realLetter}'`);
        }
    }

    const FULL_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const ALL_LETTERS = FULL_ALPHABET.split('');
    const TOTAL_LETTERS = ALL_LETTERS.length; // 52

    const mapKeys = Object.keys(decoder);
    const mapValues = Object.values(decoder);

    // Check if exactly one mapping is missing (i.e., 51 keys and 51 values)
    if (mapKeys.length === TOTAL_LETTERS - 1 && mapValues.length === TOTAL_LETTERS - 1) {

        const existingKeys = new Set(mapKeys);
        const existingValues = new Set(mapValues);

        let missingKey = null; // The encoded glyph (e.g., 'a')
        let missingValue = null; // The decoded character (e.g., 'E')

        // Find the single missing encoded glyph (key) and single missing decoded character (value)
        for (const char of ALL_LETTERS) {
            if (!existingKeys.has(char)) {
                missingKey = char;
            }
            if (!existingValues.has(char)) {
                missingValue = char;
            }
        }

        if (missingKey && missingValue) {
            // Assign the missing encoded glyph to the missing decoded character
            decoder[missingKey] = missingValue;
            console.log(`[HEURISTIC] Auto-assigned final missing mapping: Encoded '${missingKey}' -> Decoded '${missingValue}'.`);
        } else {
            console.warn("[HEURISTIC] Map size suggests one missing entry, but could not reliably identify the key/value.");
        }
    }

    console.log("\n--- DECODING MAP ---");
    console.log(JSON.stringify(decoder, null, 2));

    return decoder;
}

// Run the solver
// solveFont('public/fonts/frtlqoitga.ttf');