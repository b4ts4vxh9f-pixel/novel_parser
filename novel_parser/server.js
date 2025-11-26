//
// #!/usr/bin/env node

/**
 * Unified server that runs Next.js app and parser scheduler together
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import cron from 'node-cron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const PORT = process.env.PORT || 3000;
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '* * * * *';
const TIMEZONE = process.env.TIMEZONE || 'America/New_York';
const RUN_ON_START = process.env.RUN_ON_START === 'true';

let nextProcess = null;
let parserRunning = false;
let dbInstance = null;

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
};

function log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

/**
 * Initialize database
 */
async function initializeDatabase() {
    log('\n=== Initializing Database ===', colors.cyan + colors.bright);

    try {
        // Import database initialization module
        const dbModule = await import('./db/db_init.js');
        dbInstance = dbModule.default;

        log('✓ Database initialized with WAL mode', colors.green);
        return dbModule;
    } catch (error) {
        log(`❌ Failed to initialize database: ${error.message}`, colors.red);
        throw error;
    }
}

/**
 * Start Next.js server
 */
function startNextServer() {
    log('\n=== Starting Next.js Server ===', colors.cyan + colors.bright);

    // Use 'next start' for production or 'next dev' for development
    const isProduction = process.env.NODE_ENV === 'production';
    const command = isProduction ? 'start' : 'dev';

    nextProcess = spawn('npx', ['next', command, '-p', PORT], {
        stdio: 'inherit',
        shell: true,
        env: { ...process.env }
    });

    nextProcess.on('error', (error) => {
        log(`❌ Next.js error: ${error.message}`, colors.red);
    });

    nextProcess.on('exit', (code) => {
        if (code !== 0 && code !== null) {
            log(`❌ Next.js exited with code ${code}`, colors.red);
            process.exit(code);
        }
    });

    log(`✓ Next.js server starting on http://localhost:${PORT}`, colors.green);
}

/**
 * Run the parser
 */
async function runParser() {
    if (parserRunning) {
        log('⚠️  Parser is already running, skipping...', colors.yellow);
        return;
    }

    parserRunning = true;
    const timestamp = new Date().toISOString();

    log(`\n${'='.repeat(60)}`, colors.blue);
    log(`[${timestamp}] 🚀 Starting parser...`, colors.blue + colors.bright);
    log('='.repeat(60), colors.blue);

    try {
        // Dynamic import to avoid loading parser modules until needed
        const { ParserWrapper } = await import(join(__dirname, 'parser/parser_init.js'));

        await ParserWrapper();

        const endTime = new Date().toISOString();
        log(`\n[${endTime}] ✅ Parser completed successfully`, colors.green + colors.bright);
        log('='.repeat(60) + '\n', colors.blue);
    } catch (error) {
        const endTime = new Date().toISOString();
        log(`\n[${endTime}] ❌ Parser failed:`, colors.red + colors.bright);
        console.error(error);
        log('='.repeat(60) + '\n', colors.blue);
    } finally {
        parserRunning = false;
    }
}

/**
 * Setup parser scheduler
 */
function setupScheduler() {
    log('\n=== Setting up Parser Scheduler ===', colors.cyan + colors.bright);
    log(`📅 Schedule: ${CRON_SCHEDULE}`, colors.cyan);
    log(`🌍 Timezone: ${TIMEZONE}`, colors.cyan);

    // Schedule the parser
    const task = cron.schedule(CRON_SCHEDULE, async () => {
        await runParser();
    }, {
        timezone: TIMEZONE,
        scheduled: true
    });

    log('✓ Parser scheduler configured', colors.green);

    // Run immediately on start if configured
    if (RUN_ON_START) {
        log('⏩ Running parser immediately on startup...', colors.yellow);
        setTimeout(() => {
            runParser();
        }, 5000); // Wait 5 seconds for Next.js to start
    }

    return task;
}

/**
 * Handle graceful shutdown
 */
function setupShutdownHandlers(schedulerTask) {
    const shutdown = (signal) => {
        log(`\n\n⚠️  Received ${signal}, shutting down gracefully...`, colors.yellow + colors.bright);

        // Stop scheduler
        if (schedulerTask) {
            log('⏹  Stopping scheduler...', colors.yellow);
            schedulerTask.stop();
        }

        // Close database connection
        if (dbInstance && dbInstance.closeDb) {
            log('⏹  Closing database connection...', colors.yellow);
            try {
                dbInstance.closeDb();
            } catch (error) {
                log(`⚠️  Error closing database: ${error.message}`, colors.yellow);
            }
        }

        // Stop Next.js
        if (nextProcess) {
            log('⏹  Stopping Next.js server...', colors.yellow);
            nextProcess.kill('SIGTERM');

            // Force kill after 10 seconds if still running
            setTimeout(() => {
                if (nextProcess) {
                    log('⏹  Force stopping Next.js server...', colors.red);
                    nextProcess.kill('SIGKILL');
                }
            }, 10000);
        }

        // Wait a bit for cleanup then exit
        setTimeout(() => {
            log('✅ Shutdown complete', colors.green);
            process.exit(0);
        }, 2000);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
        log('❌ Uncaught Exception:', colors.red + colors.bright);
        console.error(error);
        shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
        log('❌ Unhandled Rejection at:', colors.red + colors.bright);
        console.error(promise, 'reason:', reason);
    });
}

/**
 * Display startup banner
 */
function displayBanner() {
    console.clear();
    log('\n' + '='.repeat(60), colors.cyan + colors.bright);
    log('           📚 NOVEL PARSER SERVER 📚', colors.cyan + colors.bright);
    log('='.repeat(60), colors.cyan + colors.bright);
    log(`
      Next.js:   http://localhost:${PORT}
      Mode:      ${process.env.NODE_ENV === 'production' ? 'Production' : 'Development'}
      Schedule:  ${CRON_SCHEDULE}
      Timezone:  ${TIMEZONE}
      Auto-run:  ${RUN_ON_START ? 'Yes' : 'No'}
    `, colors.cyan);
    log('='.repeat(60) + '\n', colors.cyan + colors.bright);
}

/**
 * Main function
 */
async function main() {
    try {
        displayBanner();

        // Initialize database first
        await initializeDatabase();

        // Start Next.js server
        startNextServer();

        // Setup parser scheduler
        const schedulerTask = setupScheduler();

        // Setup shutdown handlers
        setupShutdownHandlers(schedulerTask);

        log('\n✅ Server is running. Press Ctrl+C to stop.\n', colors.green + colors.bright);

    } catch (error) {
        log('❌ Failed to start server:', colors.red + colors.bright);
        console.error(error);
        process.exit(1);
    }
}

// Start the server
main();