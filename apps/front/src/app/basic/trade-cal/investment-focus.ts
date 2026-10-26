type CalendarEvent = {
  title: string;
  source?: string;
  country?: string | null;
  sectors?: string[];
};

/** A transparent display filter, not a prediction of market impact or a vendor importance score. */
export function isAShareFocusEvent(event: CalendarEvent): boolean {
  const title = event.title.trim();
  const country = event.country?.trim() || '';
  if (!title) return false;
  const domestic = event.source === 'cn_schedule'
    || /^(中国|中国大陆|中国香港|香港|China|Hong Kong|CN|CHN|HK)$/i.test(country)
    || /^(中国|我国|国内)/.test(title);
  const us = /^(美国|USA?|United States)$/i.test(country) || /美国|美联储|联邦公开市场|FOMC/i.test(title);
  const euro = /^(欧元区|欧盟|Euro Area|Eurozone)$/i.test(country) || /欧元区|欧洲央行/.test(title);
  const centralBank = domestic || us || euro || /^(日本|英国|Japan|UK|United Kingdom)$/i.test(country)
    || /日本央行|英国央行/.test(title);
  if (/两会|全国人民代表大会|全国政协|政治局会议|中央经济工作会议|中央全会|中央委员会.*全体会议|[二三四五六七八九十]中全会|国务院常务会议|G20|APEC|博鳌|达沃斯/i.test(title)) return true;
  if (/证监会|沪深港通|股指期货交割|期指交割|MSCI|富时.*(指数|调整)|关税|出口管制|贸易谈判|制裁/i.test(title)) return true;
  if (centralBank && /利率决议|利率决定|联邦基金利率|议息|FOMC|货币政策(会议|声明|报告)|降息|加息|降准|缩表|扩表|量化宽松|量化紧缩|缩减购债|缩减资产负债表/i.test(title)) return true;
  // Routine balance-sheet and reserve statistics are not policy decisions.
  if (/资产负债表|储备金余额|银行储备|央行储备金/.test(title)) return false;
  if (domestic && /GDP|国内生产总值|CPI|PPI|PMI|采购经理|居民消费价格|消费者物价|工业生产者|进出口|贸易(帐|差额)|工业增加值|工业企业利润|固定资产投资|社会消费品零售|社会融资|新增.{0,4}贷款|货币供应.{0,4}M[12]|M[12].{0,4}货币供应|LPR|贷款市场报价|外汇储备|国民经济运行|金融(统计|数据)/i.test(title)) return true;
  if (us && /CPI|PCE|消费者物价|消费(者)?价格|个人消费支出|非农|失业率|失业(救济|金)|GDP|国内生产总值|ISM|PMI|零售销售|ADP/i.test(title)) return true;
  if (euro && /CPI|HICP|调和消费|GDP|国内生产总值/i.test(title)) return true;
  if (/OPEC|欧佩克|EIA.{0,12}原油库存/i.test(title)) return true;
  if (event.source !== 'investment_calendar') return false;
  if (/电影|首映|定档|演唱会|音乐节|文化节|体育赛事/.test(title)) return false;
  if (event.sectors?.some((sector) => sector.trim())) return true;
  return /CES|MWC|ESMO|ASCO|AACR|开发者大会|半导体|芯片|人工智能|机器人|算力|光伏|储能|新能源|汽车|电池|医疗|医药|肿瘤|生物技术|商业航天|低空经济/i.test(title);
}
