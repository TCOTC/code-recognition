# 基准脚本

这些脚本是 `07-实测数据与复现.md` 里所有数字的来源，均在本机实际跑过。
它们**不属于插件运行时**，只是为了验证选型结论，需要时手动执行。

## 环境要求

- Node.js（本机 v25.9.0 验证通过）
- 只有 `bench.mjs` 需要依赖：`npm install magika@1.0.0`
- `coverage.cjs` 需要联网（读取 `https://google.github.io/magika/models/standard_v3_3/config.min.json`）

## 脚本说明

| 脚本 | 作用 | 约耗时 |
|---|---|---|
| `hljs-langs.cjs` | 加载 SiYuan 的 hljs，列出全部语言名，统计与 betlang 的交集 | < 1 s |
| `coverage.cjs` | 计算 hljs(201) / betlang(48) / Magika(214) 三者覆盖率与外差集 | < 2 s |
| `hljs-auto.cjs` | 实测 `highlightAuto` 在 201 语言全量 / 限定候选下的耗时 | < 3 s |
| `moonbit-probe.cjs` | 诊断 `highlightAuto` 的污染源（`third-languages.js` 的 moonbit 语法） | < 2 s |
| `fallback-eval.cjs` | 在真实长尾语料上评估 `highlightAuto` 的兜底准确率（逐条错例） | 约 3 min |
| `fallback-eval2.cjs` | 同上，对照 4 种候选集规模的准确率/耗时 | 约 3 min |
| `rule-vs-hljs.cjs` | 同一语料上：关键词规则表 vs `highlightAuto` | 约 3 min |
| `bench.mjs` | 在 betlang 的测试语料上跑 Magika，统计准确率与单次耗时 | 4–6 min |

## 路径依赖（跑之前按需改）

每个脚本顶部都有标注 `【按需修改】` 的常量：

| 脚本 | 常量 | 本机默认值 |
|---|---|---|
| `hljs-langs.cjs` / `coverage.cjs` / `hljs-auto.cjs` | `path` / `p` | `D:/CodeProjects/siyuan/app/stage/protyle/js/highlight.js/` |
| `bench.mjs` | `FIXTURES` | `C:/Users/Admin/zed-src/.betlang-src/x/betlang-0.1.1/tests/fixtures/languages` |
| `fallback-eval*.cjs` / `rule-vs-hljs.cjs` | `ROOTS` | `C:/Users/Admin/go/pkg/mod`、`D:/CodeProjects`、`C:/Users/Admin/.vscode/extensions`、`C:/Users/Admin/zed-src` |

## 运行示例

```powershell
cd docs\scripts
node hljs-langs.cjs
node coverage.cjs
node hljs-auto.cjs
node moonbit-probe.cjs
node fallback-eval2.cjs
node rule-vs-hljs.cjs

# bench.mjs 需要先装依赖（会在当前目录生成 node_modules）
npm install magika@1.0.0 --no-audit --no-fund
node bench.mjs
```

## 说明

- `hljs-*.cjs` 用 `node:vm` 在沙箱里执行 SiYuan 的 `highlight.min.js`，
  因为它是浏览器 UMD bundle，直接 `require` 会因为缺少 `window` 失败。
- `bench.mjs` 的语料是 **betlang 自己的测试集**，对 betlang 有利，
  其准确率数字**不能**当作两个模型的对比结论。详见 `../07-实测数据与复现.md` 第 4 节。
