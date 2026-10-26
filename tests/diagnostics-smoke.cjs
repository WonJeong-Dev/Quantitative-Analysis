// v4.37 스모크 — 🩺 자기점검 패널. 2026-08-27 실제 화면값을 그대로 넣어 검증한다.
// 사용법: node tests/diagnostics-smoke.cjs [dist/index.html]
const fs=require('fs');
const HTML=process.argv[2]||__dirname+'/../dist/index.html';
const L=fs.readFileSync(HTML,'utf8').split('\n');
const a=L.findIndex(x=>x.startsWith('function diagCollect()'));
const b=L.findIndex(x=>x.startsWith('/* ================= (v4.30) 거래기록'));
if(a<0||b<0){ console.error('구간 미발견'); process.exit(2); }
const src=L.slice(a,b).join('\n');

const S={stocks:{},cache:{},calc:{},glog:{},gradeLog:[],sumErr:{},sumProg:null,view:'board'};
const esc=x=>String(x);
const assetType=st=>((st&&st.type)==='etf')?'etf':'stock';
const fundMissing=id=>{const c=S.cache[id],st=S.stocks[id];
  if(st&&assetType(st)==='etf')return !(c&&c.etf&&c.etf.ts);
  const f=c&&c.fund; return !(f&&(f.roe!=null||f.epsFwd!=null||f.margin!=null)); };
