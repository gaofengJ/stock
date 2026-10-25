// Business data only. All requests use existing authenticated, read-only website APIs.
const rules = {
  gapThreeUp: ['缺口三连阳', '从跳空日起连续三天收阳，后续最低价均高于跳空前一天最高价'],
  gapTwoUp: ['缺口二连阳', '从跳空日起连续两天收阳，后续最低价均高于跳空前一天最高价'],
  gapThreeHighTurnover: ['缺口三日高换手', '跳空日起三天自由流通换手率超过门槛；跳空日成交额高于前一日，后续低点未触及缺口下沿'],
  threeDaysHighVol: ['连续三日收阳', '连续三日收盘高于开盘，不要求逐日上涨或放量'],
  continuousGap: ['连续向上缺口', '连续两天最低价高于前一天最高价，不要求收阳'],
  shadowWrap: ['缺口上影反包', '跳空日上影超过昨收3%，次日收阳且收盘突破跳空日最高价，低点未触及缺口下沿'],
  volumeBreakout: ['放量突破', '收盘超过前breakoutDays日最高价，量能不低于前volumeDays日均量的volumeMultiple倍；参考窗口不含当日'],
  breakoutPullback: ['突破回踩', '近pullbackDays日最近一次放量突破后至少经过一个回踩日；回踩缩量，未跌破容差，当日收阳且收盘高于昨日和突破位'],
  fiveMaUp: ['五线向上', 'MA5>MA10>MA20>MA60>MA120且五线均向上；new仅选当日新形成，current允许持续形态'],
};
const defaults = { breakoutDays: 20, volumeDays: 5, volumeMultiple: 1.5, pullbackDays: 10, pullbackBelow: 2, pullbackAbove: 3, contractionRatio: .8, fiveMaMode: 'new', aboveMa5: false, bullish: false, expandingVolume: false };
const bounds = { minTurnoverRateF: [0,1000], breakoutDays: [5,120,true], volumeDays: [3,20,true], volumeMultiple: [1,5], pullbackDays: [3,20,true], pullbackBelow: [0,10], pullbackAbove: [0,10], contractionRatio: [.1,1] };
export function strategySpec(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(rules, value.type)) throw Error('请选择当前策略后重新打开分析');
  if (Object.keys(value).some(k => !['type','parameters','sector','keyword'].includes(k))) throw Error('策略信息包含未允许字段');
  const raw = value.parameters || {};
  if (typeof raw !== 'object' || Array.isArray(raw)) throw Error('筛选参数无效');
  for (const [k,v] of Object.entries(raw)) {
    if (bounds[k]) { const [lo,hi,int] = bounds[k]; if (typeof v !== 'number' || !Number.isFinite(v) || v<lo || v>hi || (int && !Number.isInteger(v))) throw Error('筛选参数超出范围'); }
    else if (['aboveMa5','bullish','expandingVolume'].includes(k)) { if (typeof v !== 'boolean') throw Error('筛选参数类型错误'); }
    else if (k==='fiveMaMode') { if (!['new','current'].includes(v)) throw Error('均线模式错误'); }
    else throw Error('筛选参数包含未允许字段');
  }
  if (value.sector != null && !/^88[156]\d{3}\.TI$/.test(value.sector)) throw Error('板块筛选无效');
  if (value.keyword != null && (typeof value.keyword !== 'string' || value.keyword.length>100)) throw Error('搜索条件过长');
  const trend = ['volumeBreakout','breakoutPullback','fiveMaUp'].includes(value.type);
  let parameters = trend ? { ...defaults, ...raw } : {};
  if (!trend || value.type==='volumeBreakout') parameters.minTurnoverRateF = raw.minTurnoverRateF ?? 5;
  else delete parameters.minTurnoverRateF;
  // Keep exactly the parameters affecting the selected strategy.
  const relevant = value.type==='fiveMaUp' ? ['fiveMaMode','aboveMa5','bullish','expandingVolume',...(parameters.expandingVolume?['volumeDays','volumeMultiple']:[])] : value.type==='volumeBreakout' ? ['breakoutDays','volumeDays','volumeMultiple','minTurnoverRateF'] : value.type==='breakoutPullback' ? ['breakoutDays','volumeDays','volumeMultiple','pullbackDays','pullbackBelow','pullbackAbove','contractionRatio'] : ['minTurnoverRateF'];
  parameters = Object.fromEntries(relevant.map(k=>[k,parameters[k]]));
  return { type:value.type, parameters, ...(value.sector?{sector:value.sector}:{}), ...(value.keyword?{keyword:value.keyword.trim()}:{} ) };
}
const num = v => v == null || v === '' || typeof v==='boolean' || !Number.isFinite(Number(v)) ? null : Number(Number(v).toFixed(3));
const pick = (v, keys) => Object.fromEntries(keys.filter(k=>v?.[k]!==undefined).map(k=>[k,typeof v[k]==='number'?num(v[k]):v[k]]));
const numeric = (v,keys) => Object.fromEntries(keys.map(k=>[k,num(v?.[k])]));
const pct = (a,b) => a!=null && b>0 ? num((a/b-1)*100) : null;
const query = data => new URLSearchParams(Object.entries(data).filter(([,v])=>v!=null).map(([k,v])=>[k,String(v)])).toString();

