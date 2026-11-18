const qdrantService = require("../services/qdrantService");
const embeddingService = require("../services/embeddingService");

class PointController {
    // Helper to resolve point vector from text if raw vector is not provided
    async _resolveVector(point) {
        if (!point.vector && (point.text || point.content)) {
            const textToEmbed = point.text || point.content;
            point.vector = await embeddingService.getEmbedding(textToEmbed);
            point.payload = point.payload || {};
            if (!point.payload.text) point.payload.text = textToEmbed;
        }
        if (point.vector) {
            embeddingService.validateVector(point.vector);
        }
    }

    // ==========================================
    // Category 2: Point Management
    // ==========================================

    async insertPoint(req, res, next) {
        try {
            const collectionName = req.body.collection || req.params.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            let { id, vector, text, content, payload = {} } = req.body;

            const point = { id, vector, text: text || content, payload };
            await this._resolveVector(point);

            if (!point.vector || !Array.isArray(point.vector)) {
                return res.status(400).json({
                    success: false,
                    error: "Either a numeric 'vector' array or 'text'/'content' string is required to insert point",
                });
            }

            const result = await qdrantService.upsertPoints(collectionName, [point]);
            res.status(201).json({
                success: true,
                message: "Point inserted successfully",
                collection: collectionName,
                id: result.ids[0],
                operation: result.operation,
            });
        } catch (error) {
            next(error);
        }
    }

    async updatePoint(req, res, next) {
        try {
            const collectionName = req.body.collection || req.params.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            const id = req.params.id || req.body.id;
            if (!id) {
                return res.status(400).json({ success: false, error: "Point 'id' is required" });
            }

            let { vector, text, payload } = req.body;
            if (!vector && text) {
                vector = await embeddingService.getEmbedding(text);
                payload = payload || {};
                payload.text = text;
            }

            const result = await qdrantService.updatePoint(collectionName, id, { vector, payload });
            res.json({ success: true, collection: collectionName, ...result });
        } catch (error) {
            next(error);
        }
    }

    async getPoint(req, res, next) {
        try {
            const collectionName = req.query.collection || req.params.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
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

    async batchInsert(req, res, next) {
        try {
            const collectionName = req.body.collection || req.params.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            let { points } = req.body;

            if (!Array.isArray(points) || points.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: "'points' non-empty array of { id?, vector?, text?, payload? } is required",
                });
            }

            // Extract texts for missing vectors and batch embed (batch size 32)
            const missingVectorIndices = [];
            const textsToEmbed = [];

            points.forEach((p, idx) => {
                if (!p.vector && (p.text || p.content)) {
                    missingVectorIndices.push(idx);
                    textsToEmbed.push(p.text || p.content);
                }
            });

            if (textsToEmbed.length > 0) {
                const vectors = await embeddingService.getBatchEmbeddings(textsToEmbed, 32);
                missingVectorIndices.forEach((pointIdx, i) => {
                    points[pointIdx].vector = vectors[i];
                    points[pointIdx].payload = points[pointIdx].payload || {};
                    if (!points[pointIdx].payload.text) {
                        points[pointIdx].payload.text = textsToEmbed[i];
                    }
                });
            }

            const result = await qdrantService.upsertPoints(collectionName, points);
            res.status(201).json({
                success: true,
                message: `Successfully batch inserted ${result.count} points`,
                collection: collectionName,
                ...result,
            });
        } catch (error) {
            next(error);
        }
    }

    async deletePoints(req, res, next) {
        try {
            const collectionName = req.body.collection || req.params.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            const idParam = req.params.id;
            const idsBody = req.body.ids || req.body.points || req.body.id;
            const ids = idParam || idsBody;

            if (!ids) {
                return res.status(400).json({ success: false, error: "Point 'id' or 'ids' array is required" });
            }

            const result = await qdrantService.deletePoints(collectionName, ids);
            res.json({ success: true, message: `Deleted ${result.deletedCount} points`, collection: collectionName, ...result });
        } catch (error) {
            next(error);
        }
    }

