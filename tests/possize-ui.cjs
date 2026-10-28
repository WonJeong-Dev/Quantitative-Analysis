/* (v5.9) 위험예산·수량 배선 — 배포본에서 실제 실행 + **투자정책 엔진과의 교차검사**.
 * 목록은 금액으로 바로 환산되는 상한 둘(종목 비중 한도·최소 현금)만 반영한다.
 * 그 둘이 I.exposure의 규칙과 같은 식인지 여기서 검사한다 — 갈라지면 바로 실패한다(§22-⑲).
 * 사용법: node tests/possize-ui.cjs [dist/index.html] */
const fs=require('fs'),QADomain=require('../src/domain.js'),I=require('../src/investment.js');
const HTML=process.argv[2]||__dirname+'/../dist/index.html';
const L=fs.readFileSync(HTML,'utf8').split('\n');
const a=L.findIndex(x=>x.startsWith('const CFV_H=GL_HORIZ[1];'));
const b=L.findIndex(x=>x.startsWith('function render(){'));
if(a<0||b<0){console.error('구간 미발견');process.exit(2);}
const src=L.slice(a,b).join('\n');

const S={calc:{},stocks:{},settings:{},trades:{},uid:'u1'};
let HOLD=[];
const positions=()=>HOLD;
const FX={USD:1300,KRW:1};
const fxOf=(from,to)=>(to!=='KRW'||FX[from]==null)?(from===to?1:null):FX[from];
const esc=x=>String(x==null?'':x);
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const fmtP=(v,c)=>v==null?'—':(Math.round(v*100)/100).toLocaleString('en-US');
const fmtPct=v=>v==null?'—':((v>=0?'+':'−')+Math.abs(v).toFixed(1)+'%');
const chgCls=v=>v==null?'':(v>0?'up':(v<0?'dn':''));
const curSym=c=>c==='KRW'?'₩':'$';
const GL_HORIZ=[20,60,120], FUND_CEIL_N=3.0;
const QW_DEF={fin:35,growth:28,ana:22,stab:15}, AW_DEF={up:46,rsi:18,bb:12,vp:14,prox:10};
const QW_LABELS={fin:'재무 품질',growth:'성장성',ana:'애널 신뢰',stab:'안정성'};
const AW_LABELS={up:'상승여력',rsi:'RSI 반등',bb:'볼린저',vp:'매물대',prox:'눌림목'};
const fairPER=()=>12, fairPSR=()=>1.5, effVM=()=>({per:2,pbr:2,psr:2});

const M=new Function('S','esc','clamp','fmtP','fmtPct','chgCls','curSym','GL_HORIZ','FUND_CEIL_N',
  'fairPER','fairPSR','effVM','QADomain','QW_DEF','AW_DEF','QW_LABELS','AW_LABELS','positions','fxOf',
  src+'\n;return {riskCtx,roomKRW,sizeOf,qtyHTML,exHTML,CFV_STOP_H,CFV_H};')
  (S,esc,clamp,fmtP,fmtPct,chgCls,curSym,GL_HORIZ,FUND_CEIL_N,fairPER,fairPSR,effVM,QADomain,
   QW_DEF,AW_DEF,QW_LABELS,AW_LABELS,positions,fxOf);

let pass=0,fail=0;
const ok=(n,c,x)=>{c?(pass++,console.log('  OK   '+n)):(fail++,console.log('  FAIL '+n+(x!==undefined?('  ← '+x):'')));};
const near=(x,y,t)=>x!=null&&Math.abs(x-y)<=t;
let seq=0;
const bust=()=>{S.trades['t'+(seq++)]=1;};   // riskCtx 캐시 키를 흔든다

function setup(policy,holds,stocks){
  S.settings.investmentPolicy=policy; HOLD=holds||[]; S.calc={}; S.stocks={};
  for(const st of (stocks||[])){
    S.stocks[st.id]={market:st.market,name:st.id,sector:st.sector};
    S.calc[st.id]={price:st.price,currency:st.cur,qcur:st.cur,annVol:st.vol,tier:st.tier===undefined?'중':st.tier};
  }
  bust();
}
const POL={assets:42000000,cash:20000000,minCash:0,stockMax:10,sectorMax:30,themeMax:30,
           lossMax:20,themeStress:30,riskPct:1};
