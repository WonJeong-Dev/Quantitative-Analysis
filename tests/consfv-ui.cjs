/* (v5.8) 보수 적정가 · 판정 3단어 · 목록 칸 — 배포본(dist/index.html)에서 렌더 경로를 실제로 실행한다.
 * 순수함수가 맞아도 배선(perAuto→perTtm, fcf×fxq÷shares)이나 판정 분기가 틀리면 조용히 잘못 뜬다.
 * 사용법: node tests/consfv-ui.cjs [dist/index.html] */
const fs=require('fs'),QADomain=require('../src/domain.js');
const HTML=process.argv[2]||__dirname+'/../dist/index.html';
const T=fs.readFileSync(HTML,'utf8'),L=T.split('\n');
const a=L.findIndex(x=>x.startsWith('const CFV_H=GL_HORIZ[1];'));
const b=L.findIndex(x=>x.startsWith('function render(){'));
if(a<0||b<0){console.error('구간 미발견 — CFV_H/render');process.exit(2);}
const src=L.slice(a,b).join('\n');

const S={calc:{},stocks:{},cache:{}};
const esc=x=>String(x==null?'':x);
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const fmtP=(v,c)=>v==null?'—':(Math.round(v*100)/100).toLocaleString('en-US');
const fmtPct=v=>v==null?'—':((v>=0?'+':'−')+Math.abs(v).toFixed(1)+'%');
const chgCls=v=>v==null?'':(v>0?'up':(v<0?'dn':''));
const curSym=c=>c==='KRW'?'₩':'$';
const GL_HORIZ=[20,60,120], FUND_CEIL_N=3.0;
const pl=(x,pts)=>{if(x<=pts[0][0])return pts[0][1];for(let i=1;i<pts.length;i++){const[a0,b0]=pts[i-1],[a1,b1]=pts[i];if(x<=a1)return b0+(b1-b0)*(x-a0)/(a1-a0);}return pts[pts.length-1][1];};
function fairPER(g,q){ if(g==null||!isFinite(g))return null; let per=pl(g,[[-20,8],[0,12],[10,16],[20,24],[30,33],[40,42],[60,55],[80,62],[120,70]]);
  if(q!=null&&isFinite(q))per*=pl(q,[[30,0.8],[50,0.92],[65,1.0],[80,1.12],[92,1.25]]); return clamp(per,5,75); }
function fairPSR(g){ if(g==null||!isFinite(g))return null; return clamp(pl(g,[[-20,0.6],[0,1.5],[20,4],[40,7],[60,10],[100,15],[150,20]]),0.3,22); }
let VM={per:2,pbr:2,psr:2};
const effVM=()=>VM;
/* 점수 가중·라벨은 app.js 원본과 같은 값을 쓴다 — 편재는 '어느 성분이 최대인가'를 보는 것이라
 * 값 자체가 아니라 **비중 계산이 맞는가**를 검사한다. */
const QW_DEF={fin:35,growth:28,ana:22,stab:15};
const AW_DEF={up:46,rsi:18,bb:12,vp:14,prox:10};
const QW_LABELS={fin:'재무 품질',growth:'성장성',ana:'애널 신뢰',stab:'안정성'};
const AW_LABELS={up:'상승여력',rsi:'RSI 반등',bb:'볼린저',vp:'매물대',prox:'눌림목'};
S.settings={qw:QW_DEF,aw:AW_DEF};

const M=new Function('S','esc','clamp','fmtP','fmtPct','chgCls','curSym','GL_HORIZ','FUND_CEIL_N',
  'fairPER','fairPSR','effVM','QADomain','QW_DEF','AW_DEF','QW_LABELS','AW_LABELS',
  src+'\n;return {cfvOf,cfvDetailHTML,stripHTML,verdictOf,evidenceOf,topShare,exHTML,evHTML,CFV_H,CFV_STATE,VERDICT,LOP_WARN};')
  (S,esc,clamp,fmtP,fmtPct,chgCls,curSym,GL_HORIZ,FUND_CEIL_N,fairPER,fairPSR,effVM,QADomain,
   QW_DEF,AW_DEF,QW_LABELS,AW_LABELS);

