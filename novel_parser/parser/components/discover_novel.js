import { fetchPage } from '../browserComponents/fetch_page.js';
import { parseWithReadability } from '../textProcessing/readability.js';
import { novelsDb } from '../../db/db_init.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Helper to fix __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Discovers and parses a novel's main page
 * @param {number} bookId - Novel ID from database
 * @param {Page} page - Puppeteer page object
 * @returns {Promise<Object>} Parsed novel data
 */
export async function discoverNovel(bookId, page) {
    if (!bookId) {
        throw new Error('Book ID is required');
    }

    if (!page) {
        throw new Error('Page object is required');
    }

    try {
        // Fetch novel data from database
        const novel = novelsDb.getNovelById.get(bookId);

        if (!novel || !novel.url) {
            throw new Error(`Novel with ID ${bookId} not found or has no URL`);
        }

        console.log(`Discovering novel: ${novel.url}`);

        // Fetch the page HTML
        const html = await fetchPage(novel.url, page);

        // Parse with Readability for basic info
        const parsed = parseWithReadability(html);

        // Extract structured data
        const novelData = {
            title: '',
            author: '',
            description: '',
            cover_image: null,
            totalChapters: 0,
            chapters: []
        };

        // 1. Extract Metadata
        novelData.title = await extractTitle(page, parsed);
        novelData.author = await extractAuthor(page, parsed);
        novelData.description = await extractDescription(page, parsed);

        // 2. Handle Cover Image
        const coverUrl = await extractCoverUrl(page, parsed);
        if (coverUrl) {
            // Download and save to public/covers
            const fileName = await downloadCover(coverUrl, bookId);
            if (fileName) {
                novelData.cover_image = fileName;
            }
        }

        // 3. Extract Table of Contents
        const chaptersData = await extractTableOfContents(page, novel.url);
        novelData.chapters = chaptersData;
        novelData.totalChapters = chaptersData.length;

        // 4. Update database
        novelsDb.updateNovel.run({
            id: bookId,
            title: novelData.title || novel.title,
            raws_title: novel.raws_title,
            author: novelData.author,
            description: novelData.description,
            total_chapters: novelData.totalChapters,
            status: 1, // Mark as processed
            cover_image: novelData.cover_image // Pass the filename
        });

        console.log(`Successfully discovered novel: ${novelData.title}`);

        return {
            success: true,
            ...novelData
        };

    } catch (error) {
        console.error(`Error discovering novel ${bookId}:`, error);

        // Update status to error (-1)
        novelsDb.updateNovelStatus.run(-1, bookId);

        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Downloads the cover image and saves it locally
 * @param {string} url - The remote URL of the image
 * @param {number} bookId - The ID of the book (used for naming)
 * @returns {Promise<string|null>} The saved filename or null
 */
async function downloadCover(url, bookId) {
    try {
        // Clean URL (handle relative URLs if necessary, though usually extractors get absolute)
        if (!url.startsWith('http')) return null;

        // Determine extension
        let extension = path.extname(new URL(url).pathname);
        if (!extension || extension.length > 5) extension = '.jpg'; // Default fallback

        const filename = `novel_${bookId}${extension}`;

        // Resolve path: project_root/public/covers
        // We assume this script is in /scripts/parser_modules, so we go up two levels then into public
        const publicDir = path.resolve(process.cwd(), 'public', 'covers');

        // Ensure directory exists
        if (!fs.existsSync(publicDir)) {
            fs.mkdirSync(publicDir, { recursive: true });
        }

        const filePath = path.join(publicDir, filename);

        // Fetch the image
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        fs.writeFileSync(filePath, buffer);
        console.log(`Cover saved: ${filename}`);

        return filename;

    } catch (error) {
        console.error(`Failed to download cover for book ${bookId}:`, error.message);
        return null;
    }
}

/**
 * Extracts the cover image URL from the page
 */
async function extractCoverUrl(page, parsed) {
    try {
        // 1. Try Meta Tags (Best Source)
        const metaImage = await page.$eval('meta[property="og:image"]', el => el.content).catch(() => null);
        if (metaImage) return metaImage;

        const twitterImage = await page.$eval('meta[name="twitter:image"]', el => el.content).catch(() => null);
        if (twitterImage) return twitterImage;

        // 2. Try Readability
        if (parsed?.lead_image_url) {
            return parsed.lead_image_url;
        }

        // 3. Try Common Selectors
        const selectors = [
            '.book-img img',
            '.cover img',
            '.detail-info-cover img',
            '.novel-cover img',
            '[class*="cover"] img',
            '.img-box img'
        ];

        for (const selector of selectors) {
            try {
                const src = await page.$eval(selector, el => el.src || el.dataset.src);
                if (src && src.startsWith('http')) {
                    return src;
                }
            } catch (e) {
                continue;
            }
        }

        return null;
    } catch (error) {
        console.error('Error extracting cover URL:', error);
        return null;
    }
}

/**
 * Extracts the title from the page
 */
async function extractTitle(page, parsed) {
    try {
        // Try readability first
        if (parsed?.title) {
            return parsed.title;
        }

        // Try meta tags
        const metaTitle = await page.$eval('meta[property="og:title"]', el => el.content)
            .catch(() => null);
        if (metaTitle) return metaTitle;

        // Try common selectors
        const selectors = ['h1', '.title', '[class*="title"]', '.novel-title'];
        for (const selector of selectors) {
            try {
                const title = await page.$eval(selector, el => el.innerText.trim());
                if (title && title.length > 0 && title.length < 200) {
                    return title;
                }
            } catch (e) {
                continue;
            }
        }

        // Fallback to page title
        return await page.title();
    } catch (error) {
        console.error('Error extracting title:', error);
        return '';
    }
}

/**
 * Extracts the author name from the page
 */
async function extractAuthor(page, parsed) {
    try {
        // Try readability byline
        if (parsed?.byline) {
            return parsed.byline;
        }

        // Try meta tags
        const metaAuthor = await page.$eval('meta[name="author"]', el => el.content)
            .catch(() => null);
        if (metaAuthor) return metaAuthor;

        // Try common selectors
        const selectors = [
            '.author',
            '[class*="author"]',
            '[itemprop="author"]',
            '.by-line',
            '.byline'
        ];

        for (const selector of selectors) {
            try {
                const author = await page.$eval(selector, el => el.innerText.trim());
                if (author && author.length > 0 && author.length < 100) {
                    return author.replace(/^by\s+/i, '');
                }
            } catch (e) {
                continue;
            }
        }

        return '';
    } catch (error) {
        console.error('Error extracting author:', error);
        return '';
    }
}

/**
 * Extracts the description from the page
 */
async function extractDescription(page, parsed) {
    try {
        // Try meta description
        const metaDesc = await page.$eval('meta[property="og:description"]', el => el.content)
            .catch(() => null);
        if (metaDesc && metaDesc.length > 50) return metaDesc;

        const metaDescAlt = await page.$eval('meta[name="description"]', el => el.content)
            .catch(() => null);
        if (metaDescAlt && metaDescAlt.length > 50) return metaDescAlt;

        // Try readability excerpt
        if (parsed?.excerpt && parsed.excerpt.length > 50) {
            return parsed.excerpt;
        }

        // Try common selectors
        const selectors = [
            '.description',
            '[class*="description"]',
            '.summary',
            '[class*="summary"]',
            '.synopsis',
            '[itemprop="description"]',
            'story__summary', //LoTV
        ];

        for (const selector of selectors) {
            try {
                const desc = await page.$eval(selector, el => el.innerText.trim());
                if (desc && desc.length > 50 && desc.length < 5000) {
                    return desc;
                }
            } catch (e) {
                continue;
            }
        }

        return '';
    } catch (error) {
        console.error('Error extracting description:', error);
        return '';
    }
}

/**
 * Extracts table of contents / chapter links
 */
async function extractTableOfContents(page, baseUrl) {
    try {
        // Look for chapter lists
        const chapters = await page.evaluate(() => {
            const links = [];

            // Try to find chapter container
            const containerSelectors = [
                '.chapter-list',
                '[class*="chapter"]',
                '.table-of-contents',
                '[id*="chapter"]',
                'ul',
                'ol'
            ];

            let container = null;
            for (const selector of containerSelectors) {
                const el = document.querySelector(selector);
                if (el && el.querySelectorAll('a').length > 5) {
                    container = el;
                    break;
                }
            }

            // Extract links
            const linkElements = container
                ? container.querySelectorAll('a')
                : document.querySelectorAll('a[href*="chapter"]');

            linkElements.forEach((link, index) => {
                const href = link.href;
                const text = link.innerText.trim();

                if (href && text && !href.includes('#') && href !== window.location.href) {
                    links.push({
                        url: href,
                        title: text,
                        order: index + 1
                    });
                }
            });

            return links;
        });

        // Filter and validate chapter links
        const validChapters = chapters.filter((ch, index) => {
            // Remove duplicates
            return chapters.findIndex(c => c.url === ch.url) === index;
        });

        console.log(`Found ${validChapters.length} chapters`);
        return validChapters;

    } catch (error) {
        console.error('Error extracting table of contents:', error);
        return [];
    }
}

export default discoverNovel;