/* 상한이 넉넉한 정책 — 순수 수량 계산만 보는 구간에서 쓴다.
 * POL(종목 10%)은 상한이 실제로 깎기 때문에 사이징 식 자체를 볼 수 없다. */
const POL_FREE=Object.assign({},POL,{stockMax:100,cash:42000000,minCash:0});

console.log('\n[1] 위험예산 게이트 — 설정 없이는 수량을 내지 않는다');
setup(null,[],[{id:'KR_A',market:'KR',cur:'KRW',price:71900,vol:0.38,sector:'반도체'}]);
let rc=M.riskCtx();
ok('정책 미저장 → ready false', rc.ready===false&&/투자정책 미저장/.test(rc.why), rc.why);
ok('수량도 null + 같은 이유', M.sizeOf('KR_A',{limit:63445},rc).qty===null);
setup(Object.assign({},POL,{riskPct:null}),[],[{id:'KR_A',market:'KR',cur:'KRW',price:71900,vol:0.38,sector:'반도체'}]);
rc=M.riskCtx();
ok('1회 위험 미설정 → 수량 없음', rc.ready===false&&/위험 선호는 모형이 정할 수 없/.test(rc.why), rc.why);
setup(Object.assign({},POL,{assets:0}),[],[{id:'KR_A',market:'KR',cur:'KRW',price:71900,vol:0.38}]);
ok('총자산 0 → 수량 없음', M.riskCtx().ready===false);

console.log('\n[2] 수량 — 설계 예시와 일치하는가 (상한이 넉넉할 때)');
setup(POL_FREE,[],[{id:'KR_A',market:'KR',cur:'KRW',price:71900,vol:0.38,sector:'반도체'}]);
rc=M.riskCtx();
ok('위험예산 ₩420,000', near(rc.budget,420000,1e-9), rc.budget);
let sz=M.sizeOf('KR_A',{limit:63445},rc);
ok('무효화 거리 10.7%', near(sz.d,0.38*Math.sqrt(20/252),1e-12), sz.d);
ok('61주', sz.qty===61, sz.qty);
ok('무효화 가격 = 지정가 × (1−d)', near(sz.stop,63445*(1-sz.d),1e-9), sz.stop);
ok('상한이 넉넉하면 깎이지 않는다', sz.cap===null, sz.cap);
ok('지평은 GL_HORIZ[0]=20 재사용', M.CFV_STOP_H===20);

console.log('\n[3] 통화 — 해외 종목에서 조용히 틀리지 않는가');
setup(POL_FREE,[],[{id:'US_B',market:'US',cur:'USD',price:142.3,vol:0.55,sector:'소프트웨어'}]);
sz=M.sizeOf('US_B',{limit:96.8},M.riskCtx());
ok('예산을 USD로 환산해 쓴다 (420,000/1300 = $323)', near(sz.qty,Math.floor((420000/1300)/(96.8*0.55*Math.sqrt(20/252))),0), sz.qty);
ok('매수금액을 원화로 되돌려 보여준다', near(sz.amountKRW,sz.amount*1300,1e-6), sz.amountKRW);
ok('위험액도 원화 환산', near(sz.riskKRW,sz.riskAmt*1300,1e-6));
{ const keep=FX.USD; FX.USD=null; bust();
  const s2=M.sizeOf('US_B',{limit:96.8},M.riskCtx());
  ok('환율 미확보면 1로 치지 않고 수량을 내지 않는다', s2.qty===null&&/환율 미확보/.test(s2.why), s2.why);
  FX.USD=keep; bust(); }

console.log('\n[4] 상한 — 종목 비중 한도·최소 현금');
setup(POL,[{stockId:'KR_A',qty:100,mval:5000000,valid:true}],
      [{id:'KR_A',market:'KR',cur:'KRW',price:71900,vol:0.38,sector:'반도체'}]);
