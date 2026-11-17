const { v4: uuidv4 } = require("uuid");
const qdrantClient = require("../config/qdrant");

const DEFAULT_COLLECTION = process.env.DEFAULT_COLLECTION || "documents";
const DEFAULT_VECTOR_SIZE = parseInt(process.env.DEFAULT_VECTOR_SIZE, 10) || 4;

class QdrantService {
    /**
     * Ensure a collection exists, or create it if missing
     */
    async ensureCollection(collectionName = DEFAULT_COLLECTION, vectorSize = DEFAULT_VECTOR_SIZE, distance = "Cosine") {
        try {
            await qdrantClient.getCollection(collectionName);
            return { exists: true, message: `Collection '${collectionName}' already exists` };
        } catch (error) {
            // If not found, create it
            await qdrantClient.createCollection(collectionName, {
                vectors: {
                    size: vectorSize,
                    distance: distance,
                },
            });
            return { created: true, message: `Collection '${collectionName}' created successfully` };
        }
    }

    /**
     * List all collections
     */
    async listCollections() {
        return await qdrantClient.getCollections();
    }

    /**
     * Get details for a specific collection
     */
    async getCollection(collectionName = DEFAULT_COLLECTION) {
        return await qdrantClient.getCollection(collectionName);
    }

    /**
     * Delete an entire collection
     */
    async deleteCollection(collectionName = DEFAULT_COLLECTION) {
        return await qdrantClient.deleteCollection(collectionName);
    }

    /**
     * CREATE: Insert a single point or upsert point
     */
    async createPoint(collectionName = DEFAULT_COLLECTION, { id, vector, payload = {} }) {
        if (!vector || !Array.isArray(vector)) {
            throw new Error("Vector array is required to create a point");
        }

        // Auto-ensure collection exists matching the vector dimensions
        await this.ensureCollection(collectionName, vector.length);

        const pointId = id !== undefined && id !== null ? id : uuidv4();

        const response = await qdrantClient.upsert(collectionName, {
            wait: true,
            points: [
                {
                    id: pointId,
                    vector,
                    payload,
                },
            ],
        });

        return {
            id: pointId,
            operation: response,
            message: "Point created successfully",
        };
    }

    /**
     * CREATE BATCH: Insert multiple points
     */
    async createPointsBatch(collectionName = DEFAULT_COLLECTION, points = []) {
        if (!Array.isArray(points) || points.length === 0) {
            throw new Error("Points must be a non-empty array");
        }

        const sampleVector = points[0].vector;
        if (!sampleVector || !Array.isArray(sampleVector)) {
            throw new Error("Each point must include a valid vector array");
        }

        await this.ensureCollection(collectionName, sampleVector.length);

        const formattedPoints = points.map((p) => ({
            id: p.id !== undefined && p.id !== null ? p.id : uuidv4(),
            vector: p.vector,
            payload: p.payload || {},
        }));

        const response = await qdrantClient.upsert(collectionName, {
            wait: true,
            points: formattedPoints,
        });

        return {
            count: formattedPoints.length,
            ids: formattedPoints.map((p) => p.id),
            operation: response,
        };
    }

    /**
     * READ: Retrieve a point by its ID
     */
    async getPoint(collectionName = DEFAULT_COLLECTION, id, withVector = true) {
        if (!id) {
            throw new Error("Point ID is required");
        }

        const points = await qdrantClient.retrieve(collectionName, {
            ids: [id],
            with_payload: true,
            with_vector: withVector,
        });

        if (!points || points.length === 0) {
            return null;
        }

        return points[0];
    }

    /**
     * READ: List / scroll points from a collection
     */
    async listPoints(collectionName = DEFAULT_COLLECTION, { limit = 10, offset = null, filter = null, withVector = false } = {}) {
        const result = await qdrantClient.scroll(collectionName, {
            limit: parseInt(limit, 10),
            offset,
            filter,
            with_payload: true,
            with_vector: withVector,
        });

        return result;
    }

    /**
     * UPDATE: Update payload or upsert a point
     */
    async updatePoint(collectionName = DEFAULT_COLLECTION, id, { vector, payload }) {
        if (!id) {
            throw new Error("Point ID is required");
        }

        // If vector is provided, full upsert
        if (vector && Array.isArray(vector)) {
            const existing = await this.getPoint(collectionName, id, false);
            const mergedPayload = payload !== undefined ? payload : (existing ? existing.payload : {});

            const response = await qdrantClient.upsert(collectionName, {
                wait: true,
                points: [
                    {
                        id,
                        vector,
                        payload: mergedPayload,
                    },
                ],
            });

            return {
                id,
                operation: response,
                message: "Point (vector & payload) updated successfully",
            };
        }

        // Otherwise update payload only
        if (payload) {
            const response = await qdrantClient.setPayload(collectionName, {
                wait: true,
                points: [id],
                payload,
            });

            return {
                id,
                operation: response,
                message: "Point payload updated successfully",
            };
        }

        throw new Error("Either vector or payload must be provided for update");
    }

    /**
     * DELETE: Delete point by ID
     */
    async deletePoint(collectionName = DEFAULT_COLLECTION, id) {
        if (!id) {
            throw new Error("Point ID is required");
        }

        const response = await qdrantClient.delete(collectionName, {
            wait: true,
            points: [id],
        });

        return {
            id,
            operation: response,
            message: "Point deleted successfully",
        };
    }

    /**
     * SEARCH: Vector similarity search
     */
    async searchPoints(collectionName = DEFAULT_COLLECTION, { vector, limit = 5, filter = null, scoreThreshold = null }) {
        if (!vector || !Array.isArray(vector)) {
            throw new Error("Query vector array is required for search");
        }

        const searchParams = {
            vector,
            limit: parseInt(limit, 10),
            with_payload: true,
            with_vector: false,
        };

        if (filter) {
            searchParams.filter = filter;
        }

        if (scoreThreshold !== null && scoreThreshold !== undefined) {
            searchParams.score_threshold = parseFloat(scoreThreshold);
        }

        const results = await qdrantClient.search(collectionName, searchParams);
        return results;
    }
}

module.exports = new QdrantService();
