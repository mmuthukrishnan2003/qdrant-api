const qdrantService = require("../services/qdrantService");
const auditLogService = require("../services/auditLogService");

class AdminController {
    // GET /api/health
    async health(req, res, next) {
        try {
            const checks = {
                api: "UP",
                timestamp: new Date().toISOString(),
                services: {},
            };

            // Check local Qdrant
            try {
                const colls = await qdrantService.listCollections();
                checks.services.qdrant = {
                    status: "CONNECTED",
                    url: process.env.QDRANT_URL || "http://127.0.0.1:6333",
                    totalCollections: colls.collections?.length || 0,
                };
            } catch (err) {
                checks.services.qdrant = {
                    status: "DISCONNECTED",
                    url: process.env.QDRANT_URL || "http://127.0.0.1:6333",
                    error: err.message,
                };
            }

            // Check local Python Embedding API
            try {
                const embUrl = process.env.EMBEDDING_API_URL || "http://127.0.0.1:8002";
                const embRes = await fetch(`${embUrl}/docs`, { signal: AbortSignal.timeout(1200) });
                checks.services.embeddingService = {
                    status: embRes.ok || embRes.status < 500 ? "CONNECTED" : "ERROR",
                    url: embUrl,
                };
            } catch (err) {
                checks.services.embeddingService = {
                    status: "OFFLINE",
                    url: process.env.EMBEDDING_API_URL || "http://127.0.0.1:8002",
                    note: "Local Python embedding service not reachable",
                };
            }

            // Check local vLLM
            try {
                const vllmUrl = process.env.VLLM_API_URL || "http://127.0.0.1:8000/v1";
                const vllmRes = await fetch(`${vllmUrl}/models`, { signal: AbortSignal.timeout(1200) });
                checks.services.vllm = {
                    status: vllmRes.ok ? "CONNECTED" : "STATUS_" + vllmRes.status,
                    url: vllmUrl,
                };
            } catch (err) {
                checks.services.vllm = {
                    status: "OFFLINE",
                    url: process.env.VLLM_API_URL || "http://127.0.0.1:8000/v1",
                    note: "Local vLLM server not reachable",
                };
            }

            const overallStatus = checks.services.qdrant.status === "CONNECTED" ? "HEALTHY" : "DEGRADED";
            res.json({
                status: overallStatus,
                ...checks,
            });
        } catch (error) {
            next(error);
        }
    }

    // GET /api/status
    async status(req, res, next) {
        try {
            const memoryUsage = process.memoryUsage();
            const metrics = auditLogService.getMetrics();

            res.json({
                service: "Qdrant Vector CRUD & Advanced AI API",
                version: "2.0.0",
                environment: process.env.NODE_ENV || "production",
                platform: process.platform,
                nodeVersion: process.version,
                uptimeSeconds: metrics.uptimeSeconds,
                memory: {
                    rssMB: Math.round(memoryUsage.rss / 1024 / 1024),
                    heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024),
                    heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                },
                metrics: {
                    totalRequests: metrics.totalRequests,
                    successCount: metrics.successCount,
                    errorCount: metrics.errorCount,
                    endpointUsage: metrics.endpointUsage,
                },
            });
        } catch (error) {
            next(error);
        }
    }

    // GET /api/stats
    async stats(req, res, next) {
        try {
            const collsRes = await qdrantService.listCollections();
            const collections = collsRes.collections || [];

            let totalPoints = 0;
            let totalVectors = 0;
            const collectionSummaries = [];

            for (const col of collections) {
                try {
                    const details = await qdrantService.getCollection(col.name);
                    const pCount = details.points_count || 0;
                    const vCount = details.vectors_count || 0;
                    totalPoints += pCount;
                    totalVectors += vCount;
                    collectionSummaries.push({
                        name: col.name,
                        status: details.status,
                        pointsCount: pCount,
                        vectorsCount: vCount,
                        indexedVectorsCount: details.indexed_vectors_count || 0,
                    });
                } catch {
                    collectionSummaries.push({ name: col.name, status: "unknown" });
                }
            }

            res.json({
                success: true,
                totalCollections: collections.length,
                totalPoints,
                totalVectors,
                collections: collectionSummaries,
            });
        } catch (error) {
            next(error);
        }
    }

    // GET /api/collections/:name/stats
    async collectionStats(req, res, next) {
        try {
            const collectionName = req.params.name || req.params.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            const details = await qdrantService.getCollection(collectionName);

            res.json({
                success: true,
                collection: collectionName,
                status: details.status,
                optimizerStatus: details.optimizer_status,
                pointsCount: details.points_count,
                vectorsCount: details.vectors_count,
                indexedVectorsCount: details.indexed_vectors_count,
                segmentsCount: details.segments_count,
                config: details.config,
            });
        } catch (error) {
            next(error);
        }
    }

    // GET /api/points/:id/history
    async pointHistory(req, res, next) {
        try {
            const { id } = req.params;
            if (!id) {
                return res.status(400).json({ success: false, error: "Point 'id' is required" });
            }

            const history = auditLogService.getPointHistory(id);
            res.json({
                success: true,
                pointId: id,
                totalEvents: history.length,
                history,
            });
        } catch (error) {
            next(error);
        }
    }

    // GET /api/logs
    async logs(req, res, next) {
        try {
            const limit = req.query.limit || 100;
            const level = req.query.level || null;
            const logs = auditLogService.getLogs(limit, level);

            res.json({
                success: true,
                count: logs.length,
                logs,
            });
        } catch (error) {
            next(error);
        }
    }

    // GET /api/config
    async config(req, res, next) {
        try {
            res.json({
                success: true,
                environment: process.env.NODE_ENV || "production",
                localServicePorts: {
                    nodeApiPort: process.env.PORT || 8003,
                    qdrantUrl: process.env.QDRANT_URL || "http://127.0.0.1:6333",
                    embeddingApiUrl: process.env.EMBEDDING_API_URL || "http://127.0.0.1:8002",
                    vllmApiUrl: process.env.VLLM_API_URL || "http://127.0.0.1:8000/v1",
                },
                vectorDefaults: {
                    defaultCollection: process.env.DEFAULT_COLLECTION || "ai_centizen",
                    defaultVectorSize: parseInt(process.env.DEFAULT_VECTOR_SIZE, 10) || 1024,
                    defaultDistance: process.env.DEFAULT_VECTOR_DISTANCE || "Cosine",
                },
                vllmConfig: {
                    model: process.env.VLLM_MODEL || "default",
                },
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new AdminController();
