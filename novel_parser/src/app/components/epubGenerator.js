"use server"

import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { novelsDb, chaptersDb } from '../../../db/db_init.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Optimized HTML fixer for XHTML (EPUB)
 * Performs a single pass to fix void tags and strip bad control characters.
 */
function fixHtmlForXhtml(html) {
    if (!html) return '';

    // 1. Remove invisible control characters (0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F)
    // Keep 0x09 (tab), 0x0A (newline), 0x0D (return)
    let fixed = html.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // 2. Fix void tags (<img> -> <img />)
    const voidTags = 'br|hr|img|input|wbr|area|col|embed|meta|param|source|track';
    const regex = new RegExp(`<(${voidTags})([^>]*?)>`, 'gi');

    fixed = fixed.replace(regex, (match, tag, attrs) => {
        if (match.trim().endsWith('/>')) return match;
        return `<${tag}${attrs} />`;
    });

    return fixed;
}

/**
 * Detects custom fonts used in chapter content
 * Returns array of unique font families found
 */
function detectCustomFonts(chapters) {
    const fontFamilies = new Set();

    // Updated regex to also capture from data-font-family attributes
    const fontFamilyStyleRegex = /font-family:\s*['"]?([^;'"]+)['"]?/gi;
    const fontFamilyDataRegex = /data-font-family=["']([^"']+)["']/gi;

    chapters.forEach(chapter => {
        if (!chapter.content) return;

        // Check inline styles
        let match;
        while ((match = fontFamilyStyleRegex.exec(chapter.content)) !== null) {
            const fontFamily = match[1].trim().replace(/['"]/g, '');
            if (fontFamily && fontFamily !== 'serif' && fontFamily !== 'sans-serif' && fontFamily !== 'inherit') {
                fontFamilies.add(fontFamily);
            }
        }

        // Check data-font-family attributes
        while ((match = fontFamilyDataRegex.exec(chapter.content)) !== null) {
            const fontFamily = match[1].trim();
            if (fontFamily) {
                fontFamilies.add(fontFamily);
            }
        }
    });

    return Array.from(fontFamilies);
}

/**
 * Finds font files in public/fonts directory
 * Returns mapping of font family names to file paths
 */
function findFontFiles(fontFamilies) {
    const fontsDir = path.join(process.cwd(), 'public', 'fonts');
    const fontMap = {};

    if (!fs.existsSync(fontsDir)) {
        console.warn('Fonts directory not found:', fontsDir);
        return fontMap;
    }

    const fontFiles = fs.readdirSync(fontsDir);

    fontFamilies.forEach(fontFamily => {
        // Create a normalized version of the font family name for matching
        const normalizedFamily = fontFamily.toLowerCase().replace(/[^a-z0-9]/g, '_');

        // Find matching font files (woff2, woff, ttf, otf)
        const matchingFile = fontFiles.find(file => {
            const fileBase = path.basename(file, path.extname(file)).toLowerCase();
            return fileBase === normalizedFamily;
        });

        if (matchingFile) {
            const filePath = path.join(fontsDir, matchingFile);
            const ext = path.extname(matchingFile).slice(1);

            fontMap[fontFamily] = {
                originalName: fontFamily,
                fileName: matchingFile,
                filePath: filePath,
                format: ext === 'ttf' ? 'truetype' :
                    ext === 'otf' ? 'opentype' :
                        ext
            };

            console.log(`Found font: ${fontFamily} -> ${matchingFile}`);
        } else {
            console.warn(`Font file not found for: ${fontFamily}`);
        }
    });

    return fontMap;
}

/**
 * Generates CSS with @font-face declarations for custom fonts
 */
function getCss() {
    return `
body { font-family: serif; line-height: 1.5; margin: 0; padding: 1em; }
h1, h2, h3 { text-align: center; font-weight: bold; margin-bottom: 1em; }
p { margin-bottom: 1em; text-indent: 1em; }
img { max-width: 100%; height: auto; display: block; margin: 0 auto; }
.cover-img { max-height: 90vh; object-fit: contain; }
.toc-list { list-style-type: none; padding: 0; }
.toc-item { margin: 0.5em 0; }
a { text-decoration: none; color: inherit; }
`;
}

export async function generateEpub(bookId) {
    if (!bookId) throw new Error('Book ID is required');

    console.log(`Starting EPUB generation for book ${bookId}...`);

    try {
        // 1. Fetch Data
        const novel = novelsDb.getNovelById.get(bookId);
        if (!novel) throw new Error(`Novel ${bookId} not found`);

        const chapters = chaptersDb.getChaptersByNovelId.all(bookId);
        if (!chapters || chapters.length === 0) {
            throw new Error('No chapters found for this novel.');
        }
        console.log(`Found ${chapters.length} chapters for ${novel.title}`);

        // 2. Detect and Find Custom Fonts
        const detectedFonts = detectCustomFonts(chapters);
        console.log(`Detected ${detectedFonts.length} custom fonts:`, detectedFonts);

        const fontMap = findFontFiles(detectedFonts);
        const hasFonts = Object.keys(fontMap).length > 0;

        if (hasFonts) {
            console.log(`Will embed ${Object.keys(fontMap).length} fonts in EPUB`);
        }

        // 3. Prepare Paths
        const publicDir = path.resolve(process.cwd(), 'public');
        const coversDir = path.join(publicDir, 'covers');
        const epubsDir = path.join(publicDir, 'epubs');

        if (!fs.existsSync(epubsDir)) fs.mkdirSync(epubsDir, { recursive: true });
        if (!fs.existsSync(coversDir)) fs.mkdirSync(coversDir, { recursive: true });

        // 4. Handle Cover Image
        let coverPath = null;
        if (novel.cover_image) {
            let filename = novel.cover_image;

            if (filename.startsWith('http')) {
                const newFilename = `novel_${bookId}.jpg`;
                const success = await downloadImage(filename, path.join(coversDir, newFilename));
                if (success) filename = newFilename;
            }

            const localPath = path.join(coversDir, filename);
            if (fs.existsSync(localPath)) {
                const stats = fs.statSync(localPath);
                if (stats.size > 0) {
                    coverPath = localPath;
                } else {
                    console.warn(`Cover file exists but is empty (0 bytes): ${localPath}`);
                }
            } else {
                console.warn(`Cover file not found: ${localPath}`);
            }
        }

        // 5. Create Write Stream
        const outputFilename = `${sanitizeFilename(novel.title || 'Untitled')}.epub`;
        const outputPath = path.join(epubsDir, outputFilename);
        const publicPath = `/epubs/${outputFilename}`;

        const output = fs.createWriteStream(outputPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        return new Promise((resolve, reject) => {
            // -- Event Listeners --
            output.on('close', () => {
                console.log(`EPUB created: ${outputFilename} (${archive.pointer()} total bytes)`);

                // Extra integrity check
                try {
                    const st = fs.statSync(outputPath);
                    console.log('File on disk size:', st.size);
                    const fd = fs.openSync(outputPath, 'r');
                    const buf = Buffer.alloc(4);
                    fs.readSync(fd, buf, 0, 4, 0);
                    fs.closeSync(fd);
                    console.log('First 4 bytes (hex):', buf.toString('hex'));
                } catch (e) {
                    console.warn('Could not stat/inspect output file:', e);
                }

                resolve({
                    success: true,
                    path: outputPath,
                    filename: outputFilename,
                    publicUrl: publicPath
                });
            });

            output.on('error', (err) => {
                console.error('Output stream error:', err);
                reject(err);
            });

            archive.on('error', (err) => {
                console.error('Archiver Error:', err);
                reject(err);
            });

            archive.on('warning', (err) => {
                if (err.code === 'ENOENT') console.warn('Archiver Warning:', err);
                else reject(err);
            });

            // -- Pipe Data --
            archive.pipe(output);

            // 6. Build EPUB Structure

            // Mimetype (No compression)
            archive.append(Buffer.from('application/epub+zip'), { name: 'mimetype', store: true });

            // Container XML
            archive.append(getContainerXml(), { name: 'META-INF/container.xml' });

            // CSS with font faces
            archive.append(getCss(fontMap), { name: 'OEBPS/Styles/style.css' });

            // Embed Custom Fonts
            // if (hasFonts) {
            //     Object.values(fontMap).forEach(font => {
            //         if (fs.existsSync(font.filePath)) {
            //             archive.file(font.filePath, { name: `OEBPS/Fonts/${font.fileName}` });
            //             console.log(`Embedded font: ${font.fileName}`);
            //         }
            //     });
            // }

            // Cover Image
            if (coverPath) {
                archive.file(coverPath, { name: 'OEBPS/Images/cover.jpg' });
            }

            // Title Page
            archive.append(getTitlePageHtml(novel, !!coverPath), { name: 'OEBPS/Text/title.xhtml' });

            // Table of Contents
            archive.append(getTocHtml(novel, chapters), { name: 'OEBPS/Text/toc.xhtml' });

            // Chapters
            chapters.forEach((chapter, index) => {
                const html = getChapterHtml(chapter);
                archive.append(html, { name: `OEBPS/Text/chapter_${index + 1}.xhtml` });
            });

            // NCX & OPF
            archive.append(getNcx(novel, chapters, !!coverPath), { name: 'OEBPS/toc.ncx' });
            archive.append(getOpf(novel, chapters, !!coverPath, fontMap), { name: 'OEBPS/content.opf' });

            // Finalize
            try {
                archive.finalize();
            } catch (err) {
                reject(err);
            }
        });

    } catch (error) {
        console.error('EPUB Generation Critical Failure:', error);
        return { success: false, error: error.message };
    }
}

// ==========================================
// Helper Functions
// ==========================================

async function downloadImage(url, destPath) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`Failed to fetch cover image: ${response.statusText}`);
            return false;
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(destPath, buffer);
        return true;
    } catch (e) {
        console.warn('Error downloading cover:', e.message);
        return false;
    }
}

