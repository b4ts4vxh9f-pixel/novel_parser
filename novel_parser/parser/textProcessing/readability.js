
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

/**
 * Cleans text content by removing invisible Unicode characters
 * @param {string} text - Text to clean
 * @returns {string} Cleaned text
 */
function cleanText(text) {
    if (!text) return '';

    return text
        // Remove zero-width spaces and related characters
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        // Remove soft hyphens
        .replace(/\u00AD/g, '')
        // Remove other invisible/formatting characters
        .replace(/\u180E/g, '') // Mongolian vowel separator
        .replace(/\u2060/g, '') // Word joiner
        // Normalize whitespace
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Recursively cleans all text nodes in an element
 * @param {Element} element - DOM element to clean
 */
function cleanTextNodes(element) {
    const walker = element.ownerDocument.createTreeWalker(
        element,
        5, // NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT
        null,
        false
    );

    let node;
    while (node = walker.nextNode()) {
        if (node.nodeType === 3) { // Text node
            node.textContent = cleanText(node.textContent);
        }
    }
}

/**
 * Cleans HTML content by removing unwanted attributes and invisible characters
 * @param {string} html - HTML content to clean
 * @returns {string} Cleaned HTML
 */
function cleanHTML(html) {
    if (!html) return '';

    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;

        // Remove unwanted attributes from all elements
        const unwantedAttrs = [
            'data-fictioneer-chapter-target',
            'data-action',
            'data-paragraph-id',
            // 'id',
            // 'class',
            // 'style'
        ];

        const allElements = doc.querySelectorAll('*');
        allElements.forEach(el => {
            unwantedAttrs.forEach(attr => {
                if (el.hasAttribute(attr)) {
                    el.removeAttribute(attr);
                }
            });
        });

        // Remove XML comments and processing instructions
        const commentWalker = doc.createTreeWalker(doc.body, 128); // NodeFilter.SHOW_COMMENT
        const comments = [];
        while (commentWalker.nextNode()) {
            comments.push(commentWalker.currentNode);
        }
        comments.forEach(comment => comment.remove());

        // Clean all text nodes
        cleanTextNodes(doc.body);

        return doc.body.innerHTML;
    } catch (error) {
        console.error('Error cleaning HTML:', error);
        return html;
    }
}

/**
 * Parses HTML content using Mozilla's Readability library
 * @param {string} html - Raw HTML content
 * @returns {Object|null} Parsed article object or null if parsing fails
 */
export function parseWithReadability(html) {
    if (!html || typeof html !== 'string') {
        console.warn('Invalid HTML provided to parseWithReadability');
        return null;
    }

    try {
        const dom = new JSDOM(html);
        const reader = new Readability(dom.window.document);
        const article = reader.parse();

        // article may be null if readability couldn't extract content
        if (article) {
            return {
                title: article.title || '',
                byline: article.byline || '',
                content: cleanHTML(article.content) || '',
                textContent: cleanText(article.textContent) || '',
                length: article.length || 0,
                excerpt: cleanText(article.excerpt) || ''
            };
        }

        return null;
    } catch (error) {
        console.error('Error parsing with Readability:', error);
        return null;
    }
}