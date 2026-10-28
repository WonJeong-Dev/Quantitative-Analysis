/* (v5.8) 무성장 가치 · 판정 3단어 · 목록 칸 — 배포본(dist/index.html)에서 렌더 경로를 실제로 실행한다.
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
 * FCF 700(fcur) · fx 1 · 주식수 100 → 주당FCF 7.  무성장 가치 = median(120, 84, 80) = 84 */
function grd(n,total,blocked){
  const gates=[]; for(let i=0;i<total;i++)gates.push(['관문'+(i+1),i<n,'G'+(i+1)]);
  return {gates:gates,blocked:blocked||null,nearBoundary:false};
}
function put(id,o){
  S.calc[id]=Object.assign({price:100,currency:'USD',quality:65,annVol:0.40,
    perAuto:10,perFwdAuto:8,psrAuto:2,pbrAuto:1.25,fcf:700,fxq:1,
    /* (v6.4) 지정가의 가치 축 = 현재 적정가(k.fvNow). 중앙도달가는 87.665(현재가 100·변동성 0.40)
     * 이므로 95를 넣으면 확률이 제약, 85 이하를 넣으면 가치가 제약된다. */
    fvNow:95,downIndep:true,fvBasis:'애널목표+펀더멘털(PER)',
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
/* (v6.3) ★ 추천/관망은 **등급이 가른다.** 무성장 가치는 보조 표시로 내려갔다.
 * 종전엔 cfv.state가 갈랐고, 그 결과 등급 '상' 6종목이 전부 관망이었다 —
 * 무성장 가치는 "성장이 멈춰도 받을 값"(하방 앵커)이지 매수 기준선이 아니다.
 * 실측: 52종목 괴리 중앙 +104.1%, 가치 이하는 폭락주 4개뿐. cfv로 되돌리면 이 검사가 깨진다. */
put('US_W',{perAuto:15,perFwdAuto:15,tier:'하'}); VM={per:2,pbr:2,psr:2};
let v=M.verdictOf('US_W');
ok('등급 하 → 관망 (가치보다 비싸도 등급이 쥔다)', v.key==='watch'&&v.w==='관망', v.key);
ok('이유는 짧은 명사구', v.why==='등급 하', v.why);
ok('긴 설명은 title로', !/회사는 통과/.test(v.why)&&/등급이 하입니다/.test(v.tip||''), v.tip);
ok('관문 통과수를 센다', v.gn===11&&v.gt===11);
put('US_W2',{perAuto:15,perFwdAuto:15,tier:'상'});
v=M.verdictOf('US_W2');
ok('등급 상이면 가치보다 비싸도 추천', v.key==='rec'&&v.why==='등급 상', v.key+'/'+v.why);
ok('그 값이 매수 기준선이 아님을 title에 적는다', /하방 앵커이며 매수 기준선이 아닙니다/.test(v.tip||''), v.tip);
put('US_W3',{perAuto:15,perFwdAuto:15,tier:'중'});
ok('등급 중도 추천', M.verdictOf('US_W3').key==='rec');
/* 가치 이하는 **보조 배지**로만 남는다 — 판정을 뒤집지 않는다. */
put('US_A',{price:70,perAuto:7,perFwdAuto:7,pbrAuto:0.875,fcf:490,tier:'하'});
v=M.verdictOf('US_A');
ok('가치 이하여도 등급 하면 관망', v.key==='watch', v.key+' fv='+(v.cfv&&v.cfv.fv));
ok('가치 이하는 보조로 덧붙는다', v.why==='등급 하 · 가치 이하', v.why);
put('US_O',{tier:null,grd:grd(9,11,'최소 품질 — 종합점수 ≥ 45')});
v=M.verdictOf('US_O');
ok('관문 미통과 → 탈락', v.key==='out'&&v.w==='탈락');
ok('어느 관문에서 걸렸는지 앞부분만 쓴다', v.why==='최소 품질에서 걸림', v.why);
ok('전체 문구는 툴팁용으로 보존', v.blocked==='최소 품질 — 종합점수 ≥ 45');
put('US_NV2',{perAuto:null,perFwdAuto:null,psrAuto:null,pbrAuto:null,fcf:null,tier:'중'});
v=M.verdictOf('US_NV2');
/* (v6.3) 가치를 못 매겨도 **등급은 났다** — 관문과 점수로 평가가 끝났으므로 판정한다.
 * v6.1은 이걸 '평가 불가'로 돌렸는데, 등급이 있는 종목을 평가하지 않았다고 말하는 것은 틀렸다.
 * 평가 불가는 **관문을 못 돌린** 경우에만 쓴다(그 검사는 tests/investment.cjs가 본다). */
ok('가치를 못 매겨도 등급이 있으면 판정한다', v.key==='rec'&&v.w==='추천', v.key+'/'+v.w);
/* (v6.4) 무성장 가치가 없어도 지정가는 난다 — 가치 축이 현재 적정가로 바뀌었기 때문이다.
 * v6.3까지 이 자리는 '지정가 없음'이었고, 실측 60종목 중 13개가 그 상태였다. */
{ const c2=M.cfvOf('US_NV2'), h2=M.exHTML(S.calc['US_NV2'],c2);
  ok('무성장 가치가 없어도 지정가는 난다', c2.fv===null&&c2.limit!=null&&/class="pline"/.test(h2),
     'fv='+c2.fv+' limit='+c2.limit);
  ok('무성장 가치 없음은 상세 패널의 사유로 남는다',
     /산출 불가/.test(M.cfvDetailHTML('US_NV2',S.calc['US_NV2'])), ''); }
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
{ /* (v6.1.1) 관문은 다 통과했는데 등급 기준에 못 미친 경우 — **평가해서 못 넘었으니 탈락**이다.
   * v6.1.0이 이 가지를 빠뜨려 '관망'으로 샜다. 검사는 통과했고 실제 분포가 들켰다. */
  put('US_UNDER',{tier:null,grd:{gates:[['x',true,'G1']],blocked:null,blockedCode:null,assessable:true,unknown:null}});
  const u=M.verdictOf('US_UNDER');
  ok('등급 미달은 탈락 (관망으로 새지 않는다)', u.key==='out'&&u.w==='탈락', u.key+'/'+u.w);
  ok('그 이유를 적는다', u.why==='등급 기준 미달', u.why);
  ok('평가 불가와 섞지 않는다', u.key!=='na'); }
{ /* 경고색으로 칠하면 '나쁘다'로 읽힌다 — 중립이어야 한다. */
  const css=T.slice(0,T.lastIndexOf('</style>'));
  const i=css.indexOf('.vd.na{'); const rule=i<0?'':css.slice(i,css.indexOf('}',i));
  ok('평가 불가는 중립색(경고색 아님)', /var\(--muted\)/.test(rule)&&!/--down|--amber/.test(rule), rule); }

console.log('\n[4b] 정당 배수 천장 — 값이 무의미해지는 자리에서 그리지 않는다 (v6.3)');
/* 실측: PANW는 GAAP EPS가 0.4로 눌려 유효 PER 976배였고, 거기에 정당PER 12배를 곱한
 * $30.97이 주가 $390 옆에 '가치'로 떴다. QNT는 주당매출 0.0865 × PSR 1.5 = $0.13(괴리 +28041%).
 * "비싸다"가 아니라 **값이 무의미한 것**이다 — 모르는 값은 그리지 않는다(§22-⑯). */
{ /* 천장이 엔진 자신의 clamp 상한과 같은가 — 두 곳이 갈라지면 조용히 어긋난다(§22-⑲) */
  const per=(T.match(/return clamp\(per,\s*5,\s*(\d+)\)/)||[])[1];
  const psr=(T.match(/\[150,20\]\]\),\s*0\.3,\s*(\d+)\)/)||[])[1];
  const dec=(T.match(/const FAIR_PER_MAX=(\d+),\s*FAIR_PSR_MAX=(\d+);/)||[]);
  ok('FAIR_PER_MAX가 fairPER의 clamp 상한과 같다', per&&dec[1]&&per===dec[1], per+' vs '+dec[1]);
  ok('FAIR_PSR_MAX가 fairPSR의 clamp 상한과 같다', psr&&dec[2]&&psr===dec[2], psr+' vs '+dec[2]); }
{ /* 유효 PER 976배 — 이익이 0 근처라 정당 배수를 매길 수 없다 */
  put('US_CEIL',{price:390,perAuto:976,perFwdAuto:976,pbrAuto:null,psrAuto:null,fcf:null});
  VM={per:2,pbr:0,psr:0};
  const c=M.cfvOf('US_CEIL');
  ok('천장 밖 PER이면 이익력을 그리지 않는다', !((c&&c.used)||[]).some(m=>m.key==='eps'),
     ((c&&c.used)||[]).map(m=>m.key).join(','));
  ok('사유에 유효 PER을 적는다', /유효 PER 976배/.test(((c&&c.skipped)||[]).map(m=>m.why).join(' ')),
     ((c&&c.skipped)||[]).map(m=>m.why).join(' | '));
  ok('남는 방법이 없으면 값을 내지 않는다 (0.13 같은 수를 그리지 않는다)', c&&c.fv==null, c&&c.fv); }
{ /* 천장 안이면 종전대로 그린다 — 경고를 남발하지 않는다 */
  put('US_OK',{price:100,perAuto:20,perFwdAuto:20,pbrAuto:null,psrAuto:null,fcf:null});
  const c=M.cfvOf('US_OK');
  ok('PER 20배는 정상적으로 그린다', ((c&&c.used)||[]).some(m=>m.key==='eps'), c&&c.fv); }
{ /* 매출 쪽도 같은 규칙 — 적자 기업의 PSR 422배 */
  put('US_PSR',{price:36.5,perAuto:null,perFwdAuto:null,psrAuto:422,pbrAuto:null,fcf:null});
  VM={per:2,pbr:0,psr:2};
  const c=M.cfvOf('US_PSR');
  ok('천장 밖 PSR이면 매출을 그리지 않는다', !((c&&c.used)||[]).some(m=>m.key==='rev'),
     ((c&&c.used)||[]).map(m=>m.key).join(','));
  ok('사유에 PSR 배수를 적는다', /PSR 422배/.test(((c&&c.skipped)||[]).map(m=>m.why).join(' '))); }
