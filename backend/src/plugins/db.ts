import fp from "fastify-plugin"
import Database from "better-sqlite3"
import path from "path"

declare module "fastify" {
    interface FastifyInstance {
        db: Database.Database
    }
}

const initializeSchema = (db: Database.Database) => {
    db.exec(`
        CREATE TABLE IF NOT EXISTS library_item (
            id TEXT PRIMARY KEY,
            media_file_id TEXT NOT NULL UNIQUE,
            root_path TEXT NOT NULL,
            relative_path TEXT NOT NULL,
            video_path TEXT NOT NULL UNIQUE,
            filename TEXT NOT NULL,
            title TEXT,
            code TEXT,
            studio TEXT,
            actresses TEXT NOT NULL DEFAULT '[]',
            actress_text TEXT NOT NULL DEFAULT '',
            tags TEXT NOT NULL DEFAULT '[]',
            tag_text TEXT NOT NULL DEFAULT '',
            plot TEXT,
            year INTEGER,
            runtime_minutes INTEGER,
            thumbnail_path TEXT,
            nfo_path TEXT,
            metadata_status TEXT NOT NULL DEFAULT 'missing',
            search_text TEXT NOT NULL DEFAULT '',
            is_available INTEGER NOT NULL DEFAULT 1,
            file_size INTEGER,
            modified_at INTEGER,
            last_scanned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(media_file_id) REFERENCES media_file (id)
        );

        CREATE INDEX IF NOT EXISTS idx_library_item_code
            ON library_item (code);

        CREATE INDEX IF NOT EXISTS idx_library_item_metadata_status
            ON library_item (metadata_status);

        CREATE INDEX IF NOT EXISTS idx_library_item_root_path
            ON library_item (root_path);

        CREATE INDEX IF NOT EXISTS idx_library_item_search_text
            ON library_item (search_text);
    `)
}

export default fp(async (fastify) => {
    const dbPath = path.resolve(process.cwd(), "mediahub.db")
    const db = new Database(dbPath)
    initializeSchema(db)
    fastify.decorate("db", db)
})
