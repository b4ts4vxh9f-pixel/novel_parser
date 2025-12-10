/**
 * Executes the CG-specific cleaning logic on the provided Cheerio document.
 * @param {cheerio.CheerioAPI} $ - The Cheerio instance loaded with the chapter content.
 * @param {function(string, string): {text: string, success: boolean}} decodeText - The utility function to decode obfuscated text.
 * @param {function(string, string): Promise<void>} moveFontFile - Utility function to move the font file.
 * @param {number} novelId - The novel ID associated with the chapter. Used to identify the novel in the database and the target folder.
 * @returns {string} The HTML content after CG cleaning is applied.
 */
const cleanCGMethod = ($doc, decodeText, moveFontFile, novelId) => {
    console.log('CG watermark removal active');

    // --- Start CG Specific Logic ---

    // 1. Decode obfuscated text based on font-family style AND remove font-family on success
    $doc('[style*="font-family"]').each((i, el) => {
        const node = $doc(el);
        const style = node.attr("style");

        if (!style) return;

        const match = style.match(/font-family:\s*['"]?([^;'"]+)/i);
        if (!match) return;

        const fontName = match[1].toLowerCase();
        // The source path for the font
        const SOURCE_FONT_PATH = `public/fonts/${fontName}.ttf`;
        const raw = node.text();

        // Call the modified decodeText function
        const { text: decodedText, success: decodeSuccess } = decodeText(raw, SOURCE_FONT_PATH);

        console.log(`Found font-family: ${fontName}, Success: ${decodeSuccess}`);

        // Always replace the text with the result, even if decoding failed (it returns the raw text).
        node.text(decodedText);

        // --- CONDITIONAL LOGIC: Only remove style on successful decoding and move the font file ---
        if (decodeSuccess) {
            // 1a. Remove the font-family style
            let newStyle = style.replace(/font-family\s*:\s*[^;"]+;?/gi, '').trim();

            if (newStyle === '') {
                node.removeAttr('style');
            } else {
                node.attr('style', newStyle);
            }

            // 1b. Remove font-related data attributes
            node.removeAttr('data-preserved-style');
            node.removeAttr('data-custom-font');
            node.removeAttr('data-font-family');

            // 1c. Determine the destination folder and move the font file
            const TARGET_FONT_DIR = `public/fonts/used/${novelId}`;

            // NOTE: Since Cheerio is synchronous, we cannot use 'await' here.
            // We call the file moving utility asynchronously and don't block.
            // The file moving logic must handle its own async nature (e.g., using a queue or promise).
            moveFontFile(SOURCE_FONT_PATH, TARGET_FONT_DIR)
                .catch(err => {
                    console.error(`Failed to move font file ${fontName}.ttf for novelId ${novelId}:`, err);
                });
        }
        // ------------------------------------------------------------------
    });

    // 2. Remove elements with height:1px and remove 'color' styles
    $doc('*[style]').each((i, el) => {
        const node = $doc(el);
        const styleAttr = node.attr('style') || '';
        const lowerStyle = styleAttr.replace(/\s+/g, '').toLowerCase();

        // Remove elements with height:1px
        if (lowerStyle.includes('height:1px')) {
            node.remove();
            return;
        }

        // Remove the style attribute if it contains 'color'
        if (lowerStyle.includes('color')) {
            node.removeAttr('style');
        }

        // Also remove style attribute if it's now empty
        if (node.attr('style') && node.attr('style').trim() === '') {
            node.removeAttr('style');
        }
    });

    // --- End CG Specific Logic ---

    return $doc.html();
};

export { cleanCGMethod };