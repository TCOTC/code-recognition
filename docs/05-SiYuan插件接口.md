# 05 SiYuan 插件接口（实现必读）

所有结论基于本机 SiYuan 源码 `D:\CodeProjects\siyuan`（v3.8.4-alpha.4）与
`siyuan@1.2.3` 的类型定义。

## 1. 目录结构与构建

当前插件目录（脚手架原样）：

```
code-recognition/
├─ plugin.json            插件元数据（集市读取）
├─ package.json           npm 脚本：dev / build / lint / format / typecheck
├─ webpack.config.js      打包配置（含 zip 打包）
├─ tsconfig.json
├─ icon.png               插件图标（1493 B，需替换）
├─ preview.png            集市预览图（12208 B，需替换）
├─ README.md              空文件，必须补
├─ README.zh-CN.md        空文件，必须补
└─ src/
   ├─ index.ts            入口（默认导出 Plugin 子类）
   ├─ index.scss          样式（当前为空）
   ├─ declarations.d.ts   scss 声明
   └─ i18n/{en,zh-CN}.json 文案（当前是空对象）
```

构建产物：

| 命令 | 输出 |
|---|---|
| `pnpm dev` | 根目录 `index.js` + `index.css`（watch，开发用；工作空间里的插件目录会被 SiYuan 直接加载） |
| `pnpm build` | `dist/index.js`、`dist/index.css`、`dist/i18n/`、`dist/plugin.json`、`dist/icon.png`、`dist/preview.png`、`dist/README*.md`，并打成 `package.zip` |

`webpack.config.js` 的 production 分支用 **白名单** 方式拷贝文件：

```js
new CopyPlugin({ patterns: [
    {from: "preview.png", to: "./dist/"},
    {from: "icon.png", to: "./dist/"},
    {from: "README*.md", to: "./dist/"},
    {from: "plugin.json", to: "./dist/"},
    {from: "src/i18n/", to: "./dist/i18n/"},
]})
```

> **新增任何静态资源（特别是 `.wasm`）都必须加进这个白名单**，否则 `package.zip` 里没有它。
> 例如：`{from: "src/wasm/", to: "./dist/wasm/"}`。

## 2. plugin.json

当前内容（注意 `displayName` / `description` 还是模板占位符，是乱码的“插件名称/插件描述”）：

```json
{
  "name": "code-recognition",
  "author": "Jeffrey Chen",
  "url": "https://github.com/TCOTC/code-recognition",
  "version": "1.0.0",
  "minAppVersion": "3.7.0",
  "backends": ["windows","linux","darwin","ios","android","harmony","docker","all"],
  "frontends": ["desktop","mobile","browser-desktop","browser-mobile","desktop-window","all"],
  "disabledInPublish": false,
  "displayName": {"default": "Plugin Name", "zh-CN": "插件名称"},
  "description": {"default": "Plugin Description", "zh-CN": "插件描述"},
  "readme": {"default": "README.md", "zh-CN": "README.zh-CN.md"},
  "funding": {"custom": ["https://mytemos.com/"]}
}
```

要点：

- `minAppVersion` 必须 ≥ `3.7.0`：本方案依赖 3.7.0 才有的 `paste` 事件和
  `code-language-update` / `code-language-change` 扩展点。**不要降低这个值。**
- 发布新版本必须递增 `version`，否则集市不会推送更新。
- `funding` 里的 `https://mytemos.com/` 是模板残留，确认后再决定是否保留。
- 已知的集市约定：发布走 GitHub Release，`package.zip` 是唯一产物
  （`.github/workflows/release.yml` 已经配好，tag 触发）。

## 3. Plugin 类的可用 API

`siyuan@1.2.3` 的 `Plugin` 基类（源码 `app/src/plugin/index.ts`）可用成员：

