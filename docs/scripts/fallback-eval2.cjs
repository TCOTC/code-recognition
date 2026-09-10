// 对照实验：highlightAuto 在长尾语言上的准确率，受候选集影响多大？
// 变体 A = 全量 201；B = betlang 未覆盖的 155；C = 155 去掉污染语法；D = 只留真值语言（上限）
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

const BETLANG_COVERED = new Set([
  "armasm", "bash", "c", "clojure", "cmake", "cpp", "csharp", "css", "dart",
  "dockerfile", "dos", "elixir", "erlang", "go", "gradle", "groovy", "haskell",
  "ini", "java", "javascript", "json", "julia", "kotlin", "lisp", "lua",
  "markdown", "objectivec", "ocaml", "perl", "php", "powershell", "python", "r",
  "ruby", "rust", "scala", "shell", "sql", "swift", "typescript", "vbnet",
  "vbscript", "verilog", "x86asm", "xml", "yaml",
]);
const UNCOVERED = ALL.filter((l) => !BETLANG_COVERED.has(l));
const POLLUTED = new Set(["moonbit", "dns"]);          // 见 moonbit-probe.cjs 的诊断
const UNCOVERED_CLEAN = UNCOVERED.filter((l) => !POLLUTED.has(l));

const CASES = [
  { ext: ".proto", lang: "protobuf" }, { ext: ".wat", lang: "wasm" },
  { ext: ".scss", lang: "scss" }, { ext: ".tcl", lang: "tcl" },
  { ext: ".awk", lang: "awk" }, { ext: ".diff", lang: "diff" },
  { ext: ".hbs", lang: "handlebars" }, { ext: ".erb", lang: "erb" },
  { ext: ".vim", lang: "vim" }, { ext: ".graphql", lang: "graphql" },
  { ext: ".coffee", lang: "coffeescript" },
];
const ROOTS = ["C:/Users/Admin/go/pkg/mod", "D:/CodeProjects",
  "C:/Users/Admin/.vscode/extensions", "C:/Users/Admin/zed-src"];
const PER_LANG = 10;
const SIZE = 1024;

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
  for (const r of ROOTS) { if (found.length >= PER_LANG) break; walk(r, 0); }
  return found;
};

const TRUTH_LANGS = [...new Set(CASES.map((c) => c.lang))];
const VARIANTS = [
  { id: "A 全量201", cand: null },
  { id: "B 未覆盖155", cand: UNCOVERED },
  { id: "C 155去污染", cand: UNCOVERED_CLEAN },
  { id: "D 只留真值11", cand: TRUTH_LANGS },
];
const stat = VARIANTS.map(() => ({ ok: 0, n: 0, ms: 0 }));

const perLang = new Map();
for (const { ext, lang } of CASES) {
  const files = collect(ext);
  const row = { ext, lang, n: 0, res: VARIANTS.map(() => 0) };
  for (const f of files) {
    let code;
    try { code = fs.readFileSync(f, "utf8").slice(0, SIZE); } catch { continue; }
    if (code.trim().length < 20) continue;
    row.n++;
    VARIANTS.forEach((v, i) => {
      const t0 = performance.now();
      const r = v.cand ? hljs.highlightAuto(code, v.cand) : hljs.highlightAuto(code);
      stat[i].ms += performance.now() - t0;
      stat[i].n++;
      if (r.language === lang) { stat[i].ok++; row.res[i]++; }
    });
  }
  perLang.set(ext, row);
}

const pad = (s, n) => String(s).padEnd(n);
console.log(pad("语言", 14) + pad("样本", 6) + VARIANTS.map((v) => pad(v.id, 13)).join(""));
let total = 0;
for (const [, r] of perLang) {
  total += r.n;
  console.log(
    pad(r.lang, 14) + pad(r.n, 6) +
    r.res.map((x) => pad(`${x}/${r.n}`, 13)).join(""),
  );
}
console.log("");
VARIANTS.forEach((v, i) => {
  console.log(
    pad(v.id, 14) +
    `准确率 ${(stat[i].ok / stat[i].n * 100).toFixed(1)}%`.padEnd(18) +
    `平均耗时 ${(stat[i].ms / stat[i].n).toFixed(1)} ms`,
  );
});
console.log(`\n总样本 ${total}（每种语言最多 10 个文件，每个文件只取前 ${SIZE} 字节）`);