let pass=0,fail=0;
const ok=(n,c,x)=>{c?(pass++,console.log('  OK   '+n)):(fail++,console.log('  FAIL '+n+(x!==undefined?('  ← '+x):'')));};
const near=(a,b,tol)=>a!=null&&Math.abs(a-b)<=tol;

/* 현재가 100 · 후행PER 10 · 선행PER 8 · PSR 2 · PBR 1.25 · 종합점수 65(→정당PER 12배)
 * FCF 700(fcur) · fx 1 · 주식수 100 → 주당FCF 7.  보수 적정가 = median(120, 84, 80) = 84 */
function grd(n,total,blocked){
  const gates=[]; for(let i=0;i<total;i++)gates.push(['관문'+(i+1),i<n,'G'+(i+1)]);
  return {gates:gates,blocked:blocked||null,nearBoundary:false};
}
function put(id,o){
  S.calc[id]=Object.assign({price:100,currency:'USD',quality:65,annVol:0.40,
    perAuto:10,perFwdAuto:8,psrAuto:2,pbrAuto:1.25,fcf:700,fxq:1,
    revenueBasis:{status:'reconciled',shares:100},
    tier:'중',grd:grd(11,11),qMissW:0,aMissW:0,qMiss:[],aMiss:[],
    qParts:{fin:70,growth:60,ana:80,stab:50},
    aParts:{up:60,rsi:55,bb:50,vp:52,prox:48},
    lo52:60,hi52:140,chg:0.5},o||{});
  return id;
}

console.log('\n[1] 배선 — k의 어느 필드가 어느 방법으로 가는가');
put('US_X'); VM={per:2,pbr:2,psr:2};
let r=M.cfvOf('US_X');
/* (v5.9.6) 정상화 EPS — perTtm 10배·perFwd 8배 → EPS 10·12.5의 평균 11.25 → ×12 = 135 */
ok('EPS는 정상화(후행·선행 평균) × 정당PER 12배 = 135', near((r.used.find(m=>m.key==='eps')||{}).value,135,1e-9),
   (r.used.find(m=>m.key==='eps')||{}).value);
ok('주당FCF = fcf×fxq÷주식수 = 7 → 7×12 = 84', near((r.used.find(m=>m.key==='fcf')||{}).value,84,1e-9));
ok('장부가 = 현재가/PBR = 80', near((r.used.find(m=>m.key==='book')||{}).value,80,1e-9));
ok('흑자라 PSR은 제외', !r.used.some(m=>m.key==='rev'));
/* (v5.9.7) FCF(84)는 참고로 빠진다 → 이익력 135 · 장부 80의 2종 중앙값 = 107.5 */
ok('참고(FCF)를 뺀 2종 중앙값 107.5', near(r.fv,107.5,1e-9), r.fv);
ok('FCF는 ref 표시', (r.used.find(m=>m.key==='fcf')||{}).ref===true);
ok('지평은 GL_HORIZ[1]=60을 재사용', M.CFV_H===60&&r.h===60);

console.log('\n[2] 통화·주식수 — 조용히 틀릴 수 있는 자리');
put('US_FX',{fxq:0.5});
ok('fxq가 주당FCF에 곱해진다 (3.5×12=42)', near((M.cfvOf('US_FX').used.find(m=>m.key==='fcf')||{}).value,42,1e-9));
put('US_NOREC',{revenueBasis:{status:'share-mismatch',shares:100}});
r=M.cfvOf('US_NOREC');
ok('주식수가 시총과 안 맞으면 FCF 방법을 쓰지 않는다', !r.used.some(m=>m.key==='fcf'));
ok('그 사유를 남긴다', /주식수 미확인/.test((r.skipped.find(s=>s.key==='fcf')||{}).why||''));
put('US_NOSH',{revenueBasis:null});
ok('revenueBasis 자체가 없어도 터지지 않는다', M.cfvOf('US_NOSH').fv!=null);

