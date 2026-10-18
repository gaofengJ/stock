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
  return (raw?.indexes||[]).slice(0,5).map(index=>{
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

export async function reviewSnapshot(task,read) {
  const date=task.date,started=Date.now(),sources=[];
  const get=async(name,path,required=false)=>{const at=Date.now();try{const data=await read(path);sources.push({name,state:'ready',ms:Date.now()-at});return data;}catch(e){sources.push({name,state:'unavailable',ms:Date.now()-at});if(required||[401,403,429].includes(e.status))throw e;return null;}};
  const raw=await get('review','/review/report?'+query({date}),true);
  if(raw?.date!==date || !Array.isArray(raw.items)) throw Error('复盘日期或数据格式不匹配');
  const [environment,indexes]=await Promise.all([get('market','/analysis/market/candidate-environment?'+query({date}),true),get('indexes','/analysis/market/overview?'+query({date,days:60,scope:'all'}),true)]);
  const groups=key=>{
    const counts=new Map();
    for(const row of raw.items) for(const label of new Set((row[key]||[]).filter(x=>!x.asOf||x.asOf<=date).map(x=>x.name))) if(label)counts.set(label,(counts.get(label)||0)+1);
    return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,8).map(([name,count])=>({name,count}));
  };
  const sample=raw.items.slice(0,12).map(r=>({code:r.tsCode,name:r.name,...numeric(r,['close','pctChg','amount','turnoverRateF','volumeRatio','totalMv','circMv']),
    strategies:(r.strategies||[]).map(s=>s.key),industry:r.industry||null,capState:r.capState,
    risk:pick(r.risk,['state','reasons','note']),trendEvidence:pick(r,['breakoutPrice','breakoutPct','volumeMultiple','aboveMa5Pct','streak'])}));
  const gaps=[];
  if(!raw.complete)gaps.push('部分策略未完成，候选总数不是完整结果');
  if(!environment?.market)gaps.push('大盘统计缺失');
  if(!environment?.breadth)gaps.push('市场均线广度缺失');
  if(raw.items.some(r=>!(r.industries?.length)))gaps.push('部分候选行业标签缺失');
  const indexData=compactIndexes(indexes,date);
  if(!indexData.length || indexData.some(x=>x.asOf!==date))gaps.push('部分主要指数行情缺失或日期不齐');
  return {version:'review/v2',date,fetchedAt:new Date().toISOString(),complete:raw.complete,counts:raw.counts,
    strategies:(raw.strategies||[]).map(s=>pick(s,['key','label','state','count'])),
    market:compactMarket(environment,date),indexes:indexData,
    candidateStructure:{industries:groups('industries'),topics:groups('topics'),scope:'仅当日候选集合，按覆盖候选数排序，不是全市场热点排行；同一股票可属于多个题材',industryCovered:raw.items.filter(r=>r.industries?.length).length,topicCovered:raw.items.filter(r=>r.topics?.length).length},
    total:raw.items.length,included:sample.length,omitted:Math.max(0,raw.items.length-sample.length),sampleRule:'现有复盘接口按流通市值升序的前12只，不代表最强股票或推荐排序',items:sample,
    riskNote:typeof raw.riskNote==='string'?raw.riskNote.slice(0,700):null,
    profile:{source:'网站全部策略，使用各策略默认参数；不是策略页面自定义筛选',sorting:'流通市值升序'},
    units:{price:'元',amount:'千元；market.stats.amount为亿元',marketValue:'totalMv/circMv为万元',percent:'pctChg、turnoverRateF、涨跌幅及广度均为%；volumeRatio为倍',indexes:'dayPct为当日涨幅%，fivePct/twentyPct为5/20交易日收盘累计涨幅%'},
    gaps,limitations:['候选行业题材分布不代表全市场热度或资金流向','未发送个人持仓、成本、笔记；未读取实时新闻或公告原文','复盘不逐一获取全部候选的长周期K线和完整财务，深入分析请到策略选股选择个股'],sources,fetchMs:Date.now()-started};
}
