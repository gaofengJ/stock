/* Historical catalog reads only. Supplements stay in the private extraction, never the database. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const back=path.resolve(__dirname,'../../apps/back'),dependency=createRequire(path.join(back,'package.json'));
dependency('dotenv').config({path:process.env.APP_ENV_FILE || path.join(back,'.env.development')});
dependency('ts-node').register({transpileOnly:true,project:path.join(back,'tsconfig.json')});
dependency('tsconfig-paths').register({baseUrl:back,paths:{'@/*':['src/*']}});dependency('reflect-metadata');
const {HttpService}=dependency('@nestjs/axios');
const {TushareService}=require(path.join(back,'src/shared/tushare/tushare.service'));
const {identityIndex,readIdentityRows}=require(path.join(back,'src/modules/source/stock/stock-identity.service'));
const source=new TushareService(new HttpService()),folder=path.resolve(process.argv[2]);
const file=path.join(folder,'manifest.json'),manifest=JSON.parse(fs.readFileSync(file,'utf8'));
const unpack=name=>JSON.parse(zlib.inflateSync(fs.readFileSync(path.join(folder,name)).subarray(4)).toString());
const snapshots=manifest.identities.map(row=>({...row,data:unpack(row.file)})),primary=snapshots.find(row=>row.snapshotKey==='identity');
const names=snapshots.flatMap(row=>row.data.names||[]);
const index=identityIndex({...primary,data:{stocks:primary.data.stocks,names}},manifest.mapping);
async function main(){
 let fetched=0,added=0;
 for(const date of manifest.calendar){
  const missing=new Set(unpack(`${date}-daily.deflate`).filter(row=>Number(row[6])>0 && index.listed(row[0],date) && !index.name(row[0],date)).map(row=>index.canonical(row[0])));
  if(!missing.size)continue;
  const snapshotKey=`study:${date}`;
  if(manifest.identities.some(row=>row.snapshotKey===snapshotKey))continue;
  const response=await source.queryData('bak_basic',{trade_date:date.replaceAll('-','')},'ts_code,name,trade_date',6000,15000);
  const rows=readIdentityRows(response,['ts_code','name','trade_date']);
  assert(rows.every(row=>row.trade_date===date.replaceAll('-','') && row.name),'Historical catalog dates/names must match');
  const supplemental=rows.filter(row=>missing.has(index.canonical(row.ts_code))).map(row=>({tsCode:index.canonical(row.ts_code),name:row.name,startDate:date,endDate:date}));
  const data=Buffer.from(JSON.stringify({stocks:[],names:supplemental})),header=Buffer.alloc(4);header.writeUInt32LE(data.length);
  const name=`supplement-${date}.deflate`;fs.writeFileSync(path.join(folder,name),Buffer.concat([header,zlib.deflateSync(data)]));
  manifest.identities.push({snapshotKey,asOf:primary.asOf,file:name,source:'bak_basic',fetchedAt:new Date().toISOString()});
  fs.writeFileSync(file,JSON.stringify(manifest));fetched++;added+=supplemental.length;
  if(fetched%20===0)console.log(JSON.stringify({fetched,date,added,unresolved:missing.size-supplemental.length}));
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 console.log(JSON.stringify({complete:true,fetched,added}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
