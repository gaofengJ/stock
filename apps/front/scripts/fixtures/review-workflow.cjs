// Synthetic account and data only. Shared by CI browser checks and the local fixture server.
const date = '2026-10-23';
const stock = {tsCode:'000001.SZ',name:'测试股份',capState:'within',close:12,totalMv:100000,circMv:50000,strategies:[{key:'fiveMaUp',label:'五线顺上'}]};
const owner = {id:1,username:'fixture',nickname:'交互验证',roles:[{code:'admin'}],permissions:['review','strategy','news','market'],catalog:[{route:'/review',code:'review',group:'复盘'},{route:'/strategy',code:'strategy',group:'策略'},{route:'/news',code:'news',group:'资讯'},{route:'/analysis',code:'market',group:'市场'}]};
const privateKeys=['dataState','yesterday','marketFacts','marketJudgment','themes','execution','candidates','normalPlan','strongPlan','weakPlan','lesson','toolEvidence','holdingEvidence'];
const publicKeys=['title','summary','market','themes','watch','lesson','sources'];
const answer=['核心判断','市场与情绪','主线与梯队','板块多周期对照','后续验证'].map(h=>`### ${h}\n\n测试分析：${h}，请核验证据。`).join('\n\n');
const history={id:'fixture-history',skill:'market-review',date,codes:[],message:'测试历史结果',answer,status:'completed',historyTurns:0,createdAt:'2026-10-23T10:00:00Z',model:'gpt-6.1-sol',effort:'high',skillVersion:'v4',contextSummary:{strategy:'市场复盘',stocks:[],gaps:[],limitations:[],sources:[]}};
const summary={strategy:{name:'市场、情绪、板块与涨停题材'},stocks:[],gaps:[],limitations:[],sources:['market','breadth','sentiment','feedback','sectors20','themes'].map(name=>({name,state:'ready',ms:1}))};
function createFixture() {
 const state={writes:[],submissions:[],tasks:[{...history}],previewDelay:0,marketDelay:0,revision:3,content:{private:Object.fromEntries(privateKeys.map(k=>[k,k==='marketJudgment'?'服务器原文':''])),public:Object.fromEntries(publicKeys.map(k=>[k,''])),article:{body:'# 服务器已存正文\n\n请保留此版本',images:[],feishuUrl:''}},requests:[]};
 async function handle(url,method='GET',body) {
  const u=new URL(url,'http://localhost');const path=u.pathname;state.requests.push({path,method});
  if(path.startsWith('/personal-ai/api')) {
   let data;
   if(path.endsWith('/status')) data={enabled:true,capabilities:{streaming:false,reviewDocument:true},tasks:state.tasks,metadata:{plan:'pro',models:[{model:'gpt-6.1-sol',efforts:['high']}],quota:{}},today:{calls:state.submissions.length,tokens:0},limits:{dailyCalls:20,dailyTokens:200000}};
   else if(path.endsWith('/preview')) {if(state.previewDelay)await new Promise(r=>setTimeout(r,state.previewDelay));data={snapshot:summary,inputBytes:12000};}
   else if(path.endsWith('/tasks')&&method==='POST') {state.submissions.push(body);data={...history,...body,id:`fixture-${state.submissions.length}`,createdAt:new Date().toISOString()};state.tasks.unshift(data);}
   else if(path.endsWith('/cancel')) {data=state.tasks.find(t=>path.includes(t.id));data.status='cancelled';}
   else data=state.tasks.find(t=>path.endsWith(t.id))||history;
   return data;
  }
  let data={items:[],sources:[]};
  if(path==='/api/news/stocks')data=[{tsCode:stock.tsCode,name:stock.name}];
  if(path==='/api/auth/access')data={user:owner,trial:null};
  if(path==='/api/auth/csrf')data={csrfToken:'fixture-only'};
  if(path==='/api/common/all-options')data={};
  if(path==='/api/basic/trade-cal/list')data=[{calDate:date,isOpen:1}];
  if(path==='/api/review/notebook') {
   if(method==='POST') {state.writes.push(body);state.content=JSON.parse(body.content);data={revision:++state.revision};}
   else data={date:u.searchParams.get('date')||date,revision:state.revision,generation:0,content:state.content,versions:[{revision:state.revision,createdAt:'2026-10-23 18:00'}],previous:null};
  }
  if(path==='/api/review/notebook/dates')data=[{date,revision:state.revision}];
  if(path==='/api/review/report')data={date,complete:true,items:[stock],strategies:[{key:'fiveMaUp',label:'五线顺上',state:'ready'}]};
  if(path==='/api/strategy/tabs-list')data=[{key:'fiveMaUp',name:'五线顺上',label:'五线顺上'}];
  if(path==='/api/strategy/list')data=[stock];
  if(path.includes('candidate-labels')||path.includes('candidate-context'))data=[];
  if(path.includes('candidate-environment'))data={date,market:null,breadth:null};
  if(path.includes('financial'))data={items:[{...stock,status:'profit',amount:100,reportDate:'2026-06-30',announcedAt:date,sourceState:'ready',forecastState:'ready',history:[],forecast:null}],sources:[]};
  if(path==='/api/analysis/market/status') {if(state.marketDelay)await new Promise(r=>setTimeout(r,state.marketDelay));data={revision:'fixture-revision',latestDate:date,expectedDate:date,dates:[date],stages:[],backfill:null};}
  if(path==='/api/news/sources')data={collecting:false,sources:[]};
  if(path==='/api/news/preferences')data={keywords:[],stocks:[]};
  if(path==='/api/news')data={items:[{id:1,source:'fixture',kind:'flash',timeBasis:'published',read:false,important:false,related:[],title:'测试股份消息',body:'用于交互测试的公开合成信息',sourceName:'测试来源',publishedAt:`${date} 18:00:00`,originalUrl:'https://example.com/news',stocks:[]}],total:1,date,latestId:1,newCount:0,updatedAt:`${date}T10:00:00Z`};
  return {code:0,data};
 }
 return {state,handle,date,stock,history};
}
module.exports={createFixture};
