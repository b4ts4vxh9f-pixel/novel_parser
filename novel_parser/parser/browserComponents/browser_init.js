import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import RecaptchaPlugin from 'puppeteer-extra-plugin-recaptcha';
import UserAgent from 'user-agents';

// Add stealth plugin to evade detection
puppeteer.use(StealthPlugin());

// Add reCAPTCHA plugin (requires 2Captcha API key - set in env)
// puppeteer.use(
//     RecaptchaPlugin({
//         provider: {
//             id: '2captcha',
//             token: process.env.CAPTCHA_API_KEY || 'DEMO_KEY' // Replace with your API key
//         },
//         visualFeedback: true // Show feedback when solving CAPTCHAs
//     })
// );

let browserInstance = null;
const pagePool = new Map(); // Map to track page usage count
const MAX_PAGES = 3; // Reduced for better resource management
const MAX_PAGE_USES = Math.floor(Math.random() * 6) + 10; // 10-15 uses per page

/**
 * Generates random browser fingerprint data
 */
function generateFingerprint() {
    const userAgent = new UserAgent({ deviceCategory: 'desktop' });

    const viewports = [
        { width: 1920, height: 1080 },
        { width: 1366, height: 768 },
        { width: 1536, height: 864 },
        { width: 1440, height: 900 },
        { width: 2560, height: 1440 }
    ];

    const languages = [
        ['en-US', 'en'],
        ['en-GB', 'en'],
        ['en-CA', 'en'],
        ['en-AU', 'en']
    ];

    const timezones = [
        'America/New_York',
        'America/Chicago',
        'America/Los_Angeles',
        'America/Denver',
        'Europe/London',
        'Europe/Paris'
    ];

    return {
        userAgent: userAgent.toString(),
        viewport: viewports[Math.floor(Math.random() * viewports.length)],
        languages: languages[Math.floor(Math.random() * languages.length)],
        timezone: timezones[Math.floor(Math.random() * timezones.length)],
        platform: 'Win32',
        webgl: {
            vendor: 'Intel Inc.',
            renderer: 'Intel Iris OpenGL Engine'
        }
    };
}

/**
 * Initializes a Puppeteer browser instance with stealth settings
 * @returns {Promise<Browser>} Puppeteer browser instance
 */
export async function initBrowser() {
    if (browserInstance && browserInstance.isConnected()) {
        return browserInstance;
    }

    try {
        const fingerprint = generateFingerprint();

        browserInstance = await puppeteer.launch({
            headless: false, // Non-headless mode as requested
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                // '--disable-blink-features=AutomationControlled',
                '--disable-features=IsolateOrigins,site-per-process',
                // '--disable-web-security',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--window-size=1920,1080',
                '--disable-infobars',
                '--disable-notifications',
                '--disable-popup-blocking',
                `--user-agent=${fingerprint.userAgent}`,
                `--lang=${fingerprint.languages[0]}`
            ],
            defaultViewport: null,
            ignoreHTTPSErrors: true,
            // Additional options for better stealth
            // ignoreDefaultArgs: ['--enable-automation', '--enable-blink-features=AutomationControlled']
        });

        // Handle browser disconnection
        browserInstance.on('disconnected', () => {
            console.log('Browser disconnected');
            browserInstance = null;
            pagePool.clear();
        });

        console.log('Browser initialized with stealth mode');
        return browserInstance;
    } catch (error) {
        console.error('Failed to initialize browser:', error);
        throw error;
    }
}

/**
 * Applies anti-detection measures to a page
 * @param {Page} page - Puppeteer page object
 * @param {Object} fingerprint - Browser fingerprint data
 */
