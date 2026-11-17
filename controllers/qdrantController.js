const qdrantService = require("../services/qdrantService");
const embeddingService = require("../services/embeddingService");

class QdrantController {
    // Health check and collections
    async healthCheck(req, res, next) {
        try {
            const collections = await qdrantService.listCollections();
            res.json({
                status: "ok",
                message: "Connected to Qdrant",
                targetCollection: process.env.DEFAULT_COLLECTION || "ai_centizen",
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
            const size = vectorSize ? parseInt(vectorSize, 10) : parseInt(process.env.DEFAULT_VECTOR_SIZE, 10) || 1024;
            const dist = distance || process.env.DEFAULT_VECTOR_DISTANCE || "Cosine";
            const result = await qdrantService.ensureCollection(name, size, dist);
            res.status(201).json({ success: true, ...result });
        } catch (error) {
            next(error);
        }
    }

    async getCollection(req, res, next) {
        try {
            const collectionName = req.params.collection || req.query.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            const result = await qdrantService.getCollection(collectionName);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async deleteCollection(req, res, next) {
        try {
            const collectionName = req.params.collection || req.query.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            const result = await qdrantService.deleteCollection(collectionName);
            res.json({ success: true, message: `Collection '${collectionName}' deleted`, data: result });
        } catch (error) {
            next(error);
        }
    }

    // CREATE Point (supports both raw vector OR text via Embedding API)
    async createPoint(req, res, next) {
        try {
            const collectionName = req.params.collection || req.body.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            let { id, vector, text, payload = {} } = req.body;

            // If text is provided without a vector, automatically generate vector via Embedding API
            if (!vector && text) {
                vector = await embeddingService.getEmbedding(text);
                if (!payload.text) {
                    payload.text = text;
                }
            }

            if (!vector || !Array.isArray(vector)) {
                return res.status(400).json({
                    success: false,
                    error: "Either a numeric 'vector' array or 'text' string is required",
                });
            }

            embeddingService.validateVector(vector);

            const result = await qdrantService.createPoint(collectionName, { id, vector, payload });
            res.status(201).json({ success: true, collection: collectionName, ...result });
        } catch (error) {
            next(error);
        }
    }

    // CREATE Batch Points
    async createBatch(req, res, next) {
        try {
            const collectionName = req.params.collection || req.body.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            const { points } = req.body;

            if (!Array.isArray(points) || points.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: "'points' array is required containing objects with { vector (or text), payload?, id? }",
                });
            }

            for (const p of points) {
                if (!p.vector && p.text) {
                    p.vector = await embeddingService.getEmbedding(p.text);
                    p.payload = p.payload || {};
                    if (!p.payload.text) p.payload.text = p.text;
                }
                if (p.vector) {
                    embeddingService.validateVector(p.vector);
                }
            }

            const result = await qdrantService.createPointsBatch(collectionName, points);
            res.status(201).json({ success: true, collection: collectionName, ...result });
        } catch (error) {
            next(error);
        }
    }

    // READ Point
    async getPoint(req, res, next) {
        try {
            const collectionName = req.params.collection || req.query.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            const { id } = req.params;
            const withVector = req.query.with_vector === "true";

            const point = await qdrantService.getPoint(collectionName, id, withVector);
            if (!point) {
                return res.status(404).json({
                    success: false,
                    error: `Point with ID '${id}' not found in collection '${collectionName}'`,
                });
            }

            res.json({ success: true, collection: collectionName, data: point });
        } catch (error) {
            next(error);
        }
    }

    // READ Points List / Scroll
    async listPoints(req, res, next) {
        try {
            const collectionName = req.params.collection || req.query.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            const { limit, offset, with_vector } = req.query;

            const result = await qdrantService.listPoints(collectionName, {
                limit: limit || 10,
                offset: offset || null,
                withVector: with_vector === "true",
            });

            res.json({ success: true, collection: collectionName, data: result });
        } catch (error) {
            next(error);
        }
    }

    // UPDATE Point (payload and/or vector/text)
    async updatePoint(req, res, next) {
        try {
            const collectionName = req.params.collection || req.body.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            const { id } = req.params;
            let { vector, text, payload } = req.body;

            if (!vector && text) {
                vector = await embeddingService.getEmbedding(text);
                payload = payload || {};
                payload.text = text;
            }

            if (vector) {
                embeddingService.validateVector(vector);
            }

            if (!vector && !payload) {
                return res.status(400).json({
                    success: false,
                    error: "Either 'payload', 'vector', or 'text' must be provided for update",
                });
            }

            const result = await qdrantService.updatePoint(collectionName, id, { vector, payload });
            res.json({ success: true, collection: collectionName, ...result });
        } catch (error) {
            next(error);
        }
    }

    // DELETE Point
    async deletePoint(req, res, next) {
        try {
            const collectionName = req.params.collection || req.query.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            const { id } = req.params;

            const result = await qdrantService.deletePoint(collectionName, id);
            res.json({ success: true, collection: collectionName, ...result });
        } catch (error) {
            next(error);
        }
    }

    // SEARCH Points (supports query text or raw vector)
    async searchPoints(req, res, next) {
        try {
            const collectionName = req.params.collection || req.body.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            let { vector, text, query, limit, filter, score_threshold } = req.body;

            const queryText = text || query;
            if (!vector && queryText) {
                vector = await embeddingService.getEmbedding(queryText);
            }

            if (!vector || !Array.isArray(vector)) {
                return res.status(400).json({
                    success: false,
                    error: "Query 'vector' numeric array or 'text'/'query' string is required for search",
                });
            }

            embeddingService.validateVector(vector);

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
