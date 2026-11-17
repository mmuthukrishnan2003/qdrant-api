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
     * Fetch vectors for a slice of texts (up to max batch size, e.g. 32)
     */
    async _fetchBatchVectors(batchTexts) {
        if (batchTexts.length === 0) return [];

        const endpoints = [`${EMBEDDING_API_URL}/embed`, `${EMBEDDING_API_URL}/embeddings`, EMBEDDING_API_URL];
        const payloadVariants = [
            { texts: batchTexts },
            { inputs: batchTexts },
            { input: batchTexts },
            batchTexts,
        ];

        for (const url of endpoints) {
            for (const bodyPayload of payloadVariants) {
                try {
                    const response = await fetch(url, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(bodyPayload),
                    });

                    if (response.ok) {
                        const data = await response.json();
                        let vectors = null;

                        if (Array.isArray(data.embeddings)) {
                            vectors = data.embeddings;
                        } else if (Array.isArray(data.vectors)) {
                            vectors = data.vectors;
                        } else if (Array.isArray(data.data)) {
                            vectors = data.data.map((item) => item.embedding || item.vector || item);
                        } else if (Array.isArray(data) && Array.isArray(data[0])) {
                            vectors = data;
                        }

                        if (vectors && Array.isArray(vectors) && vectors.length === batchTexts.length) {
                            return vectors;
                        }
                    }
                } catch {
                    // Try next variant or fallback
                }
            }
        }

        // Fallback: If Python endpoint only handles single items, process this batch of 32 concurrently
        console.warn(`[EmbeddingService] Batch endpoint not responding directly; executing batch of ${batchTexts.length} via concurrent single calls`);
        return await Promise.all(batchTexts.map((text) => this.getEmbedding(text)));
    }

    /**
     * Call Python Embedding API at port 8002 in chunks (max 32 per chunk as recommended)
     * Returns an array of vector arrays in 1:1 order with texts
     */
    async getBatchEmbeddings(texts, batchSize = 32, onProgress = null) {
        if (!Array.isArray(texts) || texts.length === 0) {
            return [];
        }

        const allVectors = [];
        const totalBatches = Math.ceil(texts.length / batchSize);

        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
            const start = batchIndex * batchSize;
            const end = Math.min(start + batchSize, texts.length);
            const batchTexts = texts.slice(start, end);

            const batchNumber = batchIndex + 1;
            if (onProgress && typeof onProgress === "function") {
                onProgress({
                    batchNumber,
                    totalBatches,
                    batchSize: batchTexts.length,
                    processedSoFar: start,
                    totalItems: texts.length,
                });
            }

            const vectors = await this._fetchBatchVectors(batchTexts);

            for (let i = 0; i < vectors.length; i++) {
                this.validateVector(vectors[i]);
                allVectors.push(vectors[i]);
            }
        }

        return allVectors;
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
