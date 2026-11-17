# Datasets Directory

Place your knowledge base JSON dataset here.

Supported filenames by default:
- `sendbasket_qdrant_chunks_v4 100 - 133(1).json`
- `sendbasket_qdrant_chunks_v4.json`

You can also pass any custom file path when triggering the import API or CLI:
- CLI: `node scripts/importChunks.js [path/to/your/file.json]`
- API: `POST /api/import/json` with `{ "filePath": "path/to/file.json" }` or direct `{ "chunks": [...] }`
