const qdrantService = require("./qdrantService");
const embeddingService = require("./embeddingService");
const auditLogService = require("./auditLogService");

const VLLM_API_URL = process.env.VLLM_API_URL || "http://127.0.0.1:8000/v1";
const VLLM_MODEL = process.env.VLLM_MODEL || "default";

class RagService {
    /**
     * Split long text into manageable chunks with optional overlap
     */
    chunkText(text, chunkSize = 500, overlap = 50) {
        if (!text || typeof text !== "string") return [];
        const cleanText = text.trim();
        if (cleanText.length <= chunkSize) {
            return [cleanText];
        }

        const chunks = [];
        let start = 0;
        while (start < cleanText.length) {
            let end = start + chunkSize;
            if (end < cleanText.length) {
                // Try breaking at nearest sentence end or newline
                const lastBreak = cleanText.lastIndexOf("\n", end);
                const lastPeriod = cleanText.lastIndexOf(". ", end);
                const breakPoint = Math.max(lastBreak, lastPeriod);
                if (breakPoint > start + Math.floor(chunkSize / 2)) {
                    end = breakPoint + 1;
                }
            }
            chunks.push(cleanText.slice(start, end).trim());
            start = end - overlap;
            if (start >= cleanText.length - overlap) break;
        }
        return chunks.filter((c) => c.length > 0);
    }

    /**
     * Retrieve relevant context from Qdrant for a query
     */
    async retrieveContext(collectionName, query, limit = 4, filter = null) {
        if (!query || typeof query !== "string") {
            throw new Error("'query' text string is required");
        }

        const vector = await embeddingService.getEmbedding(query);
        const results = await qdrantService.search(collectionName, {
            vector,
            limit: parseInt(limit, 10) || 4,
            filter,
            with_payload: true,
        });

        const contextBlocks = results.map((r, i) => {
            const p = r.payload || {};
            const title = p.page_title || p.title || `Document ${i + 1}`;
            const content = p.content || p.text || JSON.stringify(p);
            const sourceUrl = p.page_url || p.url || "";
            return {
                index: i + 1,
                id: r.id,
                score: r.score,
                title,
                sourceUrl,
                content,
                payload: p,
            };
        });

        const formattedContext = contextBlocks
            .map((b) => `[Document ${b.index}: ${b.title}]\n${b.content}\nSource: ${b.sourceUrl}`)
            .join("\n\n---\n\n");

        return {
            query,
            totalRetrieved: contextBlocks.length,
            contextBlocks,
            formattedContext,
        };
    }

