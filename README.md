# brandHarness · 品牌智能体工作台

把「中粮社媒与消费者 AI 洞察平台」演示包改造成以 **[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)** 为运行底座的智能体工作形态：

- **左栏**：原九大模块 + 数据接入成为能力入口；每个模块背后是一组工具，同时以 **DeepSeek Harness 插件 / MCP / HTTP API / CLI** 形态供上层智能体调用。
- **中栏**：专家工作对话。总助手路由到 6 位专家，专家加载技能（SOP）、调用工具、交付结论，关键动作停在闸门等人确认。
- **右栏**：交付物（结论卡、周报、年报、证据包、纠偏素材、技能草稿）、证据链、工具台、技能、数据。
- **演示案例**：福临门。社媒 2,855 条有效讨论、电商 1,099 条链接 / 43,324 条评论，数字全部由算法层实时计算。

![工作台](docs/images/02-t2411-card-gate.jpg)

## 快速开始

```bash
npm install
```

```bash
npm start
```

打开 `http://127.0.0.1:8787`。不需要联网和模型密钥（离线规划器 + 真实工具）。设置 `DEEPSEEK_API_KEY` 后可在右上角切到「在线 DeepSeek」。

没有 Node 环境时，直接用浏览器打开 `apps/workbench/index.html`，或访问在线演示 **https://realzeelin.github.io/brandHarness/**（GitHub Pages，播放从真实运行录制的会话；设想设计页：`/concept.html`）。

## 接入 DeepSeek Harness

```bash
dsh plugin --profile web add "$(pwd)/packages/dsh-plugin-brand-insight"
```

```bash
dsh web
```

dsh 智能体即获得 27 个 `brand_*` 工具、8 个 `brand-*` 技能与品牌洞察工作守则。详见 [docs/03-DeepSeek-Harness安装使用说明.md](docs/03-DeepSeek-Harness安装使用说明.md)。

## 文档

| 文档 | 内容 |
|---|---|
| [01 智能体设想设计](docs/01-智能体设想设计.md) | 设计目标、智能体设计模式、架构、界面设计（可视化版：`apps/workbench/concept.html`） |
| [02 产品功能 Demo 说明](docs/02-产品功能Demo说明.md) | 十分钟演示路线、功能清单、11 个福临门场景详解 |
| [03 DeepSeek Harness 安装使用说明](docs/03-DeepSeek-Harness安装使用说明.md) | 安装、配置、使用、MCP 备选接入、自主验证、常见问题 |
| [04 接口参考](docs/04-接口参考-API-MCP-CLI-数据接入.md) | 27 个工具、HTTP API、MCP、CLI、数据导入与流式推入 |
| [05 测试报告](docs/05-测试报告.md) | 单元、端到端、浏览器、真实 dsh 验证结果 |

## 仓库结构

```
packages/brand-core/                算法层 + 资产层：数据、27 个工具、口径门禁、溯源、签发、技能、数据接入、智能体
packages/brand-server/              HTTP API + SSE + 静态工作台
packages/brand-mcp/                 MCP stdio 服务
packages/brand-cli/                 命令行 brand
packages/dsh-plugin-brand-insight/  DeepSeek Harness 组合包
apps/workbench/                     工作台前端、设想设计页、回放数据
skills/                             8 份专家技能说明（SKILL.md）
data/fulinmen/                      福临门脱敏数据集 + 演示参考数据
tests/                              单元 / 端到端 / 浏览器 / 真实 dsh 验证
scripts/                            数据构建、回放录制、文档生成
```

## 测试

```bash
npm test
```

```bash
npm run test:e2e
```

```bash
DSH_BIN=$(command -v dsh) npm run test:dsh
```

## 数据与合规说明

- 社媒作者昵称已做不可逆哈希，原文链接未入库；电商评论不含用户信息。
- GEO 巡检为建设方案中的 Demo 构造案例，抖音趋势为区间口径摘录，界面均标注来源。
- 平台与智能体只对内运行；写操作（签发、技能修订、数据入库）须人确认并留痕。
- DeepSeek Harness 为 DeepSeek 开源项目（MIT），本仓库以插件方式使用，不包含其源码。

## 许可

MIT