function sanitizeFilename(name) {
    return name.replace(/[^a-z0-9\-_. ]/gi, '_').replace(/_{2,}/g, '_');
}

function escapeXml(unsafe) {
    if (!unsafe) return '';
    return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
    });
}

// --- Templates ---

function getContainerXml() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
    <rootfiles>
        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
    </rootfiles>
</container>`;
}

function getTitlePageHtml(novel, hasCover) {
    const coverHtml = hasCover
        ? `<div class="cover"><img src="../Images/cover.jpg" alt="Cover" class="cover-img"/></div>`
        : '';

    return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${escapeXml(novel.title)}</title><link rel="stylesheet" type="text/css" href="../Styles/style.css"/></head>
<body>
    <div style="text-align:center; margin-top: 20px;">
        ${coverHtml}
        <h1>${escapeXml(novel.title)}</h1>
        <h3>${escapeXml(novel.author)}</h3>
        <p>${escapeXml(novel.description)}</p>
    </div>
</body>
</html>`;
}

function getTocHtml(novel, chapters) {
    const items = chapters.map((ch, i) =>
        `<li class="toc-item"><a href="chapter_${i+1}.xhtml">${escapeXml(ch.title || `Chapter ${ch.chapter_number}`)}</a></li>`
    ).join('\n');

    return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Table of Contents</title><link rel="stylesheet" type="text/css" href="../Styles/style.css"/></head>
<body>
    <h1>Table of Contents</h1>
    <ul class="toc-list">
        ${items}
    </ul>
</body>
</html>`;
}

function getChapterHtml(chapter) {
    let rawContent = chapter.content || '<p>[No Content]</p>';
    let content = fixHtmlForXhtml(rawContent);

    return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
    <title>${escapeXml(chapter.title)}</title>
    <link rel="stylesheet" type="text/css" href="../Styles/style.css"/>
</head>
<body>
    <h2>${escapeXml(chapter.title)}</h2>
    <div class="chapter-content">
        ${content}
    </div>
</body>
</html>`;
}