VM={per:2,pbr:2,psr:2};

console.log('\n[5] 실행 칸 — 지정가 하나 + 닿을 확률');
put('US_E');
{ const h=M.exHTML(S.calc['US_E'],M.cfvOf('US_E'));
  ok('지정가가 하나만 크게', (h.match(/class="p"/g)||[]).length===1, h);
  /* (v5.9.9) 칩은 없앴다 — 바로 왼쪽 현재가 칸이 '가격 + 등락%'라서 같은 모양이 등락률로 읽혔다.
   * 숫자는 자기 이름을 단 캡션 한 줄 안에만 있어야 한다. 칩이 돌아오면 이 검사가 깨진다. */
  ok('가격 옆에 이름 없는 % 칩을 두지 않는다', !/class="prob"/.test(h), h);
  /* (v6.6) 확률이 제약이면 도달확률은 **설계상 정확히 50%**다 — 관측이 아니라 기준이므로
   * 줄에 적지 않는다(실측 53/60이 같은 '50%'였다). 줄에는 변별력 있는 할인율이 온다. */
  ok('캡션은 할인율을 이름과 함께 적는다', /현재가 대비 <b>[−+][\d.]+%<\/b>/.test(h), h);
  ok('확률이 설계값이면 줄에 적지 않는다', !/도달 <b>/.test(h), h);
  ok('설계값이라는 사실은 툴팁이 말한다', /설계상 50%입니다/.test(h), h.slice(0,320));
  ok('가격 줄(pline)에는 %가 없다', !/%/.test((h.match(/<div class="pline">[\s\S]*?<\/div>/)||[''])[0]), h);
  ok('"제약" 같은 내부 용어를 쓰지 않는다', !/제약/.test(h)&&!/중앙 도달가/.test(h), h); }
{ put('US_E2',{annVol:null});
  const h=M.exHTML(S.calc['US_E2'],M.cfvOf('US_E2'));
  /* (v6.4) v6.3까지는 변동성이 없으면 **무성장 가치**를 큰 숫자로 찍고 캡션에만 '도달확률 산출
   * 불가'를 달았다. 지정가 칸에 있는 숫자는 지정가로 읽힌다 — 지정가가 아닌 값을 거기 두는 것은
   * 없는 값을 그리는 것과 같다(§22-⑯). 이제 글자와 사유만 남는다. */
  ok('변동성이 없으면 다른 값을 지정가 자리에 대신 그리지 않는다',
     /지정가 없음/.test(h)&&!/class="p"/.test(h)&&!/class="pline"/.test(h), h);
  ok('사유는 title에 남는다', /title="[^"]*변동성 미확보/.test(h), h); }
