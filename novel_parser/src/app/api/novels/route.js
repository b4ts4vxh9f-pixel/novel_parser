import { NextResponse } from 'next/server';
import { novelsDb } from '@db/db_init.js';

/**
 * POST /api/novels - Add a new novel to the database
 */
export async function POST(request) {
    try {
        const body = await request.json();
        const { url } = body;

        // Validate URL
        if (!url || typeof url !== 'string') {
            return NextResponse.json(
                { error: 'URL is required and must be a string' },
                { status: 400 }
            );
        }

        // Validate URL format
        try {
            new URL(url);
        } catch (e) {
            return NextResponse.json(
                { error: 'Invalid URL format' },
                { status: 400 }
            );
        }

        // Try to insert the novel
        try {
            const result = novelsDb.insertNovel.run({
                url: url.trim(),
                title: null,
                raws_title: null,
                author: null,
                description: null,
                total_chapters: 0,
                status: 0 // Pending status
            });

            return NextResponse.json({
                success: true,
                message: 'Novel added successfully',
                novelId: result.lastInsertRowid
            }, { status: 201 });

        } catch (dbError) {
            // Check if it's a UNIQUE constraint violation
            if (dbError.message.includes('UNIQUE')) {
                return NextResponse.json(
                    { error: 'This URL already exists in the database' },
                    { status: 409 }
                );
            }
            throw dbError;
        }

    } catch (error) {
        console.error('Error adding novel:', error);
        return NextResponse.json(
            { error: 'Internal server error', details: error.message },
            { status: 500 }
        );
    }
}

/**
 * GET /api/novels - Get all novels or novels by status
 */
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');

        let novels;
        if (status !== null) {
            novels = novelsDb.getNovelsByStatus.all(parseInt(status));
        } else {
            novels = novelsDb.db.prepare('SELECT * FROM novels ORDER BY created_at DESC').all();
        }

        return NextResponse.json({
            success: true,
            novels,
            count: novels.length
        });

    } catch (error) {
        console.error('Error fetching novels:', error);
        return NextResponse.json(
            { error: 'Internal server error', details: error.message },
            { status: 500 }
        );
    }
}

export const dynamic = 'force-dynamic';