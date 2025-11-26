import { NextResponse } from 'next/server';

/**
 * GET /api/cron/parse - Trigger the parser (called by cron)
 * Can be protected with a secret key for security
 */
export async function GET(request) {
    try {
        // Optional: Verify cron secret for security
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;

        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        console.log('Cron job triggered - Starting parser...');

        // Dynamic import to avoid build-time issues with better-sqlite3
        const { ParserWrapper } = await import('@parser/parser_init.js');

        // Run the parser
        await ParserWrapper();

        return NextResponse.json({
            success: true,
            message: 'Parser completed successfully',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Cron job error:', error);
        return NextResponse.json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
}

// Mark route as dynamic to prevent static optimization
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max execution time
export const runtime = 'nodejs'; // Ensure Node.js runtime