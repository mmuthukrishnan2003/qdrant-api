const { v4: uuidv4 } = require("uuid");
const qdrantClient = require("../config/qdrant");
const auditLogService = require("./auditLogService");

const DEFAULT_COLLECTION = process.env.DEFAULT_COLLECTION || "ai_centizen";
const DEFAULT_VECTOR_SIZE = parseInt(process.env.DEFAULT_VECTOR_SIZE, 10) || 1024;
const DEFAULT_VECTOR_DISTANCE = process.env.DEFAULT_VECTOR_DISTANCE || "Cosine";

class QdrantService {
    normalizePointId(id) {
        if (typeof id === "string" && /^\d+$/.test(id)) {
            const numericId = Number(id);
            if (Number.isSafeInteger(numericId)) return numericId;
        }
        return id;
    }

    normalizeIds(ids) {
        if (!Array.isArray(ids)) {
            return [this.normalizePointId(ids)];
        }
        return ids.map((id) => this.normalizePointId(id));
    }

    // ==========================================
    // 1. COLLECTION MANAGEMENT
    // ==========================================

    async ensureCollection(
        collectionName = DEFAULT_COLLECTION,
        vectorSize = DEFAULT_VECTOR_SIZE,
        distance = DEFAULT_VECTOR_DISTANCE
    ) {
        try {
            const info = await qdrantClient.getCollection(collectionName);
            return { exists: true, message: `Collection '${collectionName}' already exists`, info };
        } catch (error) {
            const status = error.status || error.statusCode || error.response?.status;
            if (status !== 404) throw error;

            await qdrantClient.createCollection(collectionName, {
                vectors: {
                    size: vectorSize,
                    distance: distance,
                },
            });
            auditLogService.log("info", `Collection '${collectionName}' created (dim: ${vectorSize})`);
            return { created: true, message: `Collection '${collectionName}' created successfully` };
        }
    }

    async createCollection(collectionName, {
        vectorSize = DEFAULT_VECTOR_SIZE,
        distance = DEFAULT_VECTOR_DISTANCE,
        optimizers_config,
        hnsw_config,
        quantization_config,
        on_disk_payload,
    } = {}) {
        if (!collectionName) throw new Error("Collection name is required");

        const options = {
            vectors: {
                size: parseInt(vectorSize, 10) || DEFAULT_VECTOR_SIZE,
                distance: distance || DEFAULT_VECTOR_DISTANCE,
            },
        };

        if (optimizers_config) options.optimizers_config = optimizers_config;
        if (hnsw_config) options.hnsw_config = hnsw_config;
        if (quantization_config) options.quantization_config = quantization_config;
        if (on_disk_payload !== undefined) options.on_disk_payload = on_disk_payload;

        const result = await qdrantClient.createCollection(collectionName, options);
        auditLogService.log("info", `Created collection ${collectionName}`, { options });
        return result;
    }

    async listCollections() {
        return await qdrantClient.getCollections();
    }

    async getCollection(collectionName = DEFAULT_COLLECTION) {
        return await qdrantClient.getCollection(collectionName);
    }

    async updateCollection(collectionName = DEFAULT_COLLECTION, config = {}) {
        const result = await qdrantClient.updateCollection(collectionName, config);
        auditLogService.log("info", `Updated collection configuration for ${collectionName}`);
        return result;
    }

    async deleteCollection(collectionName = DEFAULT_COLLECTION) {
        const result = await qdrantClient.deleteCollection(collectionName);
        auditLogService.log("warn", `Deleted collection ${collectionName}`);
        return result;
    }

    async optimizeCollection(collectionName = DEFAULT_COLLECTION, { maxOptimizationThreads, indexingThreshold } = {}) {
        const updateParams = {
            optimizers_config: {},
        };
        if (maxOptimizationThreads) updateParams.optimizers_config.max_optimization_threads = maxOptimizationThreads;
        if (indexingThreshold) updateParams.optimizers_config.indexing_threshold = indexingThreshold;

        // Trigger optimization cycle via updateCollection
        const result = await qdrantClient.updateCollection(collectionName, updateParams);
        auditLogService.log("info", `Triggered optimization for collection ${collectionName}`);
        return {
            success: true,
            message: `Optimization initiated for collection '${collectionName}'`,
            result,
        };
    }

    // ==========================================
    // 2. POINT MANAGEMENT
    // ==========================================

