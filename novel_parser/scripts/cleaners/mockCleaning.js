/**
 * Example demonstrating how to use the decryption module.
 * * This script uses the HARDCODED IDENTITY KEY defined in the main module
 * * to execute the fixed decryption logic. This will reveal the character scramble.
 */

// Import the necessary functions from the main module
// NOTE: We no longer import loadGlyphToCharMap
import { decodeObfuscatedText } from './decodeObfuscatedText.js';


// --- Raw text provided in the user's input ---
const ENCODED_TEXT = 'sCvA DCxAjtA Ctc tgGtUk XvvA mtgh, BYvmjkv tAc YvkpYtjAvc. av YtYvgU gvp vhPpjPAk kCPG, vWmvBp GCvA jp mthv pP av otj.';
// const ORIGINAL_TEXT = '"Beautiful?" The Alpha beside him smirked, eyes fixed greedily on He Lai’s figure. "You must be new. That’s no ordinary Omega."'
const FONT_NAME = 'public/fonts/mtcijhsegc.ttf';

function runDecryption() {
    console.log("--- STARTING DECRYPTION PROCESS (IDENTITY KEY) ---");

    // Decrypt using the default IDENTITY_DECRYPTION_KEY
    const decryptedText = decodeObfuscatedText(ENCODED_TEXT, FONT_NAME);

    console.log("\n===================================");
    console.log("ENCODED:  ", ENCODED_TEXT);
    console.log("DECODED (IDENTITY KEY):  ", decryptedText);
    console.log("===================================");
}

runDecryption();