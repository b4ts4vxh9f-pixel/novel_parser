
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_FILE = path.resolve(process.cwd(), 'db', 'novels.sqlite');

// Ensure folder exists
const dir = path.dirname(DB_FILE);
if (!fs.existsSync(dir)) {
    try {
        fs.mkdirSync(dir, { recursive: true });
    } catch (error) {
        console.error('Failed to create database directory:', error);
        throw error;
    }
}

let db;
try {
    db = new Database(DB_FILE);

    // Enable WAL mode for better concurrency and performance
    db.pragma('journal_mode = WAL');

    // Additional pragmas for optimization and safety
    db.pragma('synchronous = NORMAL'); // Faster writes while maintaining safety in WAL mode
    db.pragma('foreign_keys = ON'); // Ensure foreign key constraints are enforced
    db.pragma('busy_timeout = 5000'); // Wait up to 5 seconds if database is locked

} catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
}

// Graceful shutdown
const closeDatabase = () => {
    if (db && db.open) {
        try {
            db.close();
            console.log('Database connection closed');
        } catch (error) {
            console.error('Error closing database:', error);
        }
    }
};

process.on('exit', closeDatabase);
process.on('SIGINT', () => {
    closeDatabase();
    process.exit(0);
});
process.on('SIGTERM', () => {
    closeDatabase();
    process.exit(0);
});

// Create novels table
try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS novels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT UNIQUE NOT NULL,
            title TEXT,
            raws_title TEXT,
            author TEXT,
            description TEXT,
            total_chapters INTEGER DEFAULT 0,
            status INTEGER DEFAULT 0,
            cover_image TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
} catch (error) {
    console.error('Failed to create novels table:', error);
    throw error;
}

// Create chapters table
try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS chapters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            novel_id INTEGER NOT NULL,
            url TEXT UNIQUE NOT NULL,
            title TEXT,
            content TEXT,
            chapter_number INTEGER,
            status INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
        )
    `);
} catch (error) {
    console.error('Failed to create chapters table:', error);
    throw error;
}

// Create indexes for better query performance
try {
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_novels_status ON novels(status);
        CREATE INDEX IF NOT EXISTS idx_novels_url ON novels(url);
        CREATE INDEX IF NOT EXISTS idx_chapters_novel_id ON chapters(novel_id);
        CREATE INDEX IF NOT EXISTS idx_chapters_status ON chapters(status);
        CREATE INDEX IF NOT EXISTS idx_chapters_url ON chapters(url);
    `);
} catch (error) {
    console.error('Failed to create indexes:', error);
    // Non-fatal, continue execution
}

// Wrapper function for safe statement execution
const safePrepare = (sql, context) => {
    try {
        return db.prepare(sql);
    } catch (error) {
        console.error(`Failed to prepare statement (${context}):`, error);
        throw error;
    }
};

// Prepared statements for novels
export const novelsDb = {
    db,

    getNovelById: safePrepare('SELECT * FROM novels WHERE id = ?', 'getNovelById'),

    getNovelsByStatus: safePrepare('SELECT * FROM novels WHERE status = ?', 'getNovelsByStatus'),

    getAllNovels: safePrepare('SELECT * FROM novels ORDER BY created_at DESC', 'getAllNovels'),

    insertNovel: safePrepare(`
        INSERT INTO novels (url, title, raws_title, author, description, total_chapters, status)
        VALUES (@url, @title, @raws_title, @author, @description, @total_chapters, @status)
    `, 'insertNovel'),

    updateNovel: safePrepare(`
        UPDATE novels 
        SET title = @title,
            raws_title = @raws_title,
            author = @author,
            description = @description,
            total_chapters = @total_chapters,
            status = @status,
            cover_image = @cover_image,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = @id
    `, 'updateNovel'),

    updateNovelStatus: safePrepare(`
        UPDATE novels 
        SET status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `, 'updateNovelStatus')
};

// Prepared statements for chapters
export const chaptersDb = {
    db,

    getChapterById: safePrepare('SELECT * FROM chapters WHERE id = ?', 'getChapterById'),

    getChaptersByNovelId: safePrepare('SELECT * FROM chapters WHERE novel_id = ? ORDER BY chapter_number', 'getChaptersByNovelId'),

    getChaptersByStatus: safePrepare('SELECT * FROM chapters WHERE status = ?', 'getChaptersByStatus'),

    insertChapter: safePrepare(`
        INSERT INTO chapters (novel_id, url, title, content, chapter_number, status)
        VALUES (@novel_id, @url, @title, @content, @chapter_number, @status)
    `, 'insertChapter'),

    updateChapter: safePrepare(`
        UPDATE chapters 
        SET title = @title,
            content = @content,
            status = @status,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = @id
    `, 'updateChapter'),

    updateChapterStatus: safePrepare(`
        UPDATE chapters 
        SET status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `, 'updateChapterStatus')
};

// Export close function for manual cleanup if needed
export const closeDb = closeDatabase;

export default { novelsDb, chaptersDb, db, closeDb };