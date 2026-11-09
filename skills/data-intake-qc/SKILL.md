---
name: data-intake-qc
description: 数据接入质检——新数据批量导入或流式推入前先预检，按四道筛给出拦截报告，确认后入库并通知相关专家重跑
title: 数据接入质检
version: v1.0
owner: 数据运营
expert: lead
board: 全部板块
tools: [data_sources, data_import]
trigger: 新采集批次到达；或交办「把这批数据导进来」
---

# 数据接入质检

## 步骤
1. `data_sources` 查看数据集字段约定
2. `data_import` 带 `dryRun=true` 预检，报告四道筛拦截情况
3. 拦截率 > 30% 时先找来源方核对，不入库
4. 确认后正式写入；告知受影响的技能（如周报、卖点诊断）需重跑

## 四道筛
① 结构校验 ② 去重（内容哈希）③ 去无效（零信息 / 默认好评不计入有效评价）④ 相关性甄别（品牌 + 品类语境）
