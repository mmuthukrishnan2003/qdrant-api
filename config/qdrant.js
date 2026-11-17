const { QdrantClient } = require("@qdrant/js-client-rest");

const url = process.env.QDRANT_URL || "http://127.0.0.1:6333";
const apiKey = process.env.QDRANT_API_KEY || undefined;

const qdrantClient = new QdrantClient({
    url,
    checkCompatibility: false,
    ...(apiKey ? { apiKey } : {}),
});

module.exports = qdrantClient;
