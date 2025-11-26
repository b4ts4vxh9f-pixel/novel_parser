#!/usr/bin/env node

/**
 * Node-based scheduler using node-cron
 * Runs the parser at specified intervals
 */

import cron from 'node-cron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import from root parser directory
const { ParserWrapper } = await import(join(__dirname, '../parser/parser_init.js'));

// Configuration
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '* * * * *';
const TIMEZONE = process.env.TIMEZONE || 'America/New_York';

console.log(`Parser scheduler started`);
console.log(`Schedule: ${CRON_SCHEDULE}`);
console.log(`Timezone: ${TIMEZONE}`);
console.log(`---`);

// Schedule the parser
const task = cron.schedule(CRON_SCHEDULE, async () => {
    const timestamp = new Date().toISOString();
    console.log(`\n[${timestamp}] Cron triggered - Starting parser...`);

    try {
        await ParserWrapper();
        console.log(`[${new Date().toISOString()}] ✓ Parser completed successfully\n`);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] ✗ Parser failed:`, error);
    }
}, {
    timezone: TIMEZONE
});

// Run immediately on start (optional)
if (process.env.RUN_ON_START === 'true') {
    console.log('Running parser immediately...\n');
    ParserWrapper()
        .then(() => console.log('✓ Initial run completed\n'))
        .catch(err => console.error('✗ Initial run failed:', err));
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down scheduler...');
    task.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nShutting down scheduler...');
    task.stop();
    process.exit(0);
});

// Keep the process running
task.start();