/* (v5.6) 그림자 장부 UI 스모크 — 렌더 경로를 **실제로 실행**한다.
 * 순수함수 테스트(tests/shadow.cjs)가 통과해도 화면 함수가 한 번도 안 돌면 모르는 결함이 남는다.
 * dist/index.html 에서 glObs ~ lgViewVerify 구간을 잘라 실행하므로 배포본 자체를 검사한다.
 * 사용법: node tests/shadow-ui.cjs [dist/index.html] */
const fs=require('fs'),QADomain=require('../src/domain.js');
const HTML=process.argv[2]||__dirname+'/../dist/index.html';
const T=fs.readFileSync(HTML,'utf8'),L=T.split('\n');
const a=L.findIndex(x=>x.startsWith('function glObs(hz){'));
const b=L.findIndex(x=>x.startsWith('function lgViewVerify(){'));
if(a<0||b<0){console.error('구간 미발견 — glObs/lgViewVerify');process.exit(2);}
const src=L.slice(a,b).join('\n');
const RULE_VER=(T.match(/const RULE_VER='([^']+)'/)||[])[1];

const SEC=d=>Date.parse(d+'T00:00:00Z')/1000;
const COLS=['tier','tierNoCap','qMissW','aMissW','anaTgt','estE','estR','surpD','surpPct','ugdD','ugdAct','revNet','basisB','tgtW','anaN','dataAnomN'];
const S={uid:'u1',glog:{},bench:{},settings:{qw:{},aw:{},weights:{}},lg:{hz:60},view:'ledger'};
const esc=x=>String(x==null?'':x);
const glSettingsKey=()=>'K';
const glGet=(doc,row,name)=>{const cs=(doc&&doc.cols)||COLS,i=cs.indexOf(name);return (i<0||!row||i>=row.length)?null:row[i];};
const D=()=>({get:async()=>({exists:false}),set:async()=>{}});
const GL_HORIZ=[20,60,120],GL_MIN_N=30,ANA_MIN=3;
/* REV_A·REV_DIR·REV_AMB는 잘라낸 구간 **안에** 선언돼 있다 — 밖에서 넘기면 중복 선언이다. */
let HTMLOUT='';
const $=()=>({set innerHTML(v){HTMLOUT=v;}});

const M=new Function('S','esc','QADomain','RULE_VER','glSettingsKey','glGet','D','$',
  'GL_HORIZ','GL_MIN_N','ANA_MIN','STIER','TIER_RANK',
  src+'\n;return {lgShadowHTML,lgShadowCause,glShadowDocs,glObs,revCause,glEstSrc,glPlaceboArgs,preregEnsure,setPrereg:v=>{preregState=v;}};')
  (S,esc,QADomain,RULE_VER,glSettingsKey,glGet,D,$,GL_HORIZ,GL_MIN_N,ANA_MIN,
   ['상','중','하','범위밖'],{'상':3,'중':2,'하':1,'범위밖':0});

let pass=0,fail=0;
const ok=(n,c,x)=>{c?(pass++,console.log('  OK   '+n)):(fail++,console.log('  FAIL '+n+(x?('  ← '+x):'')));};

/* ── 합성 로그: 15일 × 8종목. 3일마다 3종목이 상 등급으로 전이한다 ─────────── */
function build(days){
  S.glog={};
  for(let i=0;i<days;i++){
    const d='2026-05-'+String(i+1).padStart(2,'0'),id='v55_'+d,rows={},inputs={},fwd={};
    for(let j=0;j<8;j++){
      const sid='US_S'+j, up=(i%3===0&&j<3);
      rows[sid]=[up?'상':'범위밖', (j===7&&up===false&&i%3===1)?'상':(up?'상':'범위밖'),
        0,0, 100+i, 5+i*0.1, 1000+i, i, 2.5, i, 1, 1, 7, 0.9, 10, 0];
      inputs[sid]={cls:{type:'stock'}};
      fwd[sid]={r60:((i*7+j*13)%21)-10, x60:((i*5+j*11)%17)-8, e60:SEC(d)+86400, z60:SEC(d)+86400*2};
    }
    S.glog[id]={schema:2,d,at:SEC(d)*1000,rv:RULE_VER,cols:COLS,rows,inputs,fwd,settings:'K'};
  }
  // 벤치는 로그 구간(2026-05-01~)을 반드시 덮어야 한다 — 안 덮으면 커버리지 비율이 안 나온다
  const t=[],c=[];for(let k=0;k<400;k++){t.push(SEC('2026-01-01')+k*86400);c.push(100+k*0.5);}
  S.bench={US:{t,c},KR:{t,c}};
}