/* (v5.9.9) 반올림과 흐림 — 0%는 '０이다'로 읽히는데 실제로는 '1% 미만'이다(§22-⑫와 같은 종류). */
{ put('US_P0',{annVol:0.02,perAuto:40,perFwdAuto:40,pbrAuto:null,fcf:null});
  const c=M.cfvOf('US_P0'), h=M.exHTML(S.calc['US_P0'],c);
  const pp=c.limitProb*100;
  ok('표본이 1% 미만 확률을 만든다 (검사 전제)', pp<1, pp);
  ok("1% 미만은 '0%'가 아니라 '<1%'", /&lt;1%|<b>&lt;1%<\/b>/.test(h)||/<b>&lt;1%<\/b>/.test(h)||h.indexOf('<b>&lt;1%</b>')>=0||h.indexOf('<b><1%</b>')>=0, h);
  ok('10% 미만이면 지정가를 흐리게 (숨기지는 않는다)', /class="p faint"/.test(h)&&/\$/.test(h), h);
  /* 50%를 벗어나면 **그것이 곧 정보**다 — 그때만 줄에 적는다. */
  ok('가치가 제약이면 확률을 줄에 적는다', /도달 <b>/.test(h), h);
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
  ok('무성장 가치를 못 내도 지정가는 난다 (v6.4)', /class="pline"/.test(h), h.slice(0,120));
  ok('판정은 등급이 말한다 (가치 산출 실패가 판정을 뒤집지 않는다)',
     M.verdictOf('US_E4').key!=='na', M.verdictOf('US_E4').why); }
