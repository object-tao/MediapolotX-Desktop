# MediapolotX Desktop

Electron desktop client for local/NAS media management, image batch processing, video cover generation, and Web task synchronization.

## Stack

- Electron + React + Vite
- Node.js modules for local indexing and processing
- SQLite via `better-sqlite3`
- Image processing via `sharp` and `exiftool-vendored`
- Video cover generation via `ffmpeg-static` and `fluent-ffmpeg`
- Web communication via `axios`
- Logging via `winston`

## Development

```powershell
npm install
npm run dev
```

## MVP Features

- Storage libraries: local folders, removable drives, and mounted NAS paths.
- File indexing: image/video scan, watcher updates, SQLite-backed file status.
- Image processing: resize, compress, clean EXIF, template render, thumbnail generation.
- Video processing: frame capture and cover adaptation with crop or blurred background.
- Web sync: fetch remote task queue, store remote tasks locally, upload current storage index.
- Local settings: remembers image, video, and Web sync options in SQLite.

## Web API Contract

The initial desktop client expects the Web service to expose these endpoints under the configured API base URL:

- `GET /desktop/tasks`
- `POST /desktop/indexes`
- `POST /desktop/files/:fileId/thumbnail`
- `PATCH /desktop/tasks/:taskId`

The response shape for task queue can be an array, `{ "tasks": [...] }`, or `{ "data": [...] }`.

## Build

```powershell
npm run build
npm run package
```

## Release

GitHub Actions runs CI on pull requests and pushes. Tag a release with `v*` to build desktop artifacts on Windows, macOS, and Linux.