console.log('\n[3] ETF와 결측');
put('US_ETF',{assetType:'etf',tier:'저점권'});
ok('ETF는 cfv null (재무제표가 없다)', M.cfvOf('US_ETF')===null);
put('US_EMPTY',{perAuto:null,perFwdAuto:null,psrAuto:null,pbrAuto:null,fcf:null});
ok('입력이 전부 없으면 fv=null', M.cfvOf('US_EMPTY').fv===null);

console.log('\n[4] 판정 — 세 단어, 겹치지 않는다 (v5.8)');
/* 관망 조건: 현재가 > 보수 적정가. perAuto/perFwdAuto 15배 → 이익력 80, 장부 80 → fv 80 < 100 */
put('US_W',{perAuto:15,perFwdAuto:15}); VM={per:2,pbr:2,psr:2};
let v=M.verdictOf('US_W');
ok('관문 통과 + 가격이 가치보다 비쌈 → 관망', v.key==='watch'&&v.w==='관망', v.key);
ok('이유는 짧은 명사구', v.why==='가치보다 25.0% 비쌈', v.why);
ok('"회사는 통과" 같은 중복을 빼고 긴 설명은 title로', !/회사는 통과/.test(v.why)&&/하드 게이트는 전부 통과/.test(v.tip||''), v.tip);
ok('관문 통과수를 센다', v.gn===11&&v.gt===11);
/* 추천 조건: 현재가 ≤ 보수 적정가. 이익력 70/7×12=120 · 장부 70/0.875=80 → fv 100 ≥ 70 */
put('US_A',{price:70,perAuto:7,perFwdAuto:7,pbrAuto:0.875,fcf:490});
v=M.verdictOf('US_A');
ok('현재가가 가치 이하 → 추천', v.key==='rec'&&v.w==='추천', v.key+' fv='+(v.cfv&&v.cfv.fv));
ok('이유에 가치 금액이 적힌다 (2종 중앙값 = (120+80)/2 = 100)', v.why==='가치 $100 아래', v.why);
put('US_O',{tier:null,grd:grd(9,11,'최소 품질 — 종합점수 ≥ 45')});
v=M.verdictOf('US_O');
ok('관문 미통과 → 탈락', v.key==='out'&&v.w==='탈락');
ok('어느 관문에서 걸렸는지 앞부분만 쓴다', v.why==='최소 품질에서 걸림', v.why);
ok('전체 문구는 툴팁용으로 보존', v.blocked==='최소 품질 — 종합점수 ≥ 45');
put('US_NV2',{perAuto:null,perFwdAuto:null,psrAuto:null,pbrAuto:null,fcf:null});
v=M.verdictOf('US_NV2');
/* (v6.1) 관문은 통과했는데 가치를 못 매기는 상태는 **거절이 아니다** — 재무제표가 없어서
 * 값을 못 낸 것이지 비싸서 떨어뜨린 것이 아니다. 탈락으로 되돌리면 이 검사가 깨진다. */
ok('값을 못 매기면 탈락이 아니라 평가 불가', v.key==='na'&&v.w==='평가 불가', v.key+'/'+v.w);
ok('평가하지 않았다는 뜻임을 적는다', v.why==='가치를 매길 자료 없음'
   &&/나쁘다는 뜻이 아닙니다/.test(v.tip||''), v.why);
