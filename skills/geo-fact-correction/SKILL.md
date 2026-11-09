---
name: geo-fact-correction
description: AI 答案纠偏——巡检通用 AI / 电商 AI 导购 / 社媒 AI 搜索中关于品牌的答案，按品牌事实库起草纠偏素材，品牌部审定后供给
title: AI 答案纠偏
version: v1.0
owner: GEO 优化官
expert: geo
board: 全部板块
tools: [geo_audit, geo_fact_draft, data_import]
trigger: 每周巡检；或发现 AI 答案错误
---

# AI 答案纠偏

## 步骤
1. `geo_audit` 巡检，按严重度排序
2. 对「错误」项调用 `geo_fact_draft`；事实证据未补齐的不起草，转给负责部门补证
3. 素材提交品牌部审定，经官网 / 旗舰店 / 权威媒体供给
4. 2 周后复测，新巡检结果用 `data_import`（geo_answers）推入

## 约束
- 只用权威事实与优质内容；不批量投喂、不造假、不夸大
- 平台与智能体只对内运行
