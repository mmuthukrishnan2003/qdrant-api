require("dotenv").config();
const express = require("express");
const qdrantRoutes = require("./routes/qdrantRoutes");
const auditLogService = require("./services/auditLogService");

const app = express();
const PORT = process.env.PORT || 8003;

// Middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Request auditing & latency tracking middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
        const duration = Date.now() - start;
        auditLogService.recordRequest(req.method, req.path, res.statusCode, duration);
    });
    next();
});

// Root endpoint: Complete API Catalog Overview
app.get("/", (req, res) => {
    res.json({
        name: "Advanced Qdrant Vector DB & AI Knowledge Base API",
        version: "2.0.0",
        port: PORT,
        endpoints: {
            "1. Collection Management": {
                create: "POST /api/collections/create",
                list: "GET /api/collections",
                details: "GET /api/collections/:name",
                update: "PUT /api/collections/:name",
                delete: "DELETE /api/collections/:name",
                optimize: "POST /api/collections/:name/optimize",
            },
            "2. Point Management": {
                insert: "POST /api/points/insert",
                update: "PUT /api/points/update (or PUT/PATCH /api/points/:id)",
                get: "GET /api/points/:id",
                batch: "POST /api/points/batch",
                delete: "DELETE /api/points/delete (or DELETE /api/points/:id)",
                upsert: "POST /api/points/upsert",
                count: "POST /api/points/count",
                scroll: "POST /api/points/scroll (or GET /api/points)",
            },
            "3. Vector Search": {
                search: "POST /api/points/search (or POST /api/search)",
                hybrid: "POST /api/points/search/hybrid",
                filter: "POST /api/points/search/filter",
                multi: "POST /api/points/search/multi",
                recommend: "POST /api/points/recommend",
                discover: "POST /api/points/discover",
                advanced: "POST /api/points/search/advanced",
            },
            "4. Payload / Metadata": {
                addOrUpdate: "PUT /api/points/payload",
                patchFields: "PATCH /api/points/payload",
                removeFields: "DELETE /api/points/payload",
                filterByMetadata: "POST /api/points/payload/filter",
                createIndex: "POST /api/points/payload/index",
            },
            "5. Import and Export": {
                importJson: "POST /api/import/json",
                importCsv: "POST /api/import/csv",
                importBulk: "POST /api/import/bulk",
                importPreview: "POST /api/import/preview",
                exportJson: "GET /api/export/json",
                exportCsv: "GET /api/export/csv",
                exportCollection: "GET /api/export/:collection",
            },
            "6. Advanced AI / RAG": {
                generateEmbeddings: "POST /api/embeddings/generate",
                ragQuery: "POST /api/rag/query",
                ragAnswer: "POST /api/rag/answer",
                ragChat: "POST /api/rag/chat",
                ragStream: "POST /api/rag/stream",
                ragIngest: "POST /api/rag/ingest",
                ragReindex: "POST /api/rag/reindex",
                ragDeleteDocument: "POST /api/rag/delete-document",
            },
            "7. Monitoring & Administration": {
                health: "GET /api/health",
                status: "GET /api/status",
                databaseStats: "GET /api/stats",
                collectionStats: "GET /api/collections/:name/stats",
                pointHistory: "GET /api/points/:id/history",
                logs: "GET /api/logs",
                config: "GET /api/config",
            },
        },
    });
});

// Mount Routes
app.use("/api", qdrantRoutes);

// 404 Handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: `Route not found: ${req.method} ${req.originalUrl}`,
    });
});

// Centralized Error Handler
app.use((err, req, res, next) => {
    auditLogService.log("error", `Unhandled error: ${err.message}`, { stack: err.stack });
    const statusCode = err.status || err.statusCode || 500;
    res.status(statusCode).json({
        success: false,
        error: err.message || "Internal Server Error",
        ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
});

// Start Server
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`===============================================`);
        console.log(`🚀 Advanced Qdrant Vector & AI API on port ${PORT}`);
        console.log(`   URL: http://127.0.0.1:${PORT}`);
        console.log(`   Qdrant target: ${process.env.QDRANT_URL || "http://127.0.0.1:6333"}`);
        console.log(`   Embedding target: ${process.env.EMBEDDING_API_URL || "http://127.0.0.1:8002"}`);
        console.log(`   vLLM target: ${process.env.VLLM_API_URL || "http://127.0.0.1:8000/v1"}`);
        console.log(`===============================================`);
    });
}

module.exports = app;
