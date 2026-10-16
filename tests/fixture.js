/* LOCAL TEST SERVER ONLY. Synthetic data; never included in deployment build. */
(()=>{
 const now=Date.now(),uid='local-fixture',prefix='users/'+uid+'/';
 const store=new Map(),listeners=new Map();let seq=0,authCallback;
 const clone=x=>JSON.parse(JSON.stringify(x));
 const docSnapshot=(path)=>({id:path.split('/').at(-1),exists:store.has(path),data:()=>clone(store.get(path)||{})});
 function snapshot(path){const rows=[...store.keys()].filter(k=>k.startsWith(path+'/')&&!k.slice(path.length+1).includes('/')).map(docSnapshot);return {empty:!rows.length,size:rows.length,forEach:cb=>rows.forEach(cb),docs:rows};}
 const notify=path=>{for(const [key,cbs] of listeners)if(key===path||path.startsWith(key+'/'))cbs.forEach(cb=>setTimeout(()=>cb(key===path?docSnapshot(key):snapshot(key)),0));};
 /* (v5.5) Firestore 의미를 흉내 낸다: merge(얕은 병합) · mergeFields(나열 필드만 교체) · update의 점 경로 */
 const dotted=(base,data)=>{const out=clone(base||{});for(const [k,v] of Object.entries(clone(data))){if(k.includes('.')){const ks=k.split('.');let o=out;for(const p of ks.slice(0,-1)){o[p]=o[p]&&typeof o[p]==='object'?o[p]:{};o=o[p];}o[ks.at(-1)]=v;}else out[k]=v;}return out;};
 const set=(path,data,opts)=>{let next;
  if(opts?.mergeFields){next=clone(store.get(path)||{});for(const f of opts.mergeFields)next[f]=clone(data[f]);}
  else if(opts?.merge)next={...store.get(path),...clone(data)};else next=clone(data);
  store.set(path,next);notify(path);};
 const doc=path=>({path,id:path.split('/').at(-1),get:async()=>docSnapshot(path),set:async(d,o)=>set(path,d,o),update:async d=>{if(!store.has(path))throw Object.assign(Error('not-found'),{code:'not-found'});store.set(path,dotted(store.get(path),d));notify(path);},delete:async()=>{store.delete(path);notify(path);},onSnapshot:cb=>{if(!listeners.has(path))listeners.set(path,[]);listeners.get(path).push(cb);setTimeout(()=>cb(docSnapshot(path)),0);return()=>{};}});
 const collection=path=>({get:async()=>snapshot(path),doc:id=>doc(path+'/'+(id||'id-'+ ++seq)),add:async data=>{const d=doc(path+'/id-'+ ++seq);await d.set(data);return d;},onSnapshot:cb=>{if(!listeners.has(path))listeners.set(path,[]);listeners.get(path).push(cb);setTimeout(()=>cb(snapshot(path)),0);return()=>{};},orderBy:()=>collection(path),limit:()=>collection(path)});
 const database={doc,collection,batch:()=>{const ops=[];return{set:(r,d,o)=>ops.push(()=>set(r.path,d,o)),delete:r=>ops.push(()=>store.delete(r.path)),commit:async()=>ops.forEach(fn=>fn())};},runTransaction:async fn=>{const ops=[];const v=await fn({get:r=>r.get(),set:(r,d)=>ops.push(()=>set(r.path,d))});ops.forEach(fn=>fn());return v;}};
 const user={uid,email:'preview@example.test'};
 const auth={currentUser:user,onAuthStateChanged:cb=>{authCallback=cb;setTimeout(()=>cb(auth.currentUser),0);},signOut:async()=>{auth.currentUser=null;authCallback(null);},signInWithPopup:async()=>{},signInWithRedirect:async()=>{}};
 const fAuth=()=>auth;fAuth.GoogleAuthProvider=function(){this.setCustomParameters=()=>{}};
 const firestoreFn=()=>database;firestoreFn.FieldValue={serverTimestamp:()=>Date.now()};
 window.firebase={initializeApp:()=>{},firestore:firestoreFn,auth:fAuth};
 const cases=[['KR','005930','삼성전자','반도체',79000],['KR','000660','SK하이닉스','반도체',180000],['KR','005380','현대자동차','자동차',230000],['KR','035420','NAVER','인터넷',210000],['KR','069500','KODEX 200','ETF',35000,'etf'],['KR','133690','TIGER 미국나스닥100','ETF',98000,'etf'],['US','MSFT','마이크로소프트','소프트웨어',450],['US','NVDA','엔비디아','반도체',170],['US','AAPL','애플','전자제품',220],['US','VOO','Vanguard S&P 500','ETF',500,'etf']];
 function chart(price,market){const t=[],c=[],o=[],h=[],l=[],v=[];let d=new Date(now-760*864e5);d.setUTCHours(market==='KR'?0:13,market==='KR'?0:30,0,0);let i=0;for(;d.getTime()<now-864e5;d=new Date(+d+864e5)){if([0,6].includes(d.getUTCDay()))continue;const p=price*(.78+i*.0004+Math.sin(i/14)*.04);t.push(+d/1000);c.push(p);o.push(p*.99);h.push(p*1.02);l.push(p*.98);v.push(5000000+i*100);i++;}return{t,c,o,h,l,v,price:c.at(-1),currency:market==='KR'?'KRW':'USD',mktTime:t.at(-1)*1000+6*3600e3,updatedAt:now};}
 for(const [market,code,name,sector,price,type] of cases){const id=market+'_'+code,c=chart(price,market);c.fund={roe:25,margin:20,de:45,deRatio:.45,epsG:20,revG:18,epsTtm:price/25,epsFwd:price/22,revPS:price/4,fcur:c.currency,qcur:c.currency,fx:1,ts:now};c.ana={n:15,tgt:price*1.2,rec:1.8,lg:now/1000-86400,ts:now};if(type)c.etf={exp:.2,assets:1e12,ts:now,nod:0};store.set(prefix+'qa_stocks/'+id,{market,code,name,sector,type:type||'stock',symbol:market==='KR'?code+'.KS':code,manual:{},createdAt:now});store.set(prefix+'qa_cache/'+id,c);}
 store.set(prefix+'qa_settings/global',{proxy:'',refreshMin:10,quoteSec:30});
 store.set(prefix+'qa_trades/example',{market:'KR',code:'005930',name:'삼성전자',type:'stock',account:'general:가족계좌',date:'2026-08-03',side:'buy',qty:20,price:72000,sequence:1});
 window.__fixture={store,database,auth};
 window.fetch=async url=>{const u=String(url);if(u.includes('chart')){let symbol='^GSPC';try{symbol=decodeURIComponent(u.split('/chart/')[1].split('?')[0]);}catch{}const found=cases.find(c=>symbol.includes(c[1]));const c=chart(found?.[4]||5000,found?.[0]||'US');return new Response(JSON.stringify({chart:{result:[{meta:{symbol,currency:c.currency,regularMarketPrice:c.price,regularMarketTime:c.mktTime/1000},timestamp:c.t,indicators:{quote:[{open:c.o,high:c.h,low:c.l,close:c.c,volume:c.v}]}}]}}));}return new Response('{}',{status:503});};
 const banner=document.createElement('div');banner.textContent='미리보기 · 합성 데이터 · 실제 계정에 연결되지 않습니다';banner.style='background:#fff1ce;text-align:center;padding:8px;font-size:12px';document.body.prepend(banner);
})();