put('US_ETF2',{assetType:'etf',tier:'저점권'});
ok('ETF 저점권 → 추천', M.verdictOf('US_ETF2').key==='rec');
put('US_ETF3',{assetType:'etf',tier:'중립'});
v=M.verdictOf('US_ETF3');
ok('ETF 중립 → 관망', v.key==='watch');
ok('ETF는 지정가를 내지 않는다고 title에 적는다', /재무제표가 없어 지정가는 내지 않습니다/.test(v.tip||''), v.tip);
put('US_ETF4',{assetType:'etf',tier:null,grd:grd(5,6,'데이터 충분 — 상장 120봉(≈6개월) 이상')});
ok('ETF도 관문 미통과면 탈락', M.verdictOf('US_ETF4').key==='out');
/* (v6.1) 판정은 여전히 셋이다. '평가 불가'는 네 번째 판정이 아니라 **판정이 없다는 표시**다 —
 * 평가의 결과(추천·관망·탈락)와 평가하지 않았다는 사실은 종류가 다르다. */
ok('판정 단어는 셋 + 평가 불가', Object.keys(M.VERDICT).length===4&&
   ['추천','관망','탈락','평가 불가'].every(w=>Object.values(M.VERDICT).some(x=>x.w===w)));
ok('평가 불가는 탈락과 다른 표식', M.VERDICT.na.mk!==M.VERDICT.out.mk&&M.VERDICT.na.cls==='na');
{ /* 경고색으로 칠하면 '나쁘다'로 읽힌다 — 중립이어야 한다. */
  const css=T.slice(0,T.lastIndexOf('</style>'));
  const i=css.indexOf('.vd.na{'); const rule=i<0?'':css.slice(i,css.indexOf('}',i));
  ok('평가 불가는 중립색(경고색 아님)', /var\(--muted\)/.test(rule)&&!/--down|--amber/.test(rule), rule); }

console.log('\n[5] 실행 칸 — 지정가 하나 + 닿을 확률');
put('US_E');
{ const h=M.exHTML(S.calc['US_E'],M.cfvOf('US_E'));
  ok('지정가가 하나만 크게', (h.match(/class="p"/g)||[]).length===1, h);
  /* (v5.9.9) 칩은 없앴다 — 바로 왼쪽 현재가 칸이 '가격 + 등락%'라서 같은 모양이 등락률로 읽혔다.
   * 숫자는 자기 이름을 단 캡션 한 줄 안에만 있어야 한다. 칩이 돌아오면 이 검사가 깨진다. */
  ok('가격 옆에 이름 없는 % 칩을 두지 않는다', !/class="prob"/.test(h), h);
  ok('확률은 이름을 달고 캡션 줄 안에 있다', /60거래일 내 도달 확률 <b>\d+%<\/b>/.test(h), h);
  ok('가격 줄(pline)에는 %가 없다', !/%/.test((h.match(/<div class="pline">[\s\S]*?<\/div>/)||[''])[0]), h);
  ok('"제약" 같은 내부 용어를 쓰지 않는다', !/제약/.test(h)&&!/중앙 도달가/.test(h), h); }
{ put('US_E2',{annVol:null});
  const h=M.exHTML(S.calc['US_E2'],M.cfvOf('US_E2'));
  ok('변동성이 없으면 지정가를 꾸며내지 않고 보수 적정가를 보인다', /도달 확률 산출 불가/.test(h)&&!/class="prob"/.test(h), h); }