export function compactChart(raw,date) {
  // Keep missing sessions in the window: never silently bridge gaps or include future bars.
  const series = (raw?.series || []).filter(p=>/^\d{4}-\d{2}-\d{2}$/.test(p.date) && p.date<=date).sort((a,b)=>a.date.localeCompare(b.date));
  const last = series.at(-1), close = num(last?.close);
  const valid = rows => rows.length && rows.every(p=>num(p.close)>0);
  const mean = n => { const w=series.slice(-n); return w.length===n && valid(w)?num(w.reduce((s,p)=>s+Number(p.close),0)/n):null; };
  const change = n => { const w=series.slice(-(n+1)); return w.length===n+1&&valid(w)?pct(close,num(w[0].close)):null; };
  const recent=series.slice(-20), highs=recent.map(p=>num(p.high)), lows=recent.map(p=>num(p.low));
  return { basis:raw?.basis || '未知', asOf:last?.date || null, sessions:series.length, exactDate:last?.date===date,
    returnsPct:{five:change(5),twenty:change(20),sixty:change(60)}, ma:Object.fromEntries([5,10,20,60,120].map(n=>[n,mean(n)])),
    range20:recent.length===20 && highs.every(v=>v>0)&&lows.every(v=>v>0)?{high:Math.max(...highs),low:Math.min(...lows)}:null,
    evidence:pick(raw?.evidence,['strategy','breakoutPrice','breakoutPct','volumeMultiple','breakoutDate','pullbackPct','contractionRatio','averages','aboveMa5Pct','streak','streakCapped']),
    recentBars:series.slice(-5).map(p=>({date:p.date,...numeric(p,['open','high','low','close','vol'])})),
    missingSessions:recent.filter(p=>!(num(p.close)>0)).length };
}
function compactSectors(raw,date) {
  const all=(raw?.sectorPerformance || []).filter(s=>s.asOf && s.asOf<=date);
  const topics=all.filter(s=>s.type==='N');
  // Deterministic liquidity-independent sample: strongest/weakest day + remaining by magnitude.
  const sorted=[...topics].sort((a,b)=>(num(b.day)??-Infinity)-(num(a.day)??-Infinity));
  const selected=[sorted[0],sorted.at(-1),...topics.sort((a,b)=>Math.abs(num(b.day)??0)-Math.abs(num(a.day)??0))].filter(Boolean);
  const chosen=[...new Map(selected.map(s=>[s.code,s])).values()].slice(0,4);
  return { ready:raw?.sectorContextReady===true, totalTopics:topics.length, omittedTopics:Math.max(0,topics.length-chosen.length), selection:'行业全部；题材按当日涨跌最强、最弱及绝对涨跌幅选最多4个，不代表业务收入权重',
    items:[...all.filter(s=>s.type==='I'),...chosen].map(s=>({...pick(s,['code','name','type','asOf']),...numeric(s,['day','five','twenty','maxHeight'])})) };
}
function financial(raw,date) {
  const allowed=r=>r?.announcedAt && r.announcedAt<=date;
  return { sourceState:raw?.sourceState||'unknown', forecastState:raw?.forecastState||'unknown',
    history:(raw?.history || []).filter(allowed).slice(0,3).map(r=>({...pick(r,['status','reportDate','announcedAt']),amount:num(r.amount)})),
    forecast:allowed(raw?.forecast)?{...pick(raw.forecast,['reportDate','announcedAt','type']),...numeric(raw.forecast,['profitMin','profitMax','changeMin','changeMax'])}:null };
}
function compactMarket(environment,date) {
  if(environment?.date!==date) return null;
  return {date,stats:numeric(environment.market,['amount','up','down','flat','total','upRatio','limitUp','limitDown','maxHeight','sealRate','brokenRate']),breadth:environment.breadth?{ma20:pick(environment.breadth.ma20,['ratio','eligible','missing','insufficient']),ma60:pick(environment.breadth.ma60,['ratio','eligible','missing','insufficient'])}:null};
}
export function compactIndexes(raw,date) {
  return (raw?.indexes||[]).slice(0,9).map(index=>{
    const rows=(index.series||[]).filter(p=>p.date<=date).sort((a,b)=>a.date.localeCompare(b.date));
    const last=rows.at(-1), at=n=>rows.length>n?pct(num(last?.close),num(rows.at(-n-1)?.close)):null;
    return {code:index.code,name:index.name,asOf:last?.date||null,close:num(last?.close),dayPct:num(last?.pctChg),fivePct:at(5),twentyPct:at(20)};
  });
}
export async function candidateSnapshot(task, read) {
  const spec=strategySpec(task.strategy), date=task.date, started=Date.now(), sources=[];
  const fetchData=async(name,path,required=false)=>{
    const at=Date.now();
    try { const data=await read(path); sources.push({name,state:'ready',ms:Date.now()-at}); return data; }
    catch(e) { sources.push({name,state:'unavailable',ms:Date.now()-at}); if(required || e.status===401 || e.status===403 || e.status===429) throw e; return null; }
  };
  const list=await fetchData('strategy','/strategy/list?'+query({date,strategyType:spec.type,includeLabels:false,...spec.parameters,sector:spec.sector}),true);
  if (!Array.isArray(list)) throw Error('策略候选数据格式无效');
  const rows=task.codes.map(code=>list.find(r=>r.tsCode===code));
  if (rows.some(r=>!r || r.tradeDate?.slice(0,10)!==date || !(num(r.close)>0))) throw Error('所选股票已不在当前策略候选中或当日行情缺失，请刷新候选列表');
  const scope=query({date,codes:task.codes.join(',')});
  // Bound fanout to two requests to preserve website headroom.
  const [environment,sectors]=await Promise.all([
    fetchData('market','/analysis/market/candidate-environment?'+query({date}),true),
    fetchData('sectors','/strategy/candidate-context?'+scope),
  ]);
  const [profits,indexes]=await Promise.all([fetchData('financial','/strategy/candidate-financials?'+scope),fetchData('indexes','/analysis/market/overview?'+query({date,days:60,scope:'all'}),true)]);
  const charts=[];
  for (const code of task.codes) charts.push(await fetchData('chart:'+code,'/strategy/chart?'+query({date,strategyType:spec.type,code,...spec.parameters,chartLatest:false})));
  const market=environment?.date===date?environment:null;
  const quoteKeys=['open','high','low','close','preClose','pctChg','vol','amount','turnoverRate','turnoverRateF','volumeRatio','pe','peTtm','pb','totalMv','circMv'];
  const stocks=rows.map((r,i)=>({code:r.tsCode,name:r.name,
    selection:{matched:true,verifiedBy:'strategy/list',evidence:pick(r,['breakoutPrice','breakoutPct','volumeMultiple','breakoutDate','pullbackPct','contractionRatio','averages','aboveMa5Pct','streak','streakCapped'])},
    quote:{date,...numeric(r,quoteKeys)},
    trend:compactChart(charts[i],date),sectors:compactSectors((sectors||[]).find(s=>s.tsCode===r.tsCode),date),
    financial:financial(profits?.items?.find(s=>s.tsCode===r.tsCode),date)}));
  const gaps=[];
  if (!market?.market) gaps.push('大盘统计缺失');
  if (!market?.breadth) gaps.push('市场均线广度缺失');
  const indexData=compactIndexes(indexes,date);
  if(!indexData.length || indexData.some(x=>x.asOf!==date)) gaps.push('部分主要指数行情缺失或日期不齐');
  for(const s of stocks){
    if(!s.trend.exactDate) gaps.push(s.code+'走势未覆盖所选交易日');
    if(!s.sectors.ready) gaps.push(s.code+'板块背景缺失');
    if(!s.financial.history.length) gaps.push(s.code+'历史已披露业绩缺失');
    if(s.quote.peTtm==null && s.quote.pe==null) gaps.push(s.code+'估值指标缺失');
  }
  return {version:'candidate/v2',date,fetchedAt:new Date().toISOString(),
    strategy:{...spec,name:rules[spec.type][0],rule:rules[spec.type][1],common:'成交额>5000万元、排除一字涨停、信号日收盘在日内上半区；传统形态逐日检查成交额和自由流通换手，趋势按对应规则；排除ST、退市整理和历史不足股票',candidateCount:list.length},
    units:{quotePrice:'元，不复权；trend中的价格与均线使用其basis，不能与原始报价直接比较',vol:'手',amount:'千元',marketAmount:'亿元',marketValue:'totalMv/circMv为万元',percent:'涨跌幅、换手率、量价偏离均为%；volumeRatio和volumeMultiple为倍',sector:'day当日涨幅；five/twenty为5/20交易日收盘累计涨幅%；maxHeight为板块内当日最高连板数；asOf为成分日期',financial:'history.amount扣非净利润元；forecast.profitMin/profitMax净利润万元；change为同比%（非单季值）'},
    market:compactMarket(market,date), indexes:indexData,
    stocks,gaps,limitations:['题材标签不证明收入或订单；不含实时新闻、公告原文、盘中数据和公司完整档案','所有历史行情截止所选日期；财务仅保留该日之前已披露记录；缺失值不能解释为0'],
    sources,fetchMs:Date.now()-started};
}