console.log('\n[1] 로그 부족 — 터지지 않고 안내를 낸다');
build(1); M.setPrereg(null);
let h=M.lgShadowHTML(60);
ok('문자열 반환', typeof h==='string');
ok('2일 미만 안내', /2일 미만/.test(h));

console.log('\n[2] 정상 렌더 — arm 5개 · 판독법 · 승급 · 귀속');
build(15); M.setPrereg({state:'frozen',id:'v5.5_shadow_v1',stored:'1',now:'1'});
h=M.lgShadowHTML(60);
ok('사전등록 동결 표시', /사전등록 동결됨/.test(h));
ok('로그 커버리지 표시', /로그 커버리지/.test(h));
ok('커버리지 100% (합성 로그 15일 = 벤치 15봉)', /기록 15일 \/ 같은 구간 거래일 15일 <b>\(100%\)<\/b>/.test(h),
   (h.match(/로그 커버리지[^<]*(<[^>]*>[^<]*){0,4}/)||[''])[0]);
ok('공백이 표본 손실임을 명시', /표본 손실/.test(h));
{ const keep=S.bench; S.bench={US:{t:[SEC('2020-01-01')],c:[100]},KR:{t:[SEC('2020-01-01')],c:[100]}};
  const h0=M.lgShadowHTML(60);
  ok('벤치가 구간을 안 덮으면 0%가 아니라 산출 불가로 적는다',
     /비율 산출 불가/.test(h0)&&!/\(null%\)/.test(h0)&&!/거래일 0일/.test(h0));
  S.bench=keep; }
for(const k of ['현행','캡 해제','전등급','무작위','동일가중 보유'])ok('arm 행: '+k, h.includes(k));
ok('x와 m을 나란히', /x 중앙값/.test(h)&&/m 중앙값/.test(h));
ok('MDE 열', /MDE/.test(h));
ok('A − D 플라시보 차이', /A − D/.test(h));
ok('A − E 벤치마크 차이', /A − E/.test(h));
ok('승급 심사 표', /변경 후보 심사/.test(h));
ok('승급 조건 명시', /국면 2개 각각에서 CI90이 0을 배제/.test(h));
ok('귀속 표', /귀속 — 왜 그렇게 됐나/.test(h));
ok('플라시보 행', /플라시보\(판정 이전 창\)/.test(h));
ok('플라시보의 (A)는 뜻이 없음을 명시', /플라시보의 \(A\)는/.test(h));
ok('(C) 비율 경고', /\(C\) 비율 자체는 뜻이 없습니다/.test(h));
ok('참작 금지 명시', /자유 파라미터가 된다|자유 파라미터가 됩니다/.test(h));

console.log('\n[3] 귀속이 실제로 돌았는가 (분류 건수 > 0)');
const out=QADomain.shadowRun(M.glShadowDocs(),{h:60,iters:30,bench:S.bench,regimeH:120});
M.lgShadowCause(out,60);
const A=out.arms.find(x=>x.key==='A');
ok('A에 진입 사건이 있다', A.events.length>0, 'n='+A.events.length);
ok('분류가 매칭됐다', A.causeN>0, 'causeN='+A.causeN);
ok('관측과 플라시보가 따로 집계된다', !!A.cause&&!!A.causeP);
ok('모든 사건에 cause가 붙었다', A.events.filter(e=>e.cause).length===A.causeN);

console.log('\n[4] 사전등록 불일치는 경고로 드러난다');
M.setPrereg({state:'drift',id:'v5.5_shadow_v1',stored:'111',now:'222'});
h=M.lgShadowHTML(60);
ok('정의 불일치 경고', /정의 불일치/.test(h));
ok('사전등록 결과가 아님을 명시', /사전등록된 정의의 결과가 아닙니다/.test(h));
ok('저장본 수정 불가 설명', /create-only/.test(h));

console.log('\n[5] 결정론 — 같은 로그는 같은 화면');
build(15); M.setPrereg({state:'frozen',id:'x',stored:'1',now:'1'});
const h1=M.lgShadowHTML(60), h2=M.lgShadowHTML(60);
ok('두 번 렌더가 바이트 일치', h1===h2);