/* (v5.9.9) 반올림과 흐림 — 0%는 '０이다'로 읽히는데 실제로는 '1% 미만'이다(§22-⑫와 같은 종류). */
{ put('US_P0',{annVol:0.02,perAuto:40,perFwdAuto:40,pbrAuto:null,fcf:null});
  const c=M.cfvOf('US_P0'), h=M.exHTML(S.calc['US_P0'],c);
  const pp=c.limitProb*100;
  ok('표본이 1% 미만 확률을 만든다 (검사 전제)', pp<1, pp);
  ok("1% 미만은 '0%'가 아니라 '<1%'", /&lt;1%|<b>&lt;1%<\/b>/.test(h)||/<b>&lt;1%<\/b>/.test(h)||h.indexOf('<b>&lt;1%</b>')>=0||h.indexOf('<b><1%</b>')>=0, h);
  ok('10% 미만이면 지정가를 흐리게 (숨기지는 않는다)', /class="p faint"/.test(h)&&/\$/.test(h), h);
  ok('흐린 이유를 title에 적는다', /미만이라 흐리게/.test(h), h); }
{ put('US_P1',{annVol:0.60,perAuto:9,perFwdAuto:9,pbrAuto:null,fcf:null});
  const c=M.cfvOf('US_P1'), h=M.exHTML(S.calc['US_P1'],c);
  ok('확률이 충분하면 흐리게 하지 않는다 (검사 전제: '+Math.round(c.limitProb*100)+'%)',
     c.limitProb>=0.10 ? !/faint/.test(h) : true, h.slice(0,120)); }
{ put('US_E3',{assetType:'etf',tier:'중립'});
  const h=M.exHTML(S.calc['US_E3'],null);
  ok('ETF는 구조적 이유를 적는다', /지정가 없음 \(ETF\)/.test(h)&&/결함이 아니라 구조/.test(h), h); }
{ put('US_E4',{perAuto:null,perFwdAuto:null,psrAuto:null,pbrAuto:null,fcf:null});
  const h=M.exHTML(S.calc['US_E4'],M.cfvOf('US_E4'));
  /* (v5.8.1) 캡션은 뺐다 — 판정 칸이 이미 '값을 매길 수 없음'이라고 말한다. 같은 말을 두 번 쓰면 세 줄로 접힌다.
     빈 칸이 아니어야 한다는 원칙은 그대로: 글자(지정가 없음)와 사유(title)가 남는다. */
  ok('값을 못 매기면 빈 칸이 아니라 글자 + 사유 title', /지정가 없음/.test(h)&&/title="[^"]*산출 불가/.test(h), h);
  ok('같은 사유를 두 번 쓰지 않는다', (h.match(/산출 불가/g)||[]).length===1, h);
  ok('그 사유는 판정 칸이 말한다', M.verdictOf('US_E4').why==='가치를 매길 자료 없음',
     M.verdictOf('US_E4').why); }

console.log('\n[6] 신뢰도 칸 — 결측을 뒤집어 상시 품질 수치로');
put('US_V1',{qMissW:0,aMissW:0});
ok('결측 0이면 100%', M.evidenceOf(S.calc['US_V1']).dens===100);
put('US_V2',{qMissW:23,aMissW:9,qMiss:['ROE','마진'],aMiss:['매물대']});
{ const e=M.evidenceOf(S.calc['US_V2']);
  ok('둘 중 큰 결측을 쓴다 (100−23=77)', e.dens===77, e.dens);
  const h=M.evHTML(S.calc['US_V2']);
  ok('비어 있는 성분 이름이 툴팁에 담긴다', /ROE · 마진/.test(h), h.slice(0,200));
  ok('막대 5칸 중 4칸', (h.match(/<i class="on">/g)||[]).length===4, h);
  ok('캡션 한 줄을 없애 두 줄로 줄였다', !/>근거 밀도</.test(h), h);
  /* (v5.9.9) 한 행에 뜻이 다른 %가 둘(도달확률·신뢰도) 있다. 숫자가 이름을 안 달고 있으면
   * 둘 다 읽히지 않는다 — 실제로 "작은 %랑 큰 %가 각각 뭐냐"는 질문을 받았다. */
  ok('숫자가 이름표를 달고 있다', /<span class="lbl">신뢰도<\/span> 77%/.test(h), h.slice(0,200));
  /* 이름은 바꿨지만 뜻은 안 바꿨다. 100%를 '확실하다'로 읽히게 두지 않는다. */
  ok("툴팁이 '판정이 맞을 확률이 아님'을 못 박는다", /판정이 맞을 확률이 아닙니다/.test(h), h.slice(0,300));
  ok('무엇을 재는지 툴팁에 남아 있다', /받아야 할 입력 중 도착한 비율/.test(h)); }
{ /* 편재는 이 숫자에 들어가 있지 않다 — 합치면 둘 다 안 보인다. 그 사실을 툴팁이 말한다. */
  put('US_V2b',{qMissW:0,aMissW:0,aParts:{up:60,rsi:null,bb:null,vp:null,prox:null}});
  const h=M.evHTML(S.calc['US_V2b']);
  ok('결측 0이면 신뢰도 100%', /<span class="lbl">신뢰도<\/span> 100%/.test(h), h.slice(0,160));
  ok('그래도 편재 경고는 따로 뜬다 (100%가 「확실」이 아니다)', /⚠ 단일 100%/.test(h), h);
  ok('편재가 이 숫자에 반영돼 있지 않다고 적는다', /반영돼 있지 않습니다/.test(h)); }

