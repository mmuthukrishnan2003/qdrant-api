const qdrantService = require("../services/qdrantService");

class CollectionController {
    async createCollection(req, res, next) {
        try {
            const { name, collection, vectorSize, distance, optimizers_config, hnsw_config, quantization_config } = req.body;
            const collectionName = name || collection || req.params.name;
            if (!collectionName) {
                return res.status(400).json({ success: false, error: "Collection name is required" });
            }

            const result = await qdrantService.createCollection(collectionName, {
                vectorSize: vectorSize || process.env.DEFAULT_VECTOR_SIZE,
                distance: distance || process.env.DEFAULT_VECTOR_DISTANCE,
                optimizers_config,
                hnsw_config,
                quantization_config,
            });

            res.status(201).json({
                success: true,
                message: `Collection '${collectionName}' created successfully`,
                collection: collectionName,
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }

    async listCollections(req, res, next) {
        try {
            const result = await qdrantService.listCollections();
            res.json({
                success: true,
                count: result.collections?.length || 0,
                collections: result.collections || [],
            });
        } catch (error) {
            next(error);
        }
    }

    async getCollection(req, res, next) {
        try {
            const collectionName = req.params.name || req.params.collection || req.query.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            const result = await qdrantService.getCollection(collectionName);
            res.json({ success: true, collection: collectionName, data: result });
        } catch (error) {
            next(error);
        }
    }

    async updateCollection(req, res, next) {
        try {
            const collectionName = req.params.name || req.params.collection;
            if (!collectionName) {
                return res.status(400).json({ success: false, error: "Collection name is required in URL parameter" });
            }

            const result = await qdrantService.updateCollection(collectionName, req.body);
            res.json({ success: true, message: `Collection '${collectionName}' updated`, data: result });
        } catch (error) {
            next(error);
        }
    }

    async deleteCollection(req, res, next) {
        try {
            const collectionName = req.params.name || req.params.collection;
            if (!collectionName) {
                return res.status(400).json({ success: false, error: "Collection name is required in URL parameter" });
            }

            const result = await qdrantService.deleteCollection(collectionName);
            res.json({ success: true, message: `Collection '${collectionName}' deleted`, data: result });
        } catch (error) {
            next(error);
        }
    }

    async optimizeCollection(req, res, next) {
        try {
            const collectionName = req.params.name || req.params.collection;
            if (!collectionName) {
                return res.status(400).json({ success: false, error: "Collection name is required in URL parameter" });
            }

            const result = await qdrantService.optimizeCollection(collectionName, req.body);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new CollectionController();
