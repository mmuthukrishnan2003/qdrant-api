const ragService = require("../services/ragService");
const embeddingService = require("../services/embeddingService");

class RagController {
    // POST /api/embeddings/generate
    async generateEmbeddings(req, res, next) {
        try {
            const { text, texts, input, batchSize = 32 } = req.body;

            if (text || (typeof input === "string" && input.trim())) {
                const queryText = text || input;
                const vector = await embeddingService.getEmbedding(queryText);
                return res.json({
                    success: true,
                    dimension: vector.length,
                    embedding: vector,
                });
            }

            const textList = texts || (Array.isArray(input) ? input : null);
            if (Array.isArray(textList) && textList.length > 0) {
                const vectors = await embeddingService.getBatchEmbeddings(textList, parseInt(batchSize, 10) || 32);
                return res.json({
                    success: true,
                    count: vectors.length,
                    dimension: vectors[0]?.length || 1024,
                    embeddings: vectors,
                });
            }

            return res.status(400).json({
                success: false,
                error: "'text' string or 'texts' array of strings is required to generate embeddings",
            });
        } catch (error) {
            next(error);
        }
    }

    // POST /api/rag/query
    async queryContext(req, res, next) {
        try {
            const collectionName = req.body.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            const { query, prompt, text, limit = 4, filter = null } = req.body;
            const queryText = query || prompt || text;

            if (!queryText) {
                return res.status(400).json({ success: false, error: "'query' string is required" });
            }

            const result = await ragService.retrieveContext(collectionName, queryText, limit, filter);
            res.json({ success: true, collection: collectionName, ...result });
        } catch (error) {
            next(error);
        }
    }

    // POST /api/rag/answer
    async generateAnswer(req, res, next) {
        try {
            const collectionName = req.body.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            const { query, prompt, text, limit = 4, filter = null, temperature = 0.2, systemPrompt } = req.body;
            const queryText = query || prompt || text;

            if (!queryText) {
                return res.status(400).json({ success: false, error: "'query' string is required" });
            }

            const result = await ragService.generateAnswer(collectionName, queryText, {
                limit,
                filter,
                temperature,
                systemPrompt,
            });

            res.json({ success: true, collection: collectionName, ...result });
        } catch (error) {
            next(error);
        }
    }

    // POST /api/rag/chat
    async chat(req, res, next) {
        try {
            const collectionName = req.body.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            const { messages, limit = 4, filter = null, temperature = 0.3 } = req.body;

            if (!Array.isArray(messages) || messages.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: "'messages' array of objects with { role: 'user'|'assistant', content: string } is required",
                });
            }

            const result = await ragService.chat(collectionName, messages, { limit, filter, temperature });
            res.json({ success: true, collection: collectionName, ...result });
        } catch (error) {
            next(error);
        }
    }

    // POST /api/rag/stream (Server-Sent Events)
    async streamAnswer(req, res, next) {
        try {
            const collectionName = req.body.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            const { query, prompt, text, limit = 4, filter = null, temperature = 0.2 } = req.body;
            const queryText = query || prompt || text;

            if (!queryText) {
                return res.status(400).json({ success: false, error: "'query' string is required" });
            }

            const retrieval = await ragService.retrieveContext(collectionName, queryText, limit, filter);

            // Set SSE headers
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");
            res.flushHeaders?.();

            // Send context sources header
            res.write(`data: ${JSON.stringify({ type: "sources", sources: retrieval.contextBlocks })}\n\n`);

            const systemPrompt = `You are a helpful documentation AI assistant. Use the following context to answer:
${retrieval.formattedContext}`;

            const messages = [
                { role: "system", content: systemPrompt },
                { role: "user", content: queryText },
            ];

            try {
                const streamBody = await ragService.callVllm(messages, { temperature, stream: true });
                // If stream body is an async iterable or Node stream
                if (streamBody && typeof streamBody.pipe === "function") {
                    streamBody.pipe(res);
                } else if (streamBody && typeof streamBody[Symbol.asyncIterator] === "function") {
                    for await (const chunk of streamBody) {
                        res.write(chunk);
                    }
                    res.end();
                } else {
                    res.write(`data: ${JSON.stringify({ content: "vLLM streaming response ended" })}\n\n`);
                    res.write("data: [DONE]\n\n");
                    res.end();
                }
            } catch (vllmErr) {
                res.write(`data: ${JSON.stringify({ error: `Local vLLM server unavailable: ${vllmErr.message}` })}\n\n`);
                res.write("data: [DONE]\n\n");
                res.end();
            }
        } catch (error) {
            next(error);
        }
    }

    // POST /api/rag/ingest
    async ingestDocument(req, res, next) {
        try {
            const collectionName = req.body.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            const { document_id, title, content, text, url, metadata, chunkSize, overlap } = req.body;
            const docContent = content || text;

            if (!docContent) {
                return res.status(400).json({
                    success: false,
                    error: "'content' or 'text' string is required for document ingestion",
                });
            }

            const result = await ragService.ingestDocument(collectionName, {
                document_id,
                title,
                content: docContent,
                url,
                metadata,
                chunkSize,
                overlap,
            });

            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    // POST /api/rag/reindex
    async reindex(req, res, next) {
        try {
            const collectionName = req.body.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            const { document_id, batchSize = 32 } = req.body;

            const result = await ragService.reindex(collectionName, { document_id, batchSize });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    // POST /api/rag/delete-document
    async deleteDocument(req, res, next) {
        try {
            const collectionName = req.body.collection || process.env.DEFAULT_COLLECTION || "ai_centizen";
            const { document_id, page_url } = req.body;

            const result = await ragService.deleteDocument(collectionName, { document_id, page_url });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new RagController();
