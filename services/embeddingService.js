const EMBEDDING_API_URL = process.env.EMBEDDING_API_URL || "http://127.0.0.1:8002";
const DEFAULT_VECTOR_SIZE = parseInt(process.env.DEFAULT_VECTOR_SIZE, 10) || 1024;

class EmbeddingService {
    /**
     * Call Python Embedding API at port 8002 to generate 1024-d vector from text
     */
    async getEmbedding(text) {
        if (!text || typeof text !== "string") {
            throw new Error("Text string is required to generate embeddings");
        }

        const endpoints = [`${EMBEDDING_API_URL}/embed`, `${EMBEDDING_API_URL}/embeddings`, EMBEDDING_API_URL];

        let lastError = null;
        for (const url of endpoints) {
            try {
                const response = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text, input: text }),
                });

                if (response.ok) {
                    const data = await response.json();
                    const vector = data.embedding || data.vector || (Array.isArray(data) ? data : null);
                    if (vector && Array.isArray(vector)) {
                        this.validateVector(vector);
                        return vector;
                    }
                }
            } catch (err) {
                lastError = err;
            }
        }

        throw new Error(
            `Could not obtain embedding from Embedding API at ${EMBEDDING_API_URL}. Ensure the Python API is running on port 8002. Details: ${lastError ? lastError.message : "Invalid response"}`
        );
    }

    /**
     * Validate vector dimensions and numeric values
     */
    validateVector(vector, expectedSize = DEFAULT_VECTOR_SIZE) {
        if (!Array.isArray(vector)) {
            throw new Error("Vector must be an array of numeric floats");
        }
        if (vector.length === 0) {
            throw new Error("Vector array cannot be empty");
        }
        for (let i = 0; i < vector.length; i++) {
            if (typeof vector[i] !== "number" || Number.isNaN(vector[i])) {
                throw new Error(`Vector element at index ${i} must be a valid number`);
            }
        }
        if (expectedSize && vector.length !== expectedSize) {
            console.warn(`[Warning] Vector length (${vector.length}) does not match expected size (${expectedSize})`);
        }
        return true;
    }
}

module.exports = new EmbeddingService();
