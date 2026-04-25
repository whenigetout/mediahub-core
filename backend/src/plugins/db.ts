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
        CREATE TABLE IF NOT EXISTS library_root (
            id TEXT PRIMARY KEY,
            path TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS library_item (
            id TEXT PRIMARY KEY,
            media_file_id TEXT NOT NULL UNIQUE,
            library_root_id TEXT,
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
            FOREIGN KEY(library_root_id) REFERENCES library_root (id)
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

    const columns = db
        .prepare(`PRAGMA table_info(library_item)`)
        .all() as Array<{ name: string }>

    const columnNames = new Set(columns.map((column) => column.name))

    if (!columnNames.has("library_root_id")) {
        db.exec(`
            ALTER TABLE library_item
            ADD COLUMN library_root_id TEXT;
        `)
    }

    const foreignKeys = db
        .prepare(`PRAGMA foreign_key_list(library_item)`)
        .all() as Array<{ table: string }>

    const stillLinkedToLegacyMedia = foreignKeys.some(
        (foreignKey) => foreignKey.table === "media_file"
    )

    if (stillLinkedToLegacyMedia) {
        db.exec(`
            DROP TABLE IF EXISTS library_item_migrated;

            CREATE TABLE library_item_migrated (
                id TEXT PRIMARY KEY,
                media_file_id TEXT NOT NULL UNIQUE,
                library_root_id TEXT,
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
                FOREIGN KEY(library_root_id) REFERENCES library_root (id)
            );

            INSERT INTO library_item_migrated (
                id,
                media_file_id,
                library_root_id,
                root_path,
                relative_path,
                video_path,
                filename,
                title,
                code,
                studio,
                actresses,
                actress_text,
                tags,
                tag_text,
                plot,
                year,
                runtime_minutes,
                thumbnail_path,
                nfo_path,
                metadata_status,
                search_text,
                is_available,
                file_size,
                modified_at,
                last_scanned_at,
                created_at,
                updated_at
            )
            SELECT
                id,
                media_file_id,
                library_root_id,
                root_path,
                relative_path,
                video_path,
                filename,
                title,
                code,
                studio,
                actresses,
                actress_text,
                tags,
                tag_text,
                plot,
                year,
                runtime_minutes,
                thumbnail_path,
                nfo_path,
                metadata_status,
                search_text,
                is_available,
                file_size,
                modified_at,
                last_scanned_at,
                created_at,
                updated_at
            FROM library_item;

            DROP TABLE library_item;
            ALTER TABLE library_item_migrated RENAME TO library_item;

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
}

export default fp(async (fastify) => {
    const dbPath = path.resolve(process.cwd(), "mediahub.db")
    const db = new Database(dbPath)
    initializeSchema(db)
    fastify.decorate("db", db)
})
