const HORIZONS = [1, 3, 5, 10];
const round = value => Math.round(value * 1e6) / 1e6;
function distribution(values) {
  const sorted = values.filter(value => Number.isFinite(value)).sort((a,b) => a-b);
  const n = sorted.length;
  return { sample:n, average:n ? round(sorted.reduce((a,b)=>a+b,0)/n) : null, median:n ? round((sorted[Math.floor((n-1)/2)]+sorted[Math.floor(n/2)])/2) : null };
}
function wilson(wins,total) {
  if (!total) return null;
  const z=1.959963984540054, square=z*z, p=wins/total;
  const center=(p+square/(2*total))/(1+square/total);
  const radius=z*Math.sqrt(p*(1-p)/total+square/(4*total*total))/(1+square/total);
  return [round(Math.max(0,center-radius)*100),round(Math.min(1,center+radius)*100)];
}
function summarize(samples,horizon) {
  const all = samples.map(row=>row.outcomes[horizon]);
  const valid = all.filter(row=>row.state==='valid');
  const paired = valid.filter(row=>Number.isFinite(row.excess));
  const wins = valid.filter(row=>row.value>0).length;
  const outperform = paired.filter(row=>row.excess>0).length;
  return {
    horizon,total:all.length,...distribution(valid.map(row=>row.value)),wins,
    riseRate:valid.length ? round(wins/valid.length*100) : null,
    confidence:wilson(wins,valid.length),
    pending:all.filter(row=>row.state==='pending').length,
    inactive:all.filter(row=>row.state==='inactive').length,
    missing:all.filter(row=>row.state==='missing').length,
    benchmarkMissing:valid.length-paired.length,paired:paired.length,
    benchmark:distribution(paired.map(row=>row.benchmark)),
    excess:distribution(paired.map(row=>row.excess)),
    outperformRate:paired.length ? round(outperform/paired.length*100) : null,
    outperformConfidence:wilson(outperform,paired.length),
  };
}
function extrema(samples,horizon) {
  const valid=samples.filter(row=>row.outcomes[horizon].state==='valid');
  const order=[...valid].sort((a,b)=>a.outcomes[horizon].value-b.outcomes[horizon].value || a.date.localeCompare(b.date) || a.code.localeCompare(b.code));
  const item=row=>{ if(!row) return null; const {date:observationDate,...values}=row.outcomes[horizon]; return {code:row.code,name:row.name,date:row.date,observationDate,...values}; };
  const stocks=new Map();
  for (const row of valid) { if (!stocks.has(row.code)) stocks.set(row.code,[]); stocks.get(row.code).push(row); }
  const rankings=[...stocks].map(([code,rows])=>({code,name:rows.at(-1).name,first:rows[0].date,last:rows.at(-1).date,...summarize(rows,horizon)}));
  return {best:item(order.at(-1)),worst:item(order[0]),rankings};
}
function outcome(date,start,end,benchmarkStart,benchmarkEnd,complete=true) {
  if (!date) return {date:null,value:null,benchmark:null,excess:null,state:'pending',reason:'未到期'};
  if (!complete) return {date,value:null,benchmark:null,excess:null,state:'missing',reason:'观察日行情批次缺失'};
  if (end?.inactive) return {date,value:null,benchmark:null,excess:null,state:'inactive',reason:end.reason||'观察日停牌／无成交'};
  if (!start?.traded || !end?.traded || !(start.close>0) || !(end.close>0)) return {date,value:null,benchmark:null,excess:null,state:'missing',reason:'复权收盘价缺失'};
  let base=start.close;
  if (start.basis!==end.basis) {
    if (end.basis!==end.code || !(end.conversion>0)) return {date,value:null,benchmark:null,excess:null,state:'missing',reason:'新旧代码复权基准不一致'};
    base*=end.conversion;
  }
  const value=(end.close/base-1)*100;
  const benchmark=benchmarkStart>0 && benchmarkEnd>0 ? (benchmarkEnd/benchmarkStart-1)*100 : null;
  return {date,value,benchmark,excess:benchmark===null ? null : value-benchmark,state:'valid',reason:benchmark===null?'上证指数行情缺失':null};
}
module.exports={HORIZONS,distribution,wilson,summarize,extrema,outcome};
