/* (v5.7) 보수 적정가 UI 스모크 — 배포본(dist/index.html)에서 렌더 경로를 **실제로 실행**한다.
 * 순수함수가 맞아도 배선(perAuto→perTtm, fcf×fxq÷shares)이 틀리면 조용히 몇 배 틀린 값이 뜬다.
 * 사용법: node tests/consfv-ui.cjs [dist/index.html] */
const fs=require('fs'),QADomain=require('../src/domain.js');
const HTML=process.argv[2]||__dirname+'/../dist/index.html';
const T=fs.readFileSync(HTML,'utf8'),L=T.split('\n');
const a=L.findIndex(x=>x.startsWith('const CFV_H=GL_HORIZ[1];'));
const b=L.findIndex(x=>x.startsWith('function render(){'));
if(a<0||b<0){console.error('구간 미발견 — CFV_H/render');process.exit(2);}
const src=L.slice(a,b).join('\n');

const S={calc:{},stocks:{}};
const esc=x=>String(x==null?'':x);
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const fmtP=(v,c)=>v==null?'—':(Math.round(v*100)/100).toLocaleString('en-US');
const fmtPct=v=>v==null?'—':((v>=0?'+':'−')+Math.abs(v).toFixed(1)+'%');
const chgCls=v=>v==null?'':(v>0?'up':(v<0?'dn':''));
const curSym=c=>c==='KRW'?'₩':'$';
const GL_HORIZ=[20,60,120], FUND_CEIL_N=3.0;
/* 정당 멀티플 곡선은 app.js 원본과 **같은 식**을 쓴다 — 여기서 다시 적으면 두 곳이 갈라진다.
 * 그래서 테스트는 곡선의 값이 아니라 '주입된 값이 그대로 쓰였는가'를 본다. */
const pl=(x,pts)=>{if(x<=pts[0][0])return pts[0][1];for(let i=1;i<pts.length;i++){const[a0,b0]=pts[i-1],[a1,b1]=pts[i];if(x<=a1)return b0+(b1-b0)*(x-a0)/(a1-a0);}return pts[pts.length-1][1];};
function fairPER(g,q){ if(g==null||!isFinite(g))return null; let per=pl(g,[[-20,8],[0,12],[10,16],[20,24],[30,33],[40,42],[60,55],[80,62],[120,70]]);
  if(q!=null&&isFinite(q))per*=pl(q,[[30,0.8],[50,0.92],[65,1.0],[80,1.12],[92,1.25]]); return clamp(per,5,75); }
function fairPSR(g){ if(g==null||!isFinite(g))return null; return clamp(pl(g,[[-20,0.6],[0,1.5],[20,4],[40,7],[60,10],[100,15],[150,20]]),0.3,22); }
let VM={per:2,pbr:2,psr:2};
const effVM=()=>VM;
const volumeProfile=()=>null;

const M=new Function('S','esc','clamp','fmtP','fmtPct','chgCls','curSym','GL_HORIZ','FUND_CEIL_N',
  'fairPER','fairPSR','effVM','QADomain',
  src+'\n;return {cfvOf,cfvMiniHTML,cfvDetailHTML,stripHTML,CFV_H,CFV_STATE};')
  (S,esc,clamp,fmtP,fmtPct,chgCls,curSym,GL_HORIZ,FUND_CEIL_N,fairPER,fairPSR,effVM,QADomain);

let pass=0,fail=0;
const ok=(n,c,x)=>{c?(pass++,console.log('  OK   '+n)):(fail++,console.log('  FAIL '+n+(x!==undefined?('  ← '+x):'')));};
const near=(a,b,tol)=>a!=null&&Math.abs(a-b)<=tol;

/* 현재가 100 · 후행PER 10 · 선행PER 8 · PSR 2 · PBR 1.25 · 종합점수 65(→정당PER 12배)
 * FCF 700(fcur) · fx 1 · 주식수 100 → 주당FCF 7 */
