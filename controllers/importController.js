const importService = require("../services/importService");

class ImportController {
    /**
     * Preview / Dry run validation on JSON chunks without inserting
     */
    async previewImport(req, res, next) {
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

    /**
     * Batch import JSON chunks into Qdrant
     */
    async importChunks(req, res, next) {
        try {
            const collectionName =
                req.params.collection ||
                req.body.collection ||
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
}

module.exports = new ImportController();
