const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const qdrantService = require("./qdrantService");
const embeddingService = require("./embeddingService");

class ImportService {
    /**
     * Clean and deduplicate intent questions to remove noise and near-duplicates
     */
    cleanIntentQuestions(questions) {
        if (!Array.isArray(questions)) return [];
        const seen = new Set();
        const cleaned = [];

        for (const q of questions) {
            if (typeof q !== "string") continue;
            const normalized = q.trim().toLowerCase().replace(/[?.,!]+$/, "");
            if (normalized.length > 0 && !seen.has(normalized)) {
                seen.add(normalized);
                cleaned.push(q.trim());
            }
        }
        return cleaned;
    }

    /**
     * Deduplicate keywords array
     */
    cleanKeywords(keywords) {
        if (!Array.isArray(keywords)) return [];
        const seen = new Set();
        const cleaned = [];

        for (const kw of keywords) {
            if (typeof kw !== "string") continue;
            const normalized = kw.trim().toLowerCase();
            if (normalized.length > 0 && !seen.has(normalized)) {
                seen.add(normalized);
                cleaned.push(kw.trim());
            }
        }
        return cleaned;
    }

    /**
     * Resolve and read JSON file from given path or standard paths
     */
    readJsonChunksFromFile(filePath) {
        const candidatePaths = filePath
            ? [
                  path.resolve(filePath),
                  path.resolve(process.cwd(), filePath),
                  path.resolve(process.cwd(), "data", filePath),
              ]
            : [
                  path.resolve(process.cwd(), "data", "sendbasket_qdrant_chunks_v4 100 - 133(1).json"),
                  path.resolve(process.cwd(), "data", "sendbasket_qdrant_chunks_v4.json"),
                  path.resolve(process.cwd(), "sendbasket_qdrant_chunks_v4 100 - 133(1).json"),
                  path.resolve(process.cwd(), "sendbasket_qdrant_chunks_v4.json"),
              ];

        let resolvedPath = null;
        for (const p of candidatePaths) {
            if (fs.existsSync(p)) {
                resolvedPath = p;
                break;
            }
        }

        if (!resolvedPath) {
            throw new Error(
                `JSON dataset file not found. Looked in: ${candidatePaths.join(", ")}. Please provide a valid filePath or place the file in the ./data/ directory.`
            );
        }

        const rawContent = fs.readFileSync(resolvedPath, "utf-8");
        const parsed = JSON.parse(rawContent);
        const chunks = Array.isArray(parsed) ? parsed : parsed.chunks || parsed.data || [parsed];

        return { resolvedPath, chunks };
    }

    /**
     * Validate and structure raw chunks for Qdrant insertion
     */
    validateAndPrepareChunks(rawChunks, { cleanQuestions = true } = {}) {
        const validChunks = [];
        const seenIds = new Map();
        const duplicateIds = [];
        const errors = [];
        const contentTypesCount = {};
        const pagesSet = new Set();

        rawChunks.forEach((chunk, index) => {
            const pointId = chunk.id || chunk._id || uuidv4();

            if (seenIds.has(pointId)) {
                duplicateIds.push({
                    id: pointId,
                    firstSeenIndex: seenIds.get(pointId),
                    duplicateIndex: index,
                });
            } else {
                seenIds.set(pointId, index);
            }

            // Embedding text prioritization
            const embeddingText =
                (chunk.embedding_text && typeof chunk.embedding_text === "string" && chunk.embedding_text.trim()) ||
                (chunk.content && typeof chunk.content === "string" && chunk.content.trim()) ||
                (chunk.page_title ? `${chunk.page_title}: ${chunk.content || ""}` : "");

            if (!embeddingText) {
                errors.push({
                    index,
                    id: pointId,
                    reason: "Missing both 'embedding_text' and 'content' for generating vector",
                });
                return;
            }

            // Stats tracking
            const cType = chunk.content_type || chunk.type || "Uncategorized";
            contentTypesCount[cType] = (contentTypesCount[cType] || 0) + 1;
            if (chunk.page_url) pagesSet.add(chunk.page_url);
            else if (chunk.page_title) pagesSet.add(chunk.page_title);

            // Clean intent questions and keywords
            const intentQuestions = cleanQuestions && chunk.intent_questions
                ? this.cleanIntentQuestions(chunk.intent_questions)
                : chunk.intent_questions || [];

            const keywords = chunk.keywords ? this.cleanKeywords(chunk.keywords) : [];

            // Build clean payload preserving all source metadata
            const payload = {
                page_id: chunk.page_id || chunk.pageId || "",
                page_title: chunk.page_title || chunk.pageTitle || "",
                section_title: chunk.section_title || chunk.sectionTitle || "",
                subsection_title: chunk.subsection_title || chunk.subsectionTitle || "",
                content_type: cType,
                content: chunk.content || "",
                page_url: chunk.page_url || chunk.url || "",
                language: chunk.language || "en",
                breadcrumb: chunk.breadcrumb || "",
                intent_questions: intentQuestions,
                keywords: keywords,
                ...chunk.metadata,
            };

            // Preserve any custom top-level fields not already mapped
            const standardKeys = new Set([
                "id", "_id", "vector", "embedding", "embedding_text", "page_id", "page_title",
                "section_title", "subsection_title", "content_type", "content", "page_url",
                "language", "breadcrumb", "intent_questions", "keywords", "metadata",
            ]);

            for (const [key, value] of Object.entries(chunk)) {
                if (!standardKeys.has(key) && payload[key] === undefined) {
                    payload[key] = value;
                }
            }

            validChunks.push({
                id: pointId,
                embeddingText,
                payload,
                originalVector: Array.isArray(chunk.vector) ? chunk.vector : null,
            });
        });

        return {
            validChunks,
            duplicateIds,
            errors,
            stats: {
                totalInput: rawChunks.length,
                validCount: validChunks.length,
                duplicatesCount: duplicateIds.length,
                errorsCount: errors.length,
                uniquePagesCount: pagesSet.size,
                contentTypes: contentTypesCount,
            },
        };
    }

