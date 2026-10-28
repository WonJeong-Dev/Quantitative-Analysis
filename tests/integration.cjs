const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const QADomain=require('../src/domain.js');
const src=fs.readFileSync(require('node:path').join(__dirname,'../src/app.js'),'utf8');
const piece=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)+a.length));
const run=(s,g,expr)=>vm.runInNewContext(s+'\n'+expr,{QADomain,...g});
test('financial score varies continuously over old threshold',()=>{
 const s=piece('function pl(','/*')+piece('function qFinance(','function qGrowth(');
 const x=run(s,{numOr:(a,b)=>a??b},'[qFinance({}, {roe:60,margin:45,de:5}),qFinance({}, {roe:60,margin:45,de:5.01})]');
 assert.ok(Math.abs(x[0]-x[1])<.01);assert.ok(x[0]>90);
});
test('auth loss or account switch ends existing identity session before any subscription',async()=>{
 let cb,reloads=0,clears=0,sub=0;const S={};const auth={onAuthStateChanged:fn=>cb=fn};
 await run(piece('let authSubscribed=false','function showLogin()'),{S,auth,UBASE:null,document:{querySelector:()=>({replaceChildren:()=>clears++})},location:{reload:()=>reloads++},showLogin:()=>{},hideLogin:()=>{},updConnChip:()=>{},subscribe:()=>sub++,$:()=>({})},'start()');
 cb({uid:'A'});cb(null);cb({uid:'B'});assert.equal(sub,1);assert.equal(reloads,2);assert.equal(clears,2);assert.equal(S.uid,null);
});
test('backfill retries excess return when benchmark recovers',async()=>{
 const S={uid:'x',glog:{x:{schema:2,rv:'v5.2',at:1000,rows:{US_X:[]},fwd:{US_X:{r20:10}}}},stocks:{US_X:{}},fullOK:{US_X:1},splits:[],cache:{US_X:{}},bench:{US:{}}};
 let writes=0;
 await run(piece('let glBackfillBusy=false','async function glBoot(){'),{S,GL_HORIZ:[20],RULE_VER:'v5.2',splitAdjustable:()=>true,QADomain:{forward:()=>({value:5,entryAt:1,exitAt:2}),forwardTaint:()=>null,normCode:(m,c)=>c},D:()=>({set:async()=>writes++})},'glBackfill()');
 assert.equal(writes,1);assert.equal(S.glog.x.fwd.US_X.x20,0);
});
/* (v7.0) 전방수익률은 doc.at과 가격 시계열만의 함수다 — 판정 규칙과 아무 관계가 없다.
 * 옛 규칙 문서를 건너뛰면 규칙 독립 장부가 **영구히 빈 표**가 된다(실측 24장 중 22장이 그 상태).
 * 돌연변이: glBackfill에 rv 필터를 되살리면 이 테스트가 깨진다. */
test('backfill fills forward returns for documents from earlier rule versions',async()=>{
 const S={uid:'x',glog:{
   cur:{schema:2,rv:'v6.2',at:1000,rows:{US_X:[]},fwd:{}},
   old:{schema:2,rv:'v5.5',at:2000,rows:{US_Y:[]},fwd:{}},
   s1 :{schema:1,rv:'v5.5',at:3000,rows:{US_Z:[]},fwd:{}}},
  stocks:{US_X:{},US_Y:{},US_Z:{}},fullOK:{US_X:1,US_Y:1,US_Z:1},splits:[],
  cache:{US_X:{},US_Y:{},US_Z:{}},bench:{US:{}}};
 let writes=0;
 await run(piece('let glBackfillBusy=false','async function glBoot(){'),{S,GL_HORIZ:[20],RULE_VER:'v6.2',splitAdjustable:()=>true,QADomain:{forward:()=>({value:5,entryAt:1,exitAt:2}),forwardTaint:()=>null,normCode:(m,c)=>c},D:()=>({set:async()=>writes++})},'glBackfill()');
 assert.equal(S.glog.cur.fwd.US_X.r20,5,'현행 규칙 문서');
 assert.equal(S.glog.old.fwd.US_Y.r20,5,'옛 규칙 문서도 채운다');
 assert.equal(S.glog.s1.fwd.US_Z,undefined,'스키마 1은 그대로 건너뛴다');
 assert.equal(writes,2);
});
test('unknown event coverage has separate U status',()=>{
 const r=run(piece('function revCause(','function glLaterRow('),{REV_A:[],REV_DIR:[],ANA_MIN:3},'revCause({x:-10},null)');assert.equal(r.cause,'U');
});
test('editing a different instrument invalidates snapshot',async()=>{
 const old={id:'old',market:'KR',type:'stock',code:'000001',name:'Old',date:'2026-08-03',side:'buy',account:'general',price:100,qty:1,snap:{tier:'상'}};
 const S={trades:[old],lg:{open:{mode:'edit',id:'old'},form:{...old,code:'000002'}}};
 await run(piece('async function lgSaveForm(){','function lgSnap('),{S,isYMD:()=>true,toast:()=>{},lgCloseForm:()=>{},D:()=>({update:async v=>Object.assign(old,v)})},'lgSaveForm()');
 assert.equal(old.snap,null);assert.equal(old.snapshotStatus,'edited-unverified');
});
test('per valuation does not invent missing growth, psr uses sales growth',()=>{
 const s=piece('function pl(','/*')+piece('function fairPER(','/* 이원 적정가');
 const out=run(s,{},'[fundamentalFV(1,1,null,null,60),fundamentalFV(-1,-1,10,-20,60,20)]');
 assert.equal(out[0],null);assert.ok(out[1].target>out[1].now);
});

