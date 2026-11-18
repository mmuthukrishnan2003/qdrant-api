const qdrantService = require("../services/qdrantService");
const embeddingService = require("../services/embeddingService");

class SearchController {
    async _getVectorFromRequest(body) {
        if (body.vector && Array.isArray(body.vector)) {
            embeddingService.validateVector(body.vector);
            return body.vector;
        }

        const textToEmbed = body.text || body.query || body.prompt;
        if (textToEmbed && typeof textToEmbed === "string") {
            return await embeddingService.getEmbedding(textToEmbed);
        }

        return null;
    }

    // 1. Semantic Search
    async search(req, res, next) {
        try {
            const collectionName = req.body.collection || req.params.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            const vector = await this._getVectorFromRequest(req.body);

            if (!vector) {
                return res.status(400).json({
                    success: false,
                    error: "Either a numeric 'vector' array or 'text'/'query' string is required for semantic search",
                });
            }

            const { limit = 5, filter = null, score_threshold, with_payload = true, with_vector = false } = req.body;

            const results = await qdrantService.search(collectionName, {
                vector,
                limit,
                filter,
                scoreThreshold: score_threshold,
                with_payload,
                with_vector,
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

    // 2. Hybrid Search (Keyword + Vector)
    async hybridSearch(req, res, next) {
        try {
            const collectionName = req.body.collection || req.params.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            const vector = await this._getVectorFromRequest(req.body);

            if (!vector) {
                return res.status(400).json({
                    success: false,
                    error: "Either a numeric 'vector' array or 'query'/'text' string is required for hybrid search",
                });
            }

            const { query, text, keyword, keyword_field = "content", limit = 5, filter = null } = req.body;
            const queryText = keyword || query || text || "";

            const results = await qdrantService.hybridSearch(collectionName, {
                vector,
                queryText,
                keywordField: keyword_field,
                limit,
                filter,
            });

            res.json({
                success: true,
                collection: collectionName,
                mode: "hybrid (dense vector + keyword payload match)",
                count: results.length,
                results,
            });
        } catch (error) {
            next(error);
        }
    }

    // 3. Search with Metadata Filters
    async searchWithFilter(req, res, next) {
        try {
            const collectionName = req.body.collection || req.params.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            const vector = await this._getVectorFromRequest(req.body);

            if (!vector) {
                return res.status(400).json({
                    success: false,
                    error: "Either 'vector' or 'query' string is required for filtered search",
                });
            }

            const { filter, limit = 5, score_threshold } = req.body;
            if (!filter) {
                return res.status(400).json({
                    success: false,
                    error: "'filter' object containing 'must', 'should', or 'must_not' conditions is required",
                });
            }

            const results = await qdrantService.search(collectionName, {
                vector,
                limit,
                filter,
                scoreThreshold: score_threshold,
                with_payload: true,
            });

            res.json({
                success: true,
                collection: collectionName,
                filterApplied: filter,
                count: results.length,
                results,
            });
        } catch (error) {
            next(error);
        }
    }

    // 4. Multi-search (Batch Vector Search)
    async multiSearch(req, res, next) {
        try {
            const collectionName = req.body.collection || req.params.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            const { searches } = req.body;

            if (!Array.isArray(searches) || searches.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: "'searches' non-empty array of search queries is required",
                });
            }

            for (const s of searches) {
                if (!s.vector && (s.text || s.query)) {
                    s.vector = await embeddingService.getEmbedding(s.text || s.query);
                }
                if (!s.vector || !Array.isArray(s.vector)) {
                    throw new Error("Each search in 'searches' must contain either a 'vector' array or 'text'/'query' string");
                }
            }

            const results = await qdrantService.multiSearch(collectionName, searches);
            res.json({
                success: true,
                collection: collectionName,
                totalQueries: searches.length,
                results,
            });
        } catch (error) {
            next(error);
        }
    }

    // 5. Recommend Similar Records
    async recommend(req, res, next) {
        try {
            const collectionName = req.body.collection || req.params.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            const { positive, negative = [], limit = 5, filter = null, score_threshold, using = null } = req.body;

            if (!positive || !Array.isArray(positive) || positive.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: "'positive' array of point IDs is required for recommendation",
                });
            }

            const results = await qdrantService.recommend(collectionName, {
                positive,
                negative,
                limit,
                filter,
                scoreThreshold: score_threshold,
                using,
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

    // 6. Discover Related Points
    async discover(req, res, next) {
        try {
            const collectionName = req.body.collection || req.params.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            const { target, context, limit = 5, filter = null } = req.body;

            const results = await qdrantService.discover(collectionName, {
                target,
                context,
                limit,
                filter,
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

    // 7. Advanced Search
    async advancedSearch(req, res, next) {
        try {
            const collectionName = req.body.collection || req.params.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            const vector = await this._getVectorFromRequest(req.body);

            if (!vector) {
                return res.status(400).json({
                    success: false,
                    error: "Either 'vector' array or 'text'/'query' is required for advanced search",
                });
            }

            const {
                limit = 10,
                filter = null,
                score_threshold = null,
                params = null,
                with_payload = true,
                with_vector = false,
            } = req.body;

            const results = await qdrantService.search(collectionName, {
                vector,
                limit,
                filter,
                scoreThreshold: score_threshold,
                params,
                with_payload,
                with_vector,
            });

            res.json({
                success: true,
                collection: collectionName,
                queryConfig: {
                    limit,
                    filterApplied: !!filter,
                    scoreThreshold: score_threshold,
                    searchParams: params,
                    withVector: with_vector,
                },
                count: results.length,
                results,
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new SearchController();