| 成员 | 说明 |
|---|---|
| `onload()` / `onunload()` / `uninstall()` / `onLayoutReady()` | 生命周期 |
| `onDataChanged(reason)` | 数据变更回调 |
| `this.eventBus` | 事件总线，`on` / `off` / `emit` / `once` |
| `this.loadData(name)` / `saveData(name, data)` / `removeData(name)` | 插件私有存储（存在 workspace 的 `data/storage/petal/<name>/` 下） |
| `this.addCommand(cmd)` | 注册命令（可绑快捷键、可出现在斜杠菜单） |
| `this.addTopBar(opts)` / `removeTopBar(id)` | 顶栏按钮 |
| `this.addToolbarItem(item)` / `removeToolbarItem(name)` | 编辑器工具栏按钮 |
| `this.addDock(opts)` / `addTab(opts)` / `addStatusBar(opts)` | 面板 / 自定义页签 / 状态栏 |
| `this.setting` | 插件设置面板（`new Setting({...})`，见 plugin-sample README） |
| `this.displayName` / `this.name` / `this.i18n` | 元信息 |

插件设置面板的完整用法见本机文件
`D:\Admin\Desktop\测试空间\data\plugins\plugin-sample\README.zh-CN.md`（官方模板自带，较长但权威）。

## 4. 事件系统（关键）

### 4.1 事件总表

`app/src/types/index.d.ts:102` 定义了全部 `TEventBus`：

```
ws-main | sync-start | sync-end | sync-fail
click-blockicon | click-editorcontent | click-pdf | click-editortitleicon | click-flashcard-action
open-noneditableblock
open-menu-blockref | open-menu-fileannotationref | open-menu-tag | open-menu-link | open-menu-image
open-menu-av | open-menu-content | open-menu-breadcrumbmore | open-menu-doctree | open-menu-inbox
open-siyuan-url-plugin | open-siyuan-url-block | open-asset | open-link | opened-notebook | closed-notebook
paste | before-upload-assets | before-search-results-render | input-search
loaded-protyle-dynamic | loaded-protyle-static | switch-protyle | switch-protyle-mode | destroy-protyle
lock-screen | mobile-keyboard-show | mobile-keyboard-hide
code-language-update | code-language-change | kernel-plugin-state-change
before-show-tooltip | before-hide-tooltip | common-menu-open | common-menu-closed
```

### 4.2 三个关键事件的载荷（来自 `siyuan@1.2.3` 的 `IEventBusMap`）

```ts
"paste": {
    protyle: IProtyle,
    resolve: <T>(value: T | PromiseLike<T>) => void,
    textHTML: string,
    textPlain: string,
    siyuanHTML: string,
    localFiles: { path: string, size: number }[],
    files: FileList | DataTransferItemList
};

"code-language-update": {
    languages: string[],                                // 可变：改它就能改下拉列表
    type: "init" | "match",
    listElement: HTMLElement,
    value: string
};

"code-language-change": {
    language: string,
    languageElements: HTMLElement[],
    protyle: IProtyle
};
```

### 4.3 `code-language-update`：往语言下拉框里插东西

发射点 `app/src/protyle/toolbar/index.ts:1943`（打开下拉时，type=`init`）与 `:2015`（输入过滤时，type=`match`）：

```ts
let hljsLanguages = Constants.ALIAS_CODE_LANGUAGES.concat(window.hljs?.listLanguages() ?? []).sort();
if (areProtylePluginExtensionsEnabled(protyle) && hasPluginSubscriber("code-language-update")) {
    const eventDetail = {languages: hljsLanguages, type: "init", listElement};
    emitToPlugins("code-language-update", eventDetail);
    hljsLanguages = eventDetail.languages;        // 插件改写的结果生效
}
```

也就是说：**订阅这个事件、就地修改 `event.detail.languages`，就能往语言列表里加项**
（例如加一个“自动识别”伪语言）。已有的 `code-languages` 插件正是这么用的
（`...\data\plugins\code-languages\src\index.ts:87`）。

### 4.4 `code-language-change`：用户手动选了语言

发射点 `app/src/protyle/toolbar/index.ts:2579`，在真正写入之前发出，载荷含 `languageElements` 和 `protyle`。

