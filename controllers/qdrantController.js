const qdrantService = require("../services/qdrantService");

class QdrantController {
    // Health check and collections
    async healthCheck(req, res, next) {
        try {
            const collections = await qdrantService.listCollections();
            res.json({
                status: "ok",
                message: "Connected to Qdrant",
                collections: collections.collections,
            });
        } catch (error) {
            next(error);
        }
    }

    async listCollections(req, res, next) {
        try {
            const result = await qdrantService.listCollections();
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async createCollection(req, res, next) {
        try {
            const { name, vectorSize, distance } = req.body;
            if (!name) {
                return res.status(400).json({ success: false, error: "Collection name is required" });
            }
            const size = vectorSize ? parseInt(vectorSize, 10) : 4;
            const result = await qdrantService.ensureCollection(name, size, distance || "Cosine");
            res.status(201).json({ success: true, ...result });
        } catch (error) {
            next(error);
        }
    }

    async getCollection(req, res, next) {
        try {
            const collectionName = req.params.collection || process.env.DEFAULT_COLLECTION || "documents";
            const result = await qdrantService.getCollection(collectionName);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async deleteCollection(req, res, next) {
        try {
            const collectionName = req.params.collection || process.env.DEFAULT_COLLECTION || "documents";
            const result = await qdrantService.deleteCollection(collectionName);
            res.json({ success: true, message: `Collection '${collectionName}' deleted`, data: result });
        } catch (error) {
            next(error);
        }
    }

    // CREATE Point
    async createPoint(req, res, next) {
        try {
            const collectionName = req.params.collection || req.body.collection || process.env.DEFAULT_COLLECTION || "documents";
            const { id, vector, payload } = req.body;

            if (!vector || !Array.isArray(vector)) {
                return res.status(400).json({
                    success: false,
                    error: "A valid 'vector' numeric array is required (e.g. [0.1, 0.2, 0.3, 0.4])",
                });
            }

            const result = await qdrantService.createPoint(collectionName, { id, vector, payload });
            res.status(201).json({ success: true, ...result });
        } catch (error) {
            next(error);
        }
    }

    // CREATE Batch Points
    async createBatch(req, res, next) {
        try {
            const collectionName = req.params.collection || req.body.collection || process.env.DEFAULT_COLLECTION || "documents";
            const { points } = req.body;

            if (!Array.isArray(points) || points.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: "'points' array is required containing objects with { vector, payload?, id? }",
                });
            }

            const result = await qdrantService.createPointsBatch(collectionName, points);
            res.status(201).json({ success: true, ...result });
        } catch (error) {
            next(error);
        }
    }

    // READ Point
    async getPoint(req, res, next) {
        try {
            const collectionName = req.params.collection || process.env.DEFAULT_COLLECTION || "documents";
            const { id } = req.params;
            const withVector = req.query.with_vector === "true";

            const point = await qdrantService.getPoint(collectionName, id, withVector);
            if (!point) {
                return res.status(404).json({
                    success: false,
                    error: `Point with ID '${id}' not found in collection '${collectionName}'`,
                });
            }

            res.json({ success: true, data: point });
        } catch (error) {
            next(error);
        }
    }

    // READ Points List / Scroll
    async listPoints(req, res, next) {
        try {
            const collectionName = req.params.collection || process.env.DEFAULT_COLLECTION || "documents";
            const { limit, offset, with_vector } = req.query;

            const result = await qdrantService.listPoints(collectionName, {
                limit: limit || 10,
                offset: offset || null,
                withVector: with_vector === "true",
            });

            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    // UPDATE Point
    async updatePoint(req, res, next) {
        try {
            const collectionName = req.params.collection || req.body.collection || process.env.DEFAULT_COLLECTION || "documents";
            const { id } = req.params;
            const { vector, payload } = req.body;

            if (!vector && !payload) {
                return res.status(400).json({
                    success: false,
                    error: "Either 'payload' or 'vector' must be provided for update",
                });
            }

            const result = await qdrantService.updatePoint(collectionName, id, { vector, payload });
            res.json({ success: true, ...result });
        } catch (error) {
            next(error);
        }
    }

    // DELETE Point
    async deletePoint(req, res, next) {
        try {
            const collectionName = req.params.collection || process.env.DEFAULT_COLLECTION || "documents";
            const { id } = req.params;

            const result = await qdrantService.deletePoint(collectionName, id);
            res.json({ success: true, ...result });
        } catch (error) {
            next(error);
        }
    }

    // SEARCH Points by Vector Similarity
    async searchPoints(req, res, next) {
        try {
            const collectionName = req.params.collection || req.body.collection || process.env.DEFAULT_COLLECTION || "documents";
            const { vector, limit, filter, score_threshold } = req.body;

            if (!vector || !Array.isArray(vector)) {
                return res.status(400).json({
                    success: false,
                    error: "Query 'vector' numeric array is required for search (e.g. [0.1, 0.2, 0.3, 0.4])",
                });
            }

            const results = await qdrantService.searchPoints(collectionName, {
                vector,
                limit: limit || 5,
                filter: filter || null,
                scoreThreshold: score_threshold,
            });

            res.json({
                success: true,
                collection: collectionName,
                count: results.length,
                results,
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new QdrantController();
