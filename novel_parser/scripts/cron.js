#!/usr/bin/env node

/**
 * Standalone cron script for running the parser
 * Can be scheduled with system cron or node-cron
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import from root parser directory
const { ParserWrapper } = await import(join(__dirname, '../parser/parser_init.js'));

async function runCron() {
    console.log(`[${new Date().toISOString()}] Starting cron job...`);

    try {
        await ParserWrapper();
        console.log(`[${new Date().toISOString()}] ✓ Cron job completed successfully`);
        process.exit(0);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] ✗ Cron job failed:`, error);
        process.exit(1);
    }
}

runCron();