/* 지정가를 **정말** 낼 수 없는 경우는 가치 축이 없을 때다(v6.4).
 * (v5.8.1) 캡션은 뺐다 — 판정 칸이 이미 '값을 매길 수 없음'이라고 말한다. 같은 말을 두 번 쓰면
 * 세 줄로 접힌다. 빈 칸이 아니어야 한다는 원칙은 그대로: 글자(지정가 없음)와 사유(title)가 남는다. */
{ put('US_E5',{fvNow:null,downIndep:null});
  const h=M.exHTML(S.calc['US_E5'],M.cfvOf('US_E5'));
  ok('값을 못 매기면 빈 칸이 아니라 글자 + 사유 title',
     /지정가 없음/.test(h)&&/title="[^"]*현재 적정가 미확보/.test(h), h);
  ok('같은 사유를 두 번 쓰지 않는다', (h.match(/현재 적정가 미확보/g)||[]).length===1, h); }

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
  ok('숫자가 이름표를 달고 있다', /입력 77%/.test(h), h.slice(0,200));
  /* 이름은 바꿨지만 뜻은 안 바꿨다. 100%를 '확실하다'로 읽히게 두지 않는다. */
  ok("툴팁이 '판정이 맞을 확률이 아님'을 못 박는다", /판정이 맞을 확률이 아닙니다/.test(h), h.slice(0,300));
  ok('무엇을 재는지 툴팁에 남아 있다', /점수 성분\(종합점수·가격매력도\) 중 도착한 비율/.test(h));
  /* ★ (v6.6) 이 비율이 **가치 입력을 안 센다**는 사실을 툴팁이 직접 말한다.
   * 실측에서 「신뢰도 100%」와 「가치 근거 0종」이 같은 행에 나란히 떠 있었다. */
  ok('가치 입력이 빠져 있음을 못 박는다', /가치 입력은 여기에 들어가 있지 않습니다/.test(h)); }
{ /* 편재는 이 숫자에 들어가 있지 않다 — 합치면 둘 다 안 보인다. 그 사실을 툴팁이 말한다. */
  put('US_V2b',{qMissW:0,aMissW:0,aParts:{up:60,rsi:null,bb:null,vp:null,prox:null}});
  const h=M.evHTML(S.calc['US_V2b']);
  /* (v6.6.1) 100%는 기본값이라 줄에 적지 않는다 — 막대와 툴팁에는 남는다. */
  ok('결측 0이면 입력 줄을 적지 않는다', !/>입력 /.test(h)&&/입력 100%/.test(h), h.slice(0,200));
  ok('그래도 편재 경고는 따로 뜬다 (100%가 「확실」이 아니다)', /⚠ 단일 100%/.test(h), h);
  ok('편재가 이 숫자에 반영돼 있지 않다고 적는다', /반영돼 있지 않습니다/.test(h)); }

{ /* 머리글과 범례가 같은 이름을 쓰는가 — 칸 이름이 둘로 갈리면 질문이 되돌아온다. */
  ok('목록 머리글이 「근거」', /<div style="text-align:right">근거<\/div>/.test(T), 'listhead');
  ok('범례가 각 수치를 구분해 적는다', /등락률/.test(T)&&/가치 근거/.test(T)&&/판정이 맞을 확률이 아님/.test(T)); }

