const {test}=require('node:test'),assert=require('node:assert/strict'),I=require('../src/investment.js'),D=require('../src/domain.js'),fs=require('node:fs'),vm=require('node:vm');
const s=()=>({method:'eps',months:12,base:10,source:'Synthetic normalized EPS in quote currency',asOf:new Date().toISOString().slice(0,10),cases:Object.fromEntries(['bear','base','bull'].map((k,i)=>[k,{growth:0,pe:10+i*2,discount:10,dilution:0,margin:20}]))});
const policy={assets:1000,cash:500,minCash:0,stockMax:60,sectorMax:70,themeMax:80,lossMax:60,themeStress:50};
const holdings=[{id:'X',value:500,sector:'semi',theme:'AI',valid:true}],order={id:'X',amount:100,sector:'semi',theme:'AI'};
test('valuation is discounted terminal value and margin uses value denominator',()=>{const r=I.scenario(s(),80);assert.ok(r.valid);assert.ok(Math.abs(r.rows[0].present-100/1.1)<1e-9);assert.ok(Math.abs(r.rows[0].margin-12)<1e-9);});
test('revenue model uses net margin and shareholder dilution exactly once',()=>{const x=s();x.method='revenue';x.base=100;x.cases.bear.dilution=10;const r=I.scenario(x,80);assert.ok(r.valid);assert.ok(Math.abs(r.rows[0].present-100/1.1*.2*10/1.1)<1e-9);});
test('missing assumptions never silently become zero or a price anchor',()=>{const x=s();x.cases.bear.discount='';assert.equal(I.scenario(x,80).valid,false);assert.equal(I.scenario({...x,months:0},80).rows.length,0);assert.equal(I.scenario({...s(),source:''},80).valid,false);});
test('scenario order rejects optimistic bear and supports zero terminal earnings',()=>{const x=s();x.cases.bear.pe=100;assert.equal(I.scenario(x,80).valid,false);x.method='revenue';x.cases.bear.margin=0;assert.equal(I.scenario(x,80).rows[0].present,0);});
test('policy permits zero minimum cash but missing risk caps remain unresolved',()=>{assert.equal(I.policy(policy).complete,true);assert.equal(I.policy({...policy,stockMax:''}).complete,false);assert.equal(I.policy({...policy,cash:-1}).complete,false);});
test('portfolio denominator stays total wealth after cash-funded purchase',()=>{const r=I.exposure(policy,holdings,order);assert.ok(r.allowed);assert.equal(r.weights.stock,60);assert.equal(r.cashAfter,400);});
test('unpriced and unclassified holdings cannot improve concentration by exclusion',()=>{assert.equal(I.exposure(policy,[{...holdings[0],value:null}],order).allowed,false);assert.equal(I.exposure(policy,[{...holdings[0],theme:''}],order).allowed,false);});
test('asset mismatch warns (computed denominator), low cash and joint theme concentration block pass',()=>{const m=I.exposure({...policy,assets:2000},holdings,order);assert.ok(m.warnings.length>0);assert.equal(m.weights.stock,60);assert.equal(I.exposure(policy,holdings,{...order,amount:501}).allowed,false);assert.equal(I.exposure({...policy,themeMax:50},holdings,order).allowed,false);});
test('cross-sector common theme stress is aggregated without independence assumption',()=>{const h=[{id:'A',value:250,sector:'energy',theme:'AI',valid:true},{id:'B',value:250,sector:'semi',theme:'AI',valid:true}],r=I.exposure({...policy,lossMax:20},h,{id:'C',sector:'network',theme:'AI',amount:100});assert.equal(r.themeLoss,30);assert.ok(r.errors.some(x=>x.includes('동반하락')));});
test('round trip execution costs use distinct buy and sell factors',()=>{assert.ok(Math.abs(I.netReturn(10,100)-((1.1*.99/1.01)-1)*100)<1e-10);assert.equal(I.netReturn(10,null),null);assert.equal(I.netReturn(-100,100),-100);});
const plan={at:1000,costBps:100,benchCostBps:0,rows:[{id:'X',quality:true,timing:false,rule:false},{id:'Y',quality:false,timing:true,rule:true}]};
const outcome={asset:10,benchmark:5,entryAt:2,exitAt:5,benchEntryAt:2,benchExitAt:5};
test('prospective evaluation excludes in-sample, mismatched sessions, and survivor-only subsets',()=>{assert.equal(I.evaluate(plan,{X:outcome}).complete,false);assert.equal(I.evaluate(plan,{X:outcome,Y:{...outcome,entryAt:1}}).complete,false);assert.equal(I.evaluate(plan,{X:outcome,Y:{...outcome,benchExitAt:6}}).complete,false);});
test('frozen strategies retain independent selection and equal-weight baseline',()=>{const r=I.evaluate(plan,{X:outcome,Y:{...outcome,asset:-10}});assert.ok(r.complete);assert.equal(r.groups[0].n,2);assert.equal(r.groups[1].n,1);assert.equal(r.groups[2].n,1);assert.ok(r.groups[1].net>r.groups[3].net);assert.ok(Math.abs(r.groups[0].benchmark-5)<1e-9);});
test('cohort cannot combine differing holding intervals',()=>{assert.equal(I.evaluate(plan,{X:outcome,Y:{...outcome,exitAt:6,benchExitAt:6}}).complete,false);});
const app=fs.readFileSync(require('node:path').join(__dirname,'../src/app.js'),'utf8'),piece=(a,b)=>app.slice(app.indexOf(a),app.indexOf(b,app.indexOf(a)+a.length));
test('partial finance and growth inputs cannot masquerade as full quality',()=>{const code=piece('function pl(','/*')+piece('function qFinance(','/* 애널리스트 신뢰')+piece('function numOr(','/* 애널리스트 커버리지');const x=vm.runInNewContext(code+';[qFinance({}, {de:0}),qFinance({}, {de:0,roe:-10,margin:-20}),qGrowth({}, {revG:60}),qGrowth({}, {revG:0,epsG:0})]',{QADomain:D});assert.equal(x[0],null);assert.ok(Math.abs(x[1]-25.7)<1e-9);assert.equal(x[2],null);assert.equal(x[3],34);});
test('unknown analyst coverage removes the target',()=>{const code=piece('const ANA_MIN=','/* 목표가 신선도');assert.equal(vm.runInNewContext(code+';anaInfo({},null,null).f',{}),0);});
test('model identity is global model settings only (v5.5): per-stock inputs and watchlist edits do not reset the series',()=>{const S={settings:{qw:{fin:35},fvw:{per:1}},stocks:{X:{type:'stock',sector:'tech',manual:{memo:'a',roe:10}}}};const ctx=vm.createContext({S,QADomain:D});vm.runInContext("const RULE_VER='v5.5';"+piece('function glSettingsKey(){','async function glMaybeSave'),ctx);const key=()=>vm.runInContext('glSettingsKey()',ctx);const original=key();S.stocks.X.manual.memo='b';assert.equal(key(),original);S.stocks.X.manual.roe=12;S.stocks.X.manual.livePrice=101;S.stocks.Y={type:'stock',manual:{}};assert.equal(key(),original);S.settings.fvw.per=2;assert.equal(key(),original);S.settings.qw.fin=40;assert.notEqual(key(),original);});
/* (v6.0) 실적 일정은 더 이상 관문이 아니다 — 발표 임박은 변동성 사건이지 품질 신호가 아니라
 * 📅 배지로만 알린다. 관문으로 되돌리면 이 검사가 깨진다. */
