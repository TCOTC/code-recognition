const assert = require("node:assert/strict");
const test = require("node:test");

const {LanguageDetector} = require("../.test-dist/src/detector/LanguageDetector.js");
const {RuleDetector} = require("../.test-dist/src/detector/RuleDetector.js");

const available = () => true;

const createDetector = (scores, rules = new RuleDetector(available)) =>
    new LanguageDetector(
        {detect: async () => scores},
        rules,
        available,
        error => {
            throw error;
        },
    );

test("selects a supported high-confidence betlang result", async () => {
    const detector = createDetector([
        {language: "rust", score: 0.82},
        {language: "cpp", score: 0.31},
        {language: "python", score: 0.1},
    ]);
    const result = await detector.detect('fn main() { println!("hello"); }');
    assert.equal(result.language, "rust");
    assert.equal(result.source, "betlang");
});

test("rejects low-confidence text without code signals", async () => {
    const detector = createDetector([
        {language: "markdown", score: 0.37},
        {language: "yaml", score: 0.1},
    ]);
    const result = await detector.detect("A short ordinary sentence");
    assert.equal(result, undefined);
});

test("recognizes high-confidence code without code signals", async () => {
    const detector = createDetector([
        {language: "yaml", score: 0.88},
        {language: "markdown", score: 0.08},
    ]);
    const result = await detector.detect("name: demo\nversion: latest");
    assert.equal(result.language, "yaml");
});

test("rejects medium-confidence results without code signals", async () => {
    const detector = createDetector([
        {language: "batch", score: 0.49},
        {language: "shell", score: 0.12},
    ]);
    const result = await detector.detect("echo hello world");
    assert.equal(result, undefined);
});

test("recognizes short code without a character limit", async () => {
    const detector = createDetector([
        {language: "json", score: 0.8},
        {language: "javascript", score: 0.1},
    ]);
    const result = await detector.detect("{}");
    assert.equal(result.language, "json");
});

test("rejects an ambiguous top group", async () => {
    const detector = createDetector([
        {language: "javascript", score: 0.55},
        {language: "typescript", score: 0.48},
        {language: "java", score: 0.4},
        {language: "cpp", score: 0.25},
        {language: "c", score: 0.15},
    ], {detect: () => undefined});
    const result = await detector.detect("const value = createValue<string>();");
    assert.equal(result, undefined);
});

test("recognizes markdown when confidence is sufficient", async () => {
    const detector = createDetector([
        {language: "markdown", score: 0.9},
        {language: "yaml", score: 0.1},
    ], {detect: () => undefined});
    const result = await detector.detect("# Heading\n- first item\n- second item");
    assert.equal(result.language, "markdown");
    assert.equal(result.source, "betlang");
});

test("falls back to long-tail feature rules", async () => {
    const detector = createDetector([], new RuleDetector(available));
    const source = 'syntax = "proto3";\nmessage User {\n  repeated string names = 1;\n}';
    const result = await detector.detect(source);
    assert.equal(result.language, "protobuf");
    assert.equal(result.source, "rule");
});
