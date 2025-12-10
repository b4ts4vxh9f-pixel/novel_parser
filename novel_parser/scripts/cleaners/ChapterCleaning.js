'use server';

import * as cheerio from 'cheerio';
import { chaptersDb } from "@db/db_init.js"
import { cleaningMethod } from '@/app/components/cleaningMethod.js';
import {decodeObfuscatedText as decodeText} from "./decodeObfuscatedText.js";
import { cleanCGMethod } from "./dedicatedCleaners/CGcleaner.js";


/**
 * Cleans a chapter title by:
 * 1. Removing common novel chapter prefixes (Ch, Chapter, Vol, etc.) and related symbols/dashes.
 * 2. Removing the specific watermark " - Chrysanthemum Garden".
 * * @param {string} title The original chapter title.
 * @returns {string} The cleaned chapter title.
 */
const cleanTitle = (title) => {
    if (!title) return '';

    // 1. Remove the specific watermark " - Chrysanthemum Garden" (case-insensitive)
    let cleaned = title.replace(/\s*-\s*Chrysanthemum Garden/gi, '');

    cleaned = cleaned.replace(/[^a-z0-9]/gi, ' ');

    // 2. Remove common chapter prefixes and separators (like 'OFDA Ch1 - Henpecked' -> 'Henpecked')
    // This targets patterns like "ABC ChXX - Title" or "ABC Chapter YY: Title"
    // Adjust this regex based on common patterns in your data if needed.
    // This specific pattern targets content before the first hyphen/colon that also includes a number/Ch/Chapter/Vol
    // const prefixRegex = /^(.*?(?:Ch|Chapter|Vol)\s*\d+.*?)\s*[:—\-–]\s*/i;

    // Check if the title starts with a common chapter marker and separator
    // const match = cleaned.match(prefixRegex);
    // if (match) {
    //     // If a match is found, take the text AFTER the separator
    //     cleaned = cleaned.substring(match[0].length);
    // }

    // Final cleanup of extra spaces
    return cleaned.trim();
};


// Placeholder moveFontFile function if not implemented yet
const moveFontFile = async (sourcePath, targetDir) => {
    // TODO: Implement font file moving logic
    console.log(`TODO: Move font from ${sourcePath} to ${targetDir}`);
};

export const cleanNovelChapters = async (novelId, method) => {
    try {
        // 1. Fetch all chapters for the novel
        const chapters = chaptersDb.getChaptersByNovelId.all(novelId);

        if (!chapters || chapters.length === 0) {
            return { success: false, error: 'No chapters found for this novel.' };
        }

        let cleanedCount = 0;

        // 2. Iterate and Clean
        for (const chapter of chapters) {

            const newTitle = cleanTitle(chapter.title);

            if (!chapter.content) {
                // Update the title even if content is missing
                chaptersDb.updateChapter.run({
                    id: chapter.id,
                    title: newTitle, // Use the new cleaned title
                    content: chapter.content,
                    status: chapter.status
                });
                cleanedCount++;
                continue;
            }

            const $ = cheerio.load(chapter.content, { xmlMode: false });

            // --- CORE CLEANING LOGIC (Before Method-Specific) ---

            // Rule 1: Remove span elements that DO NOT have a <p> parent (Preserved)
            // $('span').filter((i, el) => {
            //     return $(el).parents('p').length === 0;
            // }).remove();

            // Rule 2: Generic Cleanup (Unwrap spans that ARE inside p tags) (Preserved)
            // $('p span').each((i, el) => {
            //     $(el).replaceWith($(el).html());
            // });

            // -----------------------------------------------
            // Rule 3: Method Specific Watermark Removal
            // -----------------------------------------------
            let cleanedHtml = $.html(); // Initialize with the HTML after generic Cheerio cleanup

            if (method === cleaningMethod.LotV) {
                $('p').filter((i, el) => {
                    return $(el).find('span').length === 0;
                }).remove();
                cleanedHtml = $.html();
            }

            else if (method === cleaningMethod.CG) {
                // --- Call the separate CG component ---
                // We pass the Cheerio instance ($) and the decode utility function
                cleanedHtml = cleanCGMethod($, decodeText, moveFontFile, novelId);
            }

            // -----------------------------------------------
            // Rule 4: Final Cleanup (After Method-Specific)
            // -----------------------------------------------

            // Load the cleanedHtml back into a new Cheerio instance for final cleanup
            const $final = cheerio.load(cleanedHtml, { xmlMode: false });

            // Remove empty paragraphs left behind
            $final('p').filter((i, el) => $final(el).text().trim() === '').remove();

            // Get final body content (stripping <html><body> wrappers cheerio adds)
            const finalContent = $final('body').html() || '';

            // 3. Update Database
            chaptersDb.updateChapter.run({
                id: chapter.id,
                title: newTitle,
                content: finalContent,
                status: chapter.status
            });

            cleanedCount++;
        }

        return {
            success: true,
            message: `Successfully cleaned ${cleanedCount} chapters.`
        };

    } catch (error) {
        console.error('Error in chapterCleaning:', error);
        return { success: false, error: error.message };
    }
};