{ /* 머리글과 범례가 같은 이름을 쓰는가 — 칸 이름이 둘로 갈리면 질문이 되돌아온다. */
  ok('목록 머리글이 「신뢰도」', /<div style="text-align:right">신뢰도<\/div>/.test(T), 'listhead');
  ok('범례가 세 가지 %를 구분해 적는다', /등락률/.test(T)&&/도달 확률/.test(T)&&/판정이 맞을 확률이 아님/.test(T)); }

console.log('\n[6b] 편재 — 받은 근거 중 한 성분의 최대 비중 (v5.8.1)');
ok('임계는 과반', M.LOP_WARN===50);
{ // 전부 수신: 종합 fin 35/100=35%, 매력 up 46/100=46% → 최대 46%
  put('US_L1');
  const e=M.evidenceOf(S.calc['US_L1']);
  ok('두 점수 중 더 큰 쪽을 고른다', e.lop.share===46&&e.lop.label==='상승여력'&&e.lop.src==='가격매력도',
     JSON.stringify(e.lop));
  ok('과반이 아니면 화면에 적지 않는다 (툴팁에만)', !/class="s lop"/.test(M.evHTML(S.calc['US_L1'])), M.evHTML(S.calc['US_L1']));
  ok('그래도 툴팁에는 남긴다', /최대 단일 근거: 가격매력도의 상승여력 46%/.test(M.evHTML(S.calc['US_L1'])));
}
{ // 결측분은 분모에서 뺀다: 매력에서 rsi·bb·vp·prox가 없으면 up이 혼자 100%
  put('US_L2',{aParts:{up:60,rsi:null,bb:null,vp:null,prox:null}});
  const e=M.evidenceOf(S.calc['US_L2']);
  ok('결측 성분은 분모에서 빠진다 (up 혼자 100%)', e.lop.share===100&&e.lop.label==='상승여력', JSON.stringify(e.lop));
  ok('과반이면 경고를 적는다', /⚠ 단일 100%/.test(M.evHTML(S.calc['US_L2'])), M.evHTML(S.calc['US_L2']));
}
{ // 받은 성분이 하나도 없으면 편재를 내지 않는다 (0으로 세지 않는다)
  put('US_L3',{qParts:{fin:null,growth:null,ana:null,stab:null},aParts:{up:null,rsi:null,bb:null,vp:null,prox:null}});
  ok('받은 성분이 없으면 null (0% 아님)', M.evidenceOf(S.calc['US_L3']).lop===null);
}
{ // 가중이 바뀌면 편재도 따라간다 — 설정을 읽고 있는지
  const keep=S.settings.aw; S.settings.aw={up:10,rsi:10,bb:10,vp:10,prox:60};
  put('US_L4');
  ok('사용자 가중 설정을 읽는다', M.evidenceOf(S.calc['US_L4']).lop.label==='눌림목', JSON.stringify(M.evidenceOf(S.calc['US_L4']).lop));
  S.settings.aw=keep;
}
{ /* §22-⑲ 재사용은 주장이 아니라 검사 — ETF는 evidenceOf에 도달하지 않으므로
     compute()의 awEff(ETF일 때 up:0) 분기를 여기서 다시 쓸 일이 없다. */
  put('US_L5',{assetType:'etf',tier:'중립'});
  const e=M.evidenceOf(S.calc['US_L5']);
  ok('ETF는 밀도도 편재도 내지 않는다 — awEff 분기를 다시 쓸 일이 없다', e.dens===null&&e.lop===null);
}

