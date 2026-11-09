# 基于 DeepSeek Harness 的安装与使用说明

本仓库的生产形态是一个 **DeepSeek Harness（dsh）组合包**：`packages/dsh-plugin-brand-insight`。DeepSeek Harness 是 DeepSeek 于 2026 年 8 月开源的智能体框架（MIT 协议，「一切皆插件」，基于 Cordis），可完全部署在内网、接入私有化模型。我们不修改 harness 内核，只通过它公开的三个扩展点接入：

| 扩展点 | 本组合包注册的内容 | 在 dsh 中的样子 |
|---|---|---|
| `ctx.tools.register(defineTool(...))` | 27 个品牌洞察工具 | 模型可调用 `brand_insight_query`、`brand_ec_claim_gap`…… |
| `ctx.skills.register(...)` | 8 份专家技能说明 | 技能目录中的 `brand-claim-gap-diagnosis` 等，可用 `/brand-…` 调用 |
| `ctx.systemPrompt.section(...)` | 品牌洞察工作守则 | 溯源、护栏、人在环等约束进入系统提示 |

> 已验证版本：`@deepseek-ai/dsh 0.2.2-rc.1`（开发者预览版，上游声明后续会有不兼容变更；组合包在 `engines.dsh` 中声明 `>=0.2.0-rc.1 <0.3.0`）。

---

## 1. 前置条件

| 组件 | 要求 | 说明 |
|---|---|---|
| Node.js | **≥ 24.9**（dsh 要求） | 仅运行本仓库的工作台 / API / MCP / CLI 时 Node ≥ 20 即可 |
| pnpm | ≥ 10 | `dsh plugin` 在 profile 目录内调用 pnpm |
| 模型 | DeepSeek API Key，或集团私有化模型网关（OpenAI 兼容） | 首次打开 dsh Web 时登录或添加 API Key |
| 本仓库 | `git clone` 到本地任意目录 | 下文用 `$BH` 表示仓库绝对路径 |

## 2. 安装

### 2.1 准备本仓库

```bash
git clone https://github.com/realZeeLin/brandHarness.git
```

```bash
cd brandHarness && npm install && export BH=$(pwd)
```

`npm install` 只建立工作区内部链接（无第三方依赖），组合包运行时据此找到 `@brandharness/brand-core`。

### 2.2 安装 DeepSeek Harness

```bash
npm install -g @deepseek-ai/dsh
```

也可以不全局安装，用 `npx @deepseek-ai/dsh …`；或按上游 README 从源码构建。

### 2.3 把组合包装进 web profile

```bash
dsh plugin --profile web add "$BH/packages/dsh-plugin-brand-insight"
```

首次执行会从随附模板初始化 `web` profile，并把组合包追加到 bundles 列表（`@deepseek-ai/dsh-base` → `@deepseek-ai/dsh-web-app` → `dsh-plugin-brand-insight`）。确认已生效：

```bash
dsh --profile web --dump-config | grep -A4 "dsh-plugin-brand-insight"
```

应看到：
```yaml
# == dsh-plugin-brand-insight
- id: brand-insight
  name: dsh-plugin-brand-insight
  config:
    expert: lead
    exposeWriteTools: true
```

### 2.4 启动

```bash
dsh web
```

浏览器打开终端打印的地址（带 token）。首次使用在「设置 → 模型」填入 DeepSeek API Key（或添加集团模型网关为「自定义模型 API」，协议选 OpenAI Chat Completions）。

## 3. 使用

在 dsh 新会话中选择一个工作区（建议就选本仓库目录），直接用业务语言提问：

- 「福临门主图要不要继续加码非转基因？按 brand-claim-gap-diagnosis 技能来。」
- 「/brand-edible-oil-weekly-brief 起草第 46 周周报」
- 「福临门和金龙鱼谁的市场地位高？」（应被 `brand_insight_compare` 护栏拒答）
- 「把这批小红书笔记预检一下再导入」，并附 CSV 文本（`brand_data_import`，先 `dryRun`）

dsh 会显示每次 `brand_*` 工具调用的参数与返回；写类工具（`brand_insight_publish` / `brand_skill_save` / `brand_data_import`）同时受 **dsh 权限门禁** 和 **工具自身 `confirm` 闸门** 两层保护。

无界面批处理（例如每周一 07:00 由调度器触发周报）使用 dsh 的 `headless` profile，先把组合包也装进去：

```bash
dsh plugin --profile headless add "$BH/packages/dsh-plugin-brand-insight"
```