rc=M.riskCtx();
ok('분모 = 현금 + 원장 평가액', near(rc.total,20000000+5000000,1e-9), rc.total);
ok('보유 평가액을 종목별로 센다', near(rc.perStock.KR_A,5000000,1e-9));
let room=M.roomKRW('KR_A',rc);
ok('남은 금액 = 총액×10% − 기존보유 = 2,500,000 − 5,000,000 → 음수', near(room.v,25000000*0.1-5000000,1e-9), room.v);
ok('어느 상한이 좁은지 이름을 남긴다', /종목 비중 한도/.test(room.lab), room.lab);
sz=M.sizeOf('KR_A',{limit:63445},rc);
ok('이미 한도 초과면 0주 + 사유', sz.qty===0&&/막혀/.test(sz.why||''), sz.qty+' '+sz.why);
setup(Object.assign({},POL,{stockMax:100,cash:200000,minCash:150000}),[],
      [{id:'KR_A',market:'KR',cur:'KRW',price:71900,vol:0.38,sector:'반도체'}]);
rc=M.riskCtx();
room=M.roomKRW('KR_A',rc);
ok('현금 여력이 더 좁으면 그쪽이 이긴다', room.lab==='최소 현금'&&near(room.v,50000,1e-9), JSON.stringify(room));
ok('두 상한 중 작은 쪽을 고른다', room.v<=rc.total*1.0, room.v+' / '+rc.total);

console.log('\n[5] ★ 투자정책 엔진과의 교차검사 — 두 곳이 갈라지면 실패한다');
{
  const holds=[{stockId:'KR_A',qty:100,mval:5000000,valid:true},
               {stockId:'KR_C',qty:50,mval:3000000,valid:true}];
  const pol=Object.assign({},POL,{stockMax:30,cash:20000000,minCash:1000000});
  setup(pol,holds,[{id:'KR_A',market:'KR',cur:'KRW',price:71900,vol:0.38,sector:'반도체'},
                   {id:'KR_C',market:'KR',cur:'KRW',price:10000,vol:0.3,sector:'유틸'}]);
  const rc2=M.riskCtx(), rm=M.roomKRW('KR_A',rc2);
  const ex=amount=>I.exposure(pol,
    [{id:'KR_A',value:5000000,valid:true,sector:'반도체',theme:'T1'},
     {id:'KR_C',value:3000000,valid:true,sector:'유틸',theme:'T2'}],
    {id:'KR_A',amount:amount,sector:'반도체',theme:'T1'});
  const lim=/종목/.test(rm.lab);
  ok('상한 금액에서는 exposure가 종목 한도를 걸지 않는다',
     !ex(Math.floor(rm.v)).errors.some(e=>/종목 비중 한도 초과/.test(e)), JSON.stringify(ex(Math.floor(rm.v)).errors));
  ok('상한을 넘기면 exposure가 막는다',
     ex(Math.ceil(rm.v)+1000).errors.some(e=>/종목 비중 한도 초과/.test(e)), JSON.stringify(ex(Math.ceil(rm.v)+1000).errors));
  ok('최소현금 규칙도 같은 식', !ex(Math.floor(rm.v)).errors.some(e=>/최소현금/.test(e)));
  ok('목록이 고른 상한 이름이 실제 구속 조건과 맞는다', lim===(rm.v<=rc2.cashRoom), rm.lab+' / room='+rm.v+' cash='+rc2.cashRoom);
}

console.log('\n[6] 탈락 종목·지정가 없음');
setup(POL_FREE,[],[{id:'KR_D',market:'KR',cur:'KRW',price:8420,vol:0.31,tier:null}]);
ok('탈락 종목에는 수량을 제안하지 않는다', /탈락 종목/.test(M.sizeOf('KR_D',{limit:5900},M.riskCtx()).why||''));
setup(POL_FREE,[],[{id:'KR_E',market:'KR',cur:'KRW',price:8420,vol:0.31}]);
ok('지정가 없으면 수량 없음', /지정가가 없어/.test(M.sizeOf('KR_E',{limit:null},M.riskCtx()).why||''));
setup(POL_FREE,[],[{id:'KR_F',market:'KR',cur:'KRW',price:8420,vol:null}]);
ok('변동성 없으면 수량 없음', /변동성 미확보/.test(M.sizeOf('KR_F',{limit:5900},M.riskCtx()).why||''));

