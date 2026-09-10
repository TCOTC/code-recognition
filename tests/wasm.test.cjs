const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");
const {pathToFileURL} = require("node:url");

const parseTopLanguage = output => output.trim().split("\n", 1)[0].split(":", 1)[0];

test("the bundled betlang wasm recognizes representative languages", async () => {
    const modulePath = path.resolve("src/wasm/betlang_wasm.js");
    const wasmPath = path.resolve("src/wasm/betlang_wasm_bg.wasm");
    const betlang = await import(pathToFileURL(modulePath).href);
    const wasm = await fs.readFile(wasmPath);
    await betlang.default({module_or_path: wasm});

    const cases = [
        [
            "rust",
            'use std::collections::HashMap;\nfn main() { let mut values: HashMap<String, usize> = HashMap::new(); values.insert("a".into(), 1); }',
        ],
        ["go", 'package main\nimport "fmt"\nfunc main() { values := []int{1, 2, 3}; fmt.Println(values) }'],
        [
            "python",
            "from pathlib import Path\ndef collect(root: Path) -> list[str]:\n    return [item.name for item in root.iterdir() if item.is_file()]",
        ],
        ["html", "<span>234234</span>\n<span>2342343</span>\n<div>23</div>"],
    ];
    for (const [expected, source] of cases) {
        assert.equal(parseTopLanguage(betlang.detect_scores(source)), expected);
    }
});