function getNcx(novel, chapters, hasCover) {
    let playOrder = 1;
    let navPoints = '';

    navPoints += `
    <navPoint id="navPoint-${playOrder}" playOrder="${playOrder}">
        <navLabel><text>Title Page</text></navLabel>
        <content src="Text/title.xhtml"/>
    </navPoint>`;
    playOrder++;

    navPoints += `
    <navPoint id="navPoint-${playOrder}" playOrder="${playOrder}">
        <navLabel><text>Table of Contents</text></navLabel>
        <content src="Text/toc.xhtml"/>
    </navPoint>`;
    playOrder++;

    chapters.forEach((ch, i) => {
        navPoints += `
        <navPoint id="navPoint-${playOrder}" playOrder="${playOrder}">
            <navLabel><text>${escapeXml(ch.title || `Chapter ${ch.chapter_number}`)}</text></navLabel>
            <content src="Text/chapter_${i+1}.xhtml"/>
        </navPoint>`;
        playOrder++;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
    <head>
        <meta name="dtb:uid" content="urn:uuid:${novel.url}"/>
        <meta name="dtb:depth" content="1"/>
        <meta name="dtb:totalPageCount" content="0"/>
        <meta name="dtb:maxPageNumber" content="0"/>
    </head>
    <docTitle><text>${escapeXml(novel.title)}</text></docTitle>
    <navMap>
        ${navPoints}
    </navMap>
</ncx>`;
}

function getOpf(novel, chapters, hasCover, fontMap = {}) {
    const manifestItems = [];
    const spineItems = [];

    // Static Items
    manifestItems.push('<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>');
    manifestItems.push('<item id="style" href="Styles/style.css" media-type="text/css"/>');
    manifestItems.push('<item id="title_page" href="Text/title.xhtml" media-type="application/xhtml+xml"/>');
    spineItems.push('<itemref idref="title_page"/>');

    if (hasCover) {
        manifestItems.push('<item id="cover_img" href="Images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>');
    }

    // Add font files to manifest
    Object.values(fontMap).forEach((font, index) => {
        const mediaType = font.format === 'woff2' ? 'font/woff2' :
            font.format === 'woff' ? 'font/woff' :
                font.format === 'truetype' ? 'font/ttf' :
                    font.format === 'opentype' ? 'font/otf' :
                        'application/octet-stream';

        manifestItems.push(`<item id="font_${index + 1}" href="Fonts/${font.fileName}" media-type="${mediaType}"/>`);
    });

    manifestItems.push('<item id="toc" href="Text/toc.xhtml" media-type="application/xhtml+xml"/>');
    spineItems.push('<itemref idref="toc"/>');

    // Chapter Items
    chapters.forEach((ch, i) => {
        const id = `chapter_${i+1}`;
        manifestItems.push(`<item id="${id}" href="Text/${id}.xhtml" media-type="application/xhtml+xml"/>`);
        spineItems.push(`<itemref idref="${id}"/>`);
    });

    return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
    <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
        <dc:title>${escapeXml(novel.title)}</dc:title>
        <dc:creator>${escapeXml(novel.author)}</dc:creator>
        <dc:language>en</dc:language>
        <dc:identifier id="BookId">urn:uuid:${novel.url}</dc:identifier>
        <meta name="cover" content="cover_img" />
    </metadata>
    <manifest>
        ${manifestItems.join('\n        ')}
    </manifest>
    <spine toc="ncx">
        ${spineItems.join('\n        ')}
    </spine>
    <guide>
        <reference type="cover" title="Cover" href="Text/title.xhtml"/>
        <reference type="toc" title="Table of Contents" href="Text/toc.xhtml"/>
    </guide>
</package>`;
}