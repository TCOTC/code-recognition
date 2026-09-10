# 04 betlang 集成规格

## 1. 基本信息

| 项 | 值 |
|---|---|
| crate | `betlang` |
| 版本 | `0.1.1`（Zed 的 `Cargo.toml:566` 锁的就是这个版本） |
| 上游 | https://github.com/ealmloff/betlang |
| 作者 | ealmloff（Dioxus 开发者） |
| 许可 | **MIT**（源码）；嵌入的模型权重蒸馏自 Google Magika，**Apache-2.0，必须保留归属** |
| edition / MSRV | edition 2024 / rust-version 1.88 |
| 依赖 | 只有 `fearless_simd = "0.4"` |
| 下载 | `cargo add betlang@0.1.1`，或 <https://crates.io/api/v1/crates/betlang/0.1.1/download> |
| 本机解包副本 | `C:\Users\Admin\zed-src\.betlang-src\x\betlang-0.1.1\` |

## 2. 公开 API（就三个东西）

```rust
pub fn detect(source: impl AsRef<[u8]>) -> Detection;

impl Detection {
    /// 最可能的语言；输入为空 / 全空白 / 太短时返回 None
    pub fn language(&self) -> Option<Language>;
    /// 按概率从高到低迭代全部 48 个标签
    pub fn top_languages(&self) -> impl Iterator<Item = (f32, Language)> + '_;
}

impl Language {
    pub fn slug(&self) -> &'static str;         // "rust" / "python" / ...
    // 实现 FromStr，"rust".parse::<Language>() 可用
}
```

48 个标签（`slug` 名，与模型输出一一对应，不做任何聚合）：

```
asm batch c clojure cmake cobol cpp cs css dart dockerfile elixir erlang gemfile
gemspec go gradle groovy haskell html ini java javascript json julia kotlin lisp
lua markdown objectivec ocaml perl php powershell python r ruby rust scala shell
sql swift toml typescript vba verilog xml yaml
```

## 3. 内部行为（决定你的调用方式）

### 3.1 输入窗口

`src/model/window.rs` 与 `src/model/constants.rs`：

```rust
const MAGIKA_BEG_SIZE: usize = 1_024;
const MAGIKA_END_SIZE: usize = 1_024;
const MAGIKA_WINDOW_SIZE: usize = 2_048;   // beg + end
const MAGIKA_BLOCK_SIZE: usize = 4_096;
```

`build_window(source)` 的行为：

1. 输入为空 → 返回 `None`（不检测）；
2. 取 `source[..min(len, 4096)]`，去掉行首空白，如果剩余不足 **8 字节** → 返回 `None`；
3. 取 `source[len-4096..]`（不足则整体），去掉行尾空白；
4. 拼成「前 1024 B + 后 1024 B」的窗口（短输入只保留前段）。

推论：

- 传入超过 8 KB 的内容没有意义，betlang 只使用开头 4 KB 与结尾 4 KB 的窗口；
- 纯空白、或少于 8 个非空白字节的输入会直接返回空结果，调用方要当作“未识别”；
- 因为窗口是「头 1 KB + 尾 1 KB」，**代码块开头的 import / package / 关键字最关键**。

### 3.2 分词（word-unit tokenizer v3）

`src/model/tokenizer.rs`：一次线性扫描。

- 连续字母/下划线 → 一个 word（大小写折叠后哈希到 1024 个 bin）；
- 连续数字 → number（独立 flag 位）；
- 其他可打印字符 → punct（独立 flag 位）；
- `( ) [ ] { }` → 6 个固定 bracket token；
- 行首缩进量 → 压缩成一个 indent token（空格算 1、Tab 算 4，上限 63）；
- 最多 2048 个 token。

### 3.3 模型

`src/model.rs` 头部注释（原文）：

```
Model architecture: wordseq-b1024-k3-m2048-tiny-3conv-hidden
- 1024-bin x 24-dim shared HashEmbedding table (4-bit, ~12 KB)
- QConv1D k=7 24->64ch (2-bit ternary)
- MaxPool(4)
- QConv1D k=5 64->128ch (2-bit)
- MaxPool(2)
- QConv1D k=3 128->128ch (2-bit)
- GlobalMax + GlobalAvg -> 256-dim
- QDense 256->96 (2-bit) + GELU
- QDense 96->48 (4-bit)
```

- 权重文件 `assets/magika/source-student-q4.bin`，**47,840 字节**，
  通过 `include_bytes!` 编进二进制（`src/model/embedded.rs`），运行时零 IO。
- SHA-256：`8493d2d3757572c8661141e414b1c0755aa08d4c4e5382dfbbc6b73b02d89083`
- 模型用 `OnceLock` 只加载/反量化一次，之后复用。
- SIMD 通过 `fearless_simd` 的 `dispatch!` 分派。

### 3.4 wasm 可行性（关键）

【源码】非测试代码里的全部 `use`：

```
std::{error::Error, fmt, str::FromStr, ops::Range, sync::OnceLock}
```

没有 `fs` / `thread` / `time` / `net` / `Mutex`。`fs` 和 `rand` 只出现在 `#[cfg(test)]` 模块里。

【源码】依赖 `fearless_simd 0.4` 明确支持 wasm32，有两条路径：

- `target_arch = "wasm32"` 且 `target_feature = "simd128"` → `Level::WasmSimd128`；
- `target_arch = "wasm32"` 且无 simd128 → `Level::Fallback`（标量实现，能编译能跑，只是慢）。

【源码】betlang 上游 CI 有专门的 wasm 任务（`.github/workflows/ci.yml`）：

```yaml
check-wasm:
  name: Check (wasm32)
  steps:
    - uses: dioxuslabs/dioxus-ci/actions/setup-dioxus@v0.1.0
      with: { targets: wasm32-unknown-unknown }
    - run: cargo check --workspace --all-features --target wasm32-unknown-unknown
```

