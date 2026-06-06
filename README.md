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

## Build

```powershell
npm run build
npm run package
```

## Release

GitHub Actions runs CI on pull requests and pushes. Tag a release with `v*` to build desktop artifacts on Windows, macOS, and Linux.
