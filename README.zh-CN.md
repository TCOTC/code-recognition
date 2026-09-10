# 代码块语言识别

使用快速、离线的本地模型自动识别思源代码块语言。

## 功能

* 在无语言代码块中粘贴，或在普通段落中粘贴并由思源生成一个或多个无语言代码块时自动识别
* 使用 betlang WASM 识别 46 种常用语言，并通过本地特征规则补充长尾语言
* 推理完全在本机进行，不会上传代码，也不需要网络
* 写入使用思源编辑器事务，可通过撤销操作恢复
* 自动识别只处理语言为空的代码块，不覆盖任何已有语言
* 提供“识别当前或选中代码块的语言”命令，混合选择时仅处理代码块及选中块内的子代码块
* 在块菜单中强制重新识别，支持混合选择并仅处理代码块及其子代码块
* 在文档标题块菜单中识别并设置整篇文档的代码块语言

## 使用

默认启用粘贴识别。将代码粘贴到无语言代码块，或粘贴后由思源生成无语言代码块时，插件会在后台识别并设置语言。

如果自动识别没有触发，可将光标放在代码块中，或选择包含代码块的一个或多个块，通过命令面板执行“识别当前或选中代码块的语言”。结果置信度不足时，插件会保持原样。

## 设置

* 启用插件
* 粘贴时识别

Markdown 与其他代码块语言使用相同的置信度判定。

## 开发

```sh
pnpm install
pnpm run typecheck
pnpm run test
pnpm run build
```

重新生成 WASM 需要 Rust 1.88 或更高版本、`wasm32-unknown-unknown` 目标，以及与 `wasm-detector/Cargo.toml` 相同版本的 `wasm-bindgen-cli`：

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.105 --locked
pnpm run build:wasm
```

生成的 `src/wasm/` 文件需要签入仓库，插件使用者不需要安装 Rust。

## 第三方组件

Powered by [betlang](https://github.com/ealmloff/betlang)（MIT）。随附模型由 [Google Magika](https://github.com/google/magika) 教师模型蒸馏而来（Apache-2.0）。完整许可文本见 `THIRD_PARTY-betlang-LICENSE` 和 `THIRD_PARTY-Magika-LICENSE`。

## 许可证

MIT
