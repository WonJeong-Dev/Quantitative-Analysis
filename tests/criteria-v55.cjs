// v5.5 판정·데이터·검증 회귀 — 감사에서 재현한 결함이 다시 생기지 않는지 실제 소스 조각으로 확인한다.
// 사용법: node tests/criteria-v55.cjs
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const D=require('../src/domain.js'),I=require('../src/investment.js');
const src=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
const piece=(a,b)=>{const i=src.indexOf(a);assert.ok(i>=0,'missing '+a);const j=src.indexOf(b,i+a.length);assert.ok(j>i,'missing end '+b);return src.slice(i,j);};
const run=(code,ctx,expr)=>vm.runInNewContext(code+'\n;'+expr,{QADomain:D,Math,...ctx});

/* ---------- 적정가 엔진 ---------- */
const FV=piece('function pl(','/*')+piece('const FUND_CEIL_T=','\n')+piece('function fairPER(','/* 이원 적정가')+piece('function fairValue(','function rubricFlags(');
const fv=(man,tw,fund,price=100)=>run(FV,{},'fairValue('+JSON.stringify(man)+','+tw+','+JSON.stringify(fund)+',60,null,null,2,2,'+price+')');
test('목표가 신뢰가 0으로 떨어지는 순간에도 이상치 배제는 원시 목표가로 계속된다(절벽 제거)',()=>{
  const fund={epsFwd:12,epsTtm:10,revPS:null,growth:25};          // 펀더 target/now가 목표가 150의 2배·1.6배를 넘는 조합
  const a=fv({target:150},0.05,fund), b=fv({target:150},0,fund);
  assert.ok(a.fundOutlier&&b.fundOutlier,'두 경우 모두 펀더 이상치 배제');
  const up=x=>x.fvTarget==null?null:(x.fvTarget/100-1)*100;
  assert.ok(up(b)==null||up(b)<60,'tw=0이어도 여력 폭주 없음: '+up(b));
});
test('펀더 가중은 anaConf에 연속 — tw 0.001 차이로 목표가가 뛰지 않는다',()=>{
  const fund={epsFwd:6,epsTtm:5,revPS:null,growth:10};
  const a=fv({target:130},0.001,fund), b=fv({target:130},0,fund);
  assert.ok(Math.abs(a.fvTarget-b.fvTarget)<1,a.fvTarget+' vs '+b.fvTarget);
});
test('fvNow = fvTarget×0.9 폴백 삭제 — 현재가치 근거가 없으면 null',()=>{
  const r=fv({},0,{epsFwd:null,epsTtm:null,revPS:null,growth:null});
  assert.equal(r.fvNow,null);
});
test('목표가 단독이면 현재가치 독립 근거 없음(nowIndep=false), 펀더 now가 있으면 true',()=>{
  assert.equal(fv({target:150},0.8,null).nowIndep,false);
  assert.equal(fv({target:150},0.8,{epsFwd:6,epsTtm:5,growth:10}).nowIndep,true);
});

