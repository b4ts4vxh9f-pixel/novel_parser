/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
        serverComponentsExternalPackages: [
            'better-sqlite3',
            'puppeteer',
            'puppeteer-extra',
            'puppeteer-extra-plugin-stealth',
            'puppeteer-extra-plugin-recaptcha',
            'jsdom',
            '@mozilla/readability',
            'user-agents',
            'path',
            'archiver',
            'fs'
        ],
    },
};

export default nextConfig;