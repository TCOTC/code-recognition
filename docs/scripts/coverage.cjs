// 计算 hljs(SiYuan) / betlang / Magika 三者的语言覆盖关系。
// 需要联网读取 Magika 的 config.min.json。
// 运行：node coverage.cjs
const vm = require("node:vm");
const fs = require("node:fs");

// 【按需修改】SiYuan 自带的 highlight.js 目录
const path = "D:/CodeProjects/siyuan/app/stage/protyle/js/highlight.js/";

const sandbox = { window: {}, self: {}, console };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const f of ["highlight.min.js", "third-languages.js"]) {
  vm.runInContext(fs.readFileSync(path + f, "utf8"), sandbox, { filename: f });
}
const hljsLangs = (sandbox.hljs || sandbox.window.hljs).listLanguages().sort();

const BETLANG = [
  "asm", "batch", "c", "clojure", "cmake", "cobol", "cpp", "cs", "css", "dart",
  "dockerfile", "elixir", "erlang", "gemfile", "gemspec", "go", "gradle", "groovy",
  "haskell", "html", "ini", "java", "javascript", "json", "julia", "kotlin", "lisp",
  "lua", "markdown", "objectivec", "ocaml", "perl", "php", "powershell", "python",
  "r", "ruby", "rust", "scala", "shell", "sql", "swift", "toml", "typescript",
  "vba", "verilog", "xml", "yaml",
];

// 统一到规范名： hljs 名字 -> 规范名，模型标签 -> 规范名
const CANON = {
  bash: "shell", sh: "shell", zsh: "shell", shell: "shell",
  csharp: "cs", cplusplus: "cpp", "objective-c": "objectivec",
  vbnet: "vba", vbscript: "vba", vb: "vba", dos: "batch",
  x86asm: "asm", armasm: "asm", golang: "go", proto: "protobuf",
  "python-repl": null, "clojure-repl": null, "erlang-repl": null,
  "julia-repl": null, "node-repl": null, "php-template": null,
  plaintext: null, text: null, txt: null, "vbscript-html": null,
  h5: "html", sgml: "html", vue: "html", svg: "xml",
};
const canon = (n) => (n in CANON ? CANON[n] : n);

async function magikaLabels() {
  const res = await fetch(
    "https://google.github.io/magika/models/standard_v3_3/config.min.json",
  );
  return (await res.json()).target_labels_space;
}

(async () => {
  const magika = (await magikaLabels()).map(canon);
  const betlang = new Set(BETLANG.map(canon));
  const magikaSet = new Set(magika);

  const inBetlang = [];
  const inMagika = [];
  const inNeither = [];
  for (const l of hljsLangs) {
    const c = canon(l);
    if (!c) continue;
    if (betlang.has(c)) inBetlang.push(l);
    if (magikaSet.has(c)) inMagika.push(l);
    if (!betlang.has(c) && !magikaSet.has(c)) inNeither.push(l);
  }

  console.log(`hljs(SiYuan) languages = ${hljsLangs.length}`);
  console.log(`Magika labels = ${magika.length}`);
  console.log(`betlang labels = ${BETLANG.length}`);
  console.log(`\nhljs covered by betlang = ${inBetlang.length} (${(inBetlang.length / hljsLangs.length * 100).toFixed(1)}%)`);
  console.log(`hljs covered by Magika  = ${inMagika.length} (${(inMagika.length / hljsLangs.length * 100).toFixed(1)}%)`);
  console.log(`hljs covered by neither = ${inNeither.length}`);
  console.log(`\n--- betlang 能覆盖的 hljs 语言 ---\n${inBetlang.join(" ")}`);
  console.log(`\n--- 只有 Magika 能覆盖的 hljs 语言 ---\n${inMagika.filter((l) => !inBetlang.includes(l)).join(" ")}`);
  console.log(`\n--- 两者都覆盖不到的 hljs 语言 (${inNeither.length}) ---\n${inNeither.join(" ")}`);
})();
