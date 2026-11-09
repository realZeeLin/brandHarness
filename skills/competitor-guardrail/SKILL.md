---
name: competitor-guardrail
description: 竞品 / 品类对比护栏——先过覆盖门槛再比较，样本不足时拒绝给市场地位结论并列出补数清单
title: 竞品对比护栏
version: v1.0
owner: 品牌追踪官
expert: brand
board: 全部板块
tools: [insight_compare, brand_health, data_sources]
trigger: 任何「A 比 B 多多少 / 谁的市场地位高」的问题
---

# 竞品对比护栏

## 步骤
1. 调用 `insight_compare`，读取每一侧的 coverage
2. `verdict=refuse`：明确说「这个对比我不给结论」，解释为采集覆盖缺口而非市场份额
3. `verdict=partial`：只报告达标一侧的口径
4. 列出补数清单，并给出 `data_import` 推入路径

## 约束
- 门槛：社媒 ≥100 条、电商有效评价 ≥200 条
- 不输出任何倍数、份额、排名，除非两侧均达标
- 电商数据当前只覆盖中粮自有品牌
