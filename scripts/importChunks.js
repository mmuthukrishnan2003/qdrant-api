require("dotenv").config();
const path = require("path");
const importService = require("../services/importService");

async function runCli() {
    console.log("==================================================================");
    console.log("       Centizen Qdrant Knowledge Base - Batch JSON Importer       ");
    console.log("==================================================================");

    const args = process.argv.slice(2);
    let filePath = null;
    let collectionName = process.env.DEFAULT_COLLECTION || "ai_centizen";
    let batchSize = 32;
    let dryRun = false;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--dry-run" || arg === "-d") {
            dryRun = true;
        } else if (arg === "--collection" || arg === "-c") {
            collectionName = args[++i];
        } else if (arg === "--batch-size" || arg === "-b") {
            batchSize = parseInt(args[++i], 10) || 32;
        } else if (!arg.startsWith("-") && !filePath) {
            filePath = arg;
        }
    }

    try {
        console.log(`[Config] Target Collection: ${collectionName}`);
        console.log(`[Config] Max Batch Size:   ${batchSize} items / embedding request`);
        console.log(`[Config] Dry Run Mode:       ${dryRun ? "ENABLED (preview only)" : "DISABLED (actual import)"}`);

        if (dryRun) {
            console.log("\n[Step 1] Loading and validating JSON chunks...");
            const { resolvedPath, chunks } = importService.readJsonChunksFromFile(filePath);
            console.log(`[OK] Loaded dataset from: ${resolvedPath}`);

            const analysis = importService.validateAndPrepareChunks(chunks);
            console.log("\n--- DATASET SUMMARY ---");
            console.log(`Total Chunks:        ${analysis.stats.totalInput}`);
            console.log(`Valid Records:       ${analysis.stats.validCount}`);
            console.log(`Duplicate IDs:       ${analysis.stats.duplicatesCount}`);
            console.log(`Unique Pages:        ${analysis.stats.uniquePagesCount}`);
            console.log("Content Types Breakdown:");
            Object.entries(analysis.stats.contentTypes).forEach(([type, count]) => {
                console.log(`  - ${type}: ${count}`);
            });

            if (analysis.duplicateIds.length > 0) {
                console.log("\n[Warning] Duplicate IDs found:");
                analysis.duplicateIds.forEach((d) => console.log(`  - ID: ${d.id}`));
            }

            console.log("\n[Dry Run Complete] No records were embedded or inserted.");
            return;
        }

        console.log("\n[Step 1] Starting Batch Import Workflow...");
        const report = await importService.importChunks({
            collectionName,
            filePath,
            batchSize,
            cleanQuestions: true,
        });

        console.log("\n==================================================================");
        console.log("                    IMPORT EXECUTION REPORT                       ");
        console.log("==================================================================");
        console.log(`Status:               SUCCESS`);
        console.log(`Source File:          ${report.sourceFile}`);
        console.log(`Target Collection:    ${report.collection}`);
        console.log(`Total Source Chunks:  ${report.summary.totalChunksInSource}`);
        console.log(`Points Inserted:      ${report.summary.successfullyInserted}`);
        console.log(`Errors / Skipped:     ${report.summary.failedOrSkipped}`);
        console.log(`Unique Pages:         ${report.summary.uniquePages}`);
        console.log(`Duplicate IDs:        ${report.summary.duplicateIdsDetected}`);
        console.log(`Batches Processed:    ${report.summary.batchesProcessed}`);
        console.log(`Total Execution Time: ${report.summary.totalDurationMs} ms`);

        console.log("\nBatch Breakdown:");
        report.batchDetails.forEach((b) => {
            console.log(`  - Batch ${b.batchNumber}/${b.totalBatches}: ${b.chunkCount} chunks (${b.durationMs}ms) -> Qdrant: ${b.qdrantStatus}`);
        });

        if (report.collectionStatus) {
            console.log("\nQdrant Collection Status:");
            console.log(`  - Points Count:          ${report.collectionStatus.pointsCount}`);
            console.log(`  - Indexed Vectors Count: ${report.collectionStatus.indexedVectorsCount}`);
            console.log(`  - Collection Status:     ${report.collectionStatus.status}`);
        }

        console.log("==================================================================");
        process.exit(0);
    } catch (error) {
        console.error("\n[Error during Import]:", error.message);
        process.exit(1);
    }
}

runCli();