async function applyAntiDetection(page, fingerprint) {
    // Override navigator properties to mask automation
    await page.evaluateOnNewDocument((fp) => {
        // Remove webdriver flag
        Object.defineProperty(navigator, 'webdriver', {
            get: () => false
        });

        // Override plugins
        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5]
        });

        // Override languages
        Object.defineProperty(navigator, 'languages', {
            get: () => fp.languages
        });

        // Override platform
        Object.defineProperty(navigator, 'platform', {
            get: () => fp.platform
        });

        // Override chrome property
        window.chrome = {
            runtime: {}
        };

        // Override permissions
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
            parameters.name === 'notifications' ?
                Promise.resolve({ state: Notification.permission }) :
                originalQuery(parameters)
        );

        // Add WebGL vendor info
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
            if (parameter === 37445) return fp.webgl.vendor;
            if (parameter === 37446) return fp.webgl.renderer;
            return getParameter.apply(this, [parameter]);
        };

        // Randomize canvas fingerprint
        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function(type) {
            const canvas = this;
            const context = canvas.getContext('2d');
            if (context) {
                // Add subtle noise
                const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                for (let i = 0; i < imageData.data.length; i += 4) {
                    imageData.data[i] += Math.floor(Math.random() * 3) - 1;
                }
                context.putImageData(imageData, 0, 0);
            }
            return originalToDataURL.apply(this, [type]);
        };

        // Mimic human-like mouse movements
        document.addEventListener('mousemove', () => {}, { passive: true });
    }, fingerprint);

    // Set timezone
    await page.emulateTimezone(fingerprint.timezone);

    // Set realistic headers
    await page.setExtraHTTPHeaders({
        'Accept-Language': fingerprint.languages.join(','),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0'
    });
}

/**
 * Simulates human-like behavior on a page
 * @param {Page} page - Puppeteer page object
 */
export async function simulateHumanBehavior(page) {
    try {
        // Random mouse movements
        const moveRandomly = async () => {
            const x = Math.floor(Math.random() * 800) + 100;
            const y = Math.floor(Math.random() * 600) + 100;
            await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 10) + 5 });
        };

        // Perform 2-4 random movements
        const movements = Math.floor(Math.random() * 3) + 2;
        for (let i = 0; i < movements; i++) {
            await moveRandomly();
            await delay(Math.random() * 100 + 50);
        }

        // Random scroll
        if (Math.random() > 0.5) {
            await page.evaluate(() => {
                window.scrollBy({
                    top: Math.random() * 300,
                    behavior: 'smooth'
                });
            });
        }

        // Random delay before continuing
        await delay(Math.random() * 500 + 300);
    } catch (error) {
        // Ignore errors in human simulation
    }
}

/**
 * Gets or creates a new page with fresh fingerprint
 * @param {boolean} forceNew - Force creation of new page
 * @returns {Promise<Page>} Puppeteer page object
 */
export async function getPage(forceNew = false) {
    const browser = await initBrowser();

    try {
        // Check if we need to recycle any pages
        if (!forceNew) {
            for (const [page, data] of pagePool.entries()) {
                if (data.uses < MAX_PAGE_USES) {
                    data.uses++;
                    console.log(`Reusing page (${data.uses}/${MAX_PAGE_USES} uses)`);
                    return page;
                }
            }
        }

        // Recycle old pages that exceeded usage limit
        for (const [page, data] of pagePool.entries()) {
            if (data.uses >= MAX_PAGE_USES) {
                console.log(`Recycling page after ${data.uses} uses`);
                await page.close().catch(console.error);
                pagePool.delete(page);
            }
        }

        // Limit the number of open pages
        if (pagePool.size >= MAX_PAGES) {
            const oldestPage = pagePool.keys().next().value;
            console.log('Max pages reached, closing oldest page');
            await oldestPage.close().catch(console.error);
            pagePool.delete(oldestPage);
        }

        // Create new page with fresh fingerprint
        const fingerprint = generateFingerprint();
        const page = await browser.newPage();

        // Set viewport
        await page.setViewport({
            ...fingerprint.viewport,
            deviceScaleFactor: 1,
            hasTouch: false,
            isLandscape: true,
            isMobile: false
        });

        // Set user agent
        await page.setUserAgent(fingerprint.userAgent);

        // Apply anti-detection measures
        // await applyAntiDetection(page, fingerprint);

        // Set reasonable defaults
        await page.setDefaultTimeout(60000);
        await page.setDefaultNavigationTimeout(45000);

        // Setup request interception with more sophisticated filtering
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const resourceType = request.resourceType();
            const url = request.url();

            // Block trackers and unnecessary resources
            if (
                resourceType === 'media' ||
                url.includes('google-analytics') ||
                url.includes('doubleclick')
                // resourceType === 'image' ||
                // resourceType === 'media' ||
                // resourceType === 'font' ||
                // url.includes('google-analytics') ||
                // url.includes('googletagmanager') ||
                // url.includes('facebook') ||
                // url.includes('doubleclick') ||
                // url.includes('.jpg') ||
                // url.includes('.png') ||
                // url.includes('.gif') ||
                // url.includes('.css') // Block CSS if not needed for parsing
            ) {
                request.abort();
            } else {
                request.continue();
            }
        });

        // Handle console messages for debugging
        page.on('console', msg => {
            if (msg.type() === 'error') {
                console.log('Page error:', msg.text());
            }
        });

        // Track page usage
        pagePool.set(page, {
            uses: 1,
            created: Date.now(),
            fingerprint: fingerprint
        });

        console.log(`Created new page with fresh fingerprint (${pagePool.size}/${MAX_PAGES} pages active)`);
        return page;
    } catch (error) {
        console.error('Failed to create page:', error);
        throw error;
    }
}

