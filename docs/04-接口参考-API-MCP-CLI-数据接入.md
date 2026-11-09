# 接口参考：工具 · HTTP API · MCP · CLI · 数据接入

同一份工具注册表（`packages/brand-core/src/tools.js`）被五种表面复用：工作台页面、DeepSeek Harness 插件（工具名加前缀 `brand_`）、MCP（stdio）、HTTP API、CLI。改一处，全部生效。

## 1. 工具清单（27 个）

> 由 `node scripts/gen-tool-reference.mjs` 从注册表生成。**[写]** 表示写操作：不带 `confirm=true` 只返回预检 / 预览。

<!-- TOOLS:BEGIN -->
| 模块 | 工具 | 名称 | 参数（*必填） | 说明 |
|---|---|---|---|---|
| 综合态势 | `overview_snapshot` | 一屏巡检 | `brand` `days` | 综合态势：社媒总量与 NSR、电商有效评价、机会 TOP、最大卖点错位与预警，一次返回。 |
| 综合态势 | `overview_alerts` | 找异常 | `brand` `days` | 按日声量 z-score 与负面内容生成预警清单（只在内部提示，不外推）。 |
| 社媒聆听 | `insight_query` | 查声量与话题 | `brand` `keyword` `days` `platform` `cat` `channel` | 查询品牌声量、作者、互动、情感与 NSR、平台分布、关键词命中（含促销话术占比）。channel=ecommerce 时改查「标题提及率 vs 有效评价主动提及率」。 |
| 社媒聆听 | `insight_evidence` | 取原文样本 | `brand` `keyword`* `days` `limit` `sentiment` `platform` | 按关键词取社媒原文（按互动排序，标注是否促销话术），附电商有效评价旁证条数。只回原文，不做二次摘要。 |
| 社媒聆听 | `social_labels` | 口碑标签命中 | `brand` `days` `group` | 口碑标签体系 V1.1（8 类 44 项）在窗口内的覆盖率；零命中标签进入数据缺口清单。 |
| 品牌追踪 | `insight_compare` | 竞品 / 品类对比 | `dim`* `values`* `days` | 品牌、油种或平台对比。覆盖门槛：社媒 ≥100 条、电商有效评价 ≥200 条，不达标一侧进入 skipped、不输出倍数（verdict=refuse 时必须拒绝给结论）。 |
| 品牌追踪 | `brand_health` | 品牌健康度 | `brand` `days` | 品牌体检：NSR、负面占比、母品牌「中粮」背书出现率、卖点 / 场景 / 风险结构、货架口碑。 |
| 电商分析 | `ec_overview` | 货架概览 | `platform` | 各平台链接数、评论数、有效评价率、默认好评率、价格中位与负面率。 |
| 电商分析 | `ec_claim_gap` | 算卖点错位 | `claims` `platform` | 卖点错位差值 = 标题提及率 − 有效评价主动提及率。默认计算 7 个标准卖点，也可传自定义 claims。 |
| 电商分析 | `ec_pain_points` | 查痛点 | `platform` `limit` | 有效评价中的负面观点构成（规则词典 + 否定窗口），附原文样本。 |
| 电商分析 | `ec_price_audit` | 价格偏离巡检 | — | 单升价相对油种基准的偏离分布、规格价差与极端链接。 |
| 产品机会挖掘 | `opportunity_score` | 机会评分 | `ids` | 按 KSPEC-PI-01 计算产品机会分（需求强度 / 表达缺口 / 可行性）。 |
| 产品机会挖掘 | `opportunity_pack` | 生成立项证据包 | `id`* | 为一个机会生成立项证据包：评分拆解、评价与社媒原文、反例、验证计划。 |
| 营销活动评估 | `campaign_review` | 品牌说 vs 用户说 | `claims` | 卖点采纳率对照（标题表达 vs 评价 / 社媒自然复述）；增量评估需投放数据，未接入时返回 unknown。 |
| 营销活动评估 | `channel_trend` | 渠道趋势（抖音） | — | 抖音 1–10 月销售额环比与 10 月米油渠道结构，附四条口径门禁（区间值不估算、不推同比）。 |
| GEO 管理 | `geo_audit` | 查 AI 答案 | `platform` | 巡检通用 AI / 电商 AI 导购 / 社媒 AI 搜索中关于福临门的答案：准确率、提及率与纠偏清单。 |
| GEO 管理 | `geo_fact_draft` | 起草事实素材 | `questionId`* | 依据品牌事实库为一条错误答案起草纠偏素材（草稿，须品牌部审定后对外供给）。 |
| AI 助手 · 交付 | `insight_compose` | 出结论卡 | `question`* `oneLiner` `findings`* `recommendation` `nextSteps` `risks` `strength` `taskId` | 把发现写成结论卡。每条 finding 必须带 source{tool,args,path}，系统会重放该工具核对数值；溯源率低于 100% 的卡被拒绝签发。 |
| AI 助手 · 交付 | `insight_publish` | 签发（人工闸门） **[写]** | `cardId`* `confirm` `reviewer` | 唯一的写盘工具。不带 confirm 只返回 needs_confirmation 预览；签发须人确认并填写 reviewer，落盘带 sha256 与留痕。 |
| AI 助手 · 交付 | `report_draft` | 起草周报 / 年报 | `kind` `week` `save` | 按技能说明取数起草食用油商情周报（五个栏目 + 建议 ≤3 条 + 证据附录），状态 needs_review。 |
| 数据接入 | `data_sources` | 数据源状态 | — | 各数据集基线规模、增量条数、最近同步时间与接入方式（批量导入 / 数据流推入）。 |
| 数据接入 | `data_import` | 导入 / 推入数据 **[写]** | `dataset`* `records` `payload` `format` `dryRun` `source` | 向数据集导入记录（JSON 数组 / NDJSON / CSV 文本）。每条过四道筛（结构、去重、去无效、相关性）。dryRun=true 只出质检报告；正式写入后算法层立即使用新数据。 |
| 系统管理 | `dict_lookup` | 查字典口径 | `q` | 查询 KSPEC 指标口径：定义、分母与注意事项。 |
| 系统管理 | `audit_log` | 查留痕 | `limit` `action` | 查询签发、技能修订、报告起草等写操作留痕。 |
| 系统管理 | `skill_list` | 技能清单 | — | 列出技能库中的技能说明（名称、版本、维护人、可用工具）。 |
| 系统管理 | `skill_get` | 读技能说明 | `name`* | 读取一份技能说明全文与修订记录。 |
| 系统管理 | `skill_save` | 沉淀 / 修订技能 **[写]** | `name`* `content`* `author` `note` `confirm` | 新建或修订技能说明（SKILL.md）。写操作：不带 confirm 只返回预检结果；确认后写入并记录修订人与说明。 |
<!-- TOOLS:END -->

