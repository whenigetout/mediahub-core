# MediaHub

MediaHub is a local-first media library app. It scans folders on your own machine, builds a
searchable index in SQLite, and serves a web UI where you can search, filter, and play the
actual video files from disk.

Nothing is uploaded anywhere: the API, the database, and video streaming all run on your
computer. There is no account, no cloud service, and no telemetry.

## What it does

- **Scans local folders** and indexes video files (`.mp4`, `.mkv`, `.avi`, `.wmv`, `.mov`, `.m4v`, `.ts`, `.webm`).
- **Reads sidecar metadata**: `.nfo` files (title, plot, year, runtime, studio, tags, actors) and artwork sitting next to the video (`<name>.jpg`, `poster.*`, `folder.*`, `cover.*`, or the first image in the folder).
- **Detects product codes** such as `ABP-123` from the NFO, filename, or folder name, then enriches the item from code-keyed metadata already in the database.
- **Searches and refines**: relevance-ranked text search plus filters (actress, studio, code, tags, excluded tags, year range, metadata status), five sort orders, and pagination.
- **Saves search presets** so a whole filter set can be restored with one click.
- **Answers natural-language queries** like "nursing themed with Mio after 2022 without comedy" using a local Ollama model when configured, or a built-in heuristic parser when it is not.
- **Streams video in the browser** with HTTP range requests, so seeking works, plus thumbnail endpoints for the result cards.

## Quick start (one click)

On Windows, double-click:

```
start-mediahub.bat
```

That single file:

1. Checks that Node.js 20.9+ and npm are available.
2. Runs `npm install` in `backend/` and `frontend/` when `node_modules` is missing (first run only; it can take a few minutes).
3. Starts the API on <http://localhost:4000> in a minimized window named *MediaHub Backend*.
4. Starts the web UI on <http://localhost:3000> in a minimized window named *MediaHub Frontend*.
5. Waits until both answer, then opens the app in your default browser.

It is safe to run repeatedly: if something is already answering on those ports, the launcher
reuses it instead of starting a second copy. To inspect your setup without installing or
starting anything, run `start-mediahub.bat --dry-run`.

To stop MediaHub, close the two windows named *MediaHub Backend* and *MediaHub Frontend*.

## First run: scan your library

1. Open <http://localhost:3000>.
2. In **Library Roots**, paste one absolute folder path per line:

   ```
   E:\Media\Library
   F:\Archive\Series
   ```

3. Press **Scan Library**. A progress bar shows files processed and the path currently being read; the rest of the UI stays usable during the scan.
4. When the scan finishes, the sidebar lists the saved roots, the last-scan summary, and any roots that were skipped (bad path, no permission, or not a folder).
5. Search, refine with the filters, save a preset, or try **Ask Naturally**.
6. Click a result card to play it in the player panel on the right.

Scans never modify your media files. They only read file names, sizes, timestamps, and NFO/artwork.

## Manual setup (development)

To start each side yourself (or if you are on macOS/Linux), use two terminals:

```bash
# terminal 1 - API on http://localhost:4000
cd backend
npm install
npm run dev
```

```bash
# terminal 2 - web UI on http://localhost:3000
cd frontend
npm install
npm run dev
```

| Location | Command | Purpose |
| --- | --- | --- |
| `frontend/` | `npm run build` | Production build of the UI |
| `frontend/` | `npm start` | Serve the built UI |
| `frontend/` | `npm run lint` | ESLint |
| `backend/` | `npx tsc --noEmit` | Type-check the API |

> On Windows PowerShell, `npm` may fail with *"npm.ps1 cannot be loaded because running scripts is disabled on this system"*. Use `npm.cmd` instead, or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once. The one-click launcher already avoids this.

## Configuration

Everything has a working default; configuration is optional.

### Backend (`backend/.env`)

The backend loads `backend/.env` at startup (real environment variables take precedence over file values). Copy `backend/.env.example` to `backend/.env` to get started.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `4000` | Port for the Fastify API. The UI expects 4000 unless you also change the frontend values below. |
| `OLLAMA_SEARCH_MODEL` | *(unset)* | Model used for natural-language search, for example `qwen2.5:3b`. When unset, AI parsing is skipped and the heuristic parser handles those queries. |
| `OLLAMA_SEARCH_URL` | `http://127.0.0.1:11434/api/generate` | Ollama generate endpoint. The availability check derives `/api/tags` from it. |

