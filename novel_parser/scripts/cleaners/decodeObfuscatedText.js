import { solveFont } from "./solveFont.js";

/**
 * The Identity Decryption Key: Maps Glyph ID back to the standard, non-scrambled character.
 * This is ONLY used as a placeholder to execute the fixed logic.
 */

export function decodeObfuscatedText(encodedText, fontName) {

    const glyphToCharMap = solveFont(fontName)
    // console.log("Glyph to char map:", glyphToCharMap);
    if (!encodedText || Object.keys(glyphToCharMap).length === 0) {
        console.error("Missing valid decryption map. Cannot decode text.");
        return encodedText;
    }
    // console.log("Glyph to char map:", glyphToCharMap);

    let text='';

    for (let i = 0; i < encodedText.length; i++) {
        const char = encodedText[i];
        console.log("char: ", char);
        if (!/[A-Za-z]/.test(char)) {
            // console.log("Not a letter, skipping...", char);
            text += char;
            continue;
        }

        // Decode letter if available
        if (glyphToCharMap[char]) {
            // console.log("Found in glyph map, decoding...", char);
            text += glyphToCharMap[char];
        }
        // If not in glyph map, skip or keep original
        else {
            console.log("Not found in glyph map, skipping...", char);
            // skip:
            continue;

            // OR keep original (choose this if you want to see errors)
            // text += char;
        }
    }

    return text;
}