let HTMLOUT='';
const $=sel=>({set innerHTML(v){HTMLOUT=v;}});
const M=new Function('S','esc','assetType','fundMissing','$','CONST_LOG','RULE_VER',
  'DT_Z','MA_DEV_MIN','MIN_MARGIN','SCORE_ANCHOR','RATIO_SC_MIN','RATIO_MIN_N','etSession',
  src+'\n;return {diagCollect,diagRender};')
  (S,esc,assetType,fundMissing,$,[],(L.join('\n').match(/const RULE_VER='([^']+)'/)||[])[1],1.0,0.94,0.05,50,0.01,250,()=>null);   // (v5.5) 실제 RULE_VER

let pass=0,fail=0;
const ok=(n,c)=>{ c?(pass++,console.log('  OK   '+n)):(fail++,console.log('  FAIL '+n)); };

// ── 실제 화면 데이터 재현 ────────────────────────────────────────────────────
const ETFS=['KIWOOM 한국고배당&미국AI테크','TIGER 미국나스닥100','TIGER 미국S&P500',
  'ACE 미국나스닥100','KODEX 미국나스닥100','TIGER 미국테크TOP10 INDXX',
  'TIGER 미국필라델피아반도체나스닥','KODEX 미국AI테크TOP10'];
ETFS.forEach((nm,i)=>{ const id='KR_E'+i;
  S.stocks[id]={market:'KR',type:'etf',symbol:'E'+i+'.KS',name:nm};
  S.cache[id]={etf:{nod:200,ts:Date.now()},ana:{ts:Date.now()}};
  S.calc[id]={assetType:'etf',qMissW:84,aMissW:46,tier:'대기'}; });
['IEFA','IVV','QQQ','SPY','VEA','VOO','VTI','VTV','VUG'].forEach((tk,i)=>{ const id='US_'+tk;
  S.stocks[id]={market:'US',type:'etf',symbol:tk,name:tk};
  S.cache[id]={etf:{nod:0,exp:0.03,ts:Date.now()},ana:{ts:Date.now()}};
  S.calc[id]={assetType:'etf',qMissW:84,aMissW:46,tier:'대기'}; });
const stock=(id,nm,k)=>{ S.stocks[id]={market:id.slice(0,2),symbol:nm,name:nm};
  S.cache[id]={fund:{roe:10},ana:{ts:Date.now()}}; S.calc[id]=Object.assign({assetType:'stock'},k); };
// 화면의 PSR 입력값 · 통화 불일치 · PSR 정합이상 수치를 그대로
stock('US_ASML','ASML',{price:1745.64,revPSraw:1.6480,fcur:'EUR',qcur:'USD',fxq:1.1673,
  fxSrc:'pair',curMismatch:true,psrY:19.03,psrNoFx:1059.22,psrAuto:16.30,
  autoScaleBad:true,dataAnoms:['함의PSR 907.41배']});
stock('US_QNT','QNT',{price:53.29,revPSraw:0.6360,fcur:'USD',qcur:'USD',fxq:1,psrY:596.81,
  psrNoFx:83.79,autoScaleBad:true,dataAnoms:['함의PSR 83.79배'],ratioNow:null,ratioN:null});
stock('US_TSM','TSM',{price:417.69,revPSraw:107.0325,fcur:'TWD',qcur:'USD',fxq:0.0314,
  fxSrc:'pair',curMismatch:true,psrY:0.48,psrNoFx:3.90,psrAuto:15.26,
  autoScaleBad:true,dataAnoms:['함의PSR 124.28배']});
stock('US_TSLA','TSLA',{price:400,revPSraw:30,fcur:'USD',qcur:'USD',fxq:1,psrY:16.44,psrNoFx:13.33});
stock('US_IONQ','IONQ',{price:50,revPSraw:2,fcur:'USD',qcur:'USD',fxq:1,psrY:30.94,psrNoFx:25});
stock('KR_207940','삼성바이오로직스',{price:1000000,revPSraw:50000,fcur:'KRW',qcur:'KRW',fxq:1,
  psrY:29.37,psrNoFx:20});
stock('US_SPCX','SPCX',{price:30,revPSraw:5,fcur:'USD',qcur:'USD',fxq:1,psrY:19.54,psrNoFx:6,
  ratioNow:null,ratioN:null});
S.cache.US_QNT.t=new Array(58).fill(0); S.cache.US_SPCX.t=new Array(52).fill(0);

const d=M.diagCollect();
// 구판(v4.36 이하)은 PSR정합이 배열이다. 크래시 대신 FAIL로 떨어뜨려
// 반대 검사에서 '무엇이 다른지'가 읽히게 한다.
if(Array.isArray(d.PSR정합)||d.PSR정합==null) d.PSR정합={배제됨:[],사용중:[],_구판:true};
if(!Array.isArray(d.ETF펀드없음)) d.ETF펀드없음=[];

console.log('\n[1] 성분 결측 — ETF는 구조적 상수이므로 빠져야 한다');
ok('ETF 17종이 성분결측에서 제외됨', d.성분결측.length===0);
ok('재무 미수신 = 없음(v4.36 효과 유지)', d.재무미수신.length===0);
ok('ETF 펀드정보에 국내 8종(200)', d.ETF펀드없음.length===8&&/\(200\)$/.test(d.ETF펀드없음[0]));

console.log('\n[2] 입력 배제 — 무엇이 배제됐는지까지 적는다');
ok('3종 유지', d.데이터배제.length===3);
ok('ASML에 "주당매출 입력 제외" 표기', /주당매출 입력 제외/.test(d.데이터배제.find(x=>/ASML/.test(x))));

console.log('\n[3] PSR 정합 — 판별 가능한 두 무리로 갈린다');
ok('배제됨 = ASML·QNT·TSM 3종', d.PSR정합.배제됨.length===3);
ok('사용중 = 삼성바이오·IONQ·TSLA·SPCX 4종', d.PSR정합.사용중.length===4);
ok('배제군에 야후내포가 병기', /야후내포가/.test(d.PSR정합.배제됨[0]));
{ // ASML 내포가 = psrY × revPS × fxq = 19.03 × 1.648 × 1.1673 = 36.61
  const m=d.PSR정합.배제됨.find(x=>/ASML/.test(x));
  ok('ASML 내포가 36.61 (현재가 1745.64와 47.7배 괴리 = 야후 두 필드 불일치)',
     /야후내포가 36\.6/.test(m));
}
{ const m=d.PSR정합.사용중.find(x=>/TSLA/.test(x));   // 16.44×30×1 = 493.2
  ok('TSLA 내포가 493.20 (현재가 400 — 주식수 정의 차이 규모)', /야후내포가 493\.20/.test(m)); }

console.log('\n[4] 미렌더였던 항목이 화면에 나온다');
M.diagRender();
['판정 로그','이벤트 채널','ADX 관측','환율 출처','환율 미확보','상수 부채']
  .forEach(r=>ok('행 존재: '+r, HTMLOUT.includes(r)));
ok('이격 계산불가에 RATIO_MIN_N=250 기준 명시', /RATIO_MIN_N=250봉/.test(HTMLOUT));
ok('PSR 정합에 판독법 병기', /동일 주당·통화 기준이라는 가정/.test(HTMLOUT));

console.log('\n[5] 색 정책 — 정상 동작에 경고색을 씌우지 않는다');
{ const seg=HTMLOUT.split('통화 불일치')[1].split('환율 출처')[0];
  ok('통화 불일치는 경고색 아님', !/var\(--down\)/.test(HTMLOUT.split('통화 불일치')[0].slice(-140))); }
ok('환율 미확보는 없음(초록)', d.환율미확보.length===0);

// ── [6] (v4.38) 이벤트 채널 카운터 — 내용 기준인가 ──────────────────────────
// 2026-08-27 NVDA 실응답(워커 v6.8) 그대로: capex.q는 날짜만 오고 v는 전부 null.
console.log('\n[6] 이벤트 채널 — 빈 채널을 도착으로 세지 않는가');
stock('US_NVDA','NVDA',{price:206});
S.cache.US_NVDA.ana={
  surp:[{d:1785456000,act:2.22,est:2.09113,pct:6.16}],
  ugd:{up90:0,dn90:0,ini90:2,last:[{d:1787652109,firm:'Raymond James',act:'main'}]},
  rtH:[{p:'0m',sb:9,b:49,h:2,s:1,ss:0}],
  rev:{p:'0q',u7:1,u30:5,d30:0,d90:null},
  est:{eq1:2.6525,rq1:118902053480,ey1:13.12766,ry1:573640800830,ey0:9.05163},
  capex:{q:[{d:1785456000,v:null},{d:1777507200,v:null},
            {d:1769817600,v:null},{d:1761868800,v:null}],
         fcf:46335873024,ocf:125648003072},
  ts:Date.now()};
const c=M.diagCollect().이벤트채널;
ok('실적 1',      c.실적===1);
ok('애널액션 1 (up90=0이어도 관측은 있었다)', c.애널액션===1);
ok('가이던스 1',  c.가이던스===1);
ok('개정 1 (d90=null이어도)', c.개정===1);
ok('★ CapEx 0 — 값이 전부 null이면 도착이 아니다', c.CapEx===0, 'CapEx='+c.CapEx);
ok('★ 현금흐름 1 — fcf/ocf는 실제로 온다', c.현금흐름===1, '현금흐름='+c.현금흐름);
{ const H=(M.diagRender(),HTMLOUT);
  ok('꼬리 문구가 원인을 고정하지 않는다(§22-㉓)', !/워커가 v6\.7 미만/.test(H));
  ok('CapEx=0은 미수신으로 명시', /CapEx=0은 미수신/.test(H)); }

console.log('\n[7] 실배포 진단 회귀');
ok('최신 빌드명 표시', M.diagCollect().빌드.startsWith('v'+require('../package.json').version));
S.sumProg={done:16,total:77};
ok('조회 중 진단은 잠정 결과', M.diagCollect().점검상태.includes('잠정'));
S.glLoadState='조회 실패';S.glLoadError={code:'permission-denied',at:1};
ok('빈 로그를 수집 전이라고 단정하지 않음', !M.diagCollect().판정로그.includes('수집 시작 전'));
ok('로그 권한 오류 노출', M.diagCollect().로그상태.조회오류.code==='permission-denied');
const asml=M.diagCollect().PSR정합.배제됨.find(x=>x.startsWith('ASML'));
ok('PSR 비율과 내포가가 동일한 환산 기준', asml.includes((+(1745.64/(19.03*1.648*1.1673)).toFixed(3))+'배'));
ok('원천 수집시각 포함', M.diagCollect().수집시각.length===Object.keys(S.stocks).length);
ok('환산 후 재계산과 대체 표시값 분리', M.diagCollect().통화불일치[0].includes('주당매출 환산 후')&&M.diagCollect().통화불일치[0].includes('표시 PSR'));

console.log('\n[8] 수집하고 안 그리면 없는 항목이다 (§22-㉕ · 구조 검사)');
/* diagCollect가 값을 만들어도 diagRender가 그리지 않으면 **화면에 존재하지 않는다.**
 * 이 실패가 세 번 났다 — v4.37(이벤트채널·ADX관측·상수부채·환율출처·환율미확보),
 * v5.9.8·v5.9.9(후행EPS결측). 매번 "다음부터 주의"로 끝냈으므로 이번엔 검사로 막는다.
 * 사람이 줄을 하나 더 추가하는 걸 믿지 않고, **키 집합 자체를 대조**한다. */
{
  const d2=M.diagCollect();
  M.diagRender();
  const H=HTMLOUT;
  /* JSON에만 두기로 **의도한** 키는 여기에 적는다. 적는 행위가 곧 결정의 기록이다 —
   * 빠뜨린 것과 뺀 것을 구분할 수 있어야 한다. 이유 없이 늘어나면 그게 신호다. */
  const JSON_ONLY=new Set([
    '시각','종목수','요약패스','빌드',        // 머리줄에 합쳐 그린다
    '점검상태','판정로그','로그상태','등급분포','등급변화',
    '투자정책',                               // 투자정책 탭이 따로 보여준다
    'PSR상세',                                // 파생 2줄(주당매출 검증·수동 PSR)로 그린다
    'PSR정합','MAD척도','관측수min',
  ]);
  const keys=Object.keys(d2);
  ok('수집 키가 비어 있지 않다 (검사 전제)', keys.length>10);
  const notRef=keys.filter(k=>!JSON_ONLY.has(k)&&src.indexOf('d.'+k)<0&&src.indexOf("d['"+k+"']")<0);
  ok('수집한 키를 diagRender가 전부 참조한다'+(notRef.length?(' ← 누락: '+notRef.join(', ')):''), notRef.length===0);
  /* 참조만으로는 부족하다 — 참조해 놓고 빈 문자열을 그릴 수 있다. 실제 출력에 흔적이 있는지 본다. */
  ok('후행 EPS가 실제로 그려진다', /후행 EPS/.test(H), H.length);
  ok('적자와 진짜 결측을 갈라 적는다', /적자라 정상/.test(H)&&/진짜 결측/.test(H));
  ok('적자는 결함이 아니라고 못 박는다', /적자 종목은 PER이 없는 것이 정상/.test(H));

  ok('관측값과 복구 불가를 적는다', /야후 PER/.test(H)&&/복구 불가/.test(H));
  /* (v5.9.14) 폴백 제거 후 화면이 사실이 아닌 말을 하지 않는지 — 회귀로 고정한다. */
  ok("'복구 경로가 있습니다' 같은 옛 문장이 남아 있지 않다", !/복구 경로가 있습니다/.test(H));
  ok('PER 없이 판정한다는 결론을 화면이 적는다', /PER 없이 판정합니다/.test(H));
  ok('그 근거 수치를 화면에 남긴다', /1741\.7%/.test(H));
  /* (v5.9.13) 분기합을 '복구원'으로 되돌리지 못하게 고정한다 — 실측 47종목에서 조정 EPS로 확인됐다. */
  ok('분기 실적을 복구원으로 광고하지 않는다', !/분기실적 합 /.test(H), H.slice(0,400));
  ok('분기합을 쓰지 않는 이유를 화면에 적는다', /조정 EPS라 쓰지 않음/.test(H), H.slice(0,400));
  /* (v5.9.14) '복구원'이라는 말을 화면에서 뺐다 — 이름이 가능성을 암시하면 다시 배선된다. */
  ok("'복구원'으로 광고하지 않는다", !/복구원/.test(H), H.slice(0,400));
  ok('그 근거 수치를 주의에 남긴다', /1741\.7%/.test(M.diagCollect().후행EPS결측.주의));
  ok('PER 없이 판정한다는 결론을 적는다', /PER 없이 판정합니다/.test(M.diagCollect().후행EPS결측.주의));
  ok('EPS 순마진이 그려진다', /EPS 순마진/.test(H));
}

console.log('\n[9] EPS 순마진 — 관측이지 오류 판정이 아니다 (v5.9.15)');
/* v5.9.11~12는 순마진 100% 초과를 '순이익 > 매출이므로 입력 오류'로 분류하고 빨간불을 켰다.
 * 1차 출처가 그 전제를 반증했다 — SK하이닉스 2026 Q2 공식 발표 순이익률 **118%**
 * (매출 79.32조 · 영업이익 60.54조 · 당기순이익 93.92조). 지주회사가 아니다.
 * 세 종목(MU·NVDA·SKH)을 SEC·IR로 전수 확인한 결과 **데이터 오류 0건**이었다.
 * 이 검사는 분류가 되살아나는 것을 막는다. 임계를 높여 살리는 것도 막는다(§22-⑤). */
{
  const E=M.diagCollect().EPS순마진관측;
  ok('관측 객체가 있다', !!E&&Array.isArray(E.순마진상위));
  ok("'불가능' 분류가 없다", E.불가능===undefined&&E.기간일치===undefined, Object.keys(E).join(','));
  ok("'확인' 분류도 없다", E.확인===undefined);
  ok('분모 기준을 적는다', /후행 주당매출/.test(E.기준));
  ok('오류 판정이 아님을 못 박는다', /오류 판정이 아닙니다/.test(E.주의));
  ok('반례를 수치째로 남긴다 (118%)', /118%/.test(E.주의)&&/93\.92조/.test(E.주의));
  ok('100%로 되돌리지 말라고 적는다', /100%를 오류 기준으로 되돌리지 마세요/.test(E.주의));
  ok('1차 출처 확인 사실과 날짜를 남긴다', /2026-10-26/.test(E.주의)&&/데이터 오류 0건/.test(E.주의));
  ok('마진 확대 가정 축은 관측으로 남는다', Array.isArray(E.마진급확대));

  M.diagRender(); const H2=HTMLOUT;
  ok('화면에 그려진다', /EPS 순마진/.test(H2));
  /* 경고색 인자를 넘기지 않으므로 이 줄의 라벨에 var(--down)이 붙을 일이 없다. */
  { const seg=H2.slice(Math.max(0,H2.indexOf('EPS 순마진')-160), H2.indexOf('EPS 순마진'));
    ok('이 줄에 경고색이 켜지지 않는다', !/var\(--down\)/.test(seg), seg.slice(-120)); }
  ok("화면도 '불가능'이라 말하지 않는다",
     !/불가능/.test(H2.slice(H2.indexOf('EPS 순마진'), H2.indexOf('EPS 순마진')+1200)));
}

console.log('\n────────────────────────────');
console.log(pass+' passed · '+fail+' failed');
process.exit(fail?1:0);