test('earnings calendar no longer gates the candidate (v6.0 — badge only)',()=>{const code=piece('function classifyDetail(k){','function classify(k)');const ctx=vm.createContext({MIN_MARGIN:20,MIN_BARS:120,DD_DEEP:-35,DROP_STEEP:-20,STALE_MAX_D:10,MA_DEV_MIN:.94,DT_Z:1});vm.runInContext(code,ctx);const base={attract:80,quality:80,upside:40,downside:10,listedBars:250,rsi:20,pB:.2,price:100,qMissW:0,qInputMissing:[],earnDays:10};
ctx.k=base;assert.equal(vm.runInContext('classifyDetail(k).tier',ctx),'상');
ctx.k={...base,earnDays:null};assert.equal(vm.runInContext('classifyDetail(k).tier',ctx),'상','일정 미확인이 등급을 막지 않는다');
ctx.k={...base,earnDays:1,earnSoon:true};assert.equal(vm.runInContext('classifyDetail(k).tier',ctx),'상','발표 임박도 등급을 막지 않는다');
assert.ok(!vm.runInContext('JSON.stringify(classifyDetail(k).gates)',ctx).includes('G9'),'G9 관문이 남아 있지 않다');
ctx.k={...base,earnDays:null,assetType:'etf'};assert.ok(vm.runInContext('classifyDetail(k).tier',ctx));
/* (v6.1) 성분 결측은 **거절이 아니라 평가 불가**다 — 값이 안 온 것을 결격으로 읽으면
 * 근거 없이 부정 판정을 내리게 된다. blockedCode가 아니라 unknownCode에 담긴다. */
ctx.k={...base,qInputMissing:['ROE']};
{const d=JSON.parse(vm.runInContext('JSON.stringify(classifyDetail(k))',ctx));
 assert.equal(d.blockedCode,null,'거절이 아니다');
 assert.ok((d.unknownCode||[]).includes('G11'),'평가 불가로 담긴다');
 assert.equal(d.assessable,false,'평가 불가 상태');
 assert.equal(d.tier,null,'등급도 주지 않는다');}});

