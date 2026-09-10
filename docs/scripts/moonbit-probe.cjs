// 诊断：为什么 highlightAuto 老是选 moonbit？是否由 third-languages.js 引入？
const vm = require("node:vm");
const fs = require("node:fs");
const DIR = "D:/CodeProjects/siyuan/app/stage/protyle/js/highlight.js/";

function load(extra) {
  const sandbox = { window: {}, self: {}, console };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  const files = extra ? ["highlight.min.js", extra] : ["highlight.min.js"];
  for (const f of files) {
    vm.runInContext(fs.readFileSync(DIR + f, "utf8"), sandbox, { filename: f });
  }
  return sandbox.hljs || sandbox.window.hljs;
}

const SAMPLES = {
  "纯英文散文": "Hello world, this is just ordinary english prose written by a human being. " +
    "It contains no code at all, only sentences and paragraphs and words. ".repeat(3),
  "Rust 代码": fs.readFileSync(
    "C:/Users/Admin/zed-src/.betlang-src/x/betlang-0.1.1/tests/fixtures/languages/rust.rs", "utf8"),
  "Python 代码": fs.readFileSync(
    "C:/Users/Admin/zed-src/.betlang-src/x/betlang-0.1.1/tests/fixtures/languages/python.py", "utf8"),
  "Go 代码": fs.readFileSync(
    "C:/Users/Admin/zed-src/.betlang-src/x/betlang-0.1.1/tests/fixtures/languages/go.go", "utf8"),
};

for (const withThird of [false, true]) {
  const hljs = load(withThird ? "third-languages.js" : null);
  console.log(`\n===== ${withThird ? "含" : "不含"} third-languages.js（语言数 ${hljs.listLanguages().length}） =====`);
  console.log(`moonbit 是否注册: ${!!hljs.getLanguage("moonbit")}`);
  for (const [name, code] of Object.entries(SAMPLES)) {
    const r = hljs.highlightAuto(code);
    console.log(
      `${name.padEnd(10)} -> ${String(r.language).padEnd(12)} relevance=${r.relevance}` +
      `  第二名=${r.secondBest?.language}(${r.secondBest?.relevance})`,
    );
  }
  // moonbit 语法本身长什么样
  const mb = hljs.getLanguage("moonbit");
  if (mb) {
    console.log("moonbit 语法: name=" + mb.name + " relevance=" + mb.relevance +
      " keywords=" + JSON.stringify(Object.keys(mb.keywords ?? {})) +
      " 关键字数=" + Object.values(mb.keywords ?? {}).flat().length);
  }
}
