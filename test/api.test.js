const assert = require("assert");
const app = require("../server");
const importService = require("../services/importService");
const ragService = require("../services/ragService");
const adminController = require("../controllers/adminController");
const collectionController = require("../controllers/collectionController");

// Helper to mock express req/res
function mockReqRes(overrides = {}) {
    const req = {
        method: "GET",
        url: "/",
        path: "/",
        params: {},
        query: {},
        body: {},
        headers: {},
        ...overrides,
    };

    let statusCode = 200;
    let responseData = null;

    const res = {
        status(code) {
            statusCode = code;
            return res;
        },
        json(data) {
            responseData = data;
            return res;
        },
        send(data) {
            responseData = data;
            return res;
        },
        setHeader() {
            return res;
        },
        getStatusCode() {
            return statusCode;
        },
        getData() {
            return responseData;
        },
    };

    return { req, res };
}

async function runDirectTests() {
    console.log("==================================================================");
    console.log("       Running Advanced Vector DB API Direct Logic Tests          ");
    console.log("==================================================================");

    // 1. Category 7: Admin & Health
    console.log("\n[Test 1] Testing Admin Controller (Health & Config)...");
    const { req: hReq, res: hRes } = mockReqRes();
    await adminController.health(hReq, hRes, (err) => { throw err; });
    assert(hRes.getData().status);
    assert(hRes.getData().services);
    console.log(`  -> [PASS] adminController.health returned status: ${hRes.getData().status}`);

    const { req: cReq, res: cRes } = mockReqRes();
    await adminController.config(cReq, cRes, (err) => { throw err; });
    assert.strictEqual(cRes.getData().localServicePorts.qdrantUrl, "http://127.0.0.1:6333");
    assert.strictEqual(cRes.getData().localServicePorts.embeddingApiUrl, "http://127.0.0.1:8002");
    assert.strictEqual(cRes.getData().localServicePorts.vllmApiUrl, "http://127.0.0.1:8000/v1");
    console.log("  -> [PASS] adminController.config verified local-only configuration ports!");

    const { req: sReq, res: sRes } = mockReqRes();
    await adminController.status(sReq, sRes, (err) => { throw err; });
    assert.strictEqual(sRes.getData().service, "Qdrant Vector CRUD & Advanced AI API");
    console.log("  -> [PASS] adminController.status verified service runtime info!");

    // 2. Category 5: CSV Parsing & Formatting
    console.log("\n[Test 2] Testing CSV Parser and Formatter...");
    const sampleCsv = `id,page_title,content,page_url\n"p1","Product Page","Details about product","https://example.com/p1"\n"p2","Checkout","Checkout flow","https://example.com/checkout"`;
    const parsed = importService.parseCsv(sampleCsv);
    assert.strictEqual(parsed.length, 2);
    assert.strictEqual(parsed[0].id, "p1");
    assert.strictEqual(parsed[0].page_title, "Product Page");

    const formatted = importService.formatCsv(parsed);
    assert(formatted.includes("Product Page"));
    assert(formatted.includes("Checkout"));
    console.log("  -> [PASS] CSV parsing and serializing verified!");

    // 3. Category 5: Dataset validation
    console.log("\n[Test 3] Testing Dataset Validation & Intent Cleaning...");
    const { chunks } = importService.readJsonChunksFromFile("data/sample_chunks.json");
    const validated = importService.validateAndPrepareChunks(chunks);
    assert.strictEqual(validated.stats.validCount, 2);
    assert.strictEqual(validated.duplicateIds.length, 0);
    console.log("  -> [PASS] Validated sample dataset chunks!");

    // 4. Category 6: RAG Text Chunker
    console.log("\n[Test 4] Testing RAG Text Chunker...");
    const doc = "First section content. ".repeat(40);
    const chunksResult = ragService.chunkText(doc, 200, 30);
    assert(chunksResult.length > 1);
    console.log(`  -> [PASS] RAG text chunker created ${chunksResult.length} chunks properly!`);

    // 5. Category 1: Collection Controller Parameter Validation
    console.log("\n[Test 5] Testing Collection Creation Validation...");
    const { req: colReq, res: colRes } = mockReqRes({ body: {} });
    await collectionController.createCollection(colReq, colRes, (err) => { throw err; });
    assert.strictEqual(colRes.getStatusCode(), 400);
    assert.strictEqual(colRes.getData().error, "Collection name is required");
    console.log("  -> [PASS] Collection controller validated missing parameters!");

    console.log("\n==================================================================");
    console.log("             ALL API COMPONENT TESTS PASSED (100%)                ");
    console.log("==================================================================");
}

runDirectTests().catch((err) => {
    console.error("Test error:", err);
    process.exit(1);
});
