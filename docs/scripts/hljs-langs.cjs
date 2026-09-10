// 枚举 SiYuan 实际加载的 highlight.js 语言列表，并统计 betlang 的覆盖情况。
// 运行：node hljs-langs.cjs
const path = "D:/CodeProjects/siyuan/app/stage/protyle/js/highlight.js/";
const vm = require("node:vm");
const fs = require("node:fs");

const sandbox = { window: {}, self: {}, console };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);

for (const file of ["highlight.min.js", "third-languages.js"]) {
  const code = fs.readFileSync(path + file, "utf8");
  vm.runInContext(code, sandbox, { filename: file });
}

const hljs = sandbox.hljs || sandbox.window.hljs;
const langs = hljs.listLanguages().sort();
console.log(`hljs version = ${hljs.versionString}`);
console.log(`total languages = ${langs.length}`);
console.log(langs.join(" "));

// betlang 的 48 个标签
const BETLANG = new Set([
  "asm", "batch", "c", "clojure", "cmake", "cobol", "cpp", "cs", "css", "dart",
  "dockerfile", "elixir", "erlang", "gemfile", "gemspec", "go", "gradle", "groovy",
  "haskell", "html", "ini", "java", "javascript", "json", "julia", "kotlin", "lisp",
  "lua", "markdown", "objectivec", "ocaml", "perl", "php", "powershell", "python",
  "r", "ruby", "rust", "scala", "shell", "sql", "swift", "toml", "typescript",
  "vba", "verilog", "xml", "yaml",
]);

// hljs 的叫法和 betlang 不完全一致，先把等价别名对齐
const ALIAS = {
  bash: "shell", sh: "shell", zsh: "shell", console: "shell", shell: "shell",
  csharp: "cs", "c#": "cs",
  cplusplus: "cpp", "c++": "cpp", cpp: "cpp",
  "objective-c": "objectivec", objectivec: "objectivec",
  vbnet: "vba", vbscript: "vba", vba: "vba", vb: "vba",
  python: "python", py: "python",
  golang: "go",
  ini: "ini", toml: "toml",
  // 注意：dns / properties 是 hljs 里 ini 家族的其他注册名，
  // 但 betlang 的 ini 标签只会输出成 hljs 的 "ini"，所以不计入覆盖。
  x86asm: "asm", armasm: "asm", asm: "asm", nasm: "asm",
  dos: "batch", bat: "batch", batch: "batch",
  plaintext: null, text: null,
};

const covered = [];
const missing = [];
for (const l of langs) {
  const mapped = ALIAS[l] === undefined ? l : ALIAS[l];
  if (mapped && BETLANG.has(mapped)) covered.push(l);
  else missing.push(l);
}

console.log(`\ncovered by betlang (after alias) = ${covered.length}`);
console.log(`NOT covered = ${missing.length}`);
console.log(missing.join(" "));

// hljs 里覆盖不到的，是否被 Magika 的标签空间覆盖
const MAGIKA_EXTRA = new Set([
  "graphql", "less", "scss", "sass", "stylus", "makefile", "diff", "patch",
  "protobuf", "nginx", "apache", "http", "sql", "twig", "handlebars", "django",
  "erb", "haml", "pug", "mustache", "livescript", "coffeescript", "fortran",
  "pascal", "delphi", "matlab", "mathematica", "sas", "stata", "labview",
  "mermaid", "plantuml", "wasm", "reasonml", "elm", "purescript", "javascript",
]);
const magikaOnly = missing.filter((l) => MAGIKA_EXTRA.has(l));
console.log(`\nof those, plausibly in Magika's 214 content types = ${magikaOnly.length}`);
console.log(magikaOnly.join(" "));
