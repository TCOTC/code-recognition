# 02 Zed 的同功能实现调研（源码级）

Zed 在 2026-08 上线的功能：“When you type or paste code into an untitled buffer,
Zed now detects its language automatically.” 本项目的策略层可以直接照抄它。

## 0. 源码位置

| 项 | 值 |
|---|---|
| 本地副本 | `C:\Users\Admin\zed-src`（浅克隆） |
| commit | `52b2927a1bac46be5d50ad341ac00b665e13764b`（2026-09-09） |
| 相关 PR | [#61201](https://github.com/zed-industries/zed/pull/61201)（2026-07-20 合并）→ [#61351](https://github.com/zed-industries/zed/pull/61351)（同日回滚）→ [#61412](https://github.com/zed-industries/zed/pull/61412)（2026-08-28 合并，当前实现） |
| 更早的废弃方案 | [#52718](https://github.com/zed-industries/zed/pull/52718)（基于 tree-sitter 语法打分，未合并，代码里已无痕迹） |

回滚原因值得注意：最早的版本会覆盖用户/其他面板指定的语言，于是重新设计了
“buffer 级 opt-in 标志”才被接受。

## 1. 调用链总览

```
任意编辑（打字 / 粘贴 / 批量替换）
  └─ multi_buffer::Event::Edited
       └─ Editor::on_buffer_event                 crates/editor/src/editor.rs:10012
            └─ Editor::detect_buffer_language     crates/editor/src/editor.rs:11308
                 ├─ 资格判定 is_eligible_for_language_detection   :11302
                 ├─ 200ms 防抖（替换 Task 即取消旧任务）
                 ├─ detect_language                crates/language_detection/src/language_detection.rs:62
                 │     ├─ extract_sample（头 4KB + 尾 4KB）        :121
                 │     ├─ betlang::detect（CNN 推理）
                 │     └─ 置信度分组过滤 + 当前语言迟滞 + 查语言注册表
                 └─ 版本校验后 buffer.set_language(...)
```

## 2. 触发时机与防抖

`crates/editor/src/editor.rs:304`

```rust
const MIN_LANGUAGE_DETECTION_LEN: usize = 20;
const LANGUAGE_DETECTION_DEBOUNCE_TIMEOUT: Duration = Duration::from_millis(200);
```

`crates/editor/src/editor.rs:11302`

```rust
fn is_eligible_for_language_detection(buffer: &Buffer) -> bool {
    buffer.file().is_none()                           // 只处理“未命名缓冲区”
        && buffer.content_language_detection_enabled() // opt-in 标志
        && buffer.len() >= MIN_LANGUAGE_DETECTION_LEN  // 至少 20 字节
}
```

`crates/editor/src/editor.rs:11308`（节选）

```rust
fn detect_buffer_language(&mut self, buffer_id: BufferId, cx: &mut Context<Self>) {
    self.language_detection_task = Task::ready(());   // 丢弃旧任务 = 取消，实现防抖
    if !EditorSettings::get_global(cx).language_detection {
        return;
    }
    // ... 取 buffer、再判一次资格 ...
    self.language_detection_task = cx.spawn(async move |_, cx| {
        cx.background_executor()
            .timer(LANGUAGE_DETECTION_DEBOUNCE_TIMEOUT)   // 200 ms
            .await;
        // 定时器到期后重新取快照并**再判一次**资格（可能已被用户关闭或加长）
        let Some((buffer_snapshot, language_registry)) = /* ... */ else { return; };
        let buffer_version = buffer_snapshot.version().clone();
        let detected_language =
            cx.update(|cx| detect_language(buffer_snapshot, language_registry, cx));
        if let Some(detected_language) = detected_language.await {
            buffer_entity.update(cx, |buffer, cx| {
                // 推理期间内容变了就丢弃结果
                if !buffer.version().changed_since(&buffer_version)
                    && Self::is_eligible_for_language_detection(buffer)
                {
                    buffer.set_language(Some(detected_language), cx);
                }
            });
        }
    });
}
```

三个值得照抄的点：

1. **防抖靠取消任务实现**（Rust 里 drop Task 即取消）。在 JS 里对应 `clearTimeout` + 重新 `setTimeout`。
2. **推理前重判资格**，避免“用户刚手动选完语言，旧任务又把语言改回去”。
3. **推理后校验快照版本**，避免用过期内容的结果覆盖新内容。

## 3. 采样策略

`crates/language_detection/src/language_detection.rs:121`

```rust
const SAMPLE_BLOCK_SIZE: usize = 4096;

fn extract_sample(buffer: &BufferSnapshot) -> Vec<u8> {
    let source_length = buffer.len();
    let ranges = if source_length <= SAMPLE_BLOCK_SIZE * 2 {
        vec![0..source_length]
    } else {
        vec![
            0..SAMPLE_BLOCK_SIZE,
            source_length - SAMPLE_BLOCK_SIZE..source_length,
        ]
    };
    ranges.into_iter()
        .flat_map(|range| buffer.bytes_in_range(range))
        .flat_map(|chunk| chunk.iter().copied())
        .collect()
}
```

超过 8 KB 就只取开头 4 KB + 结尾 4 KB。对笔记软件同样适用：代码块可能很长，
而语言特征基本都在头部（import / package / 语法关键字）。

## 4. 决策逻辑（最有价值的部分）

`crates/language_detection/src/language_detection.rs:5`

```rust
const SAMPLE_BLOCK_SIZE: usize = 4096;
const MIN_LANGUAGE_DETECTION_CONFIDENCE: f32 = 0.2;      // 候选最低置信度
const MIN_LANGUAGE_DETECTION_CONFIDENCE_GAP: f32 = 0.2;  // 分组之间的“明显落差”
const MIN_LANGUAGE_SWITCH_CONFIDENCE_GAP: f32 = 0.5;     // 改语言所需的领先优势
```

`crates/language_detection/src/language_detection.rs:62`（核心，建议逐行读懂）

```rust
let detection = betlang::detect(source);
let (mut pending_languages, mut confirmed_languages) = (Vec::new(), Vec::new());
// As in VS Code, retain only high-confidence candidate groups followed by a clear confidence gap.
for (score, language) in detection.top_languages() {
    if pending_languages.last().is_some_and(|(previous_score, _)| {
        *previous_score - score >= MIN_LANGUAGE_DETECTION_CONFIDENCE_GAP
    }) {
        confirmed_languages.append(&mut pending_languages);
    }
    if score < MIN_LANGUAGE_DETECTION_CONFIDENCE {
        break;
    }
    pending_languages.push((score, language));
}
// 只接受“后面出现了 >=0.2 落差”的分组，最后一组天然被丢弃，
// 等价于要求 top-1 必须领先其他候选至少 0.2 才承认。
let detected_language = confirmed_languages.into_iter()
    .find_map(|(score, model_language)| {
        language_registry
            .available_language_for_name(language_registry_key(model_language)?)
            .map(|language| (score, language))   // 取第一个“本编辑器真的支持”的候选
    });
let Some((score, language)) = detected_language else { return None; };
if current_language_name == Some(language.name()) {
    return None;                                  // 和当前语言相同，不折腾
}
let current_language_score = /* 在当前候选表里找“当前语言”的分数 */;
// 除非新候选有明确优势（>0.5），否则保持当前语言
if current_language_score.is_some_and(|current_score| {
    score <= current_score + MIN_LANGUAGE_SWITCH_CONFIDENCE_GAP
}) {
    return None;
}
```

策略要点：

- **不是简单取 top-1**：先过 0.2 的置信度门槛，再看 0.2 的分组落差。
- **候选必须“本编辑器支持”才采纳**，否则顺延到下一个候选。对我们很重要：hljs 不认识的标签要跳过。
- **切换有迟滞**：新语言必须比当前语言高 0.5 才改，避免编辑过程中语言来回跳。
- **初始语言（Plain Text）不在模型标签集里**，所以第一次识别不会触发迟滞逻辑，能顺利设上语言。

## 5. opt-in 标志的生命周期（防覆盖的关键）

`crates/language/src/buffer.rs:119` / `:1540`

```rust
content_language_detection_enabled: bool,   // 默认 false（buffer.rs:1176）

pub fn set_content_language_detection_enabled(&mut self, enabled: bool) { ... }
pub fn content_language_detection_enabled(&self) -> bool { ... }
```

置 `true` 的位置（只有这些）：

| 场景 | 位置 |
|---|---|
| 新建无标题编辑器 | `crates/editor/src/editor.rs:2982` |
| 分屏新建文件 | `crates/editor/src/editor.rs:3032` |
| 启动时的空标签页 | `crates/zed/src/zed.rs:2428` |
| 从数据库恢复、且未持久化语言的 untitled buffer | `crates/editor/src/items.rs:1330`、`:1454` |

置 `false` 的位置：

| 场景 | 位置 |
|---|---|
| 用户从语言选择器手动选语言 | `crates/project/src/project.rs:4166`（`set_language_for_buffer`） |
| 语言由文件路径/扩展名/modeline 推断出来 | `crates/project/src/lsp_store.rs:5579` |

注意：**自动识别设置语言时不会关掉这个标志**（直接调 `buffer.set_language(...)`），
所以自动识别出来的语言仍可在后续编辑中被再次改写，而手动选择就锁死了。

## 6. 热退出（hot exit）的持久化技巧

`crates/editor/src/items.rs:1510`

```rust
let content_language_detection_enabled = buffer.read(cx).content_language_detection_enabled();
let language = snapshot.language().and_then(|language| {
    if content_language_detection_enabled && *language == *PLAIN_TEXT {
        None                       // 还是 Plain Text 就不存语言，恢复后继续自动识别
    } else {
        Some(language.name().to_string())
    }
});
```

即：**没有识别出结果 = 不写盘**；一旦识别出了语言就当作“已确定”，恢复后不再自动改。

## 7. 模型标签 → 编辑器语言名的映射

`crates/language_detection/src/language_detection.rs:10`

```rust
fn language_registry_key(language: betlang::Language) -> Option<&'static str> {
    let language_name = match language {
        betlang::Language::Gemfile  => "Ruby",
        betlang::Language::Gemspec  => "Ruby",
        betlang::Language::Gradle   => "Groovy",
        betlang::Language::Verilog  => "SystemVerilog",
        betlang::Language::Shell    => "Shell Script",
        betlang::Language::Cs       => "CSharp",
        // ... 其余多为同名
        _ => return None,          // batch / lisp / vba 等在 Zed 里没有对应项，直接丢弃
    };
    Some(language_name)
}
```

启示一致：**模型标签集和实际需要的语言集不重合，必须有映射表，
并且映射不到的候选要能顺延到下一个**。

## 8. 配置项

| 项 | 值 |
|---|---|
| 名称 | `editor.language_detection` |
| 默认值 | `true`（`assets/settings/default.json:421`） |
| 文档字符串 | “Whether to automatically detect the language of an untitled buffer from its contents. Languages explicitly selected from the language selector are not changed.”（`crates/settings_content/src/editor.rs:174`） |
| 读取处 | `crates/editor/src/editor_settings.rs:55` / `:316` |

## 9. 性能数据（来自 PR 描述，非本机实测）

> In release builds on Linux with an Intel Core i5-13600KF, the `betlang::detect` call
> alone typically completes within 3 ms when processing the maximum sampled input.

这是把 betlang 用作主力引擎的核心理由。

## 10. 已知问题（作者自己承认的）

PR #61412 描述里专门讨论了 Markdown / YAML 歧义：

> In the reproduction from #61351, Betlang assigns YAML more than 80% confidence during
> editing and peaks around 90%. This is reasonable from the content alone: `#` denotes a
> YAML comment, while `-` denotes a sequence item. Adding ordinary prose or a fenced code
> block shifts the model strongly toward Markdown. A fixed penalty would overfit this
> example and risk suppressing legitimate YAML detection.

结论：**不要为这一个歧义点做语言特化调参**。笔记软件里更稳妥的做法是
“内容看起来像纯列表就不检测”（见 `06-插件设计方案.md`）。