/* ── 6. (v5.6) 채널 정의 — 감사 §3-2 ───────────────────────────────────────── */
console.log('\n[6] 컨센 EPS 채널 — 회계연도 출처가 다르면 비교하지 않는다');
const T0=Date.parse('2026-05-01T00:00:00Z');
const DAY=86400000;
const base={x:10,qm:0,am:0,basisB:1,tgtW:0.9,anaN:10,dataAnomN:0,observedAt:T0,
  anaTgt:100,estE:5,estR:1000,ugdD:1,ugdAct:0,revNet:0,surpD:1,surpPct:0};
const at=d=>({at:T0+d*DAY});
const EPS='컨센 EPS 추정(가이던스)', REVN='개정 건수 순증';
{ // 같은 출처(둘 다 ey1) → 채널이 쓰인다
  const o=Object.assign({},base,{estSrc:1});
  const later=Object.assign({},base,at(60),{estSrc:1,estE:7});  // 컨센 상향 + 결과 양수 → 일치
  const r=M.revCause(o,later);
  ok('출처 일치 → EPS 채널 사용', r.dir.includes(EPS), 'dir='+r.dir.join(','));
  ok('출처 일치 → 커버리지 성립(U 아님)', r.cause!=='U', 'cause='+r.cause);
}
{ // 출처 불일치(ey1 vs ey0) → 같은 숫자여도 비교 금지
  const o=Object.assign({},base,{estSrc:1});
  const later=Object.assign({},base,at(60),{estSrc:0,estE:7});
  const r=M.revCause(o,later);
  ok('출처 불일치 → EPS 채널 미사용', !r.dir.includes(EPS)&&!r.opp.includes(EPS));
  ok('출처 불일치 → 관측불가(U)', r.cause==='U', 'cause='+r.cause);
}
{ // 구버전 문서(estSrc 없음) → 보수적으로 미사용
  const r=M.revCause(Object.assign({},base),Object.assign({},base,at(60),{estE:7}));
  ok('estSrc 없음 → 미사용(구버전 호환)', !r.dir.includes(EPS)&&r.cause==='U');
}

console.log('\n[7] 개정 건수 채널 — 유량이므로 수준을 쓴다 (차분이 아니다)');
{
  /* ★ 판별 케이스: 판정 **이전**에 하향 10건(o=−10), 판정 **이후**는 평상(later=0).
   *    차분이라면 0−(−10)=+10 → "상향이 있었다"로 읽힌다 (거짓 신호).
   *    수준이라면 later=0 → 아무 신호도 아니다 (참).                                  */
  const o=Object.assign({},base,{estSrc:1,revNet:-10});
  const later=Object.assign({},base,at(60),{estSrc:1,revNet:0});
  const r=M.revCause(o,later);
  ok('★ 판정 전 하향은 판정 후 신호가 되지 않는다', !r.dir.includes(REVN)&&!r.opp.includes(REVN),
     'dir='+r.dir.join(',')+' opp='+r.opp.join(','));
}
{ // 판정 이후 실제로 순상향 + 결과 양수 → 일치
  const o=Object.assign({},base,{estSrc:1,revNet:-10});
  const later=Object.assign({},base,at(60),{estSrc:1,revNet:4});
  ok('판정 후 순상향 → 일치', M.revCause(o,later).dir.includes(REVN));
}
{ // 판정 이후 순하향 + 결과 양수 → 불일치
  const o=Object.assign({},base,{estSrc:1,revNet:5});
  const later=Object.assign({},base,at(60),{estSrc:1,revNet:-4});
  ok('판정 후 순하향 → 반대', M.revCause(o,later).opp.includes(REVN));
}
{ // 창 게이트 — later의 30일 창이 판정일을 가로지르면 쓰지 않는다
  const o=Object.assign({},base,{estSrc:1,revNet:0});
  const near=Object.assign({},base,at(20),{estSrc:1,revNet:4});
  ok('간격 20일 → 창 겹침 → 미사용', !M.revCause(o,near).dir.includes(REVN));
  const far=Object.assign({},base,at(31),{estSrc:1,revNet:4});
  ok('간격 31일 → 창이 판정 이후 → 사용', M.revCause(o,far).dir.includes(REVN));
}
{ // 시각이 없으면(구버전 문서) 보수적으로 미사용
  const o=Object.assign({},base,{estSrc:1,revNet:0});
  const noAt=Object.assign({},base,{estSrc:1,revNet:4});
  ok('later.at 없음 → 미사용', !M.revCause(o,noAt).dir.includes(REVN));
}