结论：**可以编 wasm**。但【待验证】：本机没有 Rust 工具链，还没真编过。

## 4. 构建 wasm

### 4.1 前置

```powershell
winget install Rustlang.Rustup
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli     # wasm-bindgen 方案
# 或者用 wasm-pack：cargo install wasm-pack
```

注意：本机当前**没有** `cargo` / `rustc` / `rustup`（`C:\Users\Admin\.cargo` 不存在）。
编 wasm 不需要 MSVC 链接器（只 build wasm target，不 build 宿主目标）。

### 4.2 Rust 侧包装（wasm-bindgen 方案，推荐）

`wasm-detector/Cargo.toml`：

```toml
[package]
name = "betlang-wasm"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
betlang = "0.1.1"
wasm-bindgen = "0.2"

[profile.release]
opt-level = "s"
lto = true
```

`wasm-detector/src/lib.rs`：

```rust
use wasm_bindgen::prelude::*;

/// 返回 48 个标签的分数，交给 JS 侧做过滤与映射，
/// 这样调整阈值策略不需要重新编译 wasm。
#[wasm_bindgen]
pub fn detect_scores(source: &[u8]) -> Vec<f32> {
    let detection = betlang::detect(source);
    let mut out = vec![0.0f32; 48];
    let mut seen = 0usize;
    for (score, language) in detection.top_languages() {
        out[language_index(language)] = score;
        seen += 1;
    }
    if seen == 0 {
        return Vec::new(); // 输入太短或全空白
    }
    out
}

/// 便捷版：直接给 top-1 的 slug
#[wasm_bindgen]
pub fn detect_language(source: &[u8]) -> Option<String> {
    betlang::detect(source).language().map(|l| l.slug().to_string())
}
```

注意：`betlang::Language` 是 `#[non_exhaustive]` 枚举，没有公开的 `ALL` 数组。
写 `language_index()` 时用 48 个分支的 `match`，
或用上游的 `examples/detect.rs` 打印一次对照表，把顺序固化到 TS 常量里。
**无论哪种方式，必须保证 wasm 输出顺序与 TS 侧映射表一致。**

### 4.3 构建命令

```powershell
cd wasm-detector
cargo build --release --target wasm32-unknown-unknown
# SIMD 版本（需要浏览器支持 wasm simd128）：
#   $env:RUSTFLAGS = "-C target-feature=+simd128"

wasm-bindgen --target web --out-dir ..\src\wasm `
  target\wasm32-unknown-unknown\release\betlang_wasm.wasm
# 或者：wasm-pack build --target web --release
```

产物放哪里：**必须放进插件的静态资源目录**。插件资源由内核按
`/plugins/<插件名>/...` 提供（`kernel/server/serve.go:471` 注册了 `plugins` 路由组，带鉴权）。
建议放 `src/wasm/`，并在 webpack 的 `CopyPlugin` 里加进去（见 `05-SiYuan插件接口.md` 第 6 节）。

### 4.4 JS 侧加载

```ts
// 不要依赖 import.meta.url：webpack 产物是 commonjs2，插件脚本也不是 ES module
const wasmUrl = "/plugins/code-recognition/wasm/betlang_wasm_bg.wasm";
const mod = await import(
  /* webpackIgnore: true */ "/plugins/code-recognition/wasm/betlang_wasm.js"
);
await mod.default(wasmUrl);              // wasm-bindgen --target web 的初始化约定
const scores = mod.detect_scores(bytes); // Float32Array
```

注意点：

- 插件运行在浏览器环境，`fetch` 同源、带 cookie，鉴权没问题；
- 移动端同样可用；
- 建议**懒加载**：第一次需要识别时才加载（SiYuan 自己也是用 `addScript` 懒加载 hljs 的）。

## 5. 体积与性能预期【待验证】

| 项 | 预期 | 依据 |
|---|---|---|
| wasm 模块 | 几十 ~ 200 KB | 模型 47 KB + Rust 代码与 std 机器码；建议 `opt-level="s"` + `lto` + `wasm-opt -Oz` |
| 首次实例化 | ≤ 100 ms | 单文件、无网络 |
| 单次 detect | 5–30 ms（SIMD 版更快） | 参照原生 ~3 ms；wasm 一般比原生慢 2–5 倍 |
| 常驻内存 | ≤ 2 MB | 推理 scratch 约 2048×24 个 f32 ≈ 200 KB 量级 |

这几个数字**必须实测后再写进最终文档**，测量方法见 `07-实测数据与复现.md` 第 5 节。

## 6. 许可证与归属（发布前必做）

- betlang 源码是 MIT：在插件仓库里保留其 LICENSE 文本，或在 README 注明。
- 模型权重派生自 Google Magika（Apache-2.0）：按 betlang README 的要求，
  **分发时必须保留 Magika 的归属说明**。
- 建议在 `README.md` / `README.zh-CN.md` 加一句：
  “Powered by betlang (MIT). The bundled model is distilled from Google Magika (Apache-2.0).”

## 7. 备选方案（如果 wasm 路线走不通）

| 方案 | 评价 |
|---|---|
| 编成 native 库，由 Go kernel 通过 cgo 调用 | 需要 staticlib + cgo 桥接，跨平台交叉编译复杂，移动端几乎不可行。不推荐 |
| 纯 JS 的规则表/关键词打分 | 完全可以只做这一层（见 `06-插件设计方案.md`），最快、零依赖，但歧义处理弱。可作为降级路径 |
| 换用 Magika npm | 慢两个数量级，见 `03-识别引擎选型.md`。除非放弃速度要求，否则不推荐 |