    async upsertPoints(req, res, next) {
        try {
            const collectionName = req.body.collection || req.params.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            let points = req.body.points || (req.body.id || req.body.vector || req.body.text ? [req.body] : null);

            if (!points || !Array.isArray(points)) {
                return res.status(400).json({
                    success: false,
                    error: "Either 'points' array or a single point object in body is required",
                });
            }

            // Ensure vectors
            for (const p of points) {
                await this._resolveVector(p);
            }

            const result = await qdrantService.upsertPoints(collectionName, points);
            res.status(200).json({
                success: true,
                message: `Upserted ${result.count} points`,
                collection: collectionName,
                ...result,
            });
        } catch (error) {
            next(error);
        }
    }

    async countPoints(req, res, next) {
        try {
            const collectionName = req.body.collection || req.query.collection || req.params.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            const filter = req.body.filter || null;
            const exact = req.body.exact !== undefined ? req.body.exact : true;

            const result = await qdrantService.countPoints(collectionName, { filter, exact });
            res.json({ success: true, collection: collectionName, count: result.count });
        } catch (error) {
            next(error);
        }
    }

    async scrollPoints(req, res, next) {
        try {
            const collectionName = req.body.collection || req.query.collection || req.params.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            const limit = req.body.limit || req.query.limit || 10;
            const offset = req.body.offset || req.query.offset || null;
            const filter = req.body.filter || null;
            const with_vector = req.body.with_vector || req.query.with_vector === "true";
            const with_payload = req.body.with_payload !== undefined ? req.body.with_payload : true;

            const result = await qdrantService.scrollPoints(collectionName, {
                limit,
                offset,
                filter,
                with_vector,
                with_payload,
            });

            res.json({ success: true, collection: collectionName, data: result });
        } catch (error) {
            next(error);
        }
    }

    // ==========================================
    // Category 4: Payload / Metadata
    // ==========================================

    async setPayload(req, res, next) {
        try {
            const collectionName = req.body.collection || req.params.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            const ids = req.body.ids || (req.body.id ? [req.body.id] : null);
            const { payload } = req.body;

            if (!ids || !payload) {
                return res.status(400).json({ success: false, error: "'ids' (array or string) and 'payload' (object) are required" });
            }

            const result = await qdrantService.setPayload(collectionName, { ids, payload });
            res.json({ success: true, collection: collectionName, ...result });
        } catch (error) {
            next(error);
        }
    }

    async patchPayload(req, res, next) {
        // Alias for setPayload (Qdrant setPayload merges keys)
        return this.setPayload(req, res, next);
    }

    async deletePayloadKeys(req, res, next) {
        try {
            const collectionName = req.body.collection || req.params.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            const ids = req.body.ids || (req.body.id ? [req.body.id] : null);
            const keys = req.body.keys || (req.body.key ? [req.body.key] : null);

            if (!ids || !keys) {
                return res.status(400).json({ success: false, error: "'ids' and 'keys' array are required" });
            }

            const result = await qdrantService.deletePayloadKeys(collectionName, { ids, keys });
            res.json({ success: true, collection: collectionName, ...result });
        } catch (error) {
            next(error);
        }
    }

    async filterByPayload(req, res, next) {
        try {
            const collectionName = req.body.collection || req.params.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            const { filter, limit = 20, offset = null } = req.body;

            if (!filter) {
                return res.status(400).json({ success: false, error: "'filter' object is required to filter points by payload" });
            }

            const result = await qdrantService.scrollPoints(collectionName, {
                limit,
                offset,
                filter,
                with_payload: true,
                with_vector: false,
            });

            res.json({ success: true, collection: collectionName, count: result.points?.length || 0, data: result });
        } catch (error) {
            next(error);
        }
    }

    async createPayloadIndex(req, res, next) {
        try {
            const collectionName = req.body.collection || req.params.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            const { field_name, field_schema = "keyword" } = req.body;

            if (!field_name) {
                return res.status(400).json({ success: false, error: "'field_name' string is required" });
            }

            const result = await qdrantService.createPayloadIndex(collectionName, { field_name, field_schema });
            res.status(201).json({ success: true, collection: collectionName, ...result });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new PointController();