/* (v6.1) 세 번째 상태 — 데이터가 없으면 평가하지 않는다. */
test('gates have three states: pass / rejected / unassessable',()=>{const code=piece('function classifyDetail(k){','function classify(k)');const ctx=vm.createContext({MIN_MARGIN:20,MIN_BARS:120,DD_DEEP:-35,DROP_STEEP:-20,STALE_MAX_D:10,MA_DEV_MIN:.94,DT_Z:1});vm.runInContext(code,ctx);
const base={attract:80,quality:80,upside:40,downside:10,listedBars:250,rsi:20,pB:.2,price:100,qMissW:0,qInputMissing:[],earnDays:10};
const J=()=>JSON.parse(vm.runInContext('JSON.stringify(classifyDetail(k))',ctx));
ctx.k=base;{const d=J();assert.equal(d.assessable,true);assert.equal(d.tier,'상');}
// 종합점수가 없으면 '품질 미달'이 아니라 '평가 불가'
ctx.k={...base,quality:null};{const d=J();
  assert.equal(d.blockedCode,null,'품질을 모르는 것은 거절이 아니다');
  assert.ok((d.unknownCode||[]).includes('G8'));assert.equal(d.assessable,false);}
// 하방 근거가 목표가뿐이면 '평가 불가' (삼성전자가 걸린 자리)
ctx.k={...base,downside:null};{const d=J();
  assert.equal(d.blockedCode,null,'하방을 모르는 것은 거절이 아니다');
  assert.ok((d.unknownCode||[]).includes('G4'));}
// 실제로 평가해서 못 넘은 것은 여전히 거절이다
ctx.k={...base,downside:-50};{const d=J();
  assert.equal(d.blockedCode,'G4','평가했고 못 넘었다 → 거절');assert.equal(d.assessable,true);}
// 거절이 하나라도 있으면 거절이 우선한다 (모르는 항목이 그 사실을 지우지 않는다)
ctx.k={...base,downside:-50,quality:null};{const d=J();
  assert.equal(d.blockedCode,'G4');assert.equal(d.assessable,true,'거절이 우선');}
// 상장 봉 수 미확인도 평가 불가
ctx.k={...base,listedBars:null};{const d=J();assert.ok((d.unknownCode||[]).includes('G7'));}
// RSI·%B 둘 다 없으면 '과열 아님'으로 통과시키지 않는다 (모르면 통과도 틀렸다)
ctx.k={...base,rsi:null,pB:null};{const d=J();
  assert.ok((d.unknownCode||[]).includes('G5'),'모르면 통과도 평가다');
  assert.equal(d.tier,null);}
// 이상 신호 플래그의 부재는 '모름'이 아니라 '없음'이다 → 통과가 맞다
ctx.k={...base,dataStale:undefined,priceAnomaly:undefined,hasHardHazard:undefined};
{const d=J();assert.equal(d.assessable,true);assert.equal(d.tier,'상');}});

