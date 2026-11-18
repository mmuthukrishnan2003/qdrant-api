const express = require("express");
const router = express.Router();

const collectionController = require("../controllers/collectionController");
const pointController = require("../controllers/pointController");
const searchController = require("../controllers/searchController");
const importExportController = require("../controllers/importExportController");
const ragController = require("../controllers/ragController");
const adminController = require("../controllers/adminController");

// ==========================================
// 1. COLLECTION MANAGEMENT APIS
// ==========================================
router.post("/collections/create", (req, res, next) => collectionController.createCollection(req, res, next));
router.post("/collections", (req, res, next) => collectionController.createCollection(req, res, next));
router.get("/collections", (req, res, next) => collectionController.listCollections(req, res, next));
router.get("/collections/:name/stats", (req, res, next) => adminController.collectionStats(req, res, next));
router.post("/collections/:name/optimize", (req, res, next) => collectionController.optimizeCollection(req, res, next));
router.get("/collections/:name", (req, res, next) => collectionController.getCollection(req, res, next));
router.put("/collections/:name", (req, res, next) => collectionController.updateCollection(req, res, next));
router.delete("/collections/:name", (req, res, next) => collectionController.deleteCollection(req, res, next));

// ==========================================
// 2. POINT MANAGEMENT APIS
// ==========================================
router.post("/points/insert", (req, res, next) => pointController.insertPoint(req, res, next));
router.post("/points/batch", (req, res, next) => pointController.batchInsert(req, res, next));
router.put("/points/update", (req, res, next) => pointController.updatePoint(req, res, next));
router.delete("/points/delete", (req, res, next) => pointController.deletePoints(req, res, next));
router.post("/points/upsert", (req, res, next) => pointController.upsertPoints(req, res, next));
router.post("/points/count", (req, res, next) => pointController.countPoints(req, res, next));
router.get("/points/count", (req, res, next) => pointController.countPoints(req, res, next));
router.post("/points/scroll", (req, res, next) => pointController.scrollPoints(req, res, next));
router.get("/points", (req, res, next) => pointController.scrollPoints(req, res, next));
router.post("/points", (req, res, next) => pointController.insertPoint(req, res, next));

// ==========================================
// 3. VECTOR SEARCH APIS
// ==========================================
router.post("/points/search/hybrid", (req, res, next) => searchController.hybridSearch(req, res, next));
router.post("/points/search/filter", (req, res, next) => searchController.searchWithFilter(req, res, next));
router.post("/points/search/multi", (req, res, next) => searchController.multiSearch(req, res, next));
router.post("/points/search/advanced", (req, res, next) => searchController.advancedSearch(req, res, next));
router.post("/points/search", (req, res, next) => searchController.search(req, res, next));
router.post("/search", (req, res, next) => searchController.search(req, res, next));
router.post("/points/recommend", (req, res, next) => searchController.recommend(req, res, next));
router.post("/points/discover", (req, res, next) => searchController.discover(req, res, next));

// ==========================================
// 4. PAYLOAD / METADATA APIS
// ==========================================
router.put("/points/payload", (req, res, next) => pointController.setPayload(req, res, next));
router.patch("/points/payload", (req, res, next) => pointController.patchPayload(req, res, next));
router.delete("/points/payload", (req, res, next) => pointController.deletePayloadKeys(req, res, next));
router.post("/points/payload/filter", (req, res, next) => pointController.filterByPayload(req, res, next));
router.post("/points/payload/index", (req, res, next) => pointController.createPayloadIndex(req, res, next));

// Single point by ID & history
router.get("/points/:id/history", (req, res, next) => adminController.pointHistory(req, res, next));
router.get("/points/:id", (req, res, next) => pointController.getPoint(req, res, next));
router.put("/points/:id", (req, res, next) => pointController.updatePoint(req, res, next));
router.patch("/points/:id", (req, res, next) => pointController.updatePoint(req, res, next));
router.delete("/points/:id", (req, res, next) => pointController.deletePoints(req, res, next));

// ==========================================
// 5. IMPORT AND EXPORT APIS
// ==========================================
router.post("/import/preview", (req, res, next) => importExportController.preview(req, res, next));
router.post("/import/json", (req, res, next) => importExportController.importJson(req, res, next));
router.post("/import/csv", (req, res, next) => importExportController.importCsv(req, res, next));
router.post("/import/bulk", (req, res, next) => importExportController.importBulk(req, res, next));
router.get("/export/json", (req, res, next) => importExportController.exportJson(req, res, next));
router.get("/export/csv", (req, res, next) => importExportController.exportCsv(req, res, next));
router.get("/export/:collection", (req, res, next) => importExportController.exportJson(req, res, next));

// ==========================================
// 6. ADVANCED AI / RAG APIS
// ==========================================
router.post("/embeddings/generate", (req, res, next) => ragController.generateEmbeddings(req, res, next));
router.post("/rag/query", (req, res, next) => ragController.queryContext(req, res, next));
router.post("/rag/answer", (req, res, next) => ragController.generateAnswer(req, res, next));
router.post("/rag/chat", (req, res, next) => ragController.chat(req, res, next));
router.post("/rag/stream", (req, res, next) => ragController.streamAnswer(req, res, next));
router.post("/rag/ingest", (req, res, next) => ragController.ingestDocument(req, res, next));
router.post("/rag/reindex", (req, res, next) => ragController.reindex(req, res, next));
router.post("/rag/delete-document", (req, res, next) => ragController.deleteDocument(req, res, next));

// ==========================================
// 7. MONITORING AND ADMINISTRATION APIS
// ==========================================
router.get("/health", (req, res, next) => adminController.health(req, res, next));
router.get("/status", (req, res, next) => adminController.status(req, res, next));
router.get("/stats", (req, res, next) => adminController.stats(req, res, next));
router.get("/logs", (req, res, next) => adminController.logs(req, res, next));
router.get("/config", (req, res, next) => adminController.config(req, res, next));

module.exports = router;