    /**
     * Call local vLLM API (port 8000) for chat completion
     */
    async callVllm(messages, { temperature = 0.2, max_tokens = 800, model = VLLM_MODEL, stream = false } = {}) {
        const url = `${VLLM_API_URL}/chat/completions`;
        const payload = {
            model,
            messages,
            temperature,
            max_tokens,
            stream,
        };

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`vLLM server error (${response.status}): ${errText}`);
            }

            if (stream) {
                return response.body; // ReadableStream
            }

            const data = await response.json();
            const answer = data.choices?.[0]?.message?.content || "";
            return {
                answer,
                usage: data.usage || null,
                model: data.model || model,
            };
        } catch (error) {
            auditLogService.log("warn", `vLLM call failed: ${error.message}`);
            throw new Error(
                `Could not connect to local vLLM / LLM server at ${VLLM_API_URL}. Ensure your local vLLM engine is running. Details: ${error.message}`
            );
        }
    }

    /**
     * Generate answer grounded in Qdrant knowledge base
     */
    async generateAnswer(collectionName, query, { limit = 4, filter = null, temperature = 0.2, systemPrompt = null } = {}) {
        const retrieval = await this.retrieveContext(collectionName, query, limit, filter);

        const defaultSystem = `You are an accurate, helpful AI documentation assistant.
Answer the user's question using ONLY the provided documentation context below.
If the context does not contain enough information to answer, state that clearly.
Always reference the source documentation titles and URLs when applicable.

CONTEXT:
${retrieval.formattedContext}`;

        const messages = [
            { role: "system", content: systemPrompt || defaultSystem },
            { role: "user", content: query },
        ];

        let vllmResult = null;
        let answer = null;
        try {
            vllmResult = await this.callVllm(messages, { temperature });
            answer = vllmResult.answer;
        } catch (err) {
            answer = `[Local vLLM Offline] Context retrieved successfully from Qdrant, but local LLM server at ${VLLM_API_URL} was unreachable: ${err.message}`;
        }

        return {
            query,
            answer,
            retrieval: {
                totalFound: retrieval.totalRetrieved,
                sources: retrieval.contextBlocks.map((c) => ({
                    title: c.title,
                    url: c.sourceUrl,
                    score: c.score,
                    id: c.id,
                })),
            },
            context: retrieval.formattedContext,
            vllmUsage: vllmResult?.usage || null,
        };
    }

    /**
     * Multi-turn chat with knowledge base
     */
    async chat(collectionName, messages = [], { limit = 4, filter = null, temperature = 0.3 } = {}) {
        if (!Array.isArray(messages) || messages.length === 0) {
            throw new Error("'messages' array of { role, content } is required");
        }

        // Get latest user query
        const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
        const query = lastUserMsg ? lastUserMsg.content : "";

        let retrieval = null;
        if (query) {
            retrieval = await this.retrieveContext(collectionName, query, limit, filter);
        }

        const systemMessage = {
            role: "system",
            content: `You are a knowledgeable AI assistant with access to documentation knowledge base.
Use the following retrieved context to ground your replies:

${retrieval ? retrieval.formattedContext : "No relevant context found."}`,
        };

        const fullMessages = [systemMessage, ...messages.filter((m) => m.role !== "system")];
        const vllmResult = await this.callVllm(fullMessages, { temperature });

        return {
            reply: vllmResult.answer,
            sources: retrieval
                ? retrieval.contextBlocks.map((c) => ({
                      title: c.title,
                      url: c.sourceUrl,
                      score: c.score,
                  }))
                : [],
            usage: vllmResult.usage,
        };
    }

    /**
     * Ingest document: chunk, embed, store in Qdrant
     */
    async ingestDocument(collectionName, {
        document_id,
        title = "",
        content,
        url = "",
        metadata = {},
        chunkSize = 600,
        overlap = 60,
    } = {}) {
        if (!content || typeof content !== "string") {
            throw new Error("'content' string is required for document ingestion");
        }

        const docId = document_id || `doc_${Date.now()}`;
        const textChunks = this.chunkText(content, chunkSize, overlap);

        if (textChunks.length === 0) {
            throw new Error("Document content resulted in 0 chunks");
        }

        // Build embedding texts with title header for contextual accuracy
        const textsToEmbed = textChunks.map((chunk, idx) =>
            title ? `${title} (Part ${idx + 1}): ${chunk}` : chunk
        );

        const vectors = await embeddingService.getBatchEmbeddings(textsToEmbed, 32);

        const points = textChunks.map((chunk, idx) => ({
            id: `${docId}_chunk_${idx}`,
            vector: vectors[idx],
            payload: {
                document_id: docId,
                page_title: title,
                content: chunk,
                embedding_text: textsToEmbed[idx],
                page_url: url,
                chunk_index: idx,
                total_chunks: textChunks.length,
                ...metadata,
            },
        }));

        const result = await qdrantService.upsertPoints(collectionName, points);

        return {
            success: true,
            collection: collectionName,
            document_id: docId,
            chunksCreated: textChunks.length,
            pointIds: result.ids,
        };
    }

    /**
     * Delete document and its chunks
     */
    async deleteDocument(collectionName, { document_id, page_url } = {}) {
        if (!document_id && !page_url) {
            throw new Error("Either 'document_id' or 'page_url' is required to delete document chunks");
        }

        const mustClauses = [];
        if (document_id) {
            mustClauses.push({ key: "document_id", match: { value: document_id } });
        }
        if (page_url) {
            mustClauses.push({ key: "page_url", match: { value: page_url } });
        }

        // Find all point IDs matching this filter via scroll
        const scrollResult = await qdrantService.scrollPoints(collectionName, {
            limit: 1000,
            filter: { must: mustClauses },
            with_payload: false,
        });

        const pointsToDelete = scrollResult.points ? scrollResult.points.map((p) => p.id) : [];

        if (pointsToDelete.length === 0) {
            return {
                success: true,
                message: "No matching chunks found for the specified document",
                deletedCount: 0,
            };
        }

        const delRes = await qdrantService.deletePoints(collectionName, pointsToDelete);
        return {
            success: true,
            document_id,
            page_url,
            deletedCount: delRes.deletedCount,
            pointIds: delRes.ids,
        };
    }

    /**
     * Rebuild embeddings for a collection or specific document
     */
    async reindex(collectionName, { document_id = null, batchSize = 32 } = {}) {
        const filter = document_id
            ? { must: [{ key: "document_id", match: { value: document_id } }] }
            : null;

        const scrollRes = await qdrantService.scrollPoints(collectionName, {
            limit: 500,
            filter,
            with_payload: true,
            with_vector: false,
        });

        const points = scrollRes.points || [];
        if (points.length === 0) {
            return { message: "No points found to reindex", count: 0 };
        }

        const texts = points.map((p) => {
            const payload = p.payload || {};
            return (
                payload.embedding_text ||
                payload.content ||
                payload.page_title ||
                JSON.stringify(payload)
            );
        });

        const newVectors = await embeddingService.getBatchEmbeddings(texts, batchSize);

        const updatedPoints = points.map((p, idx) => ({
            id: p.id,
            vector: newVectors[idx],
            payload: p.payload,
        }));

        const upsertRes = await qdrantService.upsertPoints(collectionName, updatedPoints);

        return {
            success: true,
            collection: collectionName,
            reindexedCount: updatedPoints.length,
            operation: upsertRes.operation,
        };
    }
}

module.exports = new RagService();
