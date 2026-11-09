---
name: claim-gap-diagnosis
description: 卖点错位诊断——判断某个卖点该不该加码、该怎么讲；对照品牌标题表达与消费者主动复述，输出结论卡
title: 卖点错位诊断
version: v1.3
owner: 洞察分析师
expert: analyst
board: 食用油 / 米面
tools: [insight_query, insight_evidence, social_labels, ec_claim_gap, insight_compose, insight_publish]
trigger: 品牌经理交办「要不要加码某卖点」「主图 / 详情页讲什么」
---

# 卖点错位诊断

## 何时使用
- 交办「主图要不要加码 X」「详情页该讲什么」「X 卖点有没有人接」
- 周报「卖点」栏目需要更新时

## 可用工具
- `insight_query`：社媒声量与关键词命中（含促销话术占比）；`channel=ecommerce` 查标题提及率 vs 有效评价主动提及率
- `insight_evidence`：取原文，判断声音来自消费者还是渠道
- `social_labels`：口碑标签覆盖率（看关注度）
- `ec_claim_gap`：全部标准卖点的错位排序
- `insight_compose` / `insight_publish`：结论卡与签发

## 步骤
1. 社媒查关键词命中量、占比、作者数、头号平台，同时记录促销话术占比
2. 取 4 条以上原文；促销 / 到货话术占多数时，声量不能当需求
3. 电商查两套口径：标题提及率（在售链接）与有效评价主动提及率（剔除默认好评）
4. 用口碑标签确认关注度，零命中写进数据缺口
5. 写结论卡：一句话结论 + ≤4 条依据 + 建议 + 风险，每个数字带 source
6. 提交签发（不带 confirm），由品牌经理确认

## 约束
- 两套分母不可混算，只比较差值方向
- 负面样本 < 50 条不做负向结论
- 没有环比时结论强度最高为「中」
- 未经审核不得签发

## 输出
- 结论卡（溯源率必须 100%）
- 下一步：A/B 方案、验收指标（看有效评价主动提及率，不看曝光）