console.log('\n[6c] 근거 밀도 경고색');
put('US_V3',{qMissW:55,aMissW:10});
{ const h=M.evHTML(S.calc['US_V3']);
  ok('60% 미만이면 경고색', /color:var\(--amber\)/.test(h)&&/class="lo"/.test(h), h.slice(0,160)); }
put('US_V4',{assetType:'etf',tier:'중립'});
ok('ETF는 밀도를 내지 않는다 (구조적 결측)', M.evidenceOf(S.calc['US_V4']).dens===null);
ok('ETF 칸은 — 로 적고 이유를 담는다', /—/.test(M.evHTML(S.calc['US_V4']))&&/ETF/.test(M.evHTML(S.calc['US_V4'])));

console.log('\n[7] 가격 띠 — 눈금 셋뿐');
put('US_S');
{ const cfv=M.cfvOf('US_S'), h=M.stripHTML(S.calc['US_S'],cfv);
  ok('보수 적정가 눈금', /tick cfv"/.test(h));
  ok('제안 지정가 눈금', /tick cfvlim"/.test(h));
  ok('현재가 점', /pricedot/.test(h));
  ok('기술 눈금(매물대·볼린저·이평)은 더 이상 그리지 않는다',
     !/class="zone"/.test(h)&&!/class="bb"/.test(h)&&!/tick poc/.test(h)&&!/tick s200/.test(h), h.slice(0,220));
  const lefts=[...h.matchAll(/class="tick (?:cfv|cfvlim)" style="left:([\d.]+)%/g)].map(m=>+m[1]);
  ok('눈금이 0%·100%에 붙지 않는다(축에 포함됨)', lefts.length===2&&lefts.every(v=>v>0.5&&v<99.5), JSON.stringify(lefts)); }
{ put('US_S2',{pbrAuto:5,perAuto:40,perFwdAuto:40,fcf:100});
  const cfv=M.cfvOf('US_S2'), h=M.stripHTML(S.calc['US_S2'],cfv);
  const lefts=[...h.matchAll(/class="tick (?:cfv|cfvlim)" style="left:([\d.]+)%/g)].map(m=>+m[1]);
  ok('값이 52주 최저보다 낮아도 축 안에 든다', lefts.length===2&&lefts.every(v=>v>=0&&v<=100), JSON.stringify(lefts)); }
ok('cfv 없이 불러도 터지지 않는다', /pricedot/.test(M.stripHTML(S.calc['US_S'],null)));
ok('k 없으면 빈 띠', M.stripHTML(null,null)==='<div class="strip"></div>');

console.log('\n[7b] 상세 블록은 .dgrid 안에서 전폭이어야 한다 (v5.9.5 회귀)');
{
  /* cfvDetailHTML·reviewDetailHTML의 결과는 detailHTML에서 `.dgrid`(auto-fill minmax(128px,1fr))
   * **안에** 들어간다. grid-column을 주지 않으면 128px 셀 하나에 갇혀 내용이 세로로 무너진다.
   * 실제로 그렇게 깨졌고, 블록만 따로 렌더한 검사로는 잡히지 않았다 — 부모가 먼저다. */
  const css=T.slice(0,T.indexOf('</style>',T.indexOf('.cfvbox')));
  const rule=n2=>{const i=css.indexOf('.'+n2+'{');return i<0?'':css.slice(i,css.indexOf('}',i));};
  ok('.cfvbox가 전폭(grid-column:1/-1)', /grid-column:1\/-1/.test(rule('cfvbox')), rule('cfvbox').slice(0,90));
  ok('.rvbox가 전폭(grid-column:1/-1)', /grid-column:1\/-1/.test(rule('rvbox')), rule('rvbox').slice(0,90));
  ok('둘 다 min-width:0 (격자 셀 안에서 줄어들 수 있어야 한다)',
     /min-width:0/.test(rule('cfvbox'))&&/min-width:0/.test(rule('rvbox')));
  ok('.cfvtop은 컨테이너 기준 auto-fit (뷰포트 미디어쿼리에 기대지 않는다)',
     /repeat\(auto-fit/.test(rule('cfvtop')), rule('cfvtop').slice(0,90));
  ok('금액을 글자 단위로 끊지 않는다', !/word-break:break-all/.test(rule('cfvcell b')+css.slice(css.indexOf('.cfvcell b{'),css.indexOf('}',css.indexOf('.cfvcell b{')))));
}

console.log('\n[8] 상세 패널 — 목록에서 내려간 것들이 여기 있는가');
put('US_D'); VM={per:2,pbr:0,psr:1};
{ const h=M.cfvDetailHTML('US_D',S.calc['US_D']);
  ok('표시 전용임을 적는다', /판정에 쓰이지 않음/.test(h));
  ok('방법별 표', /class="cfvtbl"/.test(h));
  ok('PBR 판별력 0 배제 사유', /자산\(장부가\) — [^<]*판별력 없음/.test(h));
  ok('드리프트 0 가정 명시', /드리프트 0/.test(h));
  ok('상승추세 과대평가 경고', /상승 추세 종목에서는 도달확률이 과대평가/.test(h)); }

console.log('\n[9] 후행 EPS는 복원하지 않는다 (v5.9.14 — 폴백 제거)');
/* v5.9.8이 price/perT 폴백을 넣었다가 v5.9.14에서 걷어냈다. 남긴 이유가 아니라 **뺀 이유**를 고정한다:
 *  ① 실측 복구 0건 — 결측 19종목 전부 perT가 비어 있었다(필드가 있는 것과 값이 오는 것은 다르다).
 *  ② 유일한 대안이던 분기 epsActual 합은 조정(비GAAP) EPS였다 — 후행 EPS와 둘 다 가진 47종목에서
 *     중앙값 16.6% · 최대 1741.7% 어긋났고 INTC는 적자가 흑자로 뒤집혔다.
 * 그래서 이 11종목은 PER 없이 판정한다. 폴백이 되돌아오면 이 검사가 깨진다. */
{ put('US_NOP',{perAuto:null,perFwdAuto:null,fcf:null});
  S.cache['US_NOP']={fund:{perT:10}};
  const c=M.cfvOf('US_NOP');
  ok('후행 PER이 있어도 역산하지 않는다', !((c&&c.used)||[]).some(m=>m.key==='eps'),
     ((c&&c.used)||[]).map(m=>m.key).join(','));
  ok('그 사유를 제외 목록에 남긴다', ((c&&c.skipped)||[]).some(m=>m.key==='eps')); }
{ put('US_HASP',{perAuto:10,perFwdAuto:null,fcf:null});
  const c=M.cfvOf('US_HASP');
  ok('원래 후행 EPS가 있으면 그대로 쓴다 (이익력 10×12=120)', near(c&&c.fv,120,0.5), c&&c.fv);
  ok('출처 이름표 같은 군더더기를 붙이지 않는다',
     !/\[/.test(((c&&c.used)||[]).map(m=>m.how).join(' ')), ((c&&c.used)||[]).map(m=>m.how).join(' ')); }
{ ok('죽은 함수가 배포본에 남아 있지 않다', T.indexOf('perTtmOf')<0, T.indexOf('perTtmOf'));
  ok('죽은 입력 키도 남아 있지 않다', T.indexOf('perTtmSrc')<0); }

console.log('\n────────────────────────────');
console.log(pass+' passed · '+fail+' failed');
process.exit(fail?1:0);
