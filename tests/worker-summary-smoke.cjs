// 워커 스모크 — **실제로 실행**해서 검증한다.
//   `node --check`는 파싱만 하므로 TDZ(ReferenceError: Cannot access 'x' before
//   initialization)를 구조적으로 잡지 못한다. v6.7이 그 구멍으로 배포됐다(§22-㉗).
// 사용법: node tests/worker-summary-smoke.cjs [backend/cloudflare_worker.js]
const fs=require('fs'), os=require('os'), path=require('path');
const SRC=process.argv[2]||__dirname+'/../backend/cloudflare_worker.js';
// ugd의 90일 창은 워커가 Date.now()로 재므로 기준시각도 현재여야 한다.
// (고정 타임스탬프를 쓰면 시간이 지나면서 조용히 창 밖으로 나간다 — 첫 작성 때 그렇게 틀렸다)
const NOW=Math.floor(Date.now()/1000);
const q=n=>({raw:n});

const YQ={quoteSummary:{result:[{
  financialData:{numberOfAnalystOpinions:q(48),targetMeanPrice:q(210),targetHighPrice:q(300),
    targetLowPrice:q(150),recommendationMean:q(1.6),returnOnEquity:q(1.15),operatingMargins:q(0.62),
    debtToEquity:q(12.5),revenueGrowth:q(0.56),earningsGrowth:q(0.60),revenuePerShare:q(7.4),
    freeCashflow:q(6.1e10),operatingCashflow:q(7.2e10),financialCurrency:'USD'},
  summaryDetail:{priceToSalesTrailing12Months:q(24.1),trailingPE:q(45.2),forwardPE:q(31.0),
    marketCap:q(4.3e12),currency:'USD'},
  defaultKeyStatistics:{trailingEps:q(3.9),forwardEps:q(5.6),priceToBook:q(42.1)},
  calendarEvents:{earnings:{earningsDate:[q(NOW+86400*20)]}},
  recommendationTrend:{trend:[
    {period:'0m',strongBuy:30,buy:18,hold:6,sell:1,strongSell:0},
    {period:'-1m',strongBuy:29,buy:19,hold:6,sell:1,strongSell:0}]},
  upgradeDowngradeHistory:{history:[
    {epochGradeDate:NOW-86400*5,firm:'A',fromGrade:'Hold',toGrade:'Buy',action:'up'},
    {epochGradeDate:NOW-86400*20,firm:'B',fromGrade:'Buy',toGrade:'Hold',action:'down'},
    {epochGradeDate:NOW-86400*40,firm:'C',toGrade:'Buy',action:'init'}]},
  earningsTrend:{trend:[
    {period:'+1q',earningsEstimate:{avg:q(1.42)},revenueEstimate:{avg:q(5.4e10)},
     epsRevisions:{upLast7days:q(3),upLast30days:q(11),downLast30days:q(2),downLast90days:q(4)}},
    {period:'+1y',earningsEstimate:{avg:q(6.1)},revenueEstimate:{avg:q(2.4e11),growth:q(0.41)},
     growth:q(0.38)},
    {period:'0y',earningsEstimate:{avg:q(4.4)}}]},
  earningsHistory:{history:[
    {quarter:q(NOW-86400*95),epsActual:q(1.10),epsEstimate:q(1.01),surprisePercent:q(0.089)},
    {quarter:q(NOW-86400*5),epsActual:q(1.30),epsEstimate:q(1.20)}]},
  cashflowStatementHistoryQuarterly:{cashflowStatements:[
    {endDate:q(NOW-86400*95),capitalExpenditures:q(-1.2e10)},
    {endDate:q(NOW-86400*5), capitalExpenditures:q(-1.9e10)}]}
}]}};
const YQ_ETF={quoteSummary:{result:[{
  fundProfile:{feesExpensesInvestment:{annualReportExpenseRatio:q(0.0020)},
    categoryName:'Large Blend',family:'Vanguard'},
  defaultKeyStatistics:{totalAssets:q(1.5e12),beta3Year:q(1.0)},
  summaryDetail:{yield:q(0.012),navPrice:q(512.3),currency:'USD'}}]}};

let MODE=YQ;
global.fetch=async(url)=>{
  const u=String(url);
  if(u.includes('fc.yahoo.com'))
    return new Response('',{headers:{'set-cookie':'A1=abc; Path=/'}});
  if(u.includes('getcrumb')) return new Response('CRUMB123');
  if(u.includes('quoteSummary'))
    return new Response(JSON.stringify(MODE));
  throw new Error('unexpected fetch: '+u);
};

