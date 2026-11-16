# 免费翻译 API / 免费大模型 Token 调研

调研日期：2026-11-16。免费额度和活动变化很快，以下数字只做选型参考，最终以各厂商控制台和公告为准。

## 一、传统机器翻译 API（按字符计费）

| 平台 | 免费额度 | 接口/说明 | 结论 |
|---|---|---|---|
| **阿里云机器翻译** | **通用版 100 万字符/月**，每月 1 日重置 | 通用版/专业版/定制版均有 100 万字符/月；文本翻译后付费 50 元/百万字符 | **当前最值得用的免费翻译 API**，比腾讯 TMT 的新用户政策更友好 |
| **腾讯云 TMT** | 停止发放新免费资源包；已有资源包按有效期使用 | 2026-10-01 起停止新免费包，QPS 逐步下调 | 老账号有存量包可用；新账号按量计费 |
| **DeepL API Free** | 官方帮助页描述 50 万字符/月；页面同时标注 Free 计划状态有变化 | `api-free.deepl.com` | 质量好，但注册与可用性以官网为准 |
| **Azure Translator F0** | 约 200 万字符/月 | 需 Azure 账号和信用卡，超出按量计费 | 适合已有 Azure 账号的人 |
| **MyMemory** | 约 5,000 字符/天（匿名） | 公共免费 API，适合轻量测试 | 不适合长期大流量 |
| **LibreTranslate** | 自建无限；公共实例有限速 | 开源自部署 | 完全免费但需要服务器，质量一般 |

来源：

- 阿里云机器翻译计费：<https://help.aliyun.com/zh/machine-translation/product-overview/billing-overview>
- 腾讯云机器翻译调整公告：<https://cloud.tencent.com.cn/announce/detail/2448>
- 腾讯云文本翻译停服公告（国际站）：<https://www.tencentcloud.com/announce/detail/101526>
- DeepL API 计划：<https://support.deepl.com/hc/zh-cn/articles/360021200939-DeepL-API-计划>
- Azure Translator 定价：<https://azure.microsoft.com/en-gb/pricing/details/cognitive-services/translator/>

## 二、国内大模型免费 Token（OpenAI 兼容接口）

| 平台 | 免费额度 | 推荐模型 | Base URL | 备注 |
|---|---|---|---|---|
| **智谱 BigModel** | 新用户约 **2000 万 Token**；GLM-4-Flash / GLM-4.7-Flash 等 Flash 模型长期免费 | `glm-4-flash` / `glm-4.7-flash` | `https://open.bigmodel.cn/api/paas/v4` | 中文强、OpenAI 兼容，长期免费首选 |
| **硅基流动 SiliconFlow** | 新用户约 **2000 万 Token**；9B 以下部分模型永久免费 | `THUDM/glm-4-9b-chat` 等 | `https://api.siliconflow.cn/v1` | 国内延迟低，免费模型列表会变 |
| **阿里云百炼（通义千问）** | 新用户每个模型通常 **100 万 Token**，90 天有效；活动总量可达数千万 | `qwen3.6-flash` / `qwen-plus` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 模型多、质量稳定，适合短期集中测试 |
| **百度千帆** | `ERNIE-Speed` 系列长期免费（QPS 50）；ERNIE-4.5 等新模型约 100 万 Token/3 个月 | `ernie-speed-8k` | `https://qianfan.baidubce.com/v2` | 永久免费兜底选项 |
| **火山方舟（豆包）** | 每日约 **200 万 Token**（按天重置）+ 一次性 50 万 Token | 豆包 Lite / 推理接入点 `ep-...` | `https://ark.cn-beijing.volces.com/api/v3` | 需先创建推理接入点，把 `ep-` ID 当模型名 |
| **腾讯混元 / TokenHub** | 首次开通送 **100 万 Token**，有效期 1 年；TokenHub 另有新用户试用包 | `hunyuan-turbos` / `hy-mt2` 等 | 以 TokenHub 控制台为准 | 原混元平台正迁移至 TokenHub |
| **DeepSeek** | 无长期免费，价格低（约输入 1 元 / 输出 2 元每百万 Token） | `deepseek-v4-flash` | `https://api.deepseek.com/v1` | 追求质量、能接受少量费用时使用 |
| **Kimi（月之暗面）** | 个人认证赠 15 元；免费档限频约 3 RPM | `moonshot-v1-8k` 等 | `https://api.moonshot.cn/v1` | 长上下文场景 |
| **七牛云 AI 推理** | 注册约 300 万 Token，邀请再加 | 以控制台模型为准 | `https://api.qnaigc.com/v1` | 补充选项 |
| **讯飞星辰 MaaS** | Spark Lite 永久免费（QPS 2）；部分模型限时免费 | Spark Lite / Qwen3.6-35B-A3B | 以控制台为准 | 语音能力较强 |

来源：

- 阿里云百炼新人免费额度：<https://help.aliyun.com/zh/model-studio/new-free-quota>
- 智谱免费模型说明（第三方汇总）：<https://blog.shiguang666.eu.org/2026/05/31/d2e840584572/>
- 硅基流动免费模型：<https://free-model.com/providers/siliconflow>
- 火山方舟/豆包免费额度：<https://blog.shiguang666.eu.org/2026/05/31/d2e840584572/>
- 百度千帆免费模型：<https://blog.shiguang666.eu.org/2026/05/31/d2e840584572/>
- 腾讯混元计费与免费额度：<https://cloud.tencent.com/document/product/1729/97731>
- 腾讯云 TokenHub 新手免费体验包：<https://www.tencentcloud.com/zh/document/product/1300/80423>
- 2026 免费 Token 平台汇总：<https://www.chooseai.io/news/7622>（第三方，仅作交叉参考）

## 三、选型建议

### 只做网页翻译、想长期零成本

1. **阿里云机器翻译通用版**：100 万字符/月，按普通网页 1 万字符估算，每月约 100 篇；最稳定。
2. **智谱 GLM-4-Flash**：永久免费模型，OpenAI 兼容，接入最简单；适合把翻译当 LLM 任务处理。
3. **百度千帆 ERNIE-Speed**：永久免费兜底，QPS 50，适合高频短句。

### 想质量更好、能接受少量费用

- **DeepSeek V4 Flash**：价格低，翻译质量好。
- **阿里云百炼 Qwen3.6-Flash**：免费额度大，模型新，适合先试用。

### 不建议作为长期主力的

- 需要每天签到/抢额度的限时活动。
- 公共免费中转站（密钥共享、稳定性差、隐私不可控）。
- 未备案的“无限免费”接口。

## 四、与译屿的对应关系

译屿现在支持的 provider：

1. `tencent`：腾讯云 TMT，适合已有存量免费包的账号。
2. `alibaba`：阿里云机器翻译通用版，100 万字符/月免费额度。
3. `deepl`：DeepL API Free / Pro。
4. `azure`：Azure Translator F0 免费层。
5. `mymemory`：MyMemory 免密钥接口。
6. `libretranslate`：LibreTranslate 自建/公共实例。
7. `llm`：任意 OpenAI 兼容接口；设置页只保留 Base URL / API Key / 模型名，支持一键从 `/models` 获取模型列表。

LLM provider 的请求格式是标准 `/chat/completions`，所有 OpenAI 兼容平台都可以直接填 Base URL、API Key 和模型名使用。

