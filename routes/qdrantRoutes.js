const express = require("express");
const router = express.Router();
const qdrantController = require("../controllers/qdrantController");
const importController = require("../controllers/importController");

// Health & Collections
router.get("/health", (req, res, next) => qdrantController.healthCheck(req, res, next));
router.get("/collections", (req, res, next) => qdrantController.listCollections(req, res, next));
router.post("/collections", (req, res, next) => qdrantController.createCollection(req, res, next));
router.get("/collections/:collection", (req, res, next) => qdrantController.getCollection(req, res, next));
router.delete("/collections/:collection", (req, res, next) => qdrantController.deleteCollection(req, res, next));

// JSON Batch Import Workflow
router.post("/import/preview", (req, res, next) => importController.previewImport(req, res, next));
router.post("/import/json", (req, res, next) => importController.importChunks(req, res, next));
router.post("/collections/:collection/import", (req, res, next) => importController.importChunks(req, res, next));

// Direct /api/search endpoint
router.post("/search", (req, res, next) => qdrantController.searchPoints(req, res, next));

// Points CRUD - Default Collection
router.post("/points/batch", (req, res, next) => qdrantController.createBatch(req, res, next));
router.post("/points/search", (req, res, next) => qdrantController.searchPoints(req, res, next));
router.post("/points", (req, res, next) => qdrantController.createPoint(req, res, next));
router.get("/points", (req, res, next) => qdrantController.listPoints(req, res, next));
router.get("/points/:id", (req, res, next) => qdrantController.getPoint(req, res, next));
router.put("/points/:id", (req, res, next) => qdrantController.updatePoint(req, res, next));
router.patch("/points/:id", (req, res, next) => qdrantController.updatePoint(req, res, next));
router.delete("/points/:id", (req, res, next) => qdrantController.deletePoint(req, res, next));

// Points CRUD - Explicit Collection
router.post("/collections/:collection/points/batch", (req, res, next) => qdrantController.createBatch(req, res, next));
router.post("/collections/:collection/points/search", (req, res, next) => qdrantController.searchPoints(req, res, next));
router.post("/collections/:collection/points", (req, res, next) => qdrantController.createPoint(req, res, next));
router.get("/collections/:collection/points", (req, res, next) => qdrantController.listPoints(req, res, next));
router.get("/collections/:collection/points/:id", (req, res, next) => qdrantController.getPoint(req, res, next));
router.put("/collections/:collection/points/:id", (req, res, next) => qdrantController.updatePoint(req, res, next));
router.patch("/collections/:collection/points/:id", (req, res, next) => qdrantController.updatePoint(req, res, next));
router.delete("/collections/:collection/points/:id", (req, res, next) => qdrantController.deletePoint(req, res, next));

module.exports = router;