console.log('\n[7b] 플라시보 쌍 — 역할을 바꿔 넣는다 (v5.6.0의 버그)');
{
  const o=Object.assign({},base,{estSrc:1,revNet:2,anaTgt:100});
  const pre={at:T0-60*DAY,estSrc:1,revNet:-3,anaTgt:90,estE:4,estR:900,ugdD:0,ugdAct:0,surpD:0,surpPct:0};
  const pa=M.glPlaceboArgs(o,pre);
  ok('o 자리에 판정 이전 행이 들어간다', pa[0].revNet===-3&&pa[0].observedAt===T0-60*DAY);
  ok('later 자리에 판정 시점 행이 들어간다', pa[1].revNet===2&&pa[1].at===T0);
  ok('결과 x는 관측에서 가져온다', pa[0].x===o.x);
  ok('간격이 양수 → 창 게이트가 열린다', (pa[1].at-pa[0].observedAt)>30*DAY);
  const rp=M.revCause(pa[0],pa[1]);
  ok('목표가 상승(90→100)이 일치로 집계', rp.dir.includes('애널 목표가 개정'), 'dir='+rp.dir.join(','));
  ok('pre는 산출 상태가 없어 (A)를 만들지 않는다', rp.A.length===0);
  ok('pre 없으면 null', M.glPlaceboArgs(o,null)===null);
}

console.log('\n[8] glEstSrc — 로그 스키마를 늘리지 않고 inputs에서 복원');
{
  const mk=est=>({inputs:{X:{ana:{est}}}});
  ok('ey1 있으면 1', M.glEstSrc(mk({ey1:5,ey0:4}),'X')===1);
  ok('ey0만 있으면 0', M.glEstSrc(mk({ey0:4}),'X')===0);
  ok('est 없으면 null', M.glEstSrc(mk(null),'X')===null);
  ok('inputs 없으면 null (구버전 문서)', M.glEstSrc({},'X')===null);
}

console.log('\n[9] 성숙 관측 0건 — 「차이 없음」처럼 그리지 않는다 (v5.6.3)');
{
  /* 실제 운영 상태의 재현: 로그는 여러 날 쌓였지만 지평이 아직 경과하지 않아
   * 전방수익률이 하나도 확정되지 않았다. 이때 arm 표는 전부 0건/—이 되는데
   * 그 화면은 '규칙 간 차이가 없다'로 오독된다. */
  build(14); M.setPrereg({state:'frozen',id:'v5.5_shadow_v1',stored:'1',now:'1'});
  for(const k in S.glog)for(const sid in S.glog[k].fwd)S.glog[k].fwd[sid]={};   // 성숙 결과 제거
  const h9=M.lgShadowHTML(60);
  ok('성숙 관측 없음을 명시', /성숙 관측 없음/.test(h9));
  ok('지평 미경과가 이유로 적힌다', /지평 60거래일이 아직 경과하지 않았습니다/.test(h9));
  ok('남은 거래일을 센다', /약 \d+거래일<\/b> 남았습니다/.test(h9), (h9.match(/약[^<]*<\/b>[^<]*/)||[''])[0]);
  ok('arm 표를 그리지 않는다', !/무작위|플라시보 차이/.test(h9));
  ok('장치 고장이 아님을 구분해 적는다', /측정 대상이 아직 생기지 않은 것/.test(h9));
  ok('더 짧은 지평을 안내한다', /더 짧은 지평\(20일\)/.test(h9));
  ok('커버리지는 여전히 보인다', /로그 커버리지/.test(h9));
  /* 120일 지평에서는 20·60 둘 다 더 짧다 */
  const h120=M.lgShadowHTML(120);
  ok('120일에서 짧은 지평 2개 안내', /더 짧은 지평\(20·60일\)/.test(h120));
  /* 벤치가 구간을 안 덮으면 남은 일수를 세지 않고 그렇게 적는다 */
  const keep=S.bench; S.bench={};
  const hNB=M.lgShadowHTML(60);
  ok('벤치 없으면 남은 일수를 꾸며내지 않는다',
     /남은 일수를 셀 수 없습니다/.test(hNB)&&!/약 \d+거래일/.test(hNB));
  S.bench=keep;
  /* 결과가 돌아오면 다시 표를 그린다 — 안내문이 영구히 붙어버리지 않는지 확인 */
  build(14);
  const hBack=M.lgShadowHTML(60);
  ok('결과가 있으면 안내문이 사라지고 표가 돌아온다', !/성숙 관측 없음/.test(hBack)&&/무작위/.test(hBack));
}

console.log('\n────────────────────────────');
console.log(pass+' passed · '+fail+' failed');
process.exit(fail?1:0);
