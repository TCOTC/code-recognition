// 实测 hljs highlightAuto 在 SiYuan 的 201 语言全量集上的耗时与准确率。
// 运行：node hljs-auto.cjs
const vm = require("node:vm");
const fs = require("node:fs");

// 【按需修改】SiYuan 自带的 highlight.js 目录
const p = "D:/CodeProjects/siyuan/app/stage/protyle/js/highlight.js/";

const sandbox = { window: {}, self: {}, console };
  sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const f of ["highlight.min.js", "third-languages.js"]) {
  vm.runInContext(fs.readFileSync(p + f, "utf8"), sandbox, { filename: f });
}
const hljs = sandbox.hljs || sandbox.window.hljs;

const snippet = fs.readFileSync(
  "C:/Users/Admin/zed-src/.betlang-src/x/betlang-0.1.1/tests/fixtures/languages/rust.rs",
  "utf8",
);
const big = snippet.repeat(20); // 约 7KB，模拟一个真实代码块

const time = (label, fn, n = 5) => {
  fn(); // 预热
  const t0 = performance.now();
  for (let i = 0; i < n; i++) fn();
  const ms = (performance.now() - t0) / n;
  console.log(`${label.padEnd(52)} ${ms.toFixed(2)} ms/次`);
};

console.log(`全部语言 = ${hljs.listLanguages().length}\n`);
time("highlightAuto(201 语言全量)", () => hljs.highlightAuto(snippet));
time("highlightAuto(201 语言全量, 7KB)", () => hljs.highlightAuto(big));
time("highlightAuto(限定 6 个候选)", () =>
  hljs.highlightAuto(snippet, ["rust", "python", "javascript", "go", "css", "json"]),
);
time("highlight(指定 rust)", () => hljs.highlight(snippet, { language: "rust" }));

const r = hljs.highlightAuto(big);
console.log(`\n7KB 全量自动检测结果: ${r.language} (relevance=${r.relevance})`);