test('grade log preserves transient failure and succeeds on retry without overwriting observations',async()=>{
 const S={uid:'x',stocks:{X:{manual:{}}},calc:{X:{priceTs:1}},cache:{},glog:{},settings:{}};
 const Q={active:0,items:[]};let fail=true,writes=0;
 const context=vm.createContext({S,Q,sumBusy:false,firebase:{firestore:{FieldValue:{serverTimestamp:()=>({_sentinel:'serverTimestamp'})}}},lgToday:()=> '2026-09-21',glRow:()=>[1],GL_COLS:['price'],RULE_VER:'v5.2',QADomain:{settingsKey:()=> 'settings'},D:()=> 'ref',console:{warn:()=>{}},db:{runTransaction:async fn=>{
  if(fail)throw {code:'permission-denied'};
  return fn({get:async()=>({exists:false}),set:()=>writes++});
 }}});
 vm.runInContext(piece('let glSaveBusy=false;','let glTimer=null;'),context);
 Q.active=1;assert.equal(await vm.runInContext('glMaybeSave()',context),false);assert.equal(S.glSaveAttempt,undefined);
 Q.active=0;assert.equal(await vm.runInContext('glMaybeSave()',context),false);assert.equal(S.glSaveError.code,'permission-denied');
 fail=false;assert.equal(await vm.runInContext('glMaybeSave()',context),true);assert.equal(S.glSaveError,null);assert.equal(writes,1);
 assert.equal(await vm.runInContext('glMaybeSave()',context),false);assert.equal(writes,1);
});

test('diagnostic copy refreshes data and handles async clipboard rejection',async()=>{
 const callbacks={},messages=[];let n=0,payload='';
 run(piece('let diagLast=null;',"$('#btnSettings')"),{$:selector=>({addEventListener:(event,fn)=>callbacks[selector]=fn,classList:{add:()=>{}}}),diagRender:()=>({revision:++n}),toast:message=>messages.push(message),navigator:{clipboard:{writeText:async text=>{payload=text;throw Error('denied');}}}},'');
 callbacks['#btnDiag']();await callbacks['#btnDiagCopy']();
 assert.equal(JSON.parse(payload).revision,2);assert.ok(messages[0].includes('복사 실패'));assert.equal(messages.length,1);
});

test('loaded current-rule daily log avoids repeat write; legacy log does not suppress new schema',async()=>{
 const S={uid:'x',glog:{v52_20260921:{},'v52_2026-09-21':{d:'2026-09-21',schema:2,rv:'v5.2'}},stocks:{X:{}},calc:{X:{}}};
 const Q={active:1,items:[]};const context=vm.createContext({S,Q,sumBusy:false,RULE_VER:'v5.2',lgToday:()=> '2026-09-21'});
 vm.runInContext(piece('let glSaveBusy=false;','function glSettingsKey()'),context);
 assert.equal(vm.runInContext('glWaitReason()',context),'오늘 기록됨');
 S.glog['v52_2026-09-21'].rv='v4.34';Q.active=0;
 assert.equal(vm.runInContext('glWaitReason()',context),'저장 시도 가능');
 S.glog['v52_2026-09-21'].rv='v5.2';S.glog['v52_2026-09-21'].d='2026-09-20';
 assert.equal(vm.runInContext('glWaitReason()',context),'저장 시도 가능');
});

test('reconciled revenue is used once in quote currency; legacy and currency mismatch fail closed',()=>{
 const code=piece('  const fxW=','  // 목표가 분산 비율');
 const execute=F=>run(code,{F,k:{},qcur:'USD',curMismatch:true,fxOf:()=>1.149,price:1679.92,ch:{},st:{market:'US'},man:{},gnum:(a,b)=>a??b},'({k,fundInput})');
 const verified=execute({revPS:1.648044,fcur:'EUR',fx:1.149,psrY:18.265015,revenueBasis:{schema:1,status:'reconciled',qcur:'USD',revPSQuote:105.678984,psrQuote:15.896444}});
 assert.equal(verified.fundInput.revPS,105.678984);assert.ok(Math.abs(verified.k.psrAuto-15.896444)<.001);
 const legacy=execute({revPS:1.648044,fcur:'EUR',fx:1.149,psrY:18.265015});
 assert.equal(legacy.fundInput.revPS,null);assert.equal(legacy.k.psrAuto,null);
 const mismatch=execute({revenueBasis:{schema:1,status:'reconciled',qcur:'EUR',revPSQuote:100}});
 assert.equal(mismatch.fundInput.revPS,null);
});

test('fresh legacy revenue cache migrates once with cooldown; manual refresh always retries',()=>{
 const S={stocks:{X:{type:'stock'},ETF:{type:'etf'}},cache:{X:{fund:{},ana:{ts:Date.now()}},ETF:{ana:{ts:Date.now()}}}};
 const ctx=vm.createContext({S,assetType:st=>st.type,fundMissing:()=>false});
 vm.runInContext(piece('function needsRevenueRefresh(', '/* (v4.22) ETF는'),ctx);
 assert.equal(vm.runInContext("summaryStale('X',false)",ctx),true);
 S.revenueProbeAt={X:Date.now()};assert.equal(vm.runInContext("summaryStale('X',false)",ctx),false);
 assert.equal(vm.runInContext("summaryStale('X',true)",ctx),true);
 S.revenueProbeAt.X-=300001;assert.equal(vm.runInContext("summaryStale('X',false)",ctx),true);
 S.cache.X.fund.revenueBasis={schema:1,status:'missing-input'};
 assert.equal(vm.runInContext("summaryStale('X',false)",ctx),false);
 assert.equal(vm.runInContext("summaryStale('ETF',false)",ctx),false);
});