function put(id,o){
  S.calc[id]=Object.assign({price:100,currency:'USD',quality:65,annVol:0.40,
    perAuto:10,perFwdAuto:8,psrAuto:2,pbrAuto:1.25,fcf:700,fxq:1,
    revenueBasis:{status:'reconciled',shares:100},
    lo52:60,hi52:140,bbL:92,bbU:108,s50:98,s200:95,e20:99,bbM:100,chg:0.5},o||{});
  return id;
}

console.log('\n[1] 배선 — k의 어느 필드가 어느 방법으로 가는가');
put('US_X'); VM={per:2,pbr:2,psr:2};
let r=M.cfvOf('US_X');
ok('EPS는 낮은 쪽(후행 10배) × 정당PER 12배 = 120', near((r.used.find(m=>m.key==='eps')||{}).value,120,1e-9),
   JSON.stringify(r.used.map(m=>[m.key,m.value])));
ok('주당FCF = fcf×fxq÷주식수 = 7 → 7×12 = 84', near((r.used.find(m=>m.key==='fcf')||{}).value,84,1e-9));
ok('장부가 = 현재가/PBR = 80', near((r.used.find(m=>m.key==='book')||{}).value,80,1e-9));
ok('흑자라 PSR은 제외', !r.used.some(m=>m.key==='rev'));
ok('중앙값 84', near(r.fv,84,1e-9), r.fv);
ok('지평은 GL_HORIZ[1]=60을 재사용', M.CFV_H===60&&r.h===60);

console.log('\n[2] 통화·주식수 — 조용히 틀릴 수 있는 자리');
put('US_FX',{fxq:0.5});   // 재무제표 통화 1 = 시세통화 0.5 → 주당FCF 3.5
r=M.cfvOf('US_FX');
ok('fxq가 주당FCF에 곱해진다 (3.5×12=42)', near((r.used.find(m=>m.key==='fcf')||{}).value,42,1e-9));
put('US_NOREC',{revenueBasis:{status:'share-mismatch',shares:100}});
r=M.cfvOf('US_NOREC');
ok('주식수가 시총과 안 맞으면 FCF 방법을 **쓰지 않는다**', !r.used.some(m=>m.key==='fcf'));
ok('그 사유를 남긴다', /주식수 미확인/.test((r.skipped.find(s=>s.key==='fcf')||{}).why||''),
   (r.skipped.find(s=>s.key==='fcf')||{}).why);
put('US_NOSH',{revenueBasis:null});
ok('revenueBasis 자체가 없어도 터지지 않는다', M.cfvOf('US_NOSH').fv!=null);

console.log('\n[3] ETF와 결측');
put('US_ETF',{assetType:'etf'});
ok('ETF는 null (재무제표가 없다)', M.cfvOf('US_ETF')===null);
ok('ETF의 목록 축약은 빈 문자열', M.cfvMiniHTML(S.calc['US_ETF'],null)==='');
put('US_EMPTY',{perAuto:null,perFwdAuto:null,psrAuto:null,pbrAuto:null,fcf:null});
r=M.cfvOf('US_EMPTY');
ok('입력이 전부 없으면 fv=null', r.fv===null);
{ const h=M.cfvMiniHTML(S.calc['US_EMPTY'],r);
  ok('목록에서 빈 칸으로 사라지지 않는다', /보수 —/.test(h), h);
  ok('이유가 툴팁에 담긴다', /title="[^"]*산출 불가/.test(h), h.slice(0,160)); }

console.log('\n[4] 목록 축약 — 숫자와 확률이 함께 보인다');
put('US_M'); VM={per:2,pbr:2,psr:2};
{ const cfv=M.cfvOf('US_M'), h=M.cfvMiniHTML(S.calc['US_M'],cfv);
  ok('보수 적정가 표시', /보수 84/.test(h), h);
  ok('현재가 대비 괴리 표시', /−16\.0%/.test(h), h);
  ok('제안 지정가 표시', /지정 84/.test(h), h);
  ok('도달확률 배지', /<span class="pp">\d+%<\/span>/.test(h), h);
  ok('툴팁이 애널 미사용을 명시', /애널 목표가는 쓰지 않습니다/.test(h)); }

