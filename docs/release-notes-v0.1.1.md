# 译屿 v0.1.1

针对 v0.1.0 的补丁版本，修复网页正文被错误跳过的问题。

## Highlights

- 网页智能正文识别：`article` / `main` 优先，跳过导航、页脚、代码、表单、隐藏元素和 CSS 文本
- 菜单与卡片双语：菜单逐项显示原文 + 译文；卡片模块保留原文，并在下方生成样式相同的译文副本
- 多连接配置：阿里云、腾讯云、DeepL、Azure、MyMemory、LibreTranslate 以及任意 OpenAI 兼容大模型
- 阿里云机器翻译默认提供每月 100 万字符免费额度（每月 1 日重置，具体以阿里云控制台为准）
- 大模型手动配置：Base URL / API Key / 模型名，支持一键获取 `/models` 列表
- 悬停翻译、划词翻译、输入框翻译、右键菜单、快捷键
- 本地缓存、用量统计、GitHub Releases 更新提示

## Installation

- **Chrome / Edge / Brave**: download `yiyu-chromium-v0.1.0.zip`, extract, then load unpacked from `chrome://extensions`.
- **Firefox**: download `yiyu-firefox-v0.1.0.zip`, extract, then load temporary add-on from `about:debugging#/runtime/this-firefox`.

> Firefox is experimental and untested. Please report issues at https://github.com/GOBUT/yiyu-web-translator/issues

## Notes

- Chrome / Edge / Brave share the Chromium build. Chrome is tested; Edge and Brave are **not individually tested**.
- The CRX file is an optional packaged artifact; the ZIP is recommended for manual installation.
- No API keys or credentials are bundled.

## Fixed in 0.1.1

- 修复 Bugcrowd 等 engagement 页面正文完全不翻译的问题：此前跳过 HackerOne 浮层的 `[class*='engagement']` 规则过宽，误伤了正文容器。
- 视觉隐藏文本（sr-only / helper-sronly / screen-reader-only）不再进入翻译队列。
- 修正 `visibleText()`：浏览器内隐藏元素的 `innerText` 为空时不再错误回落到 `textContent`。
- 新增 Bugcrowd / sr-only 回归测试；测试总数 76 个。