### 返回约定
- 一律返回 JSON 对象；大多数结果带 `caveats`（口径说明），智能体须随结论一起转述。
- 社媒时间窗字段 `window`：`{start, end, days, covered}`；`covered=false` 表示请求的天数超出数据窗口已被截断。
- 对比类工具带 `verdict`：`ok` / `partial` / `refuse`；`refuse` 时不得输出倍数或份额。
- 参数错误抛出可读报错，例如 `参数错误（insight_compare）：缺少必填参数 dim`。

### 结论卡溯源格式（`insight_compose`）
```json
{
  "question": "福临门主图是否加码「非转基因」",
  "oneLiner": "……",
  "findings": [
    { "text": "消费者主动提及远低于品牌自述", "value": 14.3, "unit": "pt",
      "source": { "tool": "insight_query", "args": { "keyword": ["非转基因"], "channel": "ecommerce" }, "path": "keywords[0].gapPt" } }
  ],
  "recommendation": "……", "nextSteps": ["……"], "risks": ["……"], "strength": "中", "taskId": "T-2411"
}
```
系统会用 `source.args` 重放 `source.tool`，取 `source.path` 的值与 `value` 比对；任何一条不一致，卡片 `status=rejected`，`insight_publish` 拒绝签发。

## 2. HTTP API（`npm start`，默认 `http://127.0.0.1:8787`）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查、是否在线模式、工具数 |
| GET | `/api/meta` | 工作台左栏所需：模块、专家、场景、任务、技能、数据源 |
| GET | `/api/tools` | 工具目录（含 JSON Schema） |
| POST | `/api/tools/{name}` | 调用工具，请求体为参数 JSON |
| POST | `/api/agent/chat` | 智能体对话，返回 `text/event-stream`；请求体 `{message, mode: offline|online, scenario?, module?, expert?, history?}` |
| GET | `/api/skills`、`/api/skills/{name}` | 技能清单 / 全文与修订记录 |
| PUT | `/api/skills/{name}` | 保存技能 `{content, author, note, confirm}` |
| GET | `/api/data/sources` | 数据源状态 |
| POST | `/api/data/{dataset}/import` | 批量导入（JSON 数组 / NDJSON / CSV；`?dryRun=1` 预检） |
| POST | `/api/data/{dataset}/stream` | 数据流推入（NDJSON） |
| GET | `/api/openapi.json` | OpenAPI 3.1 描述 |

**鉴权**：设置环境变量 `BRAND_API_TOKEN` 后，写类工具、技能保存与数据写入须带 `Authorization: Bearer <token>`；只读接口不受影响。