    async upsertPoints(collectionName = DEFAULT_COLLECTION, points = []) {
        if (!Array.isArray(points)) {
            points = [points];
        }
        if (points.length === 0) {
            throw new Error("Points array cannot be empty");
        }

        const sampleVector = points[0].vector;
        if (!sampleVector || !Array.isArray(sampleVector)) {
            throw new Error("Each point must include a numeric vector array");
        }

        await this.ensureCollection(collectionName, sampleVector.length);

        const formattedPoints = points.map((p) => {
            const pId = p.id !== undefined && p.id !== null ? this.normalizePointId(p.id) : uuidv4();
            return {
                id: pId,
                vector: p.vector,
                payload: p.payload || {},
            };
        });

        const response = await qdrantClient.upsert(collectionName, {
            wait: true,
            points: formattedPoints,
        });

        formattedPoints.forEach((p) => {
            auditLogService.recordPointEvent(collectionName, p.id, "upsert", { payloadKeys: Object.keys(p.payload) });
        });

        return {
            count: formattedPoints.length,
            ids: formattedPoints.map((p) => p.id),
            operation: response,
        };
    }

    async getPoint(collectionName = DEFAULT_COLLECTION, id, withVector = true) {
        if (!id) throw new Error("Point ID is required");
        id = this.normalizePointId(id);

        const points = await qdrantClient.retrieve(collectionName, {
            ids: [id],
            with_payload: true,
            with_vector: withVector,
        });

        return points && points.length > 0 ? points[0] : null;
    }

    async updatePoint(collectionName = DEFAULT_COLLECTION, id, { vector, payload } = {}) {
        if (!id) throw new Error("Point ID is required");
        id = this.normalizePointId(id);

        if (vector && Array.isArray(vector)) {
            const existing = await this.getPoint(collectionName, id, false);
            const mergedPayload = payload !== undefined ? payload : (existing ? existing.payload : {});

            const res = await qdrantClient.upsert(collectionName, {
                wait: true,
                points: [{ id, vector, payload: mergedPayload }],
            });
            auditLogService.recordPointEvent(collectionName, id, "update", { updatedVector: true });
            return { id, operation: res, message: "Point vector & payload updated successfully" };
        }

        if (payload) {
            const res = await qdrantClient.setPayload(collectionName, {
                wait: true,
                points: [id],
                payload,
            });
            auditLogService.recordPointEvent(collectionName, id, "update_payload", { keys: Object.keys(payload) });
            return { id, operation: res, message: "Point payload updated successfully" };
        }

        throw new Error("Either 'vector' or 'payload' is required to update a point");
    }

    async deletePoints(collectionName = DEFAULT_COLLECTION, ids) {
        if (!ids) throw new Error("Point ID or array of IDs is required");
        const normalized = this.normalizeIds(ids);

        const response = await qdrantClient.delete(collectionName, {
            wait: true,
            points: normalized,
        });

        normalized.forEach((id) => auditLogService.recordPointEvent(collectionName, id, "delete"));

        return {
            deletedCount: normalized.length,
            ids: normalized,
            operation: response,
        };
    }

    async countPoints(collectionName = DEFAULT_COLLECTION, { filter = null, exact = true } = {}) {
        const countParams = { exact };
        if (filter) countParams.filter = filter;
        return await qdrantClient.count(collectionName, countParams);
    }

    async scrollPoints(collectionName = DEFAULT_COLLECTION, {
        limit = 10,
        offset = null,
        filter = null,
        with_vector = false,
        with_payload = true,
    } = {}) {
        return await qdrantClient.scroll(collectionName, {
            limit: parseInt(limit, 10),
            offset,
            filter,
            with_payload,
            with_vector,
        });
    }

    // Alias for compatibility
    async createPoint(collectionName, { id, vector, payload }) {
        const res = await this.upsertPoints(collectionName, [{ id, vector, payload }]);
        return { id: res.ids[0], operation: res.operation, message: "Point created successfully" };
    }

    async createPointsBatch(collectionName, points) {
        return await this.upsertPoints(collectionName, points);
    }

    // ==========================================
    // 3. VECTOR SEARCH APIS
    // ==========================================

    async search(collectionName = DEFAULT_COLLECTION, {
        vector,
        limit = 5,
        filter = null,
        scoreThreshold = null,
        params = null,
        with_payload = true,
        with_vector = false,
    } = {}) {
        if (!vector || !Array.isArray(vector)) {
            throw new Error("Query vector array is required for search");
        }

        const searchParams = {
            vector,
            limit: parseInt(limit, 10) || 5,
            with_payload,
            with_vector,
        };

        if (filter) searchParams.filter = filter;
        if (scoreThreshold !== null && scoreThreshold !== undefined) {
            searchParams.score_threshold = parseFloat(scoreThreshold);
        }
        if (params) searchParams.params = params;

        return await qdrantClient.search(collectionName, searchParams);
    }

    async hybridSearch(collectionName = DEFAULT_COLLECTION, {
        vector,
        queryText = "",
        keywordField = "content",
        limit = 5,
        filter = null,
    } = {}) {
        // Build hybrid search by combining dense semantic vector search with keyword payload filters
        const combinedFilter = filter ? { ...filter } : {};
        if (queryText) {
            const matchClause = {
                key: keywordField,
                match: { text: queryText },
            };
            if (!combinedFilter.should) combinedFilter.should = [];
            combinedFilter.should.push(matchClause);
        }

        const results = await this.search(collectionName, {
            vector,
            limit,
            filter: Object.keys(combinedFilter).length > 0 ? combinedFilter : null,
            with_payload: true,
        });

        return results;
    }

