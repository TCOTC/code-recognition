// 评估：hljs.highlightAuto 能不能兜住 betlang 覆盖不到的长尾语言？
// 语料：本机上真实存在的长尾语言源文件（按扩展名确定真值）
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const HLJS_DIR = "D:/CodeProjects/siyuan/app/stage/protyle/js/highlight.js/";
const sandbox = { window: {}, self: {}, console };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const f of ["highlight.min.js", "third-languages.js"]) {
  vm.runInContext(fs.readFileSync(HLJS_DIR + f, "utf8"), sandbox, { filename: f });
}
const hljs = sandbox.hljs || sandbox.window.hljs;
const ALL = hljs.listLanguages();

// betlang 能覆盖的 46 个 hljs 语言名（见 docs/appendix/数据附录.md D-1）
const BETLANG_COVERED = new Set([
  "armasm", "bash", "c", "clojure", "cmake", "cpp", "csharp", "css", "dart",
  "dockerfile", "dos", "elixir", "erlang", "go", "gradle", "groovy", "haskell",
  "ini", "java", "javascript", "json", "julia", "kotlin", "lisp", "lua",
  "markdown", "objectivec", "ocaml", "perl", "php", "powershell", "python", "r",
  "ruby", "rust", "scala", "shell", "sql", "swift", "typescript", "vbnet",
  "vbscript", "verilog", "x86asm", "xml", "yaml",
]);
const UNCOVERED = ALL.filter((l) => !BETLANG_COVERED.has(l));

// 真值：扩展名 -> hljs 语言名（只取本机有真实样本的长尾语言）
const CASES = [
  { ext: ".proto", lang: "protobuf" },
  { ext: ".wat", lang: "wasm" },
  { ext: ".scss", lang: "scss" },
  { ext: ".tcl", lang: "tcl" },
  { ext: ".awk", lang: "awk" },
  { ext: ".diff", lang: "diff" },
  { ext: ".hbs", lang: "handlebars" },
  { ext: ".erb", lang: "erb" },
  { ext: ".vim", lang: "vim" },
  { ext: ".graphql", lang: "graphql" },
  { ext: ".coffee", lang: "coffeescript" },
  { ext: ".f90", lang: "fortran" },
];
const ROOTS = [
  "C:/Users/Admin/go/pkg/mod",
  "D:/CodeProjects",
  "C:/Users/Admin/.vscode/extensions",
  "C:/Users/Admin/zed-src",
];
const PER_LANG = 10;
const SIZE = 1024; // 只取前 1KB，模拟真实代码块

const collect = (ext) => {
  const found = [];
  const walk = (dir, depth) => {
    if (found.length >= PER_LANG || depth > 8) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (found.length >= PER_LANG) return;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!/^(\.git|target|dist|build|__pycache__)$/.test(e.name) || depth < 2) walk(p, depth + 1);
      } else if (e.name.toLowerCase().endsWith(ext)) {
        try { if (fs.statSync(p).size >= 200) found.push(p); } catch { /* ignore */ }
      }
    }
  };
  for (const r of ROOTS) {
    if (found.length >= PER_LANG) break;
    walk(r, 0);
  }
  return found;
};

const rows = [];
let fullOk = 0, subsetOk = 0, total = 0;
let tFull = 0, tSubset = 0;

for (const { ext, lang } of CASES) {
  const files = collect(ext);
  let okFull = 0, okSubset = 0;
  const wrong = [];
  for (const f of files) {
    let code;
    try { code = fs.readFileSync(f, "utf8").slice(0, SIZE); } catch { continue; }
    if (code.trim().length < 20) continue;
    total++;

    let t0 = performance.now();
    const rFull = hljs.highlightAuto(code);
    tFull += performance.now() - t0;

    t0 = performance.now();
    const rSub = hljs.highlightAuto(code, UNCOVERED);
    tSubset += performance.now() - t0;

    const hitFull = rFull.language === lang;
    const hitSub = rSub.language === lang;
    if (hitFull) { okFull++; fullOk++; }
    if (hitSub) { okSubset++; subsetOk++; }
    if (!hitFull && wrong.length < 3) {
      wrong.push(`${path.basename(f)} -> ${rFull.language}(2nd:${rFull.secondBest?.language})`);
    }
  }
  rows.push({ ext, lang, n: files.length, okFull, okSubset, wrong });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`hljs 语言总数 ${ALL.length}；其中 betlang 覆盖不到 ${UNCOVERED.length} 个`);
console.log(`每个文件只取前 ${SIZE} 字节\n`);
console.log(pad("扩展名", 10) + pad("真值", 13) + pad("样本", 6) + pad("全量命中", 10) + pad("限定候选命中", 13) + "错例");
for (const r of rows) {
  console.log(
    pad(r.ext, 10) + pad(r.lang, 13) + pad(r.n, 6) +
    pad(`${r.okFull}/${r.n}`, 10) + pad(`${r.okSubset}/${r.n}`, 13) +
    r.wrong.join("; "),
  );
}
console.log(
  `\n合计: 全量 ${fullOk}/${total} (${(fullOk / total * 100).toFixed(1)}%)  ` +
  `限定候选 ${subsetOk}/${total} (${(subsetOk / total * 100).toFixed(1)}%)`,
);
console.log(
  `平均耗时: 全量 ${(tFull / total).toFixed(1)} ms  限定候选 ${(tSubset / total).toFixed(1)} ms`,
);
