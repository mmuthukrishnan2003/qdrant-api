const importService = require("../services/importService");

class ImportExportController {
    // POST /api/import/preview
    async preview(req, res, next) {
        try {
            const { filePath, chunks, cleanQuestions = true } = req.body;
            let rawChunks = chunks;

            let sourceFile = null;
            if (!rawChunks) {
                const fileData = importService.readJsonChunksFromFile(filePath);
                sourceFile = fileData.resolvedPath;
                rawChunks = fileData.chunks;
            }

            const analysis = importService.validateAndPrepareChunks(rawChunks, { cleanQuestions });

            res.json({
                success: true,
                sourceFile,
                preview: true,
                summary: analysis.stats,
                duplicates: analysis.duplicateIds,
                errors: analysis.errors,
                samplePreparedChunk: analysis.validChunks[0] || null,
            });
        } catch (error) {
            next(error);
        }
    }

    // POST /api/import/json
    async importJson(req, res, next) {
        try {
            const collectionName =
                req.body.collection ||
                req.params.collection ||
                process.env.DEFAULT_COLLECTION ||
                "ai_centizen";

            const { filePath, chunks, batchSize = 32, cleanQuestions = true } = req.body;

            const report = await importService.importChunks({
                collectionName,
                filePath,
                chunks,
                batchSize: parseInt(batchSize, 10) || 32,
                cleanQuestions,
            });

            res.status(200).json(report);
        } catch (error) {
            next(error);
        }
    }

    // POST /api/import/csv
    async importCsv(req, res, next) {
        try {
            const collectionName =
                req.body.collection ||
                req.params.collection ||
                process.env.DEFAULT_COLLECTION ||
                "ai_centizen";

            const { csvContent, filePath, batchSize = 32, cleanQuestions = true } = req.body;

            const report = await importService.importCsv({
                collectionName,
                csvContent,
                filePath,
                batchSize: parseInt(batchSize, 10) || 32,
                cleanQuestions,
            });

            res.status(200).json(report);
        } catch (error) {
            next(error);
        }
    }

    // POST /api/import/bulk
    async importBulk(req, res, next) {
        // High throughput bulk import using batchSize (up to 32 per embedding call)
        return this.importJson(req, res, next);
    }

    // GET /api/export/json & GET /api/export/:collection
    async exportJson(req, res, next) {
        try {
            const collectionName =
                req.params.collection ||
                req.query.collection ||
                process.env.DEFAULT_COLLECTION ||
                "ai_centizen";

            const limit = req.query.limit || 1000;
            const withVector = req.query.with_vector === "true";

            const data = await importService.exportCollectionJson(collectionName, { limit, withVector });
            res.json({ success: true, ...data });
        } catch (error) {
            next(error);
        }
    }

    // GET /api/export/csv
    async exportCsv(req, res, next) {
        try {
            const collectionName =
                req.query.collection ||
                req.params.collection ||
                process.env.DEFAULT_COLLECTION ||
                "ai_centizen";

            const limit = req.query.limit || 1000;
            const csvOutput = await importService.exportCollectionCsv(collectionName, { limit });

            res.setHeader("Content-Type", "text/csv");
            res.setHeader("Content-Disposition", `attachment; filename="${collectionName}_export.csv"`);
            res.send(csvOutput);
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new ImportExportController();
