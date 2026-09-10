# SiYuan 代码块语言自动识别插件（code-recognition）交接文档

> 面向接手实现的 AI / 开发者。**请先读完本目录再动手，不要重新做调研。**
> 文档里所有“实测”数据都在本机产生，原始脚本和输出见 `07-实测数据与复现.md`。

## 一句话结论

用 **betlang**（Rust，47 KB 模型，编译成 wasm 跑在渲染进程）做主力识别引擎，
配合一张关键词规则表兜底长尾语言。**不要用 Magika**（3 MB 模型 + tfjs，实测慢 2 个数量级）。

## 目标

在 SiYuan 里实现“代码块语言自动识别”：

1. 用户把代码粘进（或第一次输入到）一个**没有指定语言**的代码块时，自动识别语言并设置；
2. 识别目标语言的取值范围 = SiYuan 已加载的 highlight.js 语言集合；
3. 速度优先，单次识别不能阻塞输入；
4. 用户手动选过的语言永远不被覆盖。

## 当前状态

| 项 | 值 |
|---|---|
| 插件目录 | `D:\Admin\Desktop\测试空间\data\plugins\code-recognition` |
| 仓库 | https://github.com/TCOTC/code-recognition |
| 插件名 / 作者 | `code-recognition` / Jeffrey Chen (TCOTC) |
| 脚手架来源 | SiYuan 官方 plugin-sample 模板（已改过 plugin.json） |
| `plugin.json` 当前值 | version `1.0.0`，minAppVersion `3.7.0`，displayName/description 还是占位符 |
| 现有代码 | 只有 `src/index.ts`（约 40 行样板，onload/onLayoutReady/onunload/uninstall） |
| `README.md` / `README.zh-CN.md` | **空文件**（0 字节），发布前必须写 |
| 开发用 SiYuan 源码 | `D:\CodeProjects\siyuan`，v3.8.4-alpha.4（commit 88712665，2026-09-09） |
| 测试工作空间 | `D:\Admin\Desktop\测试空间` |
| 同工作空间内已有相关插件 | `code-languages`（同作者，改语言列表/排序，已占用 `code-language-update`、`code-language-change` 两个事件） |

## 已确定的核心决策

1. **引擎选 betlang**，理由和实测数据见 `03-识别引擎选型.md`。
2. **识别范围分层**：betlang 覆盖 46 种 hljs 语言（主流语言）；剩下 155 种用关键词规则表兜底（见 `06-插件设计方案.md`）。
3. **只在“无语言”的代码块上自动设置**，等价于 Zed 的 opt-in 语义；用户手选后不再自动改。
4. **wasm 跑在渲染进程**，不走 kernel RPC。

## 文档导航

| 文件 | 内容 |
|---|---|
| `01-需求与约束.md` | 目标、目标环境、语言范围、性能指标、非目标、成功标准 |
| `02-Zed实现调研.md` | Zed 的同功能实现全链路（源码级，含文件行号），可直接照抄的策略 |
| `03-识别引擎选型.md` | betlang / Magika / hljs highlightAuto 三者实测对比与结论 |
| `04-betlang集成规格.md` | betlang 模型与算法细节、wasm 构建方式、包装代码、许可证 |
| `05-SiYuan插件接口.md` | 插件结构、生命周期、可用事件（含 paste 钩子）、读写代码块语言的确切 API |
| `06-插件设计方案.md` | 建议的实现架构、触发点、语言映射表、阈值、配置项、边界情况 |
| `07-实测数据与复现.md` | 全部基准数据 + 复现脚本与命令 |
| `08-待办与风险.md` | 未验证项、风险、开放问题、建议的里程碑 |
| `appendix/数据附录.md` | hljs 201 语言全表、betlang 48 标签、映射表、覆盖率交集 |
| `scripts/` | 本机跑过的基准脚本（Node，可直接 `node xxx.mjs` 复跑） |

## 关键数据速查

| 指标 | betlang | Magika (npm) | hljs highlightAuto |
|---|---|---|---|
| 模型体积 | 47,840 B（编进二进制） | 3,138,239 B（运行时联网拉取） | — |
| 单次耗时（本机实测） | 原生 ~3ms（官方发布数据；wasm 待实测） | 3.4–4.8 **秒**（Node tfjs CPU 后端） | 19.5 ms / 338B，176 ms / 7KB |
| 覆盖 SiYuan 的 201 种语言 | 46（22.9%） | 66（32.8%） | 201（100%，但准确率差） |
| 输出标签数 | 48（都是源码语言） | 214（含二进制/文档格式） | — |
| 是否需要网络 | 否 | 是（除非自托管模型） | 否 |

补充：**不要把 `hljs.highlightAuto` 当长尾兜底**。在 103 个真实长尾文件上实测
只有 14.6%（201 语言全量），且 SiYuan 的 `third-languages.js` 引入的 `moonbit` 语法
会把 Rust / Python / Go 判成 MoonBit。同样语料下关键词规则表是 61.2%、快 400 倍。
详见 `03-识别引擎选型.md` 第 8 节。

## 证据等级说明（重要）

文档中的结论分三类，实现时请区别对待：

- **【实测】**：本机跑出来的数字，脚本在 `scripts/`，可复现。例如 Magika 的耗时、hljs highlightAuto 的耗时、语言覆盖率。
- **【源码】**：直接读源码得到的事实。例如 Zed 的实现细节、SiYuan 的插件 API、hljs 的语言列表。
- **【引用】**：来自第三方文档/模型卡，未在本机验证。例如 betlang 的 3 ms 耗时、0.942 准确率。
- **【待验证】**：需要接手者实际跑一遍确认的。见 `08-待办与风险.md`。

## 建议的实施顺序

1. 先做 wasm 可行性验证（装 Rust → 编 betlang → 在 SiYuan 里跑通一次检测），见 `04-betlang集成规格.md`。
2. 再接通 SiYuan 的 paste 钩子与代码块语言写入，见 `05-SiYuan插件接口.md`。
3. 然后补规则表兜底和设置界面，见 `06-插件设计方案.md`。
4. 最后写 README、i18n、图标、发布流程。