**SSE 事件类型**：`route`（专家与技能）· `plan` / `step`（执行计划与进度）· `think` · `tool`（`phase: start|end|error`，含 `transport`、`args`、`result`、`ms`）· `text` · `quotes` · `table` · `chart` · `kpis` · `card`（结论卡）· `gate`（签发闸门）· `deliverable`（交付物）· `skill`（技能草稿）· `suggest` · `done` · `error`。

```bash
curl -s -X POST http://127.0.0.1:8787/api/tools/insight_query \
  -H 'content-type: application/json' \
  -d '{"keyword":["非转基因"],"channel":"ecommerce"}'
```

```bash
curl -N -X POST http://127.0.0.1:8787/api/agent/chat \
  -H 'content-type: application/json' \
  -d '{"message":"福临门主图要不要继续加码非转基因？"}'
```

## 3. MCP（stdio）

```bash
node packages/brand-mcp/src/server.js
```

| 能力 | 内容 |
|---|---|
| `tools/list` · `tools/call` | 27 个工具；返回 `content`（文本）+ `structuredContent`（JSON）；写工具 `readOnlyHint=false` |
| `resources/list` · `resources/read` | `skill://<name>`（技能说明 Markdown）、`dict://kspec`（指标口径）、`data://sources`（数据源状态） |
| `prompts/list` · `prompts/get` | 11 个演示场景（t2411、weekly、opportunity、geo……），提示词会指引先读对应技能 |
| `initialize.instructions` | 品牌洞察工作守则 |

任意 MCP 客户端配置示例：
```json
{ "mcpServers": { "brand": { "command": "node", "args": ["/绝对路径/brandHarness/packages/brand-mcp/src/server.js"] } } }
```

## 4. CLI

```bash
npm run brand -- tools
```

```bash
npm run brand -- call insight_compare --dim cat --values 花生油,玉米油
```

```bash
npm run brand -- ask "福临门主图要不要继续加码非转基因？"
```

```bash
npm run brand -- import ./notes.csv --dataset social_posts --dry-run
```

```bash
npm run brand -- report weekly --week 46 --save
```

其他：`skills`、`skill <name>`、`skill-save <name> <SKILL.md> --confirm --author 姓名 --note 说明`、`sources`；`ask --online` 走 DeepSeek（需 `DEEPSEEK_API_KEY`）。全局安装后命令名为 `brand`（`npm i -g ./packages/brand-cli`）。

## 5. 数据接入：批量导入与数据流推入

| 数据集 | 名称 | 方式 | 必填字段 |
|---|---|---|---|
| `social_posts` | 社媒内容 | 批量 / 流式 | `text` `date` `platform` |
| `ec_reviews` | 电商评论 | 批量 / 流式 | `text` `date` `platform` |
| `ec_links` | 电商商品 | 批量 | `title` `platform` `price` |
| `geo_answers` | AI 答案巡检结果 | 批量 / 流式 | `q` `platform` `answer` |
| `brand_facts` | 品牌事实库（同 id 覆盖） | 批量 | `id` `fact` `evidence` |

**四道筛**（与建设方案一致）：① 结构校验 ② 去重（内容哈希，含与历史数据比对）③ 去无效（零信息；默认好评入库但不计入有效评价）④ 相关性甄别（品牌 + 食用油语境）。每次写入返回质检报告，并记一条留痕。作者昵称入库即做不可逆哈希。

```bash
curl -s -X POST 'http://127.0.0.1:8787/api/data/social_posts/import?dryRun=1' \
  -H 'content-type: text/csv' --data-binary @notes.csv
```

```bash
printf '%s\n' '{"text":"福临门花生油这次没漏","date":"2026-11-03","platform":"小红书"}' | \
  curl -s -X POST http://127.0.0.1:8787/api/data/social_posts/stream \
  -H 'content-type: application/x-ndjson' -H 'x-source: xhs-crawler' --data-binary @-
```

质检报告示例：
```json
{ "dataset": "social_posts", "mode": "stream", "received": 3, "accepted": 1,
  "rejected": { "去重": { "count": 1, "samples": [{ "index": 2, "reason": "与已有内容重复" }] },
                "相关性甄别": { "count": 1, "samples": [{ "index": 3, "reason": "缺品牌或食用油语境" }] } },
  "auditId": "3f2a9c1d" }
```

增量写在 `workspace/data/<dataset>.jsonl`，与基线数据合并后参与计算；接入 Kafka / Flink / 采集器时，把消息按行 POST 到 `/stream` 即可。要整体换基线，用 `scripts/build-data.mjs` 从新的原型数据包重建 `data/fulinmen/`。