```bash
dsh headless "按 brand-edible-oil-weekly-brief 起草第 46 周食用油商情周报，保存草稿"
```

加 `--json` 可输出逐行事件，便于接入调度与留痕系统。

## 4. 配置项

在 `$DSH_HOME/profiles/web/cordis.patch.yml` 中按 id 覆盖（patch 会替换整行 config，需写全）：

```yaml
- id: brand-insight
  config:
    expert: analyst            # 工作守则里的默认专家身份：lead / analyst / product / brief / brand / activity / geo
    exposeWriteTools: false    # 只读部署：不向模型开放签发、技能修订、数据导入
    dataDir: /data/brand/fulinmen        # 可选：替换数据目录
    workspaceDir: /data/brand/workspace  # 可选：结论卡、留痕、增量数据写入位置
```

修改后 dsh 热替换插件，无需重启。

## 5. 备选：以 MCP 服务器方式接入

不想装组合包时，可把 `brand-mcp` 作为通用 MCP 服务器挂到 dsh（工具名为 `mcp__brand__<tool>`）：

```bash
BRANDHARNESS_HOME="$BH" dsh web --patch "$BH/packages/dsh-plugin-brand-insight/cordis.mcp.patch.yml"
```

同样的 MCP 服务器也能接入其他支持 MCP 的智能体底座（企业办公智能体、集团自有入口），对应建设方案「兼容主流智能体底座、资产可迁移」的设计约定。

## 6. 自主验证（推荐在部署前跑一遍）

仓库附带一个**用真实 dsh 端到端验证组合包**的脚本：它在临时 `DSH_HOME` 中从 headless 模板建 profile、`dsh plugin add` 安装组合包、起一个本地 OpenAI 兼容「脚本模型」，让 dsh 智能体真的调用 `brand_insight_query` 并读回结果。

```bash
DSH_BIN=$(command -v dsh) npm run test:dsh
```

期望输出：
```
✓ dsh plugin add 安装组合包
✓ --dump-config 出现 dsh-plugin-brand-insight 层
✓ 模型收到 27 个 brand_ 工具 schema（共 50 个工具）
✓ 系统提示已注入「品牌洞察工作守则」段落
✓ 技能目录包含 brand-claim-gap-diagnosis 等专家技能
✓ DSH 智能体真实执行 brand_insight_query，返回卖点错位 14.3pt
✓ headless 最终回答：卖点错位 14.3 个百分点（来自 brand_insight_query）。
```

## 7. 卸载与升级

```bash
dsh plugin --profile web remove dsh-plugin-brand-insight
```

升级：`git pull` 后重启 dsh 即可（链接安装，无需重新 add）。打包分发给无源码的同事时：

```bash
cd "$BH/packages/dsh-plugin-brand-insight" && npm pack
```

对方 `dsh plugin --profile web add ./dsh-plugin-brand-insight-0.1.0.tgz`（tarball 需与 brand-core 一同分发，或把 brand-core 发布到内部 npm 源）。

## 8. 常见问题

| 现象 | 原因与处理 |
|---|---|
| `engines.dsh` 不满足 | dsh 版本不在 `>=0.2.0-rc.1 <0.3.0`；按上游升级说明调整组合包后再装 |
| 插件加载报 `Cannot find package '@brandharness/brand-core'` | 未在仓库根目录执行 `npm install`；或把组合包拷离了仓库 |
| 模型看不到 `brand_` 工具 | `dsh --profile web --dump-config` 确认组合包层；检查是否被 profile 的 patch 设为 `disabled` |
| 技能 / 守则没出现 | 对应服务（`dsh-skill`、`dsh-system-prompt`）未在该 profile 中启用；工具仍可用 |
| 打开 dsh Web 提示「登录失败」 | 内网无法访问 DeepSeek 账号服务：选择「添加 API Key」或配置集团私有化模型网关 |
| 签发后找不到文件 | 默认写到本仓库 `workspace/insights/`；部署时用 `workspaceDir` 指到共享存储 |

## 9. 与建设方案的对应

- **运行层可替换**：dsh 负责 agent loop、会话留痕、模型路由、权限门禁；换底座只换这一层。
- **资产层归中粮**：技能（`skills/*.md`）、工具接口（`brand-core`）、数据与字典（`data/`）都在本仓库，不随底座变化。
- **一期范围**：总助手 + 洞察分析师 / 产品机会官 / 商情简报员，食用油（福临门）全链路，周报人工审核后发送 —— 均可在本组合包上跑通。
