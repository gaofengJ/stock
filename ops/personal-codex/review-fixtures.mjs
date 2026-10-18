export function reviewFixture(path, date = '2026-10-16') {
  const name = new URL(path, 'https://test').pathname.split('/').at(-1);
  const byName = {
    overview:{date,snapshot:{amount:12000,up:2000,down:3000,total:5000},previousAmount:10000,fiveDayAmount:15000,series:[{date:'2026-10-15',data:{amount:10000,up:3000}}],indexes:[{code:'000001.SH',name:'上证指数',series:[{date,close:3000,pctChg:-1}]}]},
    breadth:{date,snapshot:{ma20:{ratio:40,eligible:5000},ma60:{ratio:60,eligible:4500}}},
    sentiment:{date,snapshot:{limitUp:50,limitDown:10,maxHeight:5,sealRate:80,upgrades:[{from:4,numerator:2,denominator:3,rate:66.67}]},series:[]},
    feedback:{date,ready:true,previousDate:'2026-10-15',groups:[{name:'昨日连板',ready:true,sample:10,average:-2,riseRate:30}]},
    sectors:{date,items:[{code:'881001.TI',name:'样例行业',asOf:date,twenty:20,five:1,day:-2}],rotation:[{date:'2026-10-15',total:90,values:[{code:'881001.TI',rank:5}]},{date,total:90,values:[{code:'881001.TI',rank:3}]}]},
    'theme-review':{date,ready:true,total:50,classified:45,groups:[{name:'样例题材',count:10,maxHeight:3,items:[{name:'样例股票'}]}]},
  };
  return byName[name];
}