console.log('\n[7] 화면 — 수량 줄');
setup(POL_FREE,[],[{id:'KR_A',market:'KR',cur:'KRW',price:71900,vol:0.38,sector:'반도체'}]);
{ const s3=M.sizeOf('KR_A',{limit:63445},M.riskCtx()), h=M.qtyHTML(S.calc['KR_A'],s3);
  ok('주수와 금액', /<b>61주<\/b> ₩3,870,145/.test(h)&&!/capped/.test(h), h);
  ok('1회 위험 %를 적는다', /위험 1%/.test(h), h);
  ok('무효화 가격과 갭 경고를 툴팁에', /무효화 가격/.test(h)&&/손실 상한의 보증이 아닙니다/.test(h));
  ok('수량 없으면 빈 칸이 아니라 글자', /수량 제안 없음/.test(M.qtyHTML(S.calc['KR_A'],{qty:null,why:'x'})));
  ok('sz 없으면 아무것도 그리지 않는다', M.qtyHTML(S.calc['KR_A'],null)===''); }

console.log('\n[8] 환율은 저장소가 하나다 (v6.5)');
/* ★ 이 구간이 없어서 **미국 주식의 수량 제안이 기능 추가 이후 한 번도 작동하지 않았다.**
 * 같은 값(USD/KRW)의 저장소가 둘이었다 — 지수 바는 S.idx['KRW=X'], sizeOf·roomKRW·보유
 * 평가는 S.fx['USDKRW']. 후자는 아무도 채우지 않았다(fxPut은 워커 펀더멘털 응답에서 만난
 * 통화쌍만 넣는다). 실측 2026-10-28 배포본: 관문 통과 29종목 중 제안 없음 21건, 전부
 * '환율 미확보 — USD 금액을 원화로 환산할 수 없습니다'. 화면 맨 위에는 1,340.78이 떠 있었다.
 *
 * ★ 이 하네스의 fxOf 스텁(FX={USD:1300})이 **환율은 늘 있다고 가정**해서 검사가 통과했다.
 *   계측기가 결함을 가린 경우다(§22-㉒). 그래서 아래 둘을 함께 본다:
 *   ① 배포본의 배선 — 지수 바가 받은 값을 저장소로 흘려보내는가 · 저장소를 우회해 읽는 곳이 없는가
 *   ② 환율이 없을 때 수량을 **꾸며내지 않는가** (스텁을 비워 실제로 확인한다) */
const T8=fs.readFileSync(HTML,'utf8');
{ const fi=T8.slice(T8.indexOf('async function fetchIndices()'));
  const body=fi.slice(0,fi.indexOf('\n}'));
  ok('지수 바가 받은 USD/KRW를 환율 저장소에 넣는다', /fxPut\('USD','KRW'/.test(body),
     body.slice(0,80));
  ok('장부 환율도 저장소에서 읽는다 (S.idx 직독 금지)',
     /function lgFxNow\(\)\{\s*return fxOf\('USD','KRW'\);\s*\}/.test(T8),
     (T8.match(/function lgFxNow[^\n]*/)||[''])[0]);
  /* 환율을 읽는 자리는 fxOf 하나뿐이어야 한다 — 주석이 아니라 **코드**에서 센다. */
  const code=T8.split('\n').filter(l=>!/^\s*[*/]/.test(l)).join('\n');
  const direct=(code.match(/S\.idx(?:\s*&&\s*S\.idx)?\[['"]KRW=X['"]\]/g)||[]);
  ok('환율로 쓰려고 S.idx를 직접 읽는 코드가 없다', direct.length===0, direct.join(' · ')); }
{ /* 스텁을 비운다 — 환율이 없는 실제 상태를 재현한다. */
  const savedUSD=FX.USD; delete FX.USD;
  setup(POL_FREE,[],[{id:'US_FX',market:'US',cur:'USD',price:100,vol:0.4,sector:'반도체'}]);
  const s9=M.sizeOf('US_FX',{limit:90},M.riskCtx());
  ok('환율이 없으면 수량을 꾸며내지 않는다', s9.qty===null, JSON.stringify(s9).slice(0,90));
  ok('그 사유를 적는다', /환율 미확보/.test(s9.why||''), s9.why);
  FX.USD=savedUSD;
  setup(POL_FREE,[],[{id:'US_FX',market:'US',cur:'USD',price:100,vol:0.4,sector:'반도체'}]);
  ok('환율이 들어오면 곧바로 수량이 난다', M.sizeOf('US_FX',{limit:90},M.riskCtx()).qty>0,
     JSON.stringify(M.sizeOf('US_FX',{limit:90},M.riskCtx())).slice(0,90)); }

console.log('\n────────────────────────────');
console.log(pass+' passed · '+fail+' failed');
process.exit(fail?1:0);