/* ---------- 판정 ---------- */
const CD=piece('function normCdf(','/* [유도값')+"const RATIO_P=normCdf(-1);"+piece('function classifyDetail(k){','function classify(k)');
const ctxC={MIN_MARGIN:20,MIN_BARS:120,DD_DEEP:-35,DROP_STEEP:-20,STALE_MAX_D:10,MA_DEV_MIN:.94,DT_Z:1};
const K=o=>Object.assign({attract:80,quality:70,upside:40,upsideEff:40,downside:10,downIndep:true,listedBars:250,rsi:50,rsiLo:30,rsiHi:70,pB:.5,price:100,vp1:{poc:50},qMissW:0,qInputMissing:[],earnDays:10,assetType:'stock'},o);
const cd=k=>run(CD,{...ctxC,k},'classifyDetail(k)');
test('G4·C1은 목표가 외 근거가 없으면 판정 불가(탈락·미충족)',()=>{
  const d=cd(K({downIndep:false}));assert.equal(d.blockedCode,'G4');assert.equal(d.conf[0][1],false);
});
test('확증은 독립 정보군당 1표 — 단기 과매도 3항목은 1표',()=>{
  const d=cd(K({rsi:20,pB:.1,price:40,downside:-5,upside:30,upsideEff:30,quality:55}));
  assert.equal(d.nRaw,3);assert.equal(d.n,1);
  const e=cd(K({rsi:20,pB:.1,price:40,downside:5,upside:40,upsideEff:40,quality:70}));
  assert.equal(e.n,3);assert.equal(e.tier,'상');
});
test('ETF는 항목 수(nRaw)로 판정 — 2항목이어야 저점권',()=>{
  assert.notEqual(cd(K({assetType:'etf',rsi:20})).tier,'저점권');
  assert.equal(cd(K({assetType:'etf',rsi:20,pB:.1})).tier,'저점권');
});
/* (v6.0) G3는 사라졌지만 **등급**은 여전히 급락 감쇠 후 여력(upsideEff)을 본다.
 * 감쇠가 점수에만 걸리고 등급은 원 여력을 보던 v5.4의 비대칭으로 되돌아가면 이 검사가 깨진다. */
test('등급 여력은 급락 감쇠 후 여력(upsideEff)을 본다 (v6.0 — G3 제거 후에도)',()=>{
  // 원 여력 25%는 「하」(≥20)를 넘지만, 감쇠 후 18.75%면 못 넘는다 → 등급 없음
  const d=cd(K({upside:25,upsideEff:18.75}));
  assert.equal(d.tier,null,'감쇠 후 값으로 떨어져야 한다');
  assert.ok(!JSON.stringify(d.gates).includes('G3'),'G3 관문은 없다');
  // 감쇠가 없으면 같은 원 여력으로 등급이 선다
  assert.ok(cd(K({upside:25,upsideEff:25})).tier,'감쇠 없으면 등급이 선다');
});
test('하락추세 통계 경로 = 경험적 분위 ≤ Φ(−1)',()=>{
  assert.equal(cd(K({s200:120,ratioZ:-3,ratioPct:.30,slope50:1,slope200:1})).statDown,false);
  assert.equal(cd(K({s200:120,ratioZ:-.5,ratioPct:.10,slope50:1,slope200:1})).statDown,true);
});
test('RSI 적응 밴드는 연속(변동성 0.1%p당 밴드 이동 ≤ 0.1)',()=>{
  const f=run(piece('function pl(','/*')+piece('function rsiBandAuto(','function scoreBB('),{},'rsiBandAuto');
  let mx=0;for(let v=.2;v<.8;v+=.001)mx=Math.max(mx,Math.abs(f(v+.001)[0]-f(v)[0]));assert.ok(mx<=.1+1e-9,String(mx));
});
test('평탄한 가격의 RSI는 50(과열 100 아님)',()=>{
  assert.equal(run(piece('function rsiLast(','/* ---------- (v4.34)'),{},'rsiLast(new Array(30).fill(10))'),50);
});
test('차트 심볼 검증은 심볼 없는 응답을 통과시키지 않는다',()=>{
  const f=run(piece('function chartSymbolOK(','async function fetchJSON('),{},'chartSymbolOK');
  assert.equal(f({chart:{result:[{meta:{}}]}},'AAPL'),false);assert.equal(f({chart:{result:[{meta:{symbol:'AAPL'}}]}},'aapl'),true);
});
test('거래소 현지 거래일 — 미 프리마켓(KST 17시)은 전일 ET 봉과 다른 세션',()=>{
  const f=run(piece('const SESS_FMT=','function compute('),{Intl,Date},'sessDay');
  const t0=Date.parse('2026-09-28T13:30:00Z')/1000, pre=Date.parse('2026-09-29T08:00:00Z')/1000;   // 월 09:30 ET · 화 04:00 ET
  assert.notEqual(f(t0,'US'),f(pre,'US'));assert.equal(f(t0,'KR'),'2026-09-28');
});

