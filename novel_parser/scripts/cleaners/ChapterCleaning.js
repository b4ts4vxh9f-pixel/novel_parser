'use server';

import * as cheerio from 'cheerio';
import { chaptersDb } from "@db/db_init.js"
import { cleaningMethod } from '@/app/components/cleaningMethod.js'; // Adjust path
import {decodeObfuscatedText as decodeText} from "./decodeObfuscatedText.js";

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
            if (!chapter.content) continue;

            const $ = cheerio.load(chapter.content, { xmlMode: false });

            // --- CORE CLEANING LOGIC ---

            // Rule 1: Remove span elements that DO NOT have a <p> parent
            // "filter" checks the condition. If true (no p parent), we remove() the element.
            // $('span').filter((i, el) => {
            //     return $(el).parents('p').length === 0;
            // }).remove();

            // Rule 2: Generic Cleanup (Unwrap spans that ARE inside p tags to clean up HTML)
            // This turns <p><span>Text</span></p> into <p>Text</p>
            // $('p span').each((i, el) => {
            //     $(el).replaceWith($(el).html());
            // });

            // Rule 3: Method Specific Watermark Removal
            // We serialize back to string to run Regex for watermarks
            let cleanedHtml = $.html();

            if (method == cleaningMethod.LotV) {
                // console.log('LotV watermark removal active');
                // Example: Remove specific domain watermarks often found in LotV
                // Using regex to catch "For the complete chapter..." with potential invisible chars
                // cleanedHtml = cleanedHtml.replace(/<p>\s*For the complete chapter.*?<\/p>/gi, '');
                // cleanedHtml = cleanedHtml.replace(/lilyonthevalley\.com/gi, '');
                $('p').filter((i, el) => {
                    return $(el).find('span').length === 0;
                }).remove();
                cleanedHtml = $.html();

            }
            else if (method == cleaningMethod.CG) {
                console.log('CG watermark removal active');

                const $doc = $; // or reload cleanedHtml with cheerio if needed

                $('[style*="font-family"]').each((i, el) => {
                    const node = $(el);
                    const style = node.attr("style");

                    const match = style.match(/font-family:\s*['"]?([^;'"]+)/i);
                    if (!match) return;

                    const fontName = match[1].toLowerCase();
                    const FONT_NAME = `public/fonts/${fontName}.ttf`;
                    console.log(`Found font-family: ${fontName}`);
                    const raw = node.text();
                    console.log(`Raw text for ${fontName}:`, raw);
                    const decoded = decodeText(raw, FONT_NAME);
                    console.log(`Decoded text for ${fontName}:`, decoded);
                    node.text(decoded);

                });

                // 1. Remove any element with height:1px in its inline style
                $doc('*[style]').each((i, el) => {
                    const style = ($doc(el).attr('style') || '').replace(/\s+/g, '').toLowerCase();

                    // Detect height:1px or height: 1px or height :1px etc.
                    if (style.includes('height:1px')) {
                        $doc(el).remove();
                    }

                    //needs to be the final step of cleaning
                    if (style.includes('color')) {
                        $doc(el).removeAttr('style');
                    }
                });

                // 2. Remove known watermark paragraphs
                cleanedHtml = $doc.html().replace(/<p>\s*Read only at.*?<\/p>/gi, '');
            }

            // Rule 4: Remove empty paragraphs left behind
            const $final = cheerio.load(cleanedHtml, { xmlMode: false });
            $final('p').filter((i, el) => $final(el).text().trim() === '').remove();

            // Get final body content (stripping <html><body> wrappers cheerio adds)
            const finalContent = $final('body').html() || '';

            // 3. Update Database
            // We must provide all fields required by your updateChapter statement
            chaptersDb.updateChapter.run({
                id: chapter.id,
                title: chapter.title,
                content: finalContent,
                status: chapter.status // Keep existing status
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