let pass=0,fail=0;
const ok=(n,c,extra)=>{ c?(pass++,console.log('  OK   '+n))
  :(fail++,console.log('  FAIL '+n+(extra?('  ← '+extra):''))); };

(async()=>{
const tmp=path.join(os.tmpdir(),'wk_'+Date.now()+'.mjs');
fs.writeFileSync(tmp,fs.readFileSync(SRC,'utf8'));
const W=(await import(require('node:url').pathToFileURL(tmp).href)).default;
const call=async p=>{ const r=await W.fetch(new Request('https://x.dev'+p),{AUTH_MODE:'report',ALLOWED_EMAILS:'smoke@test'})  /* (v7.0) 인증은 worker-security가 검증 — 여기선 report 모드로 응답 본문만 본다 */; 
  let b=null; try{ b=JSON.parse(await r.text()); }catch(e){}
  return {status:r.status,b}; };

console.log('\n[1] /summary 주식 경로 — 실제 실행 (v6.7 TDZ 회귀 검사)');
MODE=YQ;
const r=await call('/summary?sym=NVDA');
ok('HTTP 200 (500 아님)', r.status===200,
   r.status!==200?('status '+r.status+' · '+JSON.stringify(r.b)):'');
ok('ReferenceError 아님', !(r.b&&/ReferenceError/.test(String(r.b.error||''))),
   r.b&&r.b.error?String(r.b.error):'');
if(r.status!==200){ console.log('\n  ↑ 주식 경로가 죽었다. 아래 검사는 의미가 없다.'); }

console.log('\n[2] v6.7 이벤트 채널 6종이 실제로 채워지는가');
const b=r.b||{};
['surp','ugd','rtH','rev','est','capex'].forEach(k=>ok('키 존재: '+k, k in b));
ok('surp — 분기 2건, 최신순', Array.isArray(b.surp)&&b.surp.length===2&&b.surp[0].d>b.surp[1].d);
ok('surp — surprisePercent 없으면 직접 계산', b.surp&&b.surp[0].pct!=null);
ok('ugd — 90일 상1·하1·신규1', b.ugd&&b.ugd.up90===1&&b.ugd.dn90===1&&b.ugd.ini90===1,
   JSON.stringify(b.ugd&&{up90:b.ugd.up90,dn90:b.ugd.dn90,ini90:b.ugd.ini90}));
ok('est — 가이던스 대리축(+1q·+1y·0y)', b.est&&b.est.eq1===1.42&&b.est.ey1===6.1&&b.est.ey0===4.4);
ok('rev — 개정 건수', b.rev&&b.rev.u30===11&&b.rev.d90===4);
ok('capex — 분기 2건 + FCF', b.capex&&b.capex.q&&b.capex.q.length===2&&b.capex.fcf===6.1e10);
ok('rtH — 의견분포 추이 2개월', Array.isArray(b.rtH)&&b.rtH.length===2);

console.log('\n[3] 기존 필드 회귀 (v6.4~v6.6)');
ok('통화 태그 fcur/qcur', b.fcur==='USD'&&b.qcur==='USD');
ok('fx — 동일 통화면 1/same', b.fx===1&&b.fxSrc==='same');
ok('성장 추정 — +1y 우선', Math.abs(b.epsGrowthEst-38)<1e-9&&Math.abs(b.revGrowthEst-41)<1e-9);
ok('멀티플 스냅샷', b.psrY===24.1&&b.perT===45.2&&b.mcap===4.3e12);
// 부동소수: 1.15*100 = 114.99999999999999. 등호 비교는 여기서 틀린다.
ok('재무 품질 %환산', Math.abs(b.roe-115)<1e-9&&Math.abs(b.margin-62)<1e-9,
   'roe='+b.roe+' margin='+b.margin);
ok('실적 발표일', b.earn===NOW+86400*20);

console.log('\n[4] ETF 경로 · 입력 검증');
MODE=YQ_ETF;
const e=await call('/summary?sym=VOO&t=etf');
ok('ETF HTTP 200', e.status===200);
ok('kind=etf · 보수율 0.20%', e.b&&e.b.kind==='etf'&&Math.abs(e.b.exp-0.20)<1e-9);
ok('ETF는 주식 모듈에 닿지 않는다(TDZ 무관)', e.b&&!('surp' in e.b));
const bad=await call('/summary?sym=<script>');
ok('잘못된 심볼 → 400', bad.status===400);

try{fs.unlinkSync(tmp);}catch(_){}
console.log('\n────────────────────────────');
console.log(pass+' passed · '+fail+' failed');
process.exit(fail?1:0);
})();
