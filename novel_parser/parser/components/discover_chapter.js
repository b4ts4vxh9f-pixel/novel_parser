import { fetchPage } from '../browserComponents/fetch_page.js';
import { parseWithReadability } from '../textProcessing/readability.js';
import { storeCustomFonts, restoreAllStyles } from '../textProcessing/font_decoding.js';

/**
 * Discovers and parses a chapter
 */
export async function discoverChapter(chapterObj, page) {
    if (!chapterObj || !chapterObj.url) {
        throw new Error('Invalid chapter object: URL is required');
    }

    if (!page) {
        throw new Error('Page object is required');
    }

    try {
        console.log(`Discovering chapter: ${chapterObj.url}`);

        // 1. Fetch the page HTML
        const { page: updatedPage } = await fetchPage(chapterObj.url, page);

        // 2. Store custom fonts AND preserve styles in data-attributes
        const { storedFonts, fontMetadata } = await storeCustomFonts(updatedPage);

        // 3. Get the cleaned HTML from the DOM (contains data-preserved-style)
        const cleanedHtml = await updatedPage.content();

        // 4. Parse with Readability
        const parsed = parseWithReadability(cleanedHtml);

        if (!parsed) {
            console.warn(`Readability failed to parse ${chapterObj.url}`);
            const fallbackContent = await extractContentFallback(updatedPage);

            // Restore styles even in fallback
            const restoredContent = restoreAllStyles(fallbackContent, fontMetadata);

            return {
                success: !!fallbackContent,
                title: chapterObj.title || 'Untitled Chapter',
                content: restoredContent || '',
                textContent: fallbackContent || '',
                method: 'fallback',
                page: updatedPage,
                fonts: storedFonts
            };
        }

        // 5. Restore ALL styles (Readability likely stripped style="", but kept data-preserved-style="")
        const restoredContent = restoreAllStyles(parsed.content, fontMetadata);

        return {
            success: true,
            title: parsed.title || chapterObj.title || 'Untitled Chapter',
            content: restoredContent,
            textContent: parsed.textContent,
            length: parsed.length,
            excerpt: parsed.excerpt,
            method: 'readability',
            page: updatedPage,
            fonts: storedFonts
        };

    } catch (error) {
        console.error(`Error discovering chapter ${chapterObj.url}:`, error);
        return {
            success: false,
            error: error.message,
            title: chapterObj.title || 'Error',
            content: '',
            textContent: '',
            fonts: []
        };
    }
}

/**
 * Fallback method
 */
async function extractContentFallback(page) {
    try {
        const selectors = ['article', '.chapter-content', '#content', 'main'];
        for (const selector of selectors) {
            try {
                const content = await page.$eval(selector, el => el.innerHTML);
                if (content && content.length > 100) return content;
            } catch (e) { continue; }
        }
        return await page.$eval('body', el => el.innerHTML) || '';
    } catch (error) {
        return '';
    }
}