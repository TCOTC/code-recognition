// Magika 基线基准：在 betlang 自带的测试语料上运行 magika@1.0.0。
// 运行前提：npm install magika@1.0.0
// 注意：该语料是 betlang 自己的测试集（对 betlang 有利），
//       结论不能当作准确率对比，只能用来观察 Magika 的行为与耗时。详见 ../07-实测数据与复现.md
import { Magika } from "magika";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

// 【按需修改】betlang crate 在本机的解包路径
const FIXTURES =
  "C:/Users/Admin/zed-src/.betlang-src/x/betlang-0.1.1/tests/fixtures/languages";

// fixture 文件名 -> 期望的 Magika 标签
const EXPECTED = {
  "asm.s": "asm",
  "bash.sh": "shell",
  "batch.bat": "batch",
  "c-sharp.cs": "cs",
  "c.c": "c",
  "clojure.clj": "clojure",
  "cmake.cmake": "cmake",
  "cobol.cob": "cobol",
  "commonlisp.lisp": "lisp",
  "cpp.cpp": "cpp",
  "css.css": "css",
  "dart.dart": "dart",
  "dockerfile.Dockerfile": "dockerfile",
  "elixir.ex": "elixir",
  "erlang.erl": "erlang",
  Gemfile: "gemfile",
  "gemspec.gemspec": "gemspec",
  "go.go": "go",
  "gradle.gradle": "gradle",
  "groovy.groovy": "groovy",
  "haskell.hs": "haskell",
  "html.html": "html",
  "ini.ini": "ini",
  "java.java": "java",
  "javascript.js": "javascript",
  "json.json": "json",
  "julia.jl": "julia",
  "kotlin.kt": "kotlin",
  "lua.lua": "lua",
  "markdown.md": "markdown",
  "objc.m": "objectivec",
  "ocaml.ml": "ocaml",
  "perl.pl": "perl",
  "php.php": "php",
  "powershell.ps1": "powershell",
  "python.py": "python",
  "r.R": "r",
  "ruby.rb": "ruby",
  "rust.rs": "rust",
  "scala.scala": "scala",
  "sql.sql": "sql",
  "swift.swift": "swift",
  "toml.toml": "toml",
  "typescript.ts": "typescript",
  "vb.vb": "vb",
  "verilog.v": "verilog",
  "xml.xml": "xml",
  "yaml.yaml": "yaml",
};

// betlang 的 48 个输出标签（Zed 只会用这个子集里能映射到编辑器语言的结果）
const BETLANG_LABELS = [
  "asm", "batch", "c", "clojure", "cmake", "cobol", "cpp", "cs", "css", "dart",
  "dockerfile", "elixir", "erlang", "gemfile", "gemspec", "go", "gradle", "groovy",
  "haskell", "html", "ini", "java", "javascript", "json", "julia", "kotlin", "lisp",
  "lua", "markdown", "objectivec", "ocaml", "perl", "php", "powershell", "python",
  "r", "ruby", "rust", "scala", "shell", "sql", "swift", "toml", "typescript",
  "vba", "verilog", "xml", "yaml",
];

const magika = await Magika.create();
console.log(`model=${magika.getModelName()} labels=${magika.model_config.target_labels_space.length}`);
console.log(
  `beg=${magika.model_config.beg_size} end=${magika.model_config.end_size} block=${magika.model_config.block_size} min_for_dl=${magika.model_config.min_file_size_for_dl}`,
);

const files = (await readdir(FIXTURES)).sort();
let hit = 0;
let hitSubset = 0;
let txt = 0;
let rows = [];

for (const file of files) {
  const bytes = new Uint8Array(await readFile(join(FIXTURES, file)));
  const result = await magika.identifyBytes(bytes);
  const label = result.prediction.output.label;
  const score = result.prediction.score;
  const expected = EXPECTED[file] ?? "?";

  // 只在 betlang 的 48 类标签子集上取 argmax（模拟"用 Magika 给编辑器选语言"）
  const subset = Object.entries(result.prediction.scores_map)
    .filter(([k]) => BETLANG_LABELS.includes(k))
    .sort((a, b) => b[1] - a[1]);
  const subsetTop = subset[0][0];
  const subsetTop3 = subset.slice(0, 3).map(([k]) => k);

  if (label === "txt" || label === "unknown") txt++;
  else if (label === expected) hit++;
  if (subsetTop === expected) hitSubset++;
  rows.push({
    file,
    bytes: bytes.length,
    expected,
    label,
    score: Number(score.toFixed(3)),
    subsetTop,
    subsetTop3: subsetTop3.join("|"),
  });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(
  "\n" + pad("file", 24) + pad("bytes", 7) + pad("expect", 12) + pad("magika", 12) + pad("score", 9) + pad("subset", 12) + "subset_top3",
);
for (const r of rows) {
  console.log(
    pad(r.file, 24) + pad(r.bytes, 7) + pad(r.expected, 12) + pad(r.label, 12) + pad(r.score, 9) + pad(r.subsetTop, 12) + r.subsetTop3,
  );
}

const n = rows.length;
const decoded = n - txt;
console.log(
  `\nsamples=${n}` +
    `\nraw_top1_correct=${hit}/${n} (${(hit / n * 100).toFixed(1)}%)  txt/unknown_fallback=${txt}` +
    `\nraw_accuracy_on_decoded=${(hit / Math.max(decoded, 1) * 100).toFixed(1)}%` +
    `\nsubset48_argmax_correct=${hitSubset}/${n} (${(hitSubset / n * 100).toFixed(1)}%)`,
);

// 延迟：预热后跑 48 次取均值
const sample = new Uint8Array(await readFile(join(FIXTURES, "rust.rs")));
await magika.identifyBytes(sample);
await magika.identifyBytes(sample);
const t0 = performance.now();
const N = 3;
for (let i = 0; i < N; i++) await magika.identifyBytes(sample);
const t1 = performance.now();
console.log(`latency_ms_per_call=${((t1 - t0) / N).toFixed(2)}`);
