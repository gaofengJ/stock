const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),ts=require('typescript');
const root=path.join(__dirname,'../src/app/strategy');
function load(name){const out={};const compiled=ts.transpileModule(fs.readFileSync(path.join(root,name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new Function('exports','require',compiled)(out,id=>id.startsWith('./')?load(id.slice(2)):require(id));return out;}
const {readStrategyOptions,writeStrategyOptions,validStrategyDate}=load('strategy-state');
const {trendDefaults}=load('strategy-options');
const {readStrategyTurnover,turnoverQueryKey}=load('strategy-state');
const {chartPriceView}=load('chart-prices');

test('默认价位取每日实际开高低收，指标和突破位使用同一展示口径，策略数据不被改写',()=>{
 const quote={open:55,close:57.37,high:59.2,low:54,vol:100,preClose:54,pctChg:6.24,amount:1000,turnoverRateTotal:2};
 const data={date:'2026-10-20',basis:'后复权',series:[{date:'2026-10-20',open:85,close:88.6590945945946,high:91.30,low:83,vol:100,quote}],evidence:{breakoutPrice:83.75,breakoutDate:'2026-10-19'}};
 const before=JSON.stringify(data),view=chartPriceView(data,'raw');
 assert.equal(view.basis,'不复权');
 assert.deepEqual([view.series[0].open,view.series[0].close,view.series[0].high,view.series[0].low],[55,57.37,59.2,54]);
 assert.equal(view.evidence.breakoutPrice,Math.round(data.evidence.breakoutPrice*57.37/data.series[0].close*100)/100);
 assert.equal(view.series[0].quote,quote);assert.equal(JSON.stringify(data),before);
 assert.equal(chartPriceView(data,'strategy'),data);
});
test('行情缺失和停牌保留空档，缺少信号日复权锚点不绘制错误突破价',()=>{
 const make=(date,quote)=>({date,open:90,close:90,high:90,low:90,vol:100,quote});
 const rows=[make('A',null),make('B',{open:1,close:1,high:1,low:1,vol:0}),make('C',{open:1,close:NaN,high:1,low:1,vol:100})];
 const view=chartPriceView({date:'missing',basis:'后复权',series:rows,evidence:{breakoutPrice:80}},'raw');
 assert.ok(view.series.every(p=>p.close===null&&p.vol===null));assert.equal(view.evidence.breakoutPrice,undefined);
});

test('换手率按策略独立保存，切换及刷新不会混用门槛',()=>{const query=new URLSearchParams();query.set(turnoverQueryKey('gapThreeUp'),'8');assert.equal(readStrategyTurnover(query,'gapThreeUp'),8);assert.equal(readStrategyTurnover(query,'gapTwoUp'),5);query.set(turnoverQueryKey('gapTwoUp'),'10');const refreshed=new URLSearchParams(query.toString());assert.equal(readStrategyTurnover(refreshed,'gapThreeUp'),8);assert.equal(readStrategyTurnover(refreshed,'gapTwoUp'),10);refreshed.set(turnoverQueryKey('gapThreeUp'),'5');assert.equal(readStrategyTurnover(refreshed,'gapTwoUp'),10);});
test('换手率允许零门槛及两位小数，无效共享参数回到默认5%',()=>{for(const raw of ['NaN','-1','1001','5.001',''])assert.equal(readStrategyTurnover(new URLSearchParams({turnover_gapThreeUp:raw}),'gapThreeUp'),5);assert.equal(readStrategyTurnover(new URLSearchParams('turnover_gapThreeUp=0'),'gapThreeUp'),0);assert.equal(readStrategyTurnover(new URLSearchParams('turnover_gapThreeUp=5.01'),'gapThreeUp'),5.01);});
test('应用参数写入链接后完整恢复，包括false及零容差',()=>{const expected={...trendDefaults,breakoutDays:60,volumeDays:10,volumeMultiple:2.2,fiveMaMode:'current',aboveMa5:true,bullish:false,pullbackBelow:0};const query=new URLSearchParams(writeStrategyOptions(expected));assert.deepEqual(readStrategyOptions(query),expected);});
test('无效共享链接不制造异常参数或真假反转',()=>{const query=new URLSearchParams('breakoutDays=NaN&volumeDays=2.5&volumeMultiple=99&fiveMaMode=bad&aboveMa5=false&bullish=yes&expandingVolume=false&contractionRatio=-1');assert.deepEqual(readStrategyOptions(query),trendDefaults);assert(Object.values(writeStrategyOptions()).every(v=>v===undefined));});
test('日期校验拒绝自动进位和格式错误',()=>{assert.equal(validStrategyDate('2026-02-30'),undefined);assert.equal(validStrategyDate('2026-9-30'),undefined);assert.equal(validStrategyDate('2026-09-30'),'2026-09-30');});