// A bounded union avoids hiding newly strong industries behind a 20-day ranking.
export function reviewSectors(items, date) {
  const rows = (items || []).filter(r => r.asOf === date);
  const ranked = key => rows.filter(r => num(r[key]) !== null).sort((a,b) => Number(b[key])-Number(a[key]) || String(a.code).localeCompare(String(b.code)));
  const selected = new Map();
  const add = (row, reason) => { if (!row) return; const prior = selected.get(row.code); if (prior) prior.selectedFor.push(reason); else selected.set(row.code, {...pick(row,['code','name','day','five','twenty','upRatio','limitUp','maxHeight','asOf']), selectedFor:[reason]}); };
  for (const [key, label] of [['day','当日领先'],['five','5日领先'],['twenty','20日领先']]) ranked(key).slice(0,2).forEach(r => add(r,label));
  add(ranked('twenty').slice(0,10).filter(r => num(r.day)!==null && Number(r.day)<0).sort((a,b)=>Number(a.day)-Number(b.day))[0], '中期强势当日回落');
  add(ranked('day').at(-1), '当日落后对照');
  return [...selected.values()].slice(0,8);
}

export async function reviewSnapshot(task, read) {
  const date = task.date, started = Date.now(), sources = [], gaps = [];
  const get = async (name, endpoint, extra = {}) => {
    const at = Date.now();
    try {
      const data = await read('/analysis/market/' + endpoint + '?' + query({ date, scope: 'all', ...extra }));
      if (data?.date !== date) throw Error('日期不匹配');
      sources.push({ name, state: 'ready', ms: Date.now() - at }); return data;
    } catch (e) {
      if (['market', 'sentiment'].includes(name) || [401, 403, 429].includes(e.status)) throw e;
      sources.push({ name, state: 'unavailable', ms: Date.now() - at }); gaps.push(name + '资料缺失或日期不匹配'); return null;
    }
  };
  // Two requests at a time, bounded data, exact historical date; never substitute today's data.
  const [overview, breadth] = await Promise.all([get('market', 'overview', { days: 20 }), get('breadth', 'breadth', { days: 20 })]);
  const [sentiment, feedback] = await Promise.all([get('sentiment', 'sentiment', { days: 20 }), get('feedback', 'feedback')]);
  const [sectors, themes] = await Promise.all([get('sectors20', 'sectors', { kind: 'I', period: 20, days: 20 }), get('themes', 'theme-review')]);
  if (!overview?.snapshot || !sentiment?.snapshot) throw Error('市场或情绪核心数据缺失');
  const dayRows = rows => (rows || []).filter(r => r.date <= date).slice(-5);
  const ranks = dayRows(sectors?.rotation);
  const sectorRows = [...(sectors?.items || [])].filter(r => r.asOf === date && num(r.twenty) !== null).sort((a,b) => b.twenty-a.twenty).slice(0,12);
  const multiPeriod = reviewSectors(sectors?.items, date);
  const unavailable = [!breadth?.snapshot && '均线广度尚未就绪', !feedback?.ready && '昨日强势股反馈尚未就绪', !sectorRows.length && '20日板块排行尚未就绪', !themes?.ready && '涨停题材尚未就绪'].filter(Boolean);
  gaps.push(...unavailable);
  return { version: 'review/v4', date, fetchedAt: new Date().toISOString(),
    market: { snapshot: overview.snapshot, previousAmount:overview.previousAmount ?? null, fiveDayAmount:overview.fiveDayAmount ?? null, twentyDayAmount:overview.twentyDayAmount ?? null, recent: dayRows(overview.series).map(r => ({date:r.date, ...pick(r.data, ['amount','up','down','flat','total'])})) },
    indexes: compactIndexes(overview,date), breadth: breadth?.snapshot || null,
    sentiment: { snapshot: sentiment.snapshot, recent: dayRows(sentiment.series).map(r => ({date:r.date,...pick(r.data,['limitUp','limitDown','broken','maxHeight','sealRate','upgrades'])})) },
    feedback: feedback?.ready ? { previousDate: feedback.previousDate, groups: (feedback.groups || []).map(g => pick(g,['name','ready','sample','average','riseRate'])) } : null,
    sectors: { scope:'行业收盘涨幅，当日、5交易日、20交易日；精选样本不是全市场', total:(sectors?.items || []).filter(r=>r.asOf===date).length, items:multiPeriod },
    sectors20: { period:20, scope:'全市场行业，按20日涨幅排名；排名是相对位置，不等同资金净流入', total:sectors?.items?.length || 0,
      items:sectorRows.map(r => ({ ...pick(r,['name','day','five','twenty','upRatio','limitUp','maxHeight','asOf']), ranks:ranks.map(day => ({ date:day.date, rank:day.values.find(v=>v.code===r.code)?.rank ?? null, total:day.total })) })) },
    themes: themes?.ready ? { total:themes.total, classified:themes.classified, groups:(themes.groups || []).slice(0,12).map(g=>({name:g.name,count:g.count,maxHeight:g.maxHeight,names:(g.items || []).slice(0,4).map(r=>r.name)})) } : null,
    total:0,included:0,omitted:0,items:[],
    units:{amount:'市场成交额单位亿元',percent:'涨幅、广度、封板率、晋级率单位%；必须区分各自有效样本分母'},
    gaps, limitations:['只使用截止复盘日的数据；空值不代表0','不读取个人持仓或私人笔记；用户记录和策略名单由页面按原文合并','行业精选最多8个，覆盖三周期领先与回落对照；涨停题材列前12组，不可当作全部市场','行业与涨停题材属于不同分类，没有成分对应证据时不得直接等同；排名变化不代表资金流入'],
    sources, fetchMs:Date.now()-started };
}