    async multiSearch(collectionName = DEFAULT_COLLECTION, searches = []) {
        if (!Array.isArray(searches) || searches.length === 0) {
            throw new Error("searches array is required for multi-search");
        }

        const formattedSearches = searches.map((s) => ({
            vector: s.vector,
            limit: parseInt(s.limit, 10) || 5,
            filter: s.filter || null,
            score_threshold: s.scoreThreshold || s.score_threshold || null,
            with_payload: s.with_payload !== undefined ? s.with_payload : true,
            with_vector: s.with_vector || false,
        }));

        return await qdrantClient.searchBatch(collectionName, {
            searches: formattedSearches,
        });
    }

    async recommend(collectionName = DEFAULT_COLLECTION, {
        positive = [],
        negative = [],
        limit = 5,
        filter = null,
        scoreThreshold = null,
        using = null,
    } = {}) {
        if (!Array.isArray(positive) || positive.length === 0) {
            throw new Error("'positive' point IDs array is required for recommendation");
        }

        const recommendParams = {
            positive: this.normalizeIds(positive),
            negative: negative.length > 0 ? this.normalizeIds(negative) : undefined,
            limit: parseInt(limit, 10) || 5,
            with_payload: true,
            with_vector: false,
        };

        if (filter) recommendParams.filter = filter;
        if (scoreThreshold) recommendParams.score_threshold = parseFloat(scoreThreshold);
        if (using) recommendParams.using = using;

        return await qdrantClient.recommend(collectionName, recommendParams);
    }

    async discover(collectionName = DEFAULT_COLLECTION, {
        target = null,
        context = [],
        limit = 5,
        filter = null,
    } = {}) {
        const discoverParams = {
            limit: parseInt(limit, 10) || 5,
            with_payload: true,
            with_vector: false,
        };

        if (target) discoverParams.target = target;
        if (context && context.length > 0) discoverParams.context = context;
        if (filter) discoverParams.filter = filter;

        return await qdrantClient.discoverPoints(collectionName, discoverParams);
    }

    async searchPoints(collectionName, options) {
        return await this.search(collectionName, options);
    }

    // ==========================================
    // 4. PAYLOAD / METADATA APIS
    // ==========================================

    async setPayload(collectionName = DEFAULT_COLLECTION, { ids, payload }) {
        if (!ids || !payload) throw new Error("'ids' and 'payload' are required");
        const normalized = this.normalizeIds(ids);

        const res = await qdrantClient.setPayload(collectionName, {
            wait: true,
            points: normalized,
            payload,
        });

        normalized.forEach((id) => {
            auditLogService.recordPointEvent(collectionName, id, "set_payload", { keys: Object.keys(payload) });
        });

        return { ids: normalized, operation: res, message: "Payload updated successfully" };
    }

    async overwritePayload(collectionName = DEFAULT_COLLECTION, { ids, payload }) {
        if (!ids || !payload) throw new Error("'ids' and 'payload' are required");
        const normalized = this.normalizeIds(ids);

        const res = await qdrantClient.overwritePayload(collectionName, {
            wait: true,
            points: normalized,
            payload,
        });

        normalized.forEach((id) => {
            auditLogService.recordPointEvent(collectionName, id, "overwrite_payload", { keys: Object.keys(payload) });
        });

        return { ids: normalized, operation: res, message: "Payload overwritten successfully" };
    }

    async deletePayloadKeys(collectionName = DEFAULT_COLLECTION, { ids, keys }) {
        if (!ids || !Array.isArray(keys)) throw new Error("'ids' and 'keys' array are required");
        const normalized = this.normalizeIds(ids);

        const res = await qdrantClient.deletePayload(collectionName, {
            wait: true,
            points: normalized,
            keys,
        });

        normalized.forEach((id) => {
            auditLogService.recordPointEvent(collectionName, id, "delete_payload_keys", { keys });
        });

        return { ids: normalized, keys, operation: res, message: "Payload keys removed successfully" };
    }

    async createPayloadIndex(collectionName = DEFAULT_COLLECTION, { field_name, field_schema = "keyword" }) {
        if (!field_name) throw new Error("'field_name' is required to create a payload index");

        const res = await qdrantClient.createPayloadIndex(collectionName, {
            field_name,
            field_schema,
            wait: true,
        });

        auditLogService.log("info", `Created payload index on ${collectionName}.${field_name} (${field_schema})`);
        return { field_name, field_schema, operation: res, message: "Payload index created" };
    }
}

module.exports = new QdrantService();
