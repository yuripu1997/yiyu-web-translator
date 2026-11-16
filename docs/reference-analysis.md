# 参考产品分析（Immersive Translate）

本文件记录开发前对参考产品的静态观察，用于确定「网页翻译」功能范围。它不是对参考产品源码的复制，也不声称运行时等价。

## 证据来源

- Chrome 扩展包：Immersive Translate `1.34.4`，通过 Chrome Web Store CRX 下载并解包（manifest 为 MV3）。
- 包内文件：`manifest.json`、`default_config.json`、`default_config.content.json`、`popup.js`、`content_main.js`、`background.js`、`options.js`。
- 官方功能说明页：
  - <https://immersivetranslate.com/zh-Hans/docs/features/webpage/>
  - <https://immersivetranslate.com/zh-Hans/docs/features/hover/>
  - <https://immersivetranslate.com/zh-Hans/docs/input/>

## 观察到的核心配置（静态事实）

`default_config.json` 共 162 个键，与网页翻译相关的观察包括：

| 配置键 | 观察值 | 含义 |
|---|---|---|
| `translationMode` | `"dual"` | 默认双语对照 |
| `translationStartMode` | `"dynamic"` | 动态内容翻译 |
| `translationPosition` | `"after"` | 译文插入在原文之后 |
| `inputStartingTriggerKey` | `"/"` | 输入框语言命令前缀 |
| `inputTrailingTriggerKey` | `"space"` | 输入框翻译触发键 |
| `inputTrailingTriggerKeyRepeatTimes` | `3` | 连按 3 次空格 |
| `inputTargetLanguage` | `"en"` | 输入框默认目标语言 |
| `excludeTranslationHtmlTags` | `["textarea","input","body","marquee"]` | 排除标签 |
| `defaultAlwaysTranslatedUrls` | `twitter.com`、`x.com`、`www.reddit.com`、`en.wikipedia.org`、`*.medium.com` 等 | 默认总是翻译站点 |
| `immediateTranslationTextCount` | `4999` | 首屏立即翻译文本量阈值 |
| `domReadyDetectTimeout` | `3000` | DOM 就绪检测超时 |

`manifest.json` 的观察：MV3；`content_guard.js` 在 `document_start` 注入所有 frame；`content_main.js` 为主要内容脚本；`popup.html`、`options.html`、`side-panel.html` 分别对应弹窗、设置页和侧边栏。

官方文档观察到的交互：

- `Alt+A`：翻译 / 切换原文。
- `Alt+W`：翻译整个页面（而非默认智能正文区域）。
- 右键菜单：翻译网页 / 显示原文。
- 弹窗：翻译按钮、仅译文 / 双语对照切换。
- Shift + 鼠标悬停段落：显示该段译文。
- 输入框：连按 3 次空格翻译；`/ja 文本` 等语言命令；`//` 用于只翻译部分内容。

## 译屿的取舍

| 参考能力 | 本实现 | 说明 |
|---|---|---|
| 双语对照 / 仅译文 | 实现 | 弹窗和设置页均可切换 |
| 智能正文 / 整页 | 实现 | `article`、`main`、常见正文 class；整页模式跳过限制较少 |
| Alt+A / Alt+W | 实现 | Chrome commands |
| 右键菜单 | 实现 | 页面 / 选区 / 输入框 |
| 悬停翻译 | 实现 | 按住 Shift 悬停 |
| 划词翻译 | 实现 | 选中后显示「译」按钮 |
| 输入框翻译 | 实现 | 三连空格、Ctrl/Cmd+Enter、`/en` 等命令 |
| 动态内容 | 实现 | MutationObserver + 防抖 |
| 站点规则 | 实现 | always / never 域名列表 |
| 缓存 | 实现 | chrome.storage.local，7 天 TTL |
| 多翻译服务 | 实现 | 译屿支持腾讯云、阿里云、DeepL、Azure、MyMemory、LibreTranslate 与 OpenAI 兼容大模型 |
| PDF / ePub / 视频字幕 / 图片 | 不实现 | 当前版本聚焦 HTML 网页 |

## 未观察 / 未知

- `content_main.js` 等 4MB 级 bundle 未做完整反混淆；本文件不声称其内部实现细节。
- 参考产品对复杂 Shadow DOM、iframe、PDF 的具体处理方式未在本项目中复现。
- 以上配置是构建时默认值，不证明运行时所有站点都会采用该值。
