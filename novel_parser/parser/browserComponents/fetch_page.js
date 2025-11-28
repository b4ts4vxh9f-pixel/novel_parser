
import { handleCaptcha, recyclePage, getPageStats, simulateHumanBehavior } from './browser_init.js';

/**
 * Fetches a page using Puppeteer with retries, CAPTCHA handling, and anti-detection
 * @param {string} url - The URL to fetch
 * @param {Page} page - Puppeteer page object
 * @param {number} retries - Number of retry attempts
 * @returns {Promise<Object>} { html, page, recycled } - HTML content and potentially recycled page
 */
export async function fetchPage(url, page, retries = 3) {
    if (!url || typeof url !== 'string') {
        throw new Error('Invalid URL provided');
    }

    if (!page) {
        throw new Error('Page object is required');
    }

    let lastError;
    let currentPage = page;
    let wasRecycled = false;

    // Check if page should be recycled before fetching
    const stats = getPageStats(currentPage);
    if (stats.shouldRecycle) {
        console.log('Page reached usage limit, recycling before fetch...');
        currentPage = await recyclePage(currentPage);
        wasRecycled = true;
    }

    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            console.log(`Fetching ${url} (attempt ${attempt + 1}/${retries})`);

            // Random delay before navigation (human-like behavior)
            const preNavigationDelay = Math.random() * 1000 + 500;
            await delay(preNavigationDelay);

            // Navigate to page
            const response = await currentPage.goto(url, {
                waitUntil: 'domcontentloaded', // Networkidle2 is often too strict for Cloudflare
                timeout: 60000 // 60s timeout
            });

            // --- CLOUDFLARE HANDLING START ---

            // Check if we are in the waiting room
            let title = await currentPage.title();

            if (title.includes('Just a moment') || title.includes('DDoS-Guard') || title.includes('Cloudflare')) {
                console.log('Cloudflare challenge detected. Waiting for redirection...');

                // Wait up to 20 seconds for the title to change (indicating redirect happened)
                try {
                    await currentPage.waitForFunction(
                        () => !document.title.includes('Just a moment'),
                        { timeout: 20000 }
                    );
                    console.log('Cloudflare challenge passed!');
                } catch (e) {
                    console.warn('Timeout waiting for Cloudflare challenge to finish.');
                }
            }

            if (!response) {
                throw new Error('No response received');
            }

            const status = response.status();
            console.log(`Response status: ${status}`);

            // Handle different status codes
            if (status === 404) {
                throw new Error(`Page not found: ${url}`);
            }

            if (status === 403) {
                console.warn(`Access forbidden (403), may need CAPTCHA or be blocked`);
            }

            if (status >= 500) {
                throw new Error(`Server error (${status})`);
            }

            // Wait for page to settle
            await delay(Math.random() * 1000 + 1000);

            // Check for and handle CAPTCHAs
            const captchaSolved = await handleCaptcha(currentPage);
            if (!captchaSolved) {
                throw new Error('CAPTCHA detected but could not be solved');
            }


            // Re-check status after potential redirect
            // Note: Response object refers to the *first* response (the 403/503 challenge page).
            // We need to check the current state of the DOM.

            // --- CLOUDFLARE HANDLING END ---

            // Simulate human behavior
            await simulateHumanBehavior(currentPage);

            // Get page content
            const html = await currentPage.content();

            if (!html || html.length < 100) {
                throw new Error('Page content too short or empty');
            }

            // Check for common anti-bot messages
            const bodyText = await currentPage.evaluate(() => document.body.innerText.toLowerCase());

            if (bodyText.includes('Enable JavaScript and cookies to continue')) {
                throw new Error('Cloudflare challenge failed (JS disabled or detected)');
            }

            const isBlocked = (
                // Use more specific blocked phrases
                bodyText.includes('access denied for your ip') ||
                bodyText.includes('your request was blocked') ||
                bodyText.includes('rate limit exceeded') ||
                bodyText.includes('too many requests from your ip') ||

                // General phrases, but require them only if the content is relatively small,
                // suggesting a pure error page rather than a fully loaded site with a false positive keyword.
                (html.length < 5000 && (
                    bodyText.includes('access denied') ||
                    bodyText.includes('blocked')
                ))
            );

            if (isBlocked) {
                console.warn('Possible rate limiting or blocking detected');

                // If blocked, wait longer and recycle page
                if (attempt < retries - 1) {
                    const blockDelay = (attempt + 1) * 5000 + Math.random() * 5000;
                    console.log(`Waiting ${blockDelay}ms before retry due to potential block...`);
                    await delay(blockDelay);

                    // Recycle page with new fingerprint
                    currentPage = await recyclePage(currentPage);
                    wasRecycled = true;
                    continue;
                }
            }

            console.log(`✓ Successfully fetched ${url} (${html.length} bytes)`);

            return {
                html,
                page: currentPage,
                recycled: wasRecycled
            };

        } catch (error) {
            lastError = error;
            console.error(`Attempt ${attempt + 1} failed for ${url}:`, error.message);

            // Check if it's a timeout or network error
            if (error.message.includes('timeout') || error.message.includes('net::')) {
                console.log('Network or timeout error, will retry...');
            }

            // Wait before retry with exponential backoff + jitter
            if (attempt < retries - 1) {
                const baseDelay = Math.min(2000 * Math.pow(2, attempt), 10000);
                const jitter = Math.random() * 2000;
                const totalDelay = baseDelay + jitter;

                console.log(`Waiting ${Math.round(totalDelay)}ms before retry...`);
                await delay(totalDelay);

                // On second failure, try recycling the page
                if (attempt === 1 && !wasRecycled) {
                    console.log('Recycling page after repeated failure...');
                    currentPage = await recyclePage(currentPage);
                    wasRecycled = true;
                }
            }
        }
    }

    throw new Error(`Failed to fetch ${url} after ${retries} attempts: ${lastError.message}`);
}

/**
 * Utility function for delays
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export default fetchPage;