### Frontend (`frontend/.env.local`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `BACKEND_API_ORIGIN` | `http://localhost:4000` | Where the Next.js server-side proxy forwards JSON requests. |
| `NEXT_PUBLIC_BACKEND_ORIGIN` | `http://localhost:4000` | Base URL the browser uses for `<video>` and `<img>` media URLs. |

### Enabling natural-language search

1. Install [Ollama](https://ollama.com) and pull a small model: `ollama pull qwen2.5:3b`.
2. Make sure `ollama serve` is running.
3. Create `backend/.env` containing `OLLAMA_SEARCH_MODEL=qwen2.5:3b`.
4. Restart the backend. The sidebar status card switches to "AI Search Ready".

Steps 1-4 are optional. Without them, natural-language search still works through the
built-in parser in `backend/src/modules/library/library.nlp.ts`, which understands phrases
such as `with actress NAME`, `studio NAME`, `tag X`, `without Y`, `X themed`, `after 2020`,
and `from 2018 to 2022`.

## Architecture

Two independent Node applications on your machine, sharing one SQLite file:

```
Browser  ─────────────►  Next.js UI  (port 3000)
   │  /api/library/* (JSON, same origin)      │
   │                                          │  server-side fetch
   │                                          ▼
   │                              Fastify API  (port 4000)
   │                                          │
   │  <video>/<img> media requests            ▼
   └──────────────────────────────────►  SQLite: backend/mediahub.db
                                          + your media files on disk
```

**Why two apps?** The API owns the filesystem and the database; the UI only renders. Keeping
the scanning code behind its own process means long directory walks never block the web app,
and the API could serve other clients later.

**Why do JSON calls go through Next.js instead of straight to the API?** The UI feature code
calls same-origin paths like `/api/library/search`. Route handlers in
`frontend/src/app/api/library/**` proxy those to the backend, a small backend-for-frontend
layer. The browser therefore talks to a single origin for JSON and the API needs no CORS
configuration. Media URLs (`/thumbnail`, `/stream`) are used directly in `<img>`/`<video>`
tags, which do not require CORS at all.

**Backend layering** (`backend/src`):

- `server.ts` — loads `.env`, builds the app, listens on the port.
- `app.ts` — creates the Fastify instance, registers the DB plugin and the routes.
- `plugins/db.ts` — opens `mediahub.db`, creates/updates the schema, exposes it as `fastify.db`.
- `routes/index.ts` — mounts every module under the `/api` prefix.
- `modules/<domain>/` — one folder per feature area, each split into:
  - `*.controller.ts` — HTTP routes: query/body parsing, status codes, streaming.
  - `*.service.ts` — orchestration, including the in-memory scan job state machine.
  - `*.repository.ts` — all SQL. Prepared statements, parameterised everywhere.
  - `*.scanner.ts` and `*.nlp.ts` — the two worker pieces: directory walking plus NFO parsing, and natural-language query parsing.
  - `*.types.ts` — shared TypeScript types.

**Frontend layering** (`frontend/src`):

- `app/layout.tsx`, `app/page.tsx` — the App Router shell; the page just renders the feature.
- `app/api/library/**/route.ts` — thin proxy handlers to the backend.
- `features/home/HomePage.tsx` — one client component holding all UI state (query, filters, results, scan job, presets, status), with `useEffect` hooks for debounced search and scan polling.
- `features/home/components/…` — presentational pieces (`SearchBar`, `HomeFeed`, `VideoCard`), each with a small `index.ts` barrel file.
- `features/home/types.ts` — the API response types the UI consumes.

State lives in React component state only; there is no Redux/Zustand/React Query layer, and the
page refetches from the API directly.

## Tech stack

| Area | Choice | Notes |
| --- | --- | --- |
| Runtime | Node.js 20.9+ (developed on 22.x) | Next.js 16 requires 20.9 or newer. |
| Language | TypeScript 5.9 (backend), TypeScript 5 (frontend) | `strict` is enabled in the backend. |
| API framework | Fastify 5.8 + `fastify-plugin` 5 | Logging via Fastify's built-in logger. |
| Dev runner | `ts-node` (`npm run dev`) | The backend is not compiled for production yet; there is no `build`/`start` script. |
| Database | SQLite via `better-sqlite3` 12 | Synchronous, embedded, zero configuration. Raw SQL, no ORM. |
| UI framework | Next.js 16.1 (App Router) + React 19.2 | Server route handlers for the proxy, one client component for the app itself. |
| Styling | Tailwind CSS 4 and PostCSS are installed, but components currently use inline `style` objects | `app/globals.css` holds the base layer; moving to Tailwind classes is a natural next step. |
| Fonts | `next/font` (Geist / Geist Mono) | Loaded in `app/layout.tsx`. |
| Linting | ESLint 9 + `eslint-config-next` | `npm run lint` in `frontend/`. |
| Optional AI | Ollama over HTTP | A JSON-format prompt returns search parameters; otherwise the heuristic fallback runs. |

## Project layout

```
mediahub-core/
├─ start-mediahub.bat          # one-click Windows launcher
├─ backend/
│  ├─ .env.example             # copy to .env to configure
│  ├─ mediahub.db              # SQLite database (index, presets, legacy metadata)
│  ├─ .tmp-library/            # tiny dummy fixtures used to verify scanning
│  └─ src/
│     ├─ server.ts             # entry point
│     ├─ app.ts                # Fastify wiring
│     ├─ config/env.ts         # small .env loader
│     ├─ plugins/db.ts         # SQLite connection + schema
│     ├─ routes/index.ts       # /api route mounting
│     └─ modules/
│        ├─ library/           # scanning, search, presets, streaming, NLP
│        └─ video/             # legacy metadata endpoints
└─ frontend/
   └─ src/
      ├─ app/                  # App Router shell + /api/library proxy routes
      └─ features/home/        # HomePage and presentational components
```

## API reference

Every route is served by the backend under `http://localhost:4000/api`. The frontend proxies
the JSON routes at the same paths, so `http://localhost:3000/api/library/search` works too.
`thumbnail` and `stream` are requested from port 4000 directly.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/library/status` | Backend and AI availability with human-readable messages. |
| `GET` | `/api/library/stats` | `totalItems`, `availableItems`, `missingMetadataItems`. |
| `GET` | `/api/library/roots` | Saved library folders (`id`, `path`). |
| `DELETE` | `/api/library/roots/:id` | Forget a root and mark its items unavailable. |
| `POST` | `/api/library/scan` | Start a scan. Body optional: `{ "roots": ["E:\\Media"] }`. Returns `202` with the job. |
| `GET` | `/api/library/scan/current` | Current or last scan job: status, counts, current path, summary, error. |
| `GET` | `/api/library/search` | Search. Query: `q`, `actress`, `studio`, `code`, `tag`, `includeTags`, `excludeTags`, `metadataStatus`, `yearFrom`, `yearTo`, `sort`, `limit`, `offset`. |
| `GET` | `/api/library/suggestions?q=` | Up to 10 type-ahead suggestions tagged `title`, `code`, `actress`, `tag`, or `studio`. |
| `POST` | `/api/library/natural-search` | Body `{ "input": "..." }` to receive parsed parameters, `aiUsed`, interpretation, warning, and results. |
| `GET` | `/api/library/presets` | Saved search presets. |
| `POST` | `/api/library/presets` | Create or update a preset (`{ name, params }`); the same name overwrites. |
| `DELETE` | `/api/library/presets/:id` | Delete a preset. |
| `GET` | `/api/library/items/:id` | One indexed item with its full metadata. |
| `GET` | `/api/library/items/:id/thumbnail` | Sidecar artwork bytes (`Cache-Control: no-store`). |
| `GET` | `/api/library/items/:id/stream` | Video bytes with `Accept-Ranges` and `206 Partial Content` support. |
| `GET` | `/api/videos`, `/api/videos/search?q=` | Legacy endpoints reading the older `jav_metadata` table; the current UI does not call them. |

## Data model

`backend/mediahub.db` is created and migrated by `backend/src/plugins/db.ts`.

**`library_root`** — one row per scanned folder: `id`, `path` (unique), timestamps.

**`library_item`** — one row per indexed video file, unique on `video_path`:

| Column | Meaning |
| --- | --- |
| `video_path`, `root_path`, `relative_path`, `filename` | Location, plus `file_size` and `modified_at`. |
| `title`, `code`, `studio`, `plot`, `year`, `runtime_minutes` | Metadata from the NFO sidecar and/or code-based enrichment. |
| `actresses`, `tags` | JSON arrays; `actress_text` and `tag_text` are lowercase flat copies used by `LIKE` filters. |
| `thumbnail_path`, `nfo_path` | Resolved sidecar files. |
| `search_text` | Denormalised lowercase haystack: filename + title + code + studio + actresses + tags + plot. |
| `metadata_status` | `partial` when a title or code exists, otherwise `missing`. |
| `is_available` | `1` while the file was seen in the most recent scan of its root, `0` once it disappears. |
| `last_scanned_at` | Drives the "recent" sort. |

Indexes exist on `code`, `metadata_status`, `root_path`, and `search_text`.

**`search_preset`** — `name` (unique), `params_json` (the saved filter set), timestamps.

The database that ships with this repository also contains older, code-keyed metadata tables
(`jav_metadata`, `actress`, `studio`, `tag`, `video_actress`, `video_tag`, plus the currently
unused `library`, `root_folder`, `media_file`, `metadata_job`, `sync_job`). The scanner reads
them to fill in title, studio, year, runtime, actresses, and tags when a detected code matches.
Nothing in the current codebase writes to them.

## How scanning works

1. `POST /api/library/scan` hands the requested roots to the service layer, which refuses to start a second scan while one is running and tracks progress in an in-memory job object.
2. The scanner counts video files first so the UI can show a percentage, then walks each root breadth-first.
3. For each video file it resolves a sibling `<name>.nfo` and a thumbnail (`<name>.jpg|jpeg|png|webp`, then `thumb|poster|folder|cover|landscape.*`, then any image in the folder).
4. The NFO is parsed as XML with small regex helpers for `title`/`originaltitle`, `plot`, `year`/`premiered`, `runtime`, `studio`, `tag`/`genre`, and `<actor><name>` blocks; CDATA sections are unwrapped.
5. A product code is detected with `\b([A-Z]{2,10}-?\d{2,5})\b` from the NFO, title, filename, or parent folder, then normalised (`ABP123` becomes `ABP-123`).
6. Rows are upserted by `video_path`, so re-scanning updates instead of duplicating. Before walking a root, all of its items are marked `is_available = 0`; files found during the walk flip back to `1`. That is how deleted or moved files drop out of the results while their history stays in the database.
7. The UI polls `/api/library/scan/current` every 700 ms while a scan is running.

## How search works

- Multi-word queries are normalised (lowercased; `-`, `_`, `/` collapsed to spaces) and every term must appear in `search_text`, giving AND semantics.
- Relevance is a scored `CASE` expression summed per term plus once for the full query: roughly exact code 120-160, exact title 80-110, title prefix 45-60, filename prefix 35, tag contains 36-55, actress contains 30-35, studio contains 20, generic text 8. Non-relevance sorts ignore the score.
- Facet filters add `LIKE` predicates on `actress_text`, `tag_text`, `studio`, `code`, `year` range, and `metadata_status`; `excludeTags` adds `NOT LIKE` predicates.
- Results are paginated (`limit` 1-100, default 24) and the response includes `total` so the UI can build the pager.
- Suggestions score candidates by exact match, prefix match, and term coverage, with small bonuses for tags and codes.
- If an AI-parsed query returns zero rows, the app retries once with tag expansion: it looks up stored tags that fuzzy-match the query terms and adds them as `includeTags`.

## Troubleshooting

**`npm.ps1 cannot be loaded because running scripts is disabled`** — a PowerShell execution-policy restriction, not an app bug. Use `npm.cmd` (the launcher does), or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.

**`npm install` fails while building `better-sqlite3`** — it is a native module. Current Node LTS releases get a prebuilt binary; if npm falls back to compiling it you need Python plus Visual Studio Build Tools with "Desktop development with C++". The simplest fix is to install a current Node LTS release, delete `node_modules`, and reinstall.

**The launcher says the backend never answered** — restore the minimized *MediaHub Backend* window and read the last lines. Usual causes: another program already holds port 4000, or a `PORT` environment variable points the API somewhere else. Check with `netstat -ano | findstr :4000`.

**The UI loads but shows "Backend Unavailable"** — the API is not reachable at `http://localhost:4000`. Start it, or point `BACKEND_API_ORIGIN` at wherever it runs.

**A scan finds nothing** — roots must be absolute folders that exist and are readable (`E:\Media`, not `Media\`). A removed root leaves its items marked unavailable, so they stay hidden from results until re-scanned.

**Cards show "No image"** — no artwork was found beside the file, or the item was indexed before the artwork existed. Re-scan after adding it.

**Some files will not play in the browser** — the API streams the original bytes with a per-extension content type, so playback depends on browser codec support (typically H.264/AAC in MP4). MKV/AVI files with other codecs may download or fail instead of playing.

**AI search reports "Not Configured" or "Not Ready"** — expected until `OLLAMA_SEARCH_MODEL` is set in `backend/.env` and `ollama serve` is reachable. Heuristic parsing keeps working without it.

## Known limitations

- The indexer is read-only and offline; it never downloads metadata from the internet.
- Scan progress lives in memory and is lost if the backend restarts mid-scan. Only the resulting index is persisted.
- Search uses `LIKE` scans over a denormalised column rather than SQLite FTS5. That is comfortable at a few thousand rows and would need revisiting around 100k+.
- There is no authentication and no multi-user data. The API binds to `127.0.0.1` only, but **`next dev` listens on all interfaces by default**, so the UI on port 3000 can be reachable from your local network. Run `npx next dev -H 127.0.0.1` if you want it loopback-only.
- No automated tests yet (`backend/package.json` still has the placeholder `test` script) and no production build pipeline for the API.
- Schema changes rely on idempotent `CREATE TABLE IF NOT EXISTS` and `PRAGMA` checks in `plugins/db.ts` rather than a versioned migration tool. The one legacy migration (detaching `library_item` from the old `media_file` table) still lives in that file.

## Repository hygiene

Two runtime artifacts are currently committed and will change as you use the app:

- `backend/mediahub.db` (~10 MB) holds your real index, including absolute file paths and whatever your NFO files contain. Before pushing this repository anywhere public, consider untracking it:

  ```bash
  git rm --cached backend/mediahub.db
  echo "backend/mediahub.db" >> .gitignore
  ```

- `backend/.tmp-library/` contains dummy fixtures (a 4-byte `.mp4`, a 3-byte `.jpg`, and one `.nfo`) that were used to verify scanning. Harmless, but not useful to other people.

## Where to change things

If you are learning the codebase, these are the highest-value seams:

| Goal | Start here |
| --- | --- |
| Add or change an API endpoint | `backend/src/modules/library/library.controller.ts` (route) → `library.service.ts` (orchestration) → `library.repository.ts` (SQL) |
| Change what gets indexed or how NFO is parsed | `backend/src/modules/library/library.scanner.ts` |
| Change search ranking or filters | `searchLibrary` in `backend/src/modules/library/library.repository.ts` |
| Change natural-language parsing | `backend/src/modules/library/library.nlp.ts` |
| Add a table or column | `initializeSchema` in `backend/src/plugins/db.ts` |
| Change the UI | `frontend/src/features/home/HomePage.tsx` (state and layout) plus its `components/` folder |
| Call a new backend route from the UI | Add a proxy route under `frontend/src/app/api/library/…`, then fetch it from `HomePage.tsx` |

Everything is typed end to end in TypeScript, so `npx tsc --noEmit` in `backend/` and
`npm run lint` in `frontend/` are the fastest ways to catch mistakes.