/* (v6.0) G3는 「하」 등급의 여력 조건과 값이 같아 결과에 영향이 없었다 — 지웠다.
 * 여력이 모자라면 관문이 아니라 **등급 미달**로 떨어진다. */
test('G3 removed — insufficient upside falls through to tier, not a gate',()=>{const code=piece('function classifyDetail(k){','function classify(k)');const ctx=vm.createContext({MIN_MARGIN:20,MIN_BARS:120,DD_DEEP:-35,DROP_STEEP:-20,STALE_MAX_D:10,MA_DEV_MIN:.94,DT_Z:1});vm.runInContext(code,ctx);const base={attract:80,quality:80,upside:40,downside:10,listedBars:250,rsi:20,pB:.2,price:100,qMissW:0,qInputMissing:[],earnDays:10};
ctx.k={...base,upside:5};
const d=JSON.parse(vm.runInContext('JSON.stringify(classifyDetail(k))',ctx));
assert.equal(d.tier,null,'여력 5%면 등급이 없다');
assert.ok(!JSON.stringify(d.gates).includes('G3'),'G3 관문이 남아 있지 않다');
assert.ok(d.blockedCode!=='G3','G3로 막혔다고 말하지 않는다');
ctx.k={...base,upside:40};assert.equal(vm.runInContext('classifyDetail(k).tier',ctx),'상');});
test('excluded PER can use an available sector-allowed PSR model',()=>{const code=piece('function pl(','/*')+piece('function fairPER(','/* 이원 적정가')+piece('function fairValue(','function rubricFlags(');const ctx=vm.createContext({FUND_CEIL_T:4,FUND_CEIL_N:3});vm.runInContext(code,ctx);const r=vm.runInContext("fairValue({},0,{epsFwd:1,epsTtm:1,revPS:10,growth:20,revenueGrowth:20},60,null,null,0,2,100)",ctx);assert.ok(r.fvTarget>0);assert.equal(r.fundFV.basis,'PSR');});
test('a recent analyst action does not certify a consensus target update date',()=>{const code=piece('const AGE_FRESH=','/* ============================================================================');const r=vm.runInNewContext(code+';targetFresh({}, {ana:{lg:Date.now()/1000}},100,120,130)',{});assert.equal(r.ts,null);assert.equal(r.f,.5);});

/* ── (v6.3) 현재 적정가의 자산 축 ──────────────────────────────────────────────
 * 실측 원인: SK하이닉스·삼성전자는 이익 축이 '배제'된 것이 아니라 **이상치 천장(현재가 3배)**
 * 에 걸려 now가 null로 떨어졌고, PSR 신뢰도도 0이라 대체 축이 없었다. 그래서 현재 적정가의
 * 근거가 애널 목표가 하나뿐이 되고 nowIndep=false → G4를 판정할 수 없었다.
 * ★ 조건은 '신뢰도 0'이 아니라 **'현재값이 하나도 살아남지 못했다'** 다. per=1(배제 아님)인
 *   종목이 바로 그 사례였으므로, 신뢰도로 조건을 걸면 그 종목을 못 집는다. */
const FV=()=>{const code=piece('function pl(','/*')+piece('function fairPER(','/* 이원 적정가')
  +piece('function fairValue(','function rubricFlags(');
 const ctx=vm.createContext({FUND_CEIL_T:4,FUND_CEIL_N:3});vm.runInContext(code,ctx);
 return expr=>vm.runInContext(expr,ctx);};

