import { solveFont } from "./solveFont.js";

/**
 * Decodes obfuscated text based on a font map.
 * @param {string} encodedText - The text to decode.
 * @param {string} fontName - The font name used to find the decryption map.
 * @returns {{text: string, success: boolean}} An object containing the decoded text and a success flag.
 */
export function decodeObfuscatedText(encodedText, fontName) {

    const glyphToCharMap = solveFont(fontName);

    // Determine success based on having a valid map
    const mapIsValid = Object.keys(glyphToCharMap).length > 0;

    if (!encodedText || !mapIsValid) {
        console.error("Missing valid decryption map. Cannot decode text.");
        return {
            text: encodedText,
            success: false // Explicitly fail if no map is available
        };
    }

    let decodedText = '';
    let anyCharWasDecoded = false; // Track if at least one character was successfully mapped

    for (let i = 0; i < encodedText.length; i++) {
        const char = encodedText[i];

        if (!/[A-Za-z]/.test(char)) {
            // Keep non-letters as is
            decodedText += char;
            continue;
        }

        // Decode letter if available
        if (glyphToCharMap[char]) {
            decodedText += glyphToCharMap[char];
            anyCharWasDecoded = true; // Mark as successful decoding
        }
        // If not in glyph map, skip it (as per your original logic)
        else {
            console.log("Not found in glyph map, skipping...", char);
            continue;
        }
    }

    // Success is defined as having a valid map AND successfully decoding at least one character.
    // However, for elements with font-family, we primarily care that the process ran and produced
    // the intended output, which means we decoded *something*.
    return {
        text: decodedText,
        success: mapIsValid && anyCharWasDecoded
    };
}