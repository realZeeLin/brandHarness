/** 口径规则：默认好评识别、电商评论观点抽取（移植自原型 ecommerce-model.js，保持同一口径）。 */
export const isDefault = text => String(text || '').length <= 2 || /默认好评|未填写评价|未及时.*评价|未及时.*做出评价|该用户觉得商品/.test(text)

export const EC_RULES = [
  ['口味/气味', [['香味浓郁', 'pos', ['香味浓', '浓香', '香气', '很香', '特别香']], ['口感好', 'pos', ['口感好', '好吃', '口感特别纯正', '味道好', '不腻']], ['风味不佳', 'neg', ['不香', '不好吃', '味道怪', '异味', '哈喇味', '发酸']], ['讨论口味', 'neu', ['口感', '味道']]]],
  ['物流配送', [['配送快', 'pos', ['物流快', '物流很快', '物流挺快', '快递给力', '次日达', '送货快', '配送快', '当天到']], ['配送慢', 'neg', ['物流慢', '物流太慢', '快递慢', '发货太慢', '送错', '不送货上门']], ['配送粗暴', 'neg', ['野蛮', '暴力', '乱扔']], ['讨论配送', 'neu', ['物流', '快递', '配送', '送货']]]],
  ['包装', [['包装完好', 'pos', ['包装严实', '包装很好', '包装完好', '无破损', '没有漏油', '没有破损', '包装仔细']], ['包装简陋', 'neg', ['包装差', '包装太差', '包装简陋', '没保护', '没有保护', '裸装']], ['漏油破损', 'neg', ['漏油', '破损', '渗漏', '磕碰', '破了', '裂痕', '洒了']], ['讨论包装', 'neu', ['包装', '瓶身', '桶身']]]],
  ['价格/性价比', [['价格实惠', 'pos', ['实惠', '便宜', '划算', '性价比高', '性价比也很高', '价格优惠']], ['价格偏高', 'neg', ['太贵', '有点贵', '贵了', '不便宜', '价格高', '不划算', '买贵']], ['保价争议', 'neg', ['不退差价', '不给保价', '降价不退']], ['讨论价格', 'neu', ['价格', '保价', '活动']]]],
  ['品质与工艺', [['品质可靠', 'pos', ['质量好', '品质好', '品质高', '纯正', '油质清亮', '质量不错']], ['品质担忧', 'neg', ['变质', '假货', '是假', '质量差']], ['关注工艺', 'neu', ['非转基因', '压榨', '一级', '浸出']]]],
  ['品牌信任', [['信赖品牌', 'pos', ['信赖', '信任', '大品牌', '放心', '值得信赖']], ['真伪疑虑', 'neg', ['怀疑假', '不是正品', '假冒']], ['讨论品牌', 'neu', ['福临门', '中粮', '品牌']]]],
  ['新鲜度', [['日期新鲜', 'pos', ['日期新鲜', '新日期', '刚生产', '生产日期好']], ['日期不新鲜', 'neg', ['临期', '日期不新', '日期太早', '过期', '日期旧']], ['讨论日期', 'neu', ['生产日期', '保质期']]]],
  ['服务体验', [['服务好', 'pos', ['客服好', '服务好', '解决了', '给解决', '售后及时']], ['服务差', 'neg', ['客服敷衍', '态度差', '不处理', '推卸', '不退款', '态度恶劣', '不给处理']], ['讨论服务', 'neu', ['客服', '售后']]]],
  ['烹饪体验', [['油烟少', 'pos', ['少油烟', '油烟少', '油烟轻', '不呛', '不会呛']], ['油烟大', 'neg', ['油烟大', '很呛']], ['日常烹饪', 'neu', ['炒菜', '油炸', '烹饪', '煎']]]],
  ['购买意愿', [['持续回购', 'pos', ['回购', '复购', '继续买', '再买', '多次购买']], ['不再购买', 'neg', ['不买了', '不会再买', '不再买']], ['首次尝试', 'neu', ['试试', '第一次买']]]]
]

/** 抽取一条评论命中的观点（带否定窗口）。 */
export function extract(text) {
  text = String(text || '')
  if (isDefault(text)) return []
  const hits = []
  for (const [dim, options] of EC_RULES) {
    const local = []
    for (const [point, sent, terms] of options) {
      const found = terms.some(term => {
        let index = text.indexOf(term)
        while (index >= 0) {
          const before = text.slice(Math.max(0, index - 6), index).split(/[，。！？；、,.!?;\n ]/).pop()
          const after = text.slice(index + term.length, index + term.length + 4)
          if (!(sent === 'neg' && (/没有|没|无|未|避免|防止|不会|不再|不用/.test(before) || /都没有|都没|也没有/.test(after))) &&
              !(sent === 'pos' && /不|没|未|无/.test(before))) return true
          index = text.indexOf(term, index + term.length)
        }
        return false
      })
      if (found) local.push({ dim, point, sent })
    }
    hits.push(...(local.some(h => h.sent !== 'neu') ? local.filter(h => h.sent !== 'neu') : local))
  }
  return hits
}

/** 卖点词表：标题侧 / 评价侧（与原型 claim_tk / claim_ck 同源）。 */
export const anyOf = (text, terms) => terms.some(t => String(text || '').includes(t))
export const pct = (n, d, digits = 1) => d ? Number((n / d * 100).toFixed(digits)) : null
export const round = (v, digits = 1) => v == null ? null : Number(Number(v).toFixed(digits))
