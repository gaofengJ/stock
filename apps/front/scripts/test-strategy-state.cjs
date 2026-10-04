const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),ts=require('typescript');
const root=path.join(__dirname,'../src/app/strategy');
function load(name){const out={};const compiled=ts.transpileModule(fs.readFileSync(path.join(root,name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new Function('exports','require',compiled)(out,id=>id.startsWith('./')?load(id.slice(2)):require(id));return out;}
const {readStrategyOptions,writeStrategyOptions,validStrategyDate}=load('strategy-state');
const {trendDefaults}=load('strategy-options');
test('应用参数写入链接后完整恢复，包括false及零容差',()=>{const expected={...trendDefaults,breakoutDays:60,volumeDays:10,volumeMultiple:2.2,fiveMaMode:'current',aboveMa5:true,bullish:false,pullbackBelow:0};const query=new URLSearchParams(writeStrategyOptions(expected));assert.deepEqual(readStrategyOptions(query),expected);});
test('无效共享链接不制造异常参数或真假反转',()=>{const query=new URLSearchParams('breakoutDays=NaN&volumeDays=2.5&volumeMultiple=99&fiveMaMode=bad&aboveMa5=false&bullish=yes&expandingVolume=false&contractionRatio=-1');assert.deepEqual(readStrategyOptions(query),trendDefaults);assert(Object.values(writeStrategyOptions()).every(v=>v===undefined));});
test('日期校验拒绝自动进位和格式错误',()=>{assert.equal(validStrategyDate('2026-02-30'),undefined);assert.equal(validStrategyDate('2026-9-30'),undefined);assert.equal(validStrategyDate('2026-09-30'),'2026-09-30');});
