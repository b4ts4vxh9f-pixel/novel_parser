import { generateEpub } from '@/app/components/epubGenerator.js';
import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const { novelId } = await request.json();

        if (!novelId) {
            return NextResponse.json(
                { error: 'novelId is required' },
                { status: 400 }
            );
        }

        // Generate EPUB
        const epubPath = await generateEpub(novelId);

        // Read the file
        const epubBuffer = fs.readFileSync(epubPath);
        const filename = path.basename(epubPath);

        // Clean up the file after reading
        fs.unlinkSync(epubPath);

        // Return the file as a blob
        return new NextResponse(epubBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/epub+zip',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': epubBuffer.length.toString(),
            },
        });

    } catch (error) {
        console.error('EPUB generation error:', error);
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}