用途：**这就是判断“用户是否显式选过语言”的钩子**。记下被操作过的 `data-node-id`，
之后自动识别就不再动这些块。

### 4.5 `paste`：粘贴钩子（本插件的主入口）

发射点有两处：`app/src/protyle/util/paste.ts:387`（有文件/图片时）和 `:878`（纯文本/HTML）。

```ts
const timeoutId = setTimeout(() => finish(PASTE_PLUGIN_TIMED_OUT), PASTE_PLUGIN_TIMEOUT);
const emitResult = plugin.eventBus.emit("paste", {
    protyle, resolve: resolveResponse, textHTML, textPlain, siyuanHTML, files
});
if (emitResult) { finish(undefined); }     // 没有 preventDefault 就立刻放行，走原生粘贴
```

语义（**非常重要，直接决定实现方式**）：

| 插件的行为 | 结果 |
|---|---|
| 不调用 `event.preventDefault()`，不调用 `resolve` | `emit` 返回 `true` → 立刻 `finish(undefined)` → 原生粘贴照常执行。**这是我们要的：旁路监听，不干扰粘贴。** |
| 调用 `event.preventDefault()` | 事件被取消，`resolve` 不被自动调用，插件必须自己调 `resolve(...)`（可以异步）才会继续 |
| 调用 `resolve(newData)` | 用插件返回的 `{textHTML, textPlain, siyuanHTML, files}` 替换剪贴板内容 |

超时：`PASTE_PLUGIN_TIMEOUT = 120_000`（`paste.ts:79`）。**一旦 preventDefault 就必须在 120 秒内 resolve**，否则报错并中断这次粘贴。

其他约束：

- 事件是**按插件逐个 await 顺序发射**的（`for (let i = 0; i < plugins.length; i++)`），
  所以任何插件阻塞都会拖慢粘贴；
- 受 `areProtylePluginExtensionsEnabled(protyle)` 控制，某些受限环境（如发布模式下的只读渲染）
  不会触发，需要做降级判断（`app/src/protyle/runtimeCapabilities.ts:33`）。

**推荐用法**：在 `paste` 回调里只做“记录粘贴文本 + 目标代码块”，不 preventDefault；
等原生粘贴写入完成后（见 5.4）再异步识别并写语言。

## 5. 读写代码块的“语言”

### 5.1 DOM 结构

代码块节点的形态（`app/src/protyle/util/paste.ts:1148` 的字符串匹配可以作为权威参考）：

```html
<div data-node-id="2026xxxx-xxxxxx" data-type="NodeCodeBlock" class="code-block" ...>
  <div class="protyle-action">
    <span class="protyle-action__language">rust</span>   <!-- 语言就存在这里 -->
    ...
  </div>
  <div class="hljs" ...>
     <div>代码内容</div>
  </div>
  <div class="protyle-attr" contenteditable="false"></div>
</div>
```

读取语言（SiYuan 自己的写法，`app/src/protyle/wysiwyg/codeBlock.ts:73`）：

```ts
const language = nodeElement.querySelector(".protyle-action__language").textContent;
```

定位光标所在代码块：

```ts
const node = (window.getSelection()?.anchorNode as HTMLElement)?.closest?.(
  '[data-type="NodeCodeBlock"]'
);
```

（在 `paste` 回调里也可以用事件给到的 `protyle.toolbar.range` 自行定位。）

### 5.2 写入语言：照抄 SiYuan 自己的做法

`app/src/protyle/toolbar/index.ts:2564 updateLanguage()` 是官方实现：

```ts
const doOperations = [], undoOperations = [];
languageElements.forEach(item => {
    const nodeElement = hasClosestBlock(item);
    const id = nodeElement.getAttribute("data-node-id");
    undoOperations.push({id, data: nodeElement.outerHTML, action: "update"});
    item.textContent = selectedLang;                    // 1. 改语言
    highlightRender(nodeElement);                       // 2. 重新高亮
    doOperations.push({id, data: nodeElement.outerHTML, action: "update"});
});
transaction(protyle, doOperations, undoOperations);     // 3. 提交事务（含撤销栈）
```

