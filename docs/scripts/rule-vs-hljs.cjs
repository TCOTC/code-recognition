// 对照：同一批长尾语料上，关键词规则表 vs hljs.highlightAuto
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
const AVAILABLE = new Set(hljs.listLanguages());

// 规则表：每种语言若干条独立特征，命中计 1 分（同一特征重复命中只算一次）
const RULES = {
  protobuf: [
    /\bsyntax\s*=\s*"proto[23]"\s*;/,
    /\b(?:message|enum|service|rpc|oneof|extend)\s+\w+/,
    /\b(?:repeated|optional|required)\s+[\w.<>]+/,
    /^\s*option\s+\w+\s*=/m,
  ],
  wasm: [
    /^\s*\(\s*(?:module|func|memory|table|type|import|export)\b/m,
    /\(:\w+\.\w+/,
    /\(local\.|\bi32\.|\bi64\.|\bf32\./,
    /^\s*\((?:param|result|local|global)\b/m,
  ],
  scss: [
    /\$[\w-]+\s*:/,
    /@(?:mixin|include|extend|use|forward|if|each|function)\b/,
    /&(?:__|--|:(?:hover|focus|active|disabled))\b/,
    /%\w+\s*\{/,
  ],
  tcl: [
    /^\s*proc\s+[\w:]+/m,
    /\b(?:puts|llength|lindex|lappend|expr|foreach|catch)\b/,
    /\$\{?[A-Za-z_]\w*\}?/,
    /\[\s*(?:expr|string|list|llength|lindex)\b/,
  ],
  awk: [
    /^\s*(?:BEGIN|END)\s*\{/m,
    /\b(?:printf?|split|substr|gsub|sub|length|NF|NR|FS|OFS)\b/,
    /\$[0-9NF]\b/,
    /^\s*#!.*\bawk\b/m,
  ],
  diff: [
    /^diff --git /m,
    /^@@\s+-\d+/m,
    /^(?:---|\+\+\+)\s+\S+/m,
    /^[+-][^+-]/m,
  ],
  handlebars: [
    /\{\{[#/>]?\w[\w.]*/,
    /\{\{\/[\w.]+\}\}/,
    /\{\{\s*(?:else|each|if|unless|with)\b/,
    /\{\{\{/,
  ],
  erb: [
    /<%[-=]?/,
    /%>/,
    /<%=?\s*(?:if|each|end|else|link_to|render)\b/,
  ],
  vim: [
    /^\s*(?:set|setlocal|let|map|nnoremap|vnoremap|inoremap|autocmd|command!?|function!?|augroup)\b/m,
    /^\s*"\s/m,
    /<(?:CR|Esc|Leader|silent|buffer)>/i,
    /\b(?:g:|s:|b:|w:|a:)\w+/,
  ],
  graphql: [
    /\b(?:type|query|mutation|subscription|fragment|scalar|interface|input|enum|union)\s+[A-Z]\w*\s*[{(:]/,
    /\bextend\s+type\b/,
    /^\s*schema\s*\{/m,
  ],
  coffeescript: [
    /->|=>/,
    /^\s*(?:class|extends|super)\b/m,
    /\b(?:isnt|unless|until|then)\b/,
    /^\s*@\w+\s*=/m,
  ],
};

const truthOf = (code, lang) => {
  let best = null, second = 0;
  for (const [name, rules] of Object.entries(RULES)) {
    if (!AVAILABLE.has(name)) continue;
    let score = 0;
    for (const re of rules) if (re.test(code)) score++;
    if (!best || score > best.score) { second = best ? best.score : 0; best = { name, score }; }
    else if (score > second) second = score;
  }
  if (!best || best.score < 2) return null;
  if (best.score - second < 1) return null;   // 必须领先第二名
  return best.name;
};

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

const pad = (s, n) => String(s).padEnd(n);
console.log(pad("语言", 14) + pad("样本", 6) + pad("规则表", 10) + pad("规则表耗时", 12) + "highlightAuto(201)");
let ruleOk = 0, hljsOk = 0, total = 0, ruleMs = 0, hljsMs = 0;

for (const { ext, lang } of CASES) {
  const files = collect(ext);
  let rOk = 0, hOk = 0;
  for (const f of files) {
    let code;
    try { code = fs.readFileSync(f, "utf8").slice(0, SIZE); } catch { continue; }
    if (code.trim().length < 20) continue;
    total++;

    let t0 = performance.now();
    const guess = truthOf(code, lang);
    ruleMs += performance.now() - t0;
    if (guess === lang) { rOk++; ruleOk++; }

    t0 = performance.now();
    const h = hljs.highlightAuto(code);
    hljsMs += performance.now() - t0;
    if (h.language === lang) { hOk++; hljsOk++; }
  }
  console.log(
    pad(lang, 14) + pad(files.length, 6) + pad(`${rOk}/${files.length}`, 10) +
    pad("", 12) + `${hOk}/${files.length}`,
  );
}
console.log(
  `\n合计 ${total} 个文件（每个取前 ${SIZE} 字节）\n` +
  `规则表        : ${(ruleOk / total * 100).toFixed(1)}%  ${(ruleMs / total).toFixed(3)} ms/次\n` +
  `highlightAuto : ${(hljsOk / total * 100).toFixed(1)}%  ${(hljsMs / total).toFixed(1)} ms/次`,
);
