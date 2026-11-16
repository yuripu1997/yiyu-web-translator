# 译屿测试报告

日期：2026-11-16
版本：0.1.0（菜单/卡片双语、多连接、网页正文识别优化、手动大模型配置）

## 自动化测试

命令：

```bash
npm test
```

结果：

- 测试文件：19 个全部通过
- 测试用例：74 个全部通过
- 覆盖：
  - TC3-HMAC-SHA256 签名与腾讯云官方 Node SDK `Sign.sign3` 对比
  - 腾讯云 `TextTranslateBatch` 请求/响应/错误码
  - 批量分片（1800 字符 / 30 条）、超长文本切分、码点计数
  - 正文识别（article/main 优先、跳过导航/代码/隐藏元素、卡片标签和通用布局不翻译、重复单元去重、隐藏 style 文本不翻译、whole 模式）
  - 译文渲染（双语、仅译文、重复渲染、恢复原文）
  - UI 文本：菜单逐项原文+译文、卡片模块原文/译文副本、恢复原文、与正文单元去重
  - 模型列表：OpenAI 兼容 `/models` 解析、无 Key 本地模型
  - 翻译服务（腾讯云缓存命中、批量请求、重试、缺少密钥）
  - 大模型 provider（OpenAI 兼容请求、JSON/代码块/行格式解析、批量顺序、Token 统计）
  - 新 provider：Alibaba RPC 签名、DeepL、Azure、MyMemory、LibreTranslate
  - 多连接：旧版设置迁移、当前连接解析、凭证识别、失效自动回退
  - 内容脚本 jsdom 端到端（整页翻译、模式切换、设置提示、状态消息）

## 构建

```bash
npm run build
npm run package
```

- `dist/` 打包成功
- `yiyu-web-translator.zip` 339KB
- Chrome `--pack-extension` 校验通过

## 真实浏览器冒烟测试

浏览器：Google Chrome for Testing 157.0.8103.78（macOS x64）

测试步骤：

1. 以 `--load-extension=dist` 加载扩展。
2. 打开本地 fixture `fixtures/article.html`。
3. 在扩展 Service Worker 中分别 mock `tmt.tencentcloudapi.com` 的 `TextTranslateBatch` 响应和 `open.bigmodel.cn` 的 `chat/completions` 响应。
4. 通过扩展消息触发 `TWT_START`，分别验证腾讯云 provider 和大模型 provider。
5. 腾讯云与大模型两种 provider 都验证页面插入 6 个 `.twt-translation` 节点，首条译文正确。
6. 触发 `TWT_SET_MODE: translation` 验证 `html[data-twt-mode="translation"]`。
7. 触发 `TWT_RESTORE` 验证译文节点和原文包裹节点全部清除，正文恢复。

结果：全部通过。

## 已知未覆盖

- 未使用真实密钥发起付费调用（各 provider 均需用户自己的 Key）。
- 未覆盖 PDF、ePub、YouTube 字幕等非 HTML 内容。
- 未做长时间真实站点回归（建议安装后用 3–5 个常用站点手动验收）。

## UI 与多连接验证

- Chrome for Testing 中加载新版设置页：品牌首图、服务商面板正常显示；桌面 1280px 与移动 390px 布局均检查。
- 设置页新增「连接配置」列表：新建连接、重命名、切换当前连接、删除连接均通过实际浏览器交互验证。
- 弹窗中「当前连接」下拉框可切换阿里云 / DeepSeek 两条配置，`chrome.storage.local` 的 `activeProfileId` 会同步更新。
- 所有服务商面板、API Key 获取链接和手动大模型配置入口均可见。

## HackerOne 页面专项验证

- 拉取真实的 `https://hackerone.com/opportunities/all` 页面 DOM，在离屏环境运行新版正文识别。
- 旧策略会把卡片中的 `Bounty / Domain / 13 / See details` 等短标签当成段落，并在卡片下方插入大量碎片译文。
- 新策略不把通用 `div` 卡片当段落，跳过卡片标签、图标、隐藏 tooltip 和重复文本；该页面正文候选为 12 个单元。
- 卡片模块现在复制为样式相同的译文卡片，放在原卡片下方；菜单逐项显示原文与译文两行，保留原布局。
- 额外修复：页面中的 `<style>` 文本（例如 engagement widget 注入的 CSS）不再因 `textContent` 回退被当成正文翻译；新增 `visibleText` 和 `engagement` 容器跳过规则，并加了自动化回归测试。