/**
 * Solves CAPTCHAs on a page if detected
 * @param {Page} page - Puppeteer page object
 * @returns {Promise<boolean>} True if CAPTCHA was solved or not present
 */
export async function handleCaptcha(page) {
    try {
        // Check for common CAPTCHA selectors
        const captchaSelectors = [
            'iframe[src*="recaptcha"]',
            'iframe[src*="hcaptcha"]',
            '.g-recaptcha',
            '.h-captcha',
            '#recaptcha',
            '[data-captcha]'
        ];

        let captchaFound = false;
        for (const selector of captchaSelectors) {
            const element = await page.$(selector);
            if (element) {
                captchaFound = true;
                console.log('CAPTCHA detected, attempting to solve...');
                break;
            }
        }

        if (!captchaFound) {
            return true;
        }

        // Attempt to solve reCAPTCHA using the plugin
        try {
            const { solved, error } = await page.solveRecaptchas();
            if (solved) {
                console.log('✓ CAPTCHA solved successfully');
                await delay(2000); // Wait for page to process
                return true;
            } else {
                console.error('✗ Failed to solve CAPTCHA:', error);
                return false;
            }
        } catch (error) {
            console.error('Error solving CAPTCHA:', error);
            return false;
        }
    } catch (error) {
        console.error('Error handling CAPTCHA:', error);
        return false;
    }
}

/**
 * Recycles a page by closing it and creating a new one
 * @param {Page} page - Page to recycle
 * @returns {Promise<Page>} New page with fresh fingerprint
 */
export async function recyclePage(page) {
    console.log('Recycling page with fresh browser fingerprint...');

    if (pagePool.has(page)) {
        pagePool.delete(page);
    }

    try {
        await page.close();
    } catch (error) {
        console.error('Error closing page during recycle:', error);
    }

    return await getPage(true);
}

/**
 * Gets page usage statistics
 * @param {Page} page - Page to check
 * @returns {Object} Usage statistics
 */
export function getPageStats(page) {
    const data = pagePool.get(page);
    if (!data) {
        return { uses: 0, maxUses: MAX_PAGE_USES, shouldRecycle: true };
    }

    return {
        uses: data.uses,
        maxUses: MAX_PAGE_USES,
        shouldRecycle: data.uses >= MAX_PAGE_USES,
        age: Date.now() - data.created
    };
}

/**
 * Closes the browser and all pages
 */
export async function closeBrowser() {
    if (browserInstance) {
        try {
            // Close all pages first
            for (const [page] of pagePool.entries()) {
                await page.close().catch(console.error);
            }
            pagePool.clear();

            await browserInstance.close();
            browserInstance = null;
            console.log('Browser closed successfully');
        } catch (error) {
            console.error('Error closing browser:', error);
        }
    }
}

/**
 * Utility function for delays
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
    initBrowser,
    getPage,
    closeBrowser,
    handleCaptcha,
    recyclePage,
    getPageStats,
    simulateHumanBehavior
};