test('book value opens the current fair value when no earnings or sales axis survives',()=>{
 const run=FV();
 /* 선행EPS 65 · 현재가 100 → PER 경로 now가 천장(3배)을 넘어 배제된다. revPS 없음 → PSR 불가.
    주당순자산 40 → 자산 축이 열려야 한다. (per=1 로 '배제 아님'인 상태를 일부러 쓴다) */
 const r=run("fairValue({},0,{epsFwd:65,epsTtm:65,revPS:null,growth:10,bps:40},60,null,null,1,0,100,2)");
 assert.equal(r.fundFV&&r.fundFV.basis,'BOOK');
 assert.equal(r.fundFV.now,40);
 assert.equal(r.fundFV.target,null,'자산 축은 상방 목표를 내지 않는다 (ROE 전망이 되어버린다)');
 assert.equal(r.nowIndep,true,'이것이 G4를 판정 가능하게 만드는 지점이다');
 assert.ok(r.fvNow!=null&&r.fvNow<100,'장부가 40이 섞였으므로 현재가 아래여야 한다');
 assert.match(r.basis,/BOOK/);
});
test('a surviving earnings axis is never replaced by book value',()=>{
 const run=FV();
 /* 선행EPS 8 · 현재가 100 → PER 경로 now가 천장 안에 든다. 자산 축이 끼어들면 안 된다. */
 const r=run("fairValue({},0,{epsFwd:8,epsTtm:8,revPS:null,growth:10,bps:40},60,null,null,2,0,100,2)");
 assert.equal(r.fundFV.basis,'PER');
 const noBps=run("fairValue({},0,{epsFwd:8,epsTtm:8,revPS:null,growth:10,bps:null},60,null,null,2,0,100,2)");
 assert.equal(noBps.fvNow,r.fvNow,'주당순자산 유무가 살아있는 종목의 값을 바꾸면 안 된다');
});
test('the sales axis still takes precedence over book value',()=>{
 const run=FV();
 const r=run("fairValue({},0,{epsFwd:65,epsTtm:65,revPS:10,growth:20,revenueGrowth:20,bps:40},60,null,null,0,2,100,2)");
 assert.equal(r.fundFV.basis,'PSR','PSR이 가능하면 자산 축으로 내려가지 않는다');
});
test('book value is measured by the same outlier ceiling as the other axes',()=>{
 const run=FV();
 /* 주당순자산 400 = 현재가의 4배 > FUND_CEIL_N(3) → 쓰지 않는다. 0으로 메우지도 않는다. */
 const r=run("fairValue({},0,{epsFwd:65,epsTtm:65,revPS:null,growth:10,bps:400},60,null,null,1,0,100,2)");
 assert.equal(r.fundFV,null);
 assert.equal(r.nowIndep,false,'배제됐으면 독립 근거가 생기지 않는다');
 assert.equal(r.fundOutlier,true);
});
test('book value is refused where PBR has no discriminating power',()=>{
 const run=FV();
 /* vmPbr=0 (무형·자산경량) — consFV의 book 축과 같은 조건이다 */
 const r=run("fairValue({},0,{epsFwd:65,epsTtm:65,revPS:null,growth:10,bps:40},60,null,null,1,0,100,0)");
 assert.equal(r.fundFV,null);
 assert.equal(r.nowIndep,false);
 /* vmPbr=1 (참고)이면 쓰되 가중을 0.35로 줄인다 — 다른 축과 같은 승수 체계 */
 const ref=run("fairValue({},0,{epsFwd:65,epsTtm:65,revPS:null,growth:10,bps:40},60,null,null,1,0,100,1)");
 assert.equal(ref.fundFV.basis,'BOOK');
 const full=run("fairValue({},0,{epsFwd:65,epsTtm:65,revPS:null,growth:10,bps:40},60,null,null,1,0,100,2)");
 assert.ok(full.fvNow<ref.fvNow,'가중이 낮으면 현재가 앵커 쪽으로 끌려 값이 더 높아야 한다');
});
test('missing or non-positive book value never becomes a valuation',()=>{
 const run=FV();
 for(const bad of ['null','0','-40',"''",'NaN'])
  assert.equal(run("fairValue({},0,{epsFwd:65,epsTtm:65,revPS:null,growth:10,bps:"+bad+"},60,null,null,1,0,100,2).fundFV"),
    null,'bps='+bad);
});
test('refactored outlier ceilings behave exactly as the two separate checks did',()=>{
 const run=FV();
 /* 애널 목표가 기준(now 1.6배 · target 2.0배)과 현재가 기준(3배 · 4배)이 둘 다 살아 있어야 한다 */
 const byAna=run("fairValue({target:50},1,{epsFwd:12,epsTtm:12,revPS:null,growth:10,bps:null},60,null,null,2,0,100,2)");
 assert.equal(byAna.fundOutlier,true,'목표가 50의 1.6배=80을 넘는 now는 배제');
 const byPrice=run("fairValue({},0,{epsFwd:30,epsTtm:30,revPS:null,growth:10,bps:null},60,null,null,2,0,100,2)");
 assert.equal(byPrice.fundOutlier,true,'현재가 100의 3배를 넘는 now는 배제');
 const inside=run("fairValue({},0,{epsFwd:8,epsTtm:8,revPS:null,growth:10,bps:null},60,null,null,2,0,100,2)");
 assert.equal(inside.fundOutlier,false);
});

