# 基准语料：betlang 的语言样本

本目录存档 `betlang 0.1.1` 自带的测试语料，是 `../bench.mjs`、`../hljs-auto.cjs`、
`../moonbit-probe.cjs` 的输入。

| 项 | 值 |
|---|---|
| 来源 | `betlang` 0.1.1 crate 内的 `tests/fixtures/languages/`（48 个文件，17,779 字节） |
| 获取方式 | `https://crates.io/api/v1/crates/betlang/0.1.1/download` 解包，或 `cargo add betlang@0.1.1` 后取 registry 缓存里的 `.crate` |
| 许可 | MIT（betlang 源码）；随附模型蒸馏自 Google Magika，Apache-2.0。见仓库根目录 `THIRD_PARTY-betlang-LICENSE`、`THIRD_PARTY-Magika-LICENSE` |
| 存档时间 | 2026-10-16 |
| 存档原因 | 原先只存在于本机解包副本 `C:\Users\Admin\zed-src\.betlang-src\x\betlang-0.1.1\`；该 638 MB 的 Zed 源码浅克隆已于同日删除，故把语料随插件存档 |

文件名形如 `rust.rs`、`python.py`；`Gemfile`、`gemspec.gemspec` 等无扩展名样本也在其中。
「文件名 → 期望 Magika 标签」的映射写在 `../bench.mjs` 的 `EXPECTED` 常量里。

注意：这是 **betlang 自己的测试集**，对 betlang 有利，其准确率数字不能当作模型对比结论
（详见 `../../07-实测数据与复现.md` 第 4 节）。
