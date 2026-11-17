const assert = require("assert");
const importService = require("../services/importService");

function testValidationAndDeduplication() {
    console.log("Running unit test: testValidationAndDeduplication...");

    const testChunks = [
        {
            id: "uuid-1",
            page_id: "test-page",
            page_title: "Test Page",
            section_title: "Section A",
            subsection_title: "Subsection 1",
            content_type: "how-to",
            content: "Step by step content here.",
            embedding_text: "Test Page: Section A. How do I do step by step?",
            intent_questions: [
                "How do I do step by step?",
                "how do i do step by step?",      // duplicate (case insensitive)
                "How do I do step by step?   ",   // duplicate (whitespace)
                "Where can I find instructions?"  // unique
            ],
            keywords: ["test", "steps", "test"], // duplicate keyword
            page_url: "https://help.example.com/test",
            language: "en"
        },
        {
            id: "uuid-1", // duplicate ID test
            page_id: "test-page-dup",
            content: "Duplicate id content",
            embedding_text: "Duplicate"
        }
    ];

    const result = importService.validateAndPrepareChunks(testChunks, { cleanQuestions: true });

    assert.strictEqual(result.stats.totalInput, 2);
    assert.strictEqual(result.stats.validCount, 2);
    assert.strictEqual(result.duplicateIds.length, 1);
    assert.strictEqual(result.duplicateIds[0].id, "uuid-1");

    const preparedChunk = result.validChunks[0];
    assert.strictEqual(preparedChunk.id, "uuid-1");
    // Cleaned questions should only have 2 unique questions instead of 4
    assert.strictEqual(preparedChunk.payload.intent_questions.length, 2);
    assert.deepStrictEqual(preparedChunk.payload.intent_questions, [
        "How do I do step by step?",
        "Where can I find instructions?"
    ]);

    // Cleaned keywords should only have 2 unique keywords instead of 3
    assert.strictEqual(preparedChunk.payload.keywords.length, 2);
    assert.deepStrictEqual(preparedChunk.payload.keywords, ["test", "steps"]);

    console.log("[PASS] Validation & Intent Question Deduplication tests passed!");
}

testValidationAndDeduplication();