console.log('\n[5] 가격 띠 — 가치 레일이 축 안에 들어오는가');
put('US_S'); 
{ const cfv=M.cfvOf('US_S'), h=M.stripHTML(S.calc['US_S'],cfv);
  ok('가치 구간이 그려진다', /class="cfvzone"/.test(h), h.slice(0,200));
  ok('보수 적정가 눈금', /tick cfv"/.test(h));
  ok('제안 지정가 눈금', /tick cfvlim"/.test(h));
  const lefts=[...h.matchAll(/class="tick (cfv|cfvlim)" style="left:([\d.]+)%/g)].map(m=>+m[2]);
  ok('눈금이 0%·100%에 붙지 않는다(축 범위에 포함됨)', lefts.length===2&&lefts.every(v=>v>0.5&&v<99.5), JSON.stringify(lefts));
  const cfv2=M.cfvOf('US_S');
  ok('cfv 없이 불러도 기존 띠는 그대로', !/cfvzone/.test(M.stripHTML(S.calc['US_S'],null))&&/pricedot/.test(M.stripHTML(S.calc['US_S'],null)));
  void cfv2; }
{ // 보수 적정가가 52주 범위보다 훨씬 낮은 경우 — 축이 늘어나 눈금이 보여야 한다
  put('US_LOW',{pbrAuto:5,perAuto:40,perFwdAuto:40,fcf:100});
  const cfv=M.cfvOf('US_LOW'), h=M.stripHTML(S.calc['US_LOW'],cfv);
  const lefts=[...h.matchAll(/class="tick (cfv|cfvlim)" style="left:([\d.]+)%/g)].map(m=>+m[2]);
  ok('값이 52주 최저보다 낮아도 눈금이 축 안에 있다', lefts.every(v=>v>=0&&v<=100)&&lefts.length===2, JSON.stringify(lefts)+' fv='+cfv.fv); }

console.log('\n[6] 상세 패널 — 내역·배제사유·가정');
put('US_D'); VM={per:2,pbr:0,psr:1};
{ const h=M.cfvDetailHTML('US_D',S.calc['US_D']);
  ok('제목에 표시 전용임을 적는다', /판정에 쓰이지 않음/.test(h));
  ok('방법별 표가 있다', /class="cfvtbl"/.test(h)&&/이익력\(EPS\)/.test(h));
  ok('PBR 판별력 0이면 배제 목록에 사유가 뜬다', /자산\(장부가\) — [^<]*판별력 없음/.test(h), (h.match(/자산\(장부가\) — [^<]*/)||[''])[0]);
  ok('절반 확률 도달가를 따로 적는다', /절반의 확률<\/b>로 닿는 가격/.test(h));
  ok('드리프트 0 가정을 명시', /드리프트 0/.test(h));
  ok('상승추세에서 과대평가됨을 경고', /상승 추세 종목에서는 도달확률이 과대평가/.test(h));
  ok('성장 0을 쓴다는 것을 적는다', /성장률 0/.test(h)); }
{ put('US_DN',{perAuto:null,perFwdAuto:null,psrAuto:null,pbrAuto:null,fcf:null});
  const h=M.cfvDetailHTML('US_DN',S.calc['US_DN']);
  ok('산출 불가도 이유와 함께 블록을 낸다', /산출 불가 —/.test(h)&&/쓰지 않은 방법/.test(h), h.slice(0,200)); }

console.log('\n[7] 변동성 미확보 — 지정가를 꾸며내지 않는다');
put('US_NV',{annVol:null});
{ const cfv=M.cfvOf('US_NV'), h=M.cfvMiniHTML(S.calc['US_NV'],cfv);
  ok('보수 적정가는 나온다', cfv.fv!=null);
  ok('지정가는 null', cfv.limit===null);
  ok('목록에 지정 — 로 적고 이유를 담는다', /지정 —/.test(h)&&/변동성 미확보/.test(h), h);
  ok('띠에 가치 구간을 그리지 않는다', !/cfvzone/.test(M.stripHTML(S.calc['US_NV'],cfv))); }

console.log('\n────────────────────────────');
console.log(pass+' passed · '+fail+' failed');
process.exit(fail?1:0);
