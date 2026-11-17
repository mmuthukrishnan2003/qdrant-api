require("dotenv").config();
const express = require("express");
const qdrantRoutes = require("./routes/qdrantRoutes");
const qdrantClient = require("./config/qdrant");

const app = express();
const PORT = process.env.PORT || 8003;

// Middleware
app.use(express.json());

// Root endpoint: API Overview
app.get("/", (req, res) => {
    res.json({
        name: "Qdrant Vector CRUD & Search API",
        version: "1.0.0",
        port: PORT,
        endpoints: {
            health: "GET /api/health",
            collections: {
                list: "GET /api/collections",
                create: "POST /api/collections",
                get: "GET /api/collections/:collection",
                delete: "DELETE /api/collections/:collection",
            },
            crud: {
                create: "POST /api/points",
                createBatch: "POST /api/points/batch",
                read: "GET /api/points/:id",
                list: "GET /api/points",
                update: "PUT /api/points/:id (or PATCH)",
                delete: "DELETE /api/points/:id",
            },
            search: {
                vectorSearch: "POST /api/points/search (or POST /api/search)",
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
    console.error(`[Error] ${err.message}`);
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
        console.log(`🚀 Qdrant CRUD API running on port ${PORT}`);
        console.log(`   URL: http://127.0.0.1:${PORT}`);
        console.log(`   Qdrant target: ${process.env.QDRANT_URL || "http://127.0.0.1:6333"}`);
        console.log(`===============================================`);
    });
}

module.exports = app;