console.log('\n[6a] 가치 근거 — 점수 입력과 **같은 칸, 다른 수치** (v6.6)');
/* ★ 실측 2026-10-28: 60종목 중 56개(93%)가 「신뢰도 100%」였고 그중 13종목은 무성장 가치를
 * 만들 방법이 하나도 없었다(SK하이닉스·삼성전자·삼성SDI·LG에너지솔루션 …).
 * 칸이 상수라서 쓸모없었던 것이 아니라 **재는 것과 읽히는 것이 달랐다.** 둘을 갈라 적는다. */
{ VM={per:2,pbr:2,psr:2};
  put('US_EV1');                       // 이익력·장부가 2종
  const e1=M.evidenceOf(S.calc['US_EV1'],'US_EV1'), h1=M.evHTML(S.calc['US_EV1'],'US_EV1');
  ok('가치 근거 수를 함께 낸다', e1.vn===M.cfvOf('US_EV1').n&&e1.vn>0, e1.vn);
  ok('칸의 큰 숫자는 가치 근거다', /<span class="lbl">근거<\/span> \d+종/.test(h1), h1.slice(0,120));
  ok('점수 입력이 덜 왔으면 작은 줄로 적는다',
     /class="s"[^>]*>입력 \d+%/.test(M.evHTML(S.calc['US_V2'],'US_V2')), M.evHTML(S.calc['US_V2'],'US_V2').slice(0,260));
  ok('다 왔으면 그 줄을 적지 않는다', !/>입력 /.test(h1), h1.slice(0,200));
  ok('id를 안 주면 가치 근거를 지어내지 않는다', M.evidenceOf(S.calc['US_EV1']).vn===null); }
{ put('US_EV0',{perAuto:null,perFwdAuto:null,psrAuto:null,pbrAuto:null,fcf:null,qMissW:0,aMissW:0});
  const e0=M.evidenceOf(S.calc['US_EV0'],'US_EV0'), h0=M.evHTML(S.calc['US_EV0'],'US_EV0');
  ok('점수 입력이 100%여도 가치 근거는 0종일 수 있다', e0.dens===100&&e0.vn===0, e0.dens+'/'+e0.vn);
  ok('0종은 경고색으로 적는다', /class="n" style="color:var\(--down\)"/.test(h0), h0.slice(0,140));
  ok('쓰지 못한 방법을 툴팁에 적는다', /쓰지 못한 방법/.test(h0), h0.slice(0,400)); }
{ put('US_EVE',{assetType:'etf',tier:'중립'});
  ok('ETF는 가치 근거를 내지 않는다', M.evidenceOf(S.calc['US_EVE'],'US_EVE').vn===null); }

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
  ok('무성장 가치 눈금', /tick cfv"/.test(h));
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

console.log('\n[10] 지정가의 가치 축 = 현재 적정가 (v6.4)');
/* ★ 이 구간은 **무엇이 지정가를 만드는가**를 고정한다. v6.3까지는 min(무성장 가치, 50% 도달가)
 * 였고, 무성장 가치가 현재가보다 중위 −48.5% 아래라 지정가의 도달확률이 중위 1.5%,
 * 60종목 중 47개가 사실상 무용이었다. 되돌아오면 여기서 깨진다. */
VM={per:2,pbr:2,psr:2};  // 앞 구간이 PBR 배제를 시험하며 바꿔 두었다 — 기본으로 돌린다
put('US_AX');            // 가치 축 95 · 중앙도달가 87.665 → 확률이 제약
{ const c=M.cfvOf('US_AX');
  ok('배선: k.fvNow가 가치 축으로 들어간다', c.anchor===95, c.anchor);
  ok('무성장 가치(107.5)는 지정가에 쓰이지 않는다', near(c.fv,107.5,1e-9)&&near(c.limit,87.665047,1e-5),
     'fv='+c.fv+' limit='+c.limit);
  ok('바인딩은 확률', c.bind==='prob', c.bind);
  ok('배선: 독립성 플래그(k.downIndep)도 함께 간다', c.anchorIndep===true, c.anchorIndep); }
{ put('US_AX2',{fvNow:85});
  const c=M.cfvOf('US_AX2');
  ok('가치 축이 더 낮으면 그 값이 지정가', near(c.limit,85,1e-9)&&c.bind==='value', c.limit+'/'+c.bind); }
{ put('US_AX3',{perAuto:15,perFwdAuto:15,pbrAuto:1.25,fcf:null,fvNow:95});
  const c=M.cfvOf('US_AX3'), h=M.stripHTML(S.calc['US_AX3'],c);
  /* 무성장 가치 80 < 지정가 87.665 — v6.3에서는 구조적으로 불가능했던 배치다. */
  ok('지정가가 무성장 가치보다 위에 올 수 있다', near(c.fv,80,1e-9)&&c.limit>c.fv, 'fv='+c.fv+' limit='+c.limit);
  ok('그래도 눈금 둘을 모두 그린다', /tick cfv"/.test(h)&&/tick cfvlim"/.test(h), h); }
/* 뜻이 사라진 그림은 남기지 않는다 — '가치 구간'(지정가 ~ 무성장 가치) 띠는 지정가가 가치
 * 위에 올 수 있게 된 순간 어떤 관계도 뜻하지 않는다. CSS까지 함께 지워졌는지 본다. */
ok("'가치 구간' 띠를 더 이상 그리지 않는다", !/class="cfvzone"/.test(M.stripHTML(S.calc['US_AX'],M.cfvOf('US_AX'))));
ok('죽은 CSS(.cfvzone)도 배포본에 없다', T.indexOf('.cfvzone')<0, T.indexOf('.cfvzone'));
ok('죽은 CSS(.cfvnone)도 배포본에 없다', T.indexOf('.cfvnone')<0, T.indexOf('.cfvnone'));

console.log('\n[10b] 상세 패널은 가치 축이 무엇에 기댔는지 적는다');
/* ★ 현재 적정가는 **애널 목표가(×0.80 · 가중 0.50·anaConf)를 주 앵커로 쓰는 값**이다.
 * 무성장 가치의 '목표가 미사용'을 상자 제목에 걸어두면 지정가까지 그런 값으로 읽힌다 —
 * 두 값의 성격 차이를 라벨로 분리했는지 검사한다(§22-㉕: 수집했으면 그려야 한다). */
{ const h=M.cfvDetailHTML('US_AX',S.calc['US_AX']);
  ok('가치 축의 값을 적는다', /가치 축 \$95/.test(h), (h.match(/가치 축[^<]*/)||[''])[0]);
  ok('가치 축의 근거(k.fvBasis)를 적는다', /애널목표\+펀더멘털\(PER\)/.test(h));
  ok('어느 축이 제약인지 적는다', /도달가가 더 낮아 이 값/.test(h));
  ok("'목표가 미사용'은 무성장 가치 칸에만 쓴다", /재무제표만\(애널 목표가 미사용\)/.test(h)
     && !/cfvhd[^<]*애널 목표가 미사용/.test(h), (h.match(/cfvhd[^<]*<\/div>/)||[''])[0]);
  ok('무성장 가치가 지정가에 들어가지 않는다고 적는다', /무성장 가치는 들어가지 않습니다/.test(h));
  ok('판독이 무성장 가치 대비라고 적는다', /판독 <small>무성장 가치 대비/.test(h)); }
{ put('US_AX4',{fvNow:85});
  ok('가치 축이 제약일 때도 그렇게 적는다', /가치 축이 더 낮아 이 값/.test(M.cfvDetailHTML('US_AX4',S.calc['US_AX4']))); }
{ put('US_AX5',{downIndep:false});
  ok('목표가 외 독립 근거가 없으면 그 사실을 적는다',
     /목표가 외 독립 근거 없음/.test(M.cfvDetailHTML('US_AX5',S.calc['US_AX5']))); }
ok('있으면 그 문구를 쓰지 않는다', !/독립 근거 없음/.test(M.cfvDetailHTML('US_AX',S.calc['US_AX'])));
{ put('US_AX6',{perAuto:null,perFwdAuto:null,psrAuto:null,pbrAuto:null,fcf:null});
  const h=M.cfvDetailHTML('US_AX6',S.calc['US_AX6']);
  /* 참고(ref) 방법만 남아 중앙값이 없는 경우가 있다 — 그때 표를 열면 머리행만 있는 빈 표가 되고,
   * 여는 태그만 조건에 걸면 행이 표 밖으로 샌다. 블록째 감쌌는지 본다. */
  ok('무성장 가치가 없으면 방법 표를 열지 않는다', !/class="cfvtbl"/.test(h)&&!/<tr/.test(h), h.slice(0,160));
  ok('그래도 지정가 칸은 값을 보인다', /제안 지정가<\/span><b>\$87\.67</.test(h), (h.match(/제안 지정가[\s\S]{0,40}/)||[''])[0]);
  ok('무성장 가치 칸에는 사유를 적는다', /산출 불가 — /.test(h)); }

console.log('\n[10c] 범례·장부 — 바뀐 정의가 화면과 데이터에 반영됐는가');
{ const lg=T.slice(T.indexOf('class="striplegend"'), T.indexOf('class="listhead"'));
  ok('범례가 지정가의 기준을 현재 적정가로 적는다', /제안 지정가[\s\S]{0,90}현재 적정가/.test(lg), lg.slice(0,200));
  ok("범례에 '가치 구간'이 남아 있지 않다", lg.indexOf('가치 구간')<0);
  ok('무성장 가치는 지정가 기준이 아니라고 적는다', /하방 앵커<\/b>이며 지정가 기준이 아님/.test(lg)); }
{ /* 장부 열과 glRow의 길이가 어긋나면 **모든 열이 한 칸씩 밀린다** — 과거 행과 비교하는 모든
   * 집계가 조용히 틀린다. 이름 목록과 값 목록을 배포본에서 직접 세어 맞춘다(§22-⑲). */
  const colsSrc=T.slice(T.indexOf('const GL_COLS=['));
  const cols=colsSrc.slice(colsSrc.indexOf('['), colsSrc.indexOf('];')+1)
    .replace(/\/\*[\s\S]*?\*\//g,'');
  const names=JSON.parse(cols.replace(/'/g,'"').replace(/,(\s*])/,'$1'));
  ok("cfvAnchor를 **끝에** 붙였다 (가운데 삽입은 과거 문서를 민다)",
     names[names.length-1]==='cfvAnchor', names.slice(-4).join(','));
  ok('cfvState의 이름·자리는 그대로다 (그림자 장부 H arm의 입력)',
     names[names.length-2]==='cfvState', names.slice(-3).join(','));
  const rowSrc=T.slice(T.indexOf('function glRow(k,id){'));
  const body=rowSrc.slice(rowSrc.indexOf('return ['), rowSrc.indexOf('];')+1)
    .replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
  let d=0,n=1;
  for(const ch of body.slice(body.indexOf('[')+1, body.lastIndexOf(']'))){
    if('([{'.indexOf(ch)>=0)d++; else if(')]}'.indexOf(ch)>=0)d--; else if(ch===','&&d===0)n++;
  }
  ok('GL_COLS('+names.length+')과 glRow('+n+')의 길이가 같다', names.length===n);
  ok('glRow가 가치 축을 기록한다', /cv&&cv\.anchor/.test(body), body.slice(-80)); }

console.log('\n[10d] 목록 헤더 — 열 이름과 열 내용이 한 정의에서 나오는가');
/* ★ v5.8이 행의 열을 「판정 · 실행 · 신뢰도 · 52주 범위」로 바꾸고 index.html의 헤더도 고쳤는데,
 * app.js의 LISTHEAD(v4.33)가 남아 **매 탭 전환마다 옛 이름으로 덮어썼다.** 그래서 배포 화면의
 * 제안 지정가 칸 위에는 「적정목표가 · 여력」이, 신뢰도 칸 위에는 「규칙 후보등급」이 적혀 있었다
 * (2026-10-28 실측). 이름의 출처가 둘이면 반드시 갈라진다(§22-⑲) — 하나로 줄이고 여기서 고정한다. */
{ /* 이름 맵이 되살아나거나, syncBoardCols가 다시 헤더를 그리면 여기서 깨진다.
   * (주석에 적힌 'LISTHEAD'라는 낱말이 아니라 **정의와 쓰기**를 본다.) */
  ok('헤더 이름 맵이 되살아나지 않았다', !/LISTHEAD\s*=/.test(T), (T.match(/LISTHEAD\s*=[^\n]{0,40}/)||[''])[0]);
  const sb=T.slice(T.indexOf('function syncBoardCols(){'));
  ok('syncBoardCols는 헤더를 다시 그리지 않는다', sb.slice(0,sb.indexOf('\n}')).indexOf('innerHTML')<0);
  const i0=T.indexOf('class="listhead"'), i1=T.indexOf('>',i0)+1, i2=T.indexOf('<div id="list"',i1);
  const hd=T.slice(i1,i2), cells=(hd.match(/<div/g)||[]).length;
  const tpl=((T.match(/\.listhead,\.row \.main\{display:grid;grid-template-columns:([^;]+);/)||[])[1]||'');
  const colN=tpl.replace(/\([^)]*\)/g,'').trim().split(/\s+/).filter(Boolean).length;
  ok('헤더 칸('+cells+')과 격자 열('+colN+')의 수가 같다', cells===colN&&cells===8, tpl);
  ok('지정가 칸의 이름은 실행이다', /실행 — 지정가 · 할인율/.test(hd), hd);
  ok('52주 띠 칸의 이름은 가치 눈금이다', /52주 범위 · 가치 눈금/.test(hd), hd);
  ok('옛 이름이 배포본 헤더에 남아 있지 않다',
     hd.indexOf('적정목표가')<0&&hd.indexOf('규칙 후보등급')<0&&hd.indexOf('가격매력')<0
     &&hd.indexOf('신뢰도')<0&&hd.indexOf('닿을 확률')<0, hd); }

console.log('\n[11] 국내 주당순자산 — DART 1차 출처 배선 (v6.9 · 규칙 v6.2)');
/* ★ 야후는 KRX 티커에 priceToBook을 **한 건도** 주지 않는다(실측 0/11, 2026-10-28).
 * 그래서 국내 11종목은 장부가 축이 통째로 막혀 있었고 SK하이닉스·삼성전자는 무성장 가치가
 * 아예 없었다. DART 보고서의 자본총계 ÷ 상장주식수를 캐시에 심고, compute가 **현재가로 직접**
 * 나눈다 — 비율을 저장하면 조회 시점 가격에 굳어 장중에 안 움직인다. */
{
  ok('compute가 주당순자산(F.bps)을 읽는다', /const bpsQ=\(F\.bps!=null/.test(T));
  ok('현재가로 직접 나눈다 (스냅샷 비율이 아니다)', /k\.pbrAuto=\(price>0&&bpsQ!=null\)\?price\/bpsQ/.test(T));
  ok('야후 값은 폴백으로 남는다 (미국 종목 경로)', /F\.pbrY!=null&&isFinite\(F\.pbrY\)&&fxq!=null&&fxq>0\)\?F\.pbrY\/fxq/.test(T));
  ok('출처를 기록한다', /k\.pbrSrc=/.test(T)&&/'dart'/.test(T)&&/'yahoo'/.test(T));
  ok('기준일도 함께 둔다 (어느 시점 자본총계인지 모르면 믿을 수 없다)', /k\.bpsAt=F\.bpsAt/.test(T));
  const col=T.slice(T.indexOf('async function ensureDartBps'));
  const body=col.slice(0,col.indexOf('\n}'));
  ok('국내 주식에만 건다', /st\.market!=='KR'/.test(body)&&/assetType\(st\)==='etf'/.test(body));
  /* 셋 중 하나라도 어긋나면 **심지 않고 사유만** 남긴다 — 지어내면 PBR이 조용히 몇 배 틀린다. */
  ok('자본총계가 없으면 심지 않는다', /b&&b\.equity>0/.test(body)&&/bpsWhy='DART 자본총계 미확보/.test(body));
  ok('통화가 원화가 아니면 심지 않는다', /b\.cur!=='KRW'/.test(body)&&/원화가 아니어서 쓰지 않습니다/.test(body));
  ok('상장주식수가 없으면 심지 않는다', /상장주식수 미확보/.test(body));
  ok('비율이 아니라 주당순자산을 저장한다', /f\.bps=eqUsed\/shares/.test(body));
  /* (v6.12) 분자·분모 일치. 실측 11종목: 비지배지분이 자본의 최대 26.2%(LG에너지솔루션)·
   * 순이익의 27.4%(삼성SDI)였다. 분모(주식수)는 모회사 것이므로 분자도 지배주주 몫이어야 한다. */
  ok('자본은 지배주주지분을 먼저 쓴다', /ow\.equity!=null&&isFinite\(ow\.equity\)&&ow\.equity>0/.test(body)
     &&/const eqUsed=\(eqOwn!=null\)\?eqOwn:b\.equity/.test(body));
  ok('어느 기준인지 기록한다', /f\.bpsBasis=\(eqOwn!=null\)\?'owners':'total'/.test(body));
  ok('총계로 떨어지면 사유를 남긴다', /f\.bpsBasisWhy=/.test(body));
  ok('비지배 비율도 남긴다', /f\.nciPct=/.test(body));
  ok('순이익도 지배주주 몫을 먼저 쓴다', /const niOwn=\(ow\.ttm!=null/.test(body)
     &&/const niUsed=\(niOwn!=null\)\?niOwn:/.test(body));
  ok('하루에 몇 번씩 부르지 않는다 (재무제표는 분기마다 바뀐다)', /BPS_TTL/.test(body));
  ok('같은 종목을 동시에 두 번 부르지 않는다', /bpsPending/.test(body));
  const pin=require('../docs/RULEHASH.json');
  ok('판정 입력이 늘었으므로 RULE_VER을 올렸다 (v6.2)', pin.ruleVer==='v6.2', pin.ruleVer);
  /* (v6.10) 후행 EPS는 **compute를 고치지 않고** 들어간다 — Feff가 캐시(F)의 복사본이라
   * `epsTtm`을 심으면 기존 문으로 그대로 흐른다. PBR 때 compute를 고쳐야 했던 것은
   * 캐시에 **비율**밖에 없었기 때문이고, 여기는 같은 양이 다른 출처로 올 뿐이다. */
  ok('후행 EPS는 캐시의 epsTtm에 심는다', /f\.epsTtm=niUsed\/shares/.test(body), '');
  ok('야후 값을 덮지 않는다 (미국은 야후 경로)', /f\.epsTtm==null\|\|f\.epsTtmSrc==='dart'/.test(body));
  ok('출처와 기준을 남긴다', /f\.epsTtmSrc='dart'/.test(body)&&/epsTtmBasis/.test(body));
  ok('TTM이 없으면 사유만 남기고 심지 않는다', /f\.epsTtmWhy=ni\.why/.test(body));
  /* (v6.12) 수집하고 안 그리면 없는 항목이다(§22-㉕) — v6.10의 epsTtmBasis가 그 상태였다 */
  ok('PBR 칸에 어느 자본 기준인지 그린다', /const bpsNote=/.test(T)&&/지배주주지분 기준/.test(T)&&/자본총계 기준/.test(T));
  ok('PER 칸에 후행 EPS 기준을 그린다', /const epsNote=/.test(T)&&/F\('per','PER \(비우면 자동\)'\+epsNote/.test(T));
  ok('PBR 칸이 실제로 그 문구를 받는다', /F\('pbr','PBR \(비우면 자동\)'\+bpsNote/.test(T));
  ok('compute의 PER 경로는 손대지 않았다 (Feff.epsTtm 그대로)',
     /k\.perAuto=\(price>0&&Feff\.epsTtm!=null&&Feff\.epsTtm>0\)\?price\/Feff\.epsTtm:null/.test(T));
}

console.log('\n────────────────────────────');
console.log(pass+' passed · '+fail+' failed');
process.exit(fail?1:0);
