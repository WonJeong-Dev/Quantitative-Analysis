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
