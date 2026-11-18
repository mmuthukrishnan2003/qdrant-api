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
     * Simple robust RFC 4180 CSV parser
     */
    parseCsv(csvString) {
        const lines = [];
        let row = [""];
        let inQuotes = false;

        for (let i = 0; i < csvString.length; i++) {
            const char = csvString[i];
            const nextChar = csvString[i + 1];

            if (char === '"' && inQuotes && nextChar === '"') {
                row[row.length - 1] += '"';
                i++; // skip escaped quote
            } else if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                row.push("");
            } else if ((char === '\r' || char === '\n') && !inQuotes) {
                if (char === '\r' && nextChar === '\n') i++;
                lines.push(row);
                row = [""];
            } else {
                row[row.length - 1] += char;
            }
        }
        if (row.length > 1 || row[0] !== "") {
            lines.push(row);
        }

        if (lines.length < 2) return [];

        const headers = lines[0].map((h) => h.trim());
        const records = [];

        for (let r = 1; r < lines.length; r++) {
            const values = lines[r];
            if (values.length === 1 && values[0].trim() === "") continue;
            const record = {};
            headers.forEach((header, colIdx) => {
                record[header] = values[colIdx] !== undefined ? values[colIdx].trim() : "";
            });
            records.push(record);
        }

        return records;
    }

    /**
     * Convert array of objects to CSV string
     */
    formatCsv(records, fields = null) {
        if (!records || records.length === 0) return "";

        const headers = fields || Object.keys(records[0]);
        const escapeCsvValue = (val) => {
            if (val === null || val === undefined) return "";
            if (typeof val === "object") val = JSON.stringify(val);
            const str = String(val);
            if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const headerLine = headers.map(escapeCsvValue).join(",");
        const rowLines = records.map((rec) => headers.map((h) => escapeCsvValue(rec[h])).join(","));

        return [headerLine, ...rowLines].join("\n");
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

            const embeddingText =
                (chunk.embedding_text && typeof chunk.embedding_text === "string" && chunk.embedding_text.trim()) ||
                (chunk.content && typeof chunk.content === "string" && chunk.content.trim()) ||
                (chunk.text && typeof chunk.text === "string" && chunk.text.trim()) ||
                (chunk.page_title ? `${chunk.page_title}: ${chunk.content || ""}` : "");

            if (!embeddingText) {
                errors.push({
                    index,
                    id: pointId,
                    reason: "Missing 'embedding_text', 'content', or 'text' for generating vector",
                });
                return;
            }

            const cType = chunk.content_type || chunk.type || "Uncategorized";
            contentTypesCount[cType] = (contentTypesCount[cType] || 0) + 1;
            if (chunk.page_url) pagesSet.add(chunk.page_url);
            else if (chunk.page_title) pagesSet.add(chunk.page_title);

            const intentQuestions = cleanQuestions && chunk.intent_questions
                ? this.cleanIntentQuestions(chunk.intent_questions)
                : chunk.intent_questions || [];

            const keywords = chunk.keywords ? this.cleanKeywords(chunk.keywords) : [];

            const payload = {
                page_id: chunk.page_id || chunk.pageId || "",
                page_title: chunk.page_title || chunk.pageTitle || chunk.title || "",
                section_title: chunk.section_title || chunk.sectionTitle || "",
                subsection_title: chunk.subsection_title || chunk.subsectionTitle || "",
                content_type: cType,
                content: chunk.content || chunk.text || "",
                page_url: chunk.page_url || chunk.url || "",
                language: chunk.language || "en",
                breadcrumb: chunk.breadcrumb || "",
                intent_questions: intentQuestions,
                keywords: keywords,
                ...chunk.metadata,
            };

            const standardKeys = new Set([
                "id", "_id", "vector", "embedding", "embedding_text", "page_id", "page_title",
                "section_title", "subsection_title", "content_type", "content", "page_url",
                "language", "breadcrumb", "intent_questions", "keywords", "metadata", "text", "title",
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

        const { validChunks, duplicateIds, errors, stats } = this.validateAndPrepareChunks(rawChunks, {
            cleanQuestions,
        });

        if (validChunks.length === 0) {
            throw new Error("Validation failed: No valid chunks could be prepared for embedding/insertion");
        }

        const vectorSize = parseInt(process.env.DEFAULT_VECTOR_SIZE, 10) || 1024;
        const distance = process.env.DEFAULT_VECTOR_DISTANCE || "Cosine";
        await qdrantService.ensureCollection(collectionName, vectorSize, distance);

        const totalBatches = Math.ceil(validChunks.length / batchSize);
        const batchReports = [];
        const readyPoints = [];

        for (let bIndex = 0; bIndex < totalBatches; bIndex++) {
            const startIdx = bIndex * batchSize;
            const endIdx = Math.min(startIdx + batchSize, validChunks.length);
            const batchSlice = validChunks.slice(startIdx, endIdx);
            const batchStartTime = Date.now();

            const textsToEmbed = [];
            const textToSliceIdx = [];

            batchSlice.forEach((item, idx) => {
                if (item.originalVector && item.originalVector.length === vectorSize) {
                    // Vector present
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

            const qdrantRes = await qdrantService.upsertPoints(collectionName, batchPoints);
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

        let postImportCollectionInfo = null;
        try {
            postImportCollectionInfo = await qdrantService.getCollection(collectionName);
        } catch (e) {
            console.warn(`[ImportService] Could not fetch collection stats: ${e.message}`);
        }

        const totalDurationMs = Date.now() - startTime;

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

    /**
     * Import CSV dataset
     */
    async importCsv({ collectionName, csvContent, filePath, batchSize = 32, cleanQuestions = true }) {
        let content = csvContent;
        let sourceFile = null;

        if (!content && filePath) {
            const p = path.resolve(filePath);
            if (!fs.existsSync(p)) throw new Error(`CSV file not found: ${filePath}`);
            content = fs.readFileSync(p, "utf-8");
            sourceFile = p;
        }

        if (!content) throw new Error("Either 'csvContent' string or 'filePath' is required");

        const records = this.parseCsv(content);
        if (records.length === 0) throw new Error("CSV parsed into 0 records");

        const report = await this.importChunks({
            collectionName,
            chunks: records,
            batchSize,
            cleanQuestions,
        });

        report.sourceFile = sourceFile || "direct_csv_upload";
        return report;
    }

    /**
     * Export all points from a collection as JSON
     */
    async exportCollectionJson(collectionName = process.env.DEFAULT_COLLECTION || "ai_centizen", { limit = 1000, withVector = false } = {}) {
        const scrollRes = await qdrantService.scrollPoints(collectionName, {
            limit: parseInt(limit, 10) || 1000,
            with_payload: true,
            with_vector: withVector,
        });

        const points = scrollRes.points || [];
        return {
            collection: collectionName,
            totalExported: points.length,
            withVector,
            points,
        };
    }

    /**
     * Export all points from a collection as CSV
     */
    async exportCollectionCsv(collectionName = process.env.DEFAULT_COLLECTION || "ai_centizen", { limit = 1000 } = {}) {
        const { points } = await this.exportCollectionJson(collectionName, { limit, withVector: false });

        if (points.length === 0) {
            return "id,page_title,content_type,content,page_url";
        }

        const flatRows = points.map((p) => {
            const pl = p.payload || {};
            return {
                id: p.id,
                page_title: pl.page_title || "",
                section_title: pl.section_title || "",
                subsection_title: pl.subsection_title || "",
                content_type: pl.content_type || "",
                content: pl.content || "",
                page_url: pl.page_url || "",
                language: pl.language || "en",
                breadcrumb: pl.breadcrumb || "",
                intent_questions: Array.isArray(pl.intent_questions) ? pl.intent_questions.join(" | ") : "",
                keywords: Array.isArray(pl.keywords) ? pl.keywords.join(", ") : "",
            };
        });

        return this.formatCsv(flatRows);
    }
}

module.exports = new ImportService();