/* 돌연변이 테스트가 샌 세 자리를 메운다. 하나는 테스트 공백이 아니라 **중복 코드**였다 —
 * pb!==0 게이트를 지워도 대부분의 경우 mulOf(0)=0이 같은 결과를 만든다. 다만 PER의
 * target만 살아남은 상태에서는 다르다: 자산 축이 fund2를 덮으면 그 target이 사라진다. */
test('book value does not displace a surviving earnings target where PBR is meaningless',()=>{
 const run=FV();
 /* 후행 100 · 선행 20 · 성장 0 → now=(100+20)/2×PER 가 현재가 3배를 넘어 배제되고,
    target=20×PER 는 4배 안에 들어 살아남는다. 이 상태에서 vmPbr=0 이면 자산 축은
    **시도조차 하지 않아야** 한다 — 덮으면 살아있던 상방 근거가 사라진다. */
 const kept=run("fairValue({},0,{epsFwd:20,epsTtm:100,revPS:null,growth:0,bps:40},60,null,null,2,0,100,0)");
 assert.equal(kept.fundFV.basis,'PER','이익 축이 그대로 남아 있어야 한다');
 assert.equal(kept.fundFV.now,null,'now는 천장에 걸려 배제된 상태다');
 assert.ok(kept.fundFV.target>0,'target은 살아남은 상태다 — 이 검사의 전제');
 const noBook=run("fairValue({},0,{epsFwd:20,epsTtm:100,revPS:null,growth:0,bps:null},60,null,null,2,0,100,0)");
 assert.equal(kept.fvTarget,noBook.fvTarget,'자산 축이 끼어들어 상방 목표를 지우면 안 된다');
 assert.ok(kept.fvTarget>0,'PER target 이 살아 있어야 이 검사가 뜻을 갖는다');
});
/* fundamentalFV 의 내부 가드를 **직접** 고정한다. fairValue 경로에서는 num()이 먼저
 * 0·음수·빈값을 걸러내므로 내부 가드가 닿지 않고, 그래서 돌연변이가 보이지 않았다.
 * 호출부가 하나 더 생기면 그때는 내부 가드가 유일한 방어다. */
test('fundamentalFV itself refuses a non-positive book value',()=>{
 const code=piece('function pl(','/*')+piece('function fairPER(','/* 이원 적정가');
 const ctx=vm.createContext({});vm.runInContext(code,ctx);
 const f=(bps,ok)=>vm.runInContext('fundamentalFV(null,null,null,null,60,null,'+bps+','+ok+')',ctx);
 assert.equal(f(0,true),null);
 assert.equal(f(-40,true),null);
 assert.equal(f('NaN',true),null);
 assert.equal(f('null',true),null);
 /* 다른 realm의 객체라 deepEqual은 프로토타입에서 걸린다 — 필드로 본다 */
 const ok40=f(40,true);
 assert.equal(ok40.basis,'BOOK'); assert.equal(ok40.now,40); assert.equal(ok40.target,null);
 assert.equal(f(40,false),null,'호출부가 열어주지 않으면 돌지 않는다');
});
/* 통화 불일치 가드는 compute 안의 배선이라 이 하네스가 실행하지 못한다 — 식을 고정한다.
 * (소스 수준 가드임을 명시한다: 동작 검사가 아니다) */
test('the asset axis input is withheld on currency mismatch (wiring pinned at source)',()=>{
 const src=fs.readFileSync(require('node:path').join(__dirname,'../src/app.js'),'utf8');
 assert.match(src,/fundInput\.bps = curMismatch \? null/,
   '통화가 섞이면 PBR 비율을 믿을 수 없다 — consFV의 book 축과 같은 조건이어야 한다');
});