**但插件拿不到 `hasClosestBlock` / `highlightRender` / `transaction` 这些内部函数。**
插件可用的等价路径有两种：

#### 方案 A（推荐）：直接调 `/api/transactions`

`transaction()` 内部就是往这个接口发请求（`app/src/protyle/wysiwyg/transaction.ts:616`）：

```ts
fetchPost("/api/transactions", {
    session: protyle.id,
    app: "siyuan",
    transactions: [{
        doOperations:   [{action: "update", id: blockId, data: newOuterHTML}],
        undoOperations: [{action: "update", id: blockId, data: oldOuterHTML}],
    }],
});
```

其中 `newOuterHTML` = 把当前代码块 DOM 的 `.protyle-action__language` 文本改成目标语言后的 `outerHTML`。
内核侧路由：`kernel/api/router.go:456` → `kernel/api/transaction.go:34 performTransactions`。

优点：**带撤销栈**，行为与用户手动选语言完全一致。

#### 方案 B（更简单）：`/api/block/updateBlock`

```ts
fetchPost("/api/block/updateBlock", {
    id: blockId,
    dataType: "markdown",
    data: "```go\n" + code + "\n```",
});
```

`dataType` 支持 `markdown` / `dom`；`dom` 时 `data` 传 block DOM。
内核侧：`kernel/api/router.go:293` → `kernel/api/block_op.go:837 updateBlock` → `parseBlockUpdateInput`（`block_op.go:34`，接受 `id` / `data` / `dataType` / `lockType`）。

优点：简单；缺点：需要自己拼 markdown 围栏（注意代码里可能包含 ``` 的情况），
撤销行为不如方案 A 贴近原生。

### 5.3 判断“这个块的语言是不是用户手动选的”

需要自己维护状态。建议：

```ts
this.autoLangBlocks = new Set<string>();   // 自动设置过、允许再改的块 id
this.lockedBlocks   = new Set<string>();   // 用户手动选过、不再自动改的块 id
```

- 订阅 `code-language-change`：把 `event.detail.languageElements` 对应的块 id 加进 `lockedBlocks`，并从 `autoLangBlocks` 移除；
- 自动设置成功后：块 id 加进 `autoLangBlocks`；
- 块被删除后要清理（可通过 `ws-main` 的 transaction 或定期 GC，或懒清理 + 上限）。

### 5.4 粘贴后如何拿到“刚粘贴完的代码块”

`paste` 事件触发时内容还没写入。可选做法：

1. **等一拍**：`requestAnimationFrame` 或 `setTimeout(0)` 后再查 DOM（简单，够用）；
2. 更稳的方式：监听 `ws-main`，等包含目标块 id 的 transaction 回来再处理；
3. 如果粘贴的目标就是一个已存在的空代码块，可以**在粘贴前**就记录块 id 和当前语言，
   粘贴完成后直接按记录的 id 处理（推荐，最简单可靠）。

## 6. 其他实现注意点

- **只在语言为空的块上自动设置**。读取 `.protyle-action__language` 的 `textContent`，任何非空语言（包括 `plaintext`）都不自动覆盖。
- **不要动 `SIYUAN_RENDER_CODE_LANGUAGES`**（abc/plantuml/mermaid/flowchart/echarts/mindmap/graphviz/math），
  这些是渲染器语言，识别结果里绝不能出现它们。
- **只读/发布模式**下 protyle 可能不启用插件扩展，要做 `try/catch` 与能力判断。
- **移动端**：`frontends` 里已声明 mobile；注意触摸键盘与粘贴路径不同，但事件一致。
- **与 `code-languages` 插件共存**：它也监听 `code-language-update` / `code-language-change`，
  且会重排/过滤语言列表。我们的写入流程不依赖下拉列表，所以互不干扰；
  但如果我们往列表里插“自动识别”项，要保证顺序在它处理之后仍然存在（事件是顺序发射的，
  按插件注册顺序，注意测试）。
