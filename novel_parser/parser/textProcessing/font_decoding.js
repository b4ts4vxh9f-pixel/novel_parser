import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {fontConvert} from "../../public/fonts/fontConverter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Detects spans with custom fonts, stores fonts, and preserves ALL font-family in HTML
 * @param {Page} page - Puppeteer page object
 * @returns {Object} {storedFonts: Array, fontMetadata: Map}
 */
export async function storeCustomFonts(page) {
    try {
        console.log('Checking for custom fonts and preserving styles...');

        // 1. Identify all custom fonts used on the page AND get the mapping
        const fontsInfo = await page.evaluate(() => {
            const fonts = [];
            const processedFonts = new Set();
            const fontMapping = {}; // Maps font-family to selector info

            // --- PRESERVE ALL STYLES START ---
            // Backup all inline styles to a data attribute so they survive Readability
            const allElementsWithStyle = document.querySelectorAll('*[style]');
            allElementsWithStyle.forEach(el => {
                // We assume Readability preserves data attributes (it usually does for structure)
                // or we clean them up later.
                if (el.getAttribute('style')) {
                    el.setAttribute('data-preserved-style', el.getAttribute('style'));
                }
            });
            // --- PRESERVE ALL STYLES END ---

            // Check all spans with font-family
            const spans = Array.from(document.querySelectorAll('span[style*="font-family"]'));

            for (const span of spans) {
                const fontFamily = span.style.fontFamily.replace(/['"]/g, '');

                // Store which elements use this font
                if (!fontMapping[fontFamily]) {
                    fontMapping[fontFamily] = [];
                }

                // Mark this span so we can identify it later
                // (We keep this for specific font logic, though data-preserved-style covers the visual part)
                span.setAttribute('data-custom-font', fontFamily);

                // Skip if already processed
                if (processedFonts.has(fontFamily)) continue;
                processedFonts.add(fontFamily);

                // Find the font URL in stylesheets
                let fontUrl = null;
                let fontFormat = null;

                for (const sheet of document.styleSheets) {
                    try {
                        for (const rule of sheet.cssRules) {
                            if (rule.type === CSSRule.FONT_FACE_RULE &&
                                rule.style.fontFamily.includes(fontFamily)) {

                                const src = rule.style.getPropertyValue('src');
                                const match = src.match(/url\((['"]?)(.*?)\1\)/);
                                if (match) {
                                    fontUrl = match[2];

                                    // Detect format from URL or format() declaration
                                    if (src.includes('woff2') || fontUrl.includes('.woff2')) {
                                        fontFormat = 'woff2';
                                    } else if (src.includes('woff') || fontUrl.includes('.woff')) {
                                        fontFormat = 'woff';
                                    } else if (src.includes('ttf') || fontUrl.includes('.ttf')) {
                                        fontFormat = 'ttf';
                                    } else if (src.includes('otf') || fontUrl.includes('.otf')) {
                                        fontFormat = 'otf';
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        continue;
                    }
                }

                if (fontUrl) {
                    fonts.push({ fontFamily, fontUrl, fontFormat });
                }
            }

            return { fonts, fontMapping };
        });

        if (fontsInfo.fonts.length === 0) {
            console.log('No custom fonts found, but styles preserved.');
            return { storedFonts: [], fontMetadata: new Map() };
        }

        // 2. Create fonts directory if it doesn't exist
        const fontsDir = path.join(process.cwd(), 'public', 'fonts');
        await fs.mkdir(fontsDir, { recursive: true });

        // 3. Download and store each font
        const storedFonts = [];
        const fontMetadata = new Map();

        for (const fontInfo of fontsInfo.fonts) {
            try {
                // Resolve relative URLs
                const absoluteFontUrl = new URL(fontInfo.fontUrl, page.url()).href;
                console.log(`Downloading font: ${fontInfo.fontFamily} from ${absoluteFontUrl}`);

                const fontResponse = await fetch(absoluteFontUrl);
                const fontBuffer = await fontResponse.arrayBuffer();

                // Generate a safe filename
                const safeFontName = fontInfo.fontFamily
                    .replace(/[^a-z0-9]/gi, '_')
                    .toLowerCase();

                const extension = fontInfo.fontFormat || 'woff2';
                const filename = `${safeFontName}.${extension}`;
                const filepath = path.join(fontsDir, filename);

                // Save the font file
                await fs.writeFile(filepath, Buffer.from(fontBuffer));

                const fontData = {
                    fontFamily: fontInfo.fontFamily,
                    filename: filename,
                    localPath: filepath,
                    relativePath: `fonts/${filename}`,
                    format: fontInfo.fontFormat || 'woff2'
                };

                storedFonts.push(fontData);
                fontMetadata.set(fontInfo.fontFamily, fontData);

            } catch (error) {
                console.error(`Failed to download font ${fontInfo.fontFamily}:`, error.message);
            }
        }

        // 4. Inject data-font-family attributes (Legacy support / Double check)
        // We already did the heavy lifting in step 1 with data-preserved-style
        await page.evaluate(() => {
            const spans = document.querySelectorAll('span[style*="font-family"]');
            spans.forEach(span => {
                const fontFamily = span.style.fontFamily.replace(/['"]/g, '');
                span.setAttribute('data-font-family', fontFamily);
            });
        });

        console.log(`Successfully stored ${storedFonts.length} fonts.`);
        await fontConvert()
        console.log(`Fonts converted successfully.`);
        return { storedFonts, fontMetadata };

    } catch (error) {
        console.error('Failed to process custom fonts:', error);
        return { storedFonts: [], fontMetadata: new Map() };
    }
}

/**
 * Generates CSS @font-face declarations for stored fonts
 * @param {Array} storedFonts - Array of stored font information
 * @returns {string} CSS string with @font-face declarations
 */
export function generateFontFaceCSS(storedFonts) {
    return storedFonts.map(font => {
        return `@font-face {
    font-family: '${font.fontFamily}';
    src: url('${font.relativePath}') format('${font.format}');
    font-weight: normal;
    font-style: normal;
}`;
    }).join('\n\n');
}

/**
 * Restores ALL styles to HTML content based on data-preserved-style attributes
 * Also handles the legacy data-font-family fallback
 * @param {string} html - HTML content
 * @param {Map} fontMetadata - Map of font family names to font data (optional here but kept for signature)
 * @returns {string} HTML with restored styles
 */
export function restoreAllStyles(html, fontMetadata) {
    if (!html) return html;

    let restoredHtml = html;

    // 1. Restore FULL styles from data-preserved-style
    // This looks for <tag ... data-preserved-style="color: red; ..." ...>
    restoredHtml = restoredHtml.replace(/<([^>]+)data-preserved-style=["']([^"']+)["']([^>]*)>/gi, (match, before, styleContent, after) => {
        // If a style attribute already exists (unlikely if Readability stripped it, but possible), overwrite or append?
        // We overwrite because preserved-style is the source of truth.

        // Remove existing style attribute if present in 'before' or 'after' to avoid duplicates
        const cleanBefore = before.replace(/style=["'][^"']*["']\s?/gi, '');
        const cleanAfter = after.replace(/style=["'][^"']*["']\s?/gi, '');

        return `<${cleanBefore}style="${styleContent}" data-preserved-style="${styleContent}"${cleanAfter}>`;
    });

    // 2. Fallback: Restore font-family specifically if data-preserved-style missed it but data-font-family exists
    // (This matches your original logic)
    if (fontMetadata && fontMetadata.size > 0) {
        restoredHtml = restoredHtml.replace(/<span([^>]*?)data-font-family=["']([^"']+)["']([^>]*?)>/gi, (match, before, fontFamily, after) => {
            // Check if we already fixed this via step 1
            if (match.includes('style=') && match.includes(fontFamily)) {
                return match;
            }

            if (match.includes('style=')) {
                return match.replace(/style=["']([^"']*?)["']/i, `style="$1; font-family: '${fontFamily}'"`);
            } else {
                return `<span${before}data-font-family="${fontFamily}"${after} style="font-family: '${fontFamily}'">`;
            }
        });
    }

    return restoredHtml;
}