/* ---------- 캐시·원장 ---------- */
test('필드 단위 저장 — ETF 요약 저장이 캔들을 지우지 않는다(mergeFields)',async()=>{
  const writes=[];const S={cache:{X:{etf:{nod:0},ana:{ts:1}}}};
  const code=piece('const CACHE_SAVE_GAP_MS=','function refreshAll(');
  const ctx=vm.createContext({S,Date,sleep:async()=>{},console,D:()=>({set:async(d,o)=>writes.push([d,o])})});
  vm.runInContext(code,ctx);await vm.runInContext("saveCache('X',true,['etf','ana'])",ctx);await new Promise(r=>setTimeout(r,10));
  assert.equal(writes.length,1);assert.equal(JSON.stringify(writes[0][1].mergeFields.slice().sort()),'["ana","etf"]');assert.ok(!('t' in writes[0][0]));
});
test('확정 봉 비교 — 마지막(부분) 봉 차이는 변경이 아니다, 과거 봉 정정은 변경이다',()=>{
  const f=run(piece('function closedBarsChanged(','function saveCache('),{},'closedBarsChanged');
  const a={t:[1,2,3],c:[10,11,12]};
  assert.equal(f(a,{t:[1,2,3,4],c:[10,11,12.5,13]}),false);
  assert.equal(f(a,{t:[1,2,3],c:[5,5.5,6]}),true);
});
test('같은 분할이 두 문서로 들어와도 한 번만 환산',()=>{
  const code=piece('const ADJ_KINDS=','/* (v4.24)')+piece('function splitAutoId(','/* 자동 점검.');
  const S={splits:[{market:'US',code:'NVDA',date:'2026-06-10',ratio:2},{market:'US',code:'NVDA',date:'2026-06-10',ratio:2,id:'dup'}]};
  const f=run(code,{S},"splitFactor({market:'US',code:'NVDA',date:'2026-01-02'})");assert.equal(f,2);
});
test('국내 코드 정규화 — 005930과 005930.KS는 같은 포지션',()=>{
  assert.equal(D.positionKey({market:'KR',code:'005930'}),D.positionKey({market:'KR',code:'005930.KS'}));
});
test('거래ID가 있어도 수동 입력 거래와 같은 체결이면 확인 후보로',()=>{
  const ex=[{date:'2026-09-01',side:'buy',market:'KR',type:'stock',account:'general',name:'A',code:'000001',price:100,qty:10}];
  const p=D.importPlan([{일자:'2026-09-01',구분:'매수',시장:'KR',종목명:'A',코드:'000001',단가:100,수량:10,거래ID:'B-1',순번:1}],ex);
  assert.equal(p.add.length,0);assert.equal(p.candidates.length,1);
});
test('전방수익률 — 청산 봉 뒤에 봉이 있어야 확정, 창 안 분할·가격제한폭 초과는 오염 표시',()=>{
  const day=86400,t=[0,1,2,3,4].map(i=>1e9+i*day),ch={t,o:[10,10,10,10,10],c:[10,10,10,10,10]};
  assert.equal(D.forward(ch,(t[0]+10)*1000,4,(t[4]+2*day)*1000),null);          // 마지막 봉이 청산 → 미확정
  assert.ok(D.forward(ch,(t[0]+10)*1000,3,(t[4]+2*day)*1000));
  assert.equal(D.forwardTaint({t,c:[10,10,50,50,50]},t[1],t[3],{market:'KR'}),'jump');
  assert.equal(D.forwardTaint({t,c:[10,10,10,10,10]},t[1],t[3],{splitDates:[new Date(t[2]*1000).toISOString().slice(0,10)]}),'split');
});
test('백업 복구 전 거래 행 검증',()=>{
  const b={format:'qa-board-backup',version:1,collections:{qa_trades:[{id:'x',data:{date:'bad'}}]}};
  assert.throws(()=>D.validateBackup(b),/형식/);
});

