import { initBrowser, getPage, closeBrowser, recyclePage, getPageStats } from './browserComponents/browser_init.js';
import { discoverNovel } from './components/discover_novel.js';
import { discoverChapter } from './components/discover_chapter.js';
import { novelsDb, chaptersDb } from '../db/db_init.js';

// Status codes
const STATUS = {
    PENDING: 0,
    SUCCESS: 1,
    ERROR: -1,
    PROCESSING: 2
};

/**
 * Main parser wrapper that orchestrates the parsing process
 */
export async function ParserWrapper() {
    console.log('Starting parser with stealth mode...');

    let browserInitialized = false;
    let page = null;

    try {
        // Parse novels first
        const pendingNovels = novelsDb.getNovelsByStatus.all(STATUS.PENDING);

        if (pendingNovels.length > 0) {
            console.log(`Found ${pendingNovels.length} pending novels`);

            if (!browserInitialized) {
                await initBrowser();
                page = await getPage();
                browserInitialized = true;
            }

            const result = await ParseNovels({ novels: pendingNovels, page });
            page = result.page; // Update page reference in case it was recycled
        } else {
            console.log('No pending novels to parse');
        }

        // Parse chapters
        const pendingChapters = chaptersDb.getChaptersByStatus.all(STATUS.PENDING);

        if (pendingChapters.length > 0) {
            console.log(`Found ${pendingChapters.length} pending chapters`);

            if (!browserInitialized) {
                await initBrowser();
                page = await getPage();
                browserInitialized = true;
            }

            const result = await ParseChapters({ chapters: pendingChapters, page });
            page = result.page; // Update page reference
        } else {
            console.log('No pending chapters to parse');
        }

        console.log('Parser completed successfully');

    } catch (error) {
        console.error('Parser error:', error);
        throw error;
    } finally {
        // Clean up browser resources
        if (browserInitialized) {
            await closeBrowser();
        }
    }
}

/**
 * Parses multiple novels with page recycling
 * @param {Object} params
 * @param {Array} params.novels - Array of novel objects
 * @param {Page} params.page - Puppeteer page object
 * @returns {Object} Results and updated page
 */
async function ParseNovels({ novels, page }) {
    console.log(`Parsing ${novels.length} novels...`);

    let successCount = 0;
    let errorCount = 0;
    let currentPage = page;

    for (let i = 0; i < novels.length; i++) {
        const novel = novels[i];

        try {
            // Check if page should be recycled
            const stats = getPageStats(currentPage);
            if (stats.shouldRecycle) {
                console.log(`Recycling page after ${stats.uses} uses`);
                currentPage = await recyclePage(currentPage);
            }

            // Mark as processing
            novelsDb.updateNovelStatus.run(STATUS.PROCESSING, novel.id);

            // Discover and parse novel
            const result = await discoverNovel(novel.id, currentPage);

            // Update page if it was recycled during discover
            if (result.page) {
                currentPage = result.page;
            }

            if (result.success) {
                successCount++;
                console.log(`✓ Successfully parsed: ${result.title} (${i + 1}/${novels.length})`);

                // Insert discovered chapters into database
                if (result.chapters && result.chapters.length > 0) {
                    for (const chapter of result.chapters) {
                        try {
                            chaptersDb.insertChapter.run({
                                novel_id: novel.id,
                                url: chapter.url,
                                title: chapter.title,
                                content: null,
                                chapter_number: chapter.order,
                                status: STATUS.PENDING
                            });
                        } catch (err) {
                            // Ignore duplicate entries
                            if (!err.message.includes('UNIQUE')) {
                                console.error(`Error inserting chapter: ${err.message}`);
                            }
                        }
                    }
                }
            } else {
                errorCount++;
                console.error(`✗ Failed to parse novel ${novel.id}: ${result.error}`);
                novelsDb.updateNovelStatus.run(STATUS.ERROR, novel.id);
            }

            // Rate limiting with randomization - wait between requests
            const delayTime = Math.random() * 2000 + 2000; // 2-4 seconds
            console.log(`Waiting ${Math.round(delayTime)}ms before next request...`);
            await delay(delayTime);

        } catch (error) {
            errorCount++;
            console.error(`Error processing novel ${novel.id}:`, error);
            novelsDb.updateNovelStatus.run(STATUS.ERROR, novel.id);

            // On error, wait longer and consider recycling page
            await delay(5000);
            if (Math.random() > 0.5) {
                console.log('Recycling page after error...');
                currentPage = await recyclePage(currentPage);
            }
        }
    }

    console.log(`Novels parsing complete: ${successCount} success, ${errorCount} errors`);

    return { page: currentPage, successCount, errorCount };
}

/**
 * Parses multiple chapters with page recycling
 * @param {Object} params
 * @param {Array} params.chapters - Array of chapter objects
 * @param {Page} params.page - Puppeteer page object
 * @returns {Object} Results and updated page
 */
async function ParseChapters({ chapters, page }) {
    console.log(`Parsing ${chapters.length} chapters...`);

    let successCount = 0;
    let errorCount = 0;
    let currentPage = page;

    for (let i = 0; i < chapters.length; i++) {
        const chapter = chapters[i];

        try {
            // Check if page should be recycled
            const stats = getPageStats(currentPage);
            if (stats.shouldRecycle) {
                console.log(`Recycling page after ${stats.uses} uses`);
                currentPage = await recyclePage(currentPage);
            }

            // Mark as processing
            chaptersDb.updateChapterStatus.run(STATUS.PROCESSING, chapter.id);

            // Discover and parse chapter
            const result = await discoverChapter(chapter, currentPage);

            // Update page if it was recycled during discover
            if (result.page) {
                currentPage = result.page;
            }

            if (result.success) {
                // Update chapter in database
                chaptersDb.updateChapter.run({
                    id: chapter.id,
                    title: result.title,
                    content: result.content,
                    status: STATUS.SUCCESS
                });

                successCount++;
                console.log(`✓ Successfully parsed: ${result.title} (${i + 1}/${chapters.length})`);
            } else {
                errorCount++;
                console.error(`✗ Failed to parse chapter ${chapter.id}: ${result.error}`);
                chaptersDb.updateChapterStatus.run(STATUS.ERROR, chapter.id);
            }

            // Rate limiting with randomization - wait between requests
            const delayTime = Math.random() * 1500 + 1500; // 1.5-3 seconds
            console.log(`Waiting ${Math.round(delayTime)}ms before next request...`);
            await delay(delayTime);

        } catch (error) {
            errorCount++;
            console.error(`Error processing chapter ${chapter.id}:`, error);
            chaptersDb.updateChapterStatus.run(STATUS.ERROR, chapter.id);

            // On error, wait longer
            await delay(3000);
        }
    }

    console.log(`Chapters parsing complete: ${successCount} success, ${errorCount} errors`);

    return { page: currentPage, successCount, errorCount };
}

/**
 * Utility function for delays
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export { ParseNovels, ParseChapters, STATUS };
export default ParserWrapper;