    /**
     * Run batch import workflow
     * 1. Validate chunks
     * 2. Generate embeddings in batches of maxBatchSize (32)
     * 3. Insert points into Qdrant
     * 4. Return detailed report
     */
    async importChunks({
        collectionName = process.env.DEFAULT_COLLECTION || "ai_centizen",
        filePath = null,
        chunks = null,
        batchSize = 32,
        cleanQuestions = true,
    } = {}) {
        const startTime = Date.now();
        let sourceFile = null;
        let rawChunks = chunks;

        if (!rawChunks) {
            const fileData = this.readJsonChunksFromFile(filePath);
            sourceFile = fileData.resolvedPath;
            rawChunks = fileData.chunks;
        }

        if (!Array.isArray(rawChunks) || rawChunks.length === 0) {
            throw new Error("No chunk records found in the provided input or file");
        }

        // 1. Validation & Preparation
        const { validChunks, duplicateIds, errors, stats } = this.validateAndPrepareChunks(rawChunks, {
            cleanQuestions,
        });

        if (validChunks.length === 0) {
            throw new Error("Validation failed: No valid chunks could be prepared for embedding/insertion");
        }

        // 2. Ensure target Qdrant collection exists (1024 dims)
        const vectorSize = parseInt(process.env.DEFAULT_VECTOR_SIZE, 10) || 1024;
        const distance = process.env.DEFAULT_VECTOR_DISTANCE || "Cosine";
        await qdrantService.ensureCollection(collectionName, vectorSize, distance);

        // 3. Batch Embedding Generation (max 32 per batch)
        const totalBatches = Math.ceil(validChunks.length / batchSize);
        const batchReports = [];
        const readyPoints = [];

        for (let bIndex = 0; bIndex < totalBatches; bIndex++) {
            const startIdx = bIndex * batchSize;
            const endIdx = Math.min(startIdx + batchSize, validChunks.length);
            const batchSlice = validChunks.slice(startIdx, endIdx);
            const batchStartTime = Date.now();

            console.log(
                `[ImportService] Processing batch ${bIndex + 1}/${totalBatches} (${batchSlice.length} chunks)...`
            );

            // Separate chunks that already have vectors vs need embedding
            const textsToEmbed = [];
            const textToSliceIdx = [];

            batchSlice.forEach((item, idx) => {
                if (item.originalVector && item.originalVector.length === vectorSize) {
                    // Already has valid vector
                } else {
                    textsToEmbed.push(item.embeddingText);
                    textToSliceIdx.push(idx);
                }
            });

            if (textsToEmbed.length > 0) {
                const generatedVectors = await embeddingService.getBatchEmbeddings(textsToEmbed, batchSize);
                textToSliceIdx.forEach((sliceIdx, i) => {
                    batchSlice[sliceIdx].vector = generatedVectors[i];
                });
            }

            const batchPoints = batchSlice.map((item) => ({
                id: item.id,
                vector: item.vector || item.originalVector,
                payload: item.payload,
            }));

            // Upsert batch into Qdrant
            const qdrantRes = await qdrantService.createPointsBatch(collectionName, batchPoints);
            readyPoints.push(...batchPoints);

            const batchDuration = Date.now() - batchStartTime;
            batchReports.push({
                batchNumber: bIndex + 1,
                totalBatches,
                chunkCount: batchSlice.length,
                durationMs: batchDuration,
                qdrantStatus: qdrantRes.operation?.status || "completed",
                pointIds: batchPoints.map((p) => p.id),
            });
        }

        // 4. Retrieve Collection Status After Insertion
        let postImportCollectionInfo = null;
        try {
            postImportCollectionInfo = await qdrantService.getCollection(collectionName);
        } catch (e) {
            console.warn(`[ImportService] Could not fetch collection stats: ${e.message}`);
        }

        const totalDurationMs = Date.now() - startTime;

        // 5. Build Final Comprehensive Report
        return {
            success: true,
            collection: collectionName,
            sourceFile,
            summary: {
                totalChunksInSource: stats.totalInput,
                successfullyInserted: readyPoints.length,
                failedOrSkipped: errors.length,
                uniquePages: stats.uniquePagesCount,
                duplicateIdsDetected: stats.duplicatesCount,
                batchesProcessed: batchReports.length,
                totalDurationMs,
                vectorDimensions: vectorSize,
                distanceMetric: distance,
            },
            contentTypesBreakdown: stats.contentTypes,
            batchDetails: batchReports,
            duplicateIds,
            errors,
            collectionStatus: postImportCollectionInfo
                ? {
                      pointsCount: postImportCollectionInfo.points_count,
                      indexedVectorsCount: postImportCollectionInfo.indexed_vectors_count,
                      vectorsCount: postImportCollectionInfo.vectors_count,
                      status: postImportCollectionInfo.status,
                  }
                : null,
        };
    }
}

module.exports = new ImportService();