/* ---------- 투자 검증 ---------- */
const sc=m=>({method:'eps',months:m,base:10,source:'s',asOf:new Date().toISOString().slice(0,10),cases:{bear:{growth:20,pe:10,discount:10,dilution:0},base:{growth:20,pe:12,discount:10,dilution:0},bull:{growth:20,pe:14,discount:10,dilution:0}}});
test('판정용 현재가치는 보유기간과 무관(기간을 늘려 게이트를 통과할 수 없다)',()=>{
  const a=I.scenario(sc(1),100),b=I.scenario(sc(36),100);
  assert.ok(Math.abs(a.rows[0].marginGate-b.rows[0].marginGate)<1e-9);
  assert.notEqual(a.rows[0].margin,b.rows[0].margin);
});
test('기초 재무 기준일 15개월 초과는 보류',()=>{
  assert.equal(I.scenario({...sc(12),asOf:'2024-01-02'},100).valid,false);
});
test('집중도 분모는 현금+원장평가액(계산값) — 입력 총자산 차이는 경고',()=>{
  const r=I.exposure({assets:1000.7,cash:500,minCash:0,stockMax:60,sectorMax:70,themeMax:80,lossMax:60,themeStress:50},[{id:'X',value:500,sector:'s',theme:'t',valid:true}],{id:'X',amount:100,sector:'s',theme:'t'});
  assert.ok(r.allowed);assert.equal(r.total,1000);assert.equal(r.warnings.length,0);
});
test('사전 고정 검증 — 종목 봉 결측(거래정지)이 계획 전체를 영구 대기로 만들지 않는다',()=>{
  const day=86400,T=Array.from({length:30},(_,i)=>1.7e9+i*day),bn={t:T,o:T.map(()=>100),c:T.map((_,i)=>100+i)};
  const x={t:T.slice(0,10),o:T.slice(0,10).map(()=>10),c:T.slice(0,10).map(()=>11)};           // 10봉 뒤 거래정지
  const y={t:T,o:T.map(()=>20),c:T.map(()=>22)};
  const plan={at:(T[0]+60)*1000,horizon:20,benchmark:'^GSPC',costBps:0,benchCostBps:0,rows:[{id:'X',symbol:'X',quality:true,rule:true,tier:'상'},{id:'Y',symbol:'Y',quality:false,rule:false,tier:null}]};
  const o=I.planOutcome(plan,(s,isB)=>isB?bn:(s==='X'?x:y),(T[29]+2*day)*1000);
  assert.ok(o.bench);assert.equal(o.out.X.imputed,'lastClose');
  const r=I.evaluate({...plan,benchExitAt:o.bench.exitAt},o.out);assert.ok(r.complete);assert.equal(r.imputed,1);
  assert.ok(r.groups.find(g=>g.key==='rule').vsAll!=null);
});
test('국내 하한가 −30%는 정상 거래(오염 아님), +31%는 오염',()=>{
  const t=[1e9,1e9+86400,1e9+2*86400];
  assert.equal(D.forwardTaint({t,c:[100,70,70]},t[0],t[2],{market:'KR'}),null);
  assert.equal(D.forwardTaint({t,c:[100,131,131]},t[0],t[2],{market:'KR'}),'jump');
});
test('코드가 빈 두 분할 기록은 종목명이 다르면 같은 사건이 아니다',()=>{
  const f=run(piece('function splitAutoId(','/* 자동 점검.'),{},'lgSameSplit');
  assert.equal(f({market:'KR',code:'',name:'A',date:'2026-06-10',ratio:2},{market:'KR',code:'',name:'B',date:'2026-06-10',ratio:2}),false);
});
