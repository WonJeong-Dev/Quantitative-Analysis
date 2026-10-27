/* (v6.0) 상승여력의 기준을 '적정가 혼합'에서 '애널 목표가'로 바꾼 변경을 고정한다.
 * 배경: 임계 20/25/30은 v4.3의 **희석 없는 눈금**에서 정해졌는데, v4.4가 기준일 불명에
 * ×0.5를 넣으면서 임계를 다시 보지 않았다 → 실효 임계가 40/50/60이 돼 있었다.
 * 실측(2026-10-27): 60종목 전부 기준일 불명, tgtF.f의 서로 다른 값이 **단 2개**.
 * 변하지 않는 계수는 신뢰도 신호가 아니라 임계를 옮긴 것이다.
 * 사용법: node tests/upside-v6.cjs [dist/index.html] */
const fs=require('fs');
const HTML=process.argv[2]||__dirname+'/../dist/index.html';
const T=fs.readFileSync(HTML,'utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{c?(pass++,console.log('  OK   '+n)):(fail++,console.log('  FAIL '+n+(x!==undefined?('  ← '+x):'')));};

console.log('\n[1] 관문이 보는 양 — 애널 목표가 기준');
ok('k.upside는 tgtUsed에서 나온다', /k\.upside=\(k\.tgtUsed!=null/.test(T), (T.match(/k\.upside=[^;]{0,70}/)||[''])[0]);
ok('k.upside가 더는 fvTarget에서 나오지 않는다', !/k\.upside=\(k\.fvTarget!=null/.test(T));
ok('적정가 기준 여력은 upsideBlend로 남는다', /k\.upsideBlend=\(k\.fvTarget!=null/.test(T));
ok('감쇠 적용 순서는 그대로 (upsideEff = upside × crashPenalty)',
   /k\.upsideEff=\(k\.upside!=null&&k\.upside>0\)\?k\.upside\*crashPenalty:k\.upside;/.test(T));

console.log('\n[2] 상수 — 새로 고른 값이 아니라 기존 값의 재사용');
ok('TGT_UNKNOWN_BASE = 0.5', /const TGT_UNKNOWN_BASE=0\.5;/.test(T));
/* targetFresh가 쓰는 리터럴과 갈라지면 '같은 0.5'라는 전제가 조용히 깨진다. */
ok('targetFresh의 기준일 불명 계수도 0.5 그대로', /return\{ts:null,src:null,age:null,f:0\.5\*s0\.f/.test(T),
   (T.match(/f:[\d.]+\*s0\.f/)||[''])[0]);
ok('TGT_SPREAD_FLOOR = 0.25 (spreadMul 격자의 끝점)', /const TGT_SPREAD_FLOOR=0\.25;/.test(T));
ok('spreadMul 격자의 마지막 칸이 0.25다', /\[2\.2,0\.25\]\]\),0\.25,1\)/.test(T), (T.match(/\[\[0\.2,1\][^)]{0,60}/)||[''])[0]);
ok('선언이 compute보다 앞에 있다 (TDZ 의심 여지 없음)',
   T.indexOf('const TGT_UNKNOWN_BASE=0.5;')<T.indexOf('function compute(id,simPrice){'));

console.log('\n[3] 환산식 — 모두에게 걸리는 몫만 걷어낸다');
const f=(tgtF)=>{const TGT_UNKNOWN_BASE=0.5;return (tgtF&&tgtF.f>0)?Math.min(1,tgtF.f/TGT_UNKNOWN_BASE):0;};
ok('기준일 불명(0.5) → 계수 1.0 (단위를 되돌린다)', f({f:0.5})===1);
ok('고점 낙관 감쇠(0.25) → 계수 0.5 (변하는 몫은 그대로 깎인다)', f({f:0.25})===0.5);
ok('만료(0) → 계수 0 (여력 근거 없음)', f({f:0})===0);
ok('1.0을 넘지 않는다 (목표가를 부풀리지 않는다)', f({f:0.9})===1&&f({f:2})===1);

console.log('\n[4] 자격 조건 — 분산이 바닥이면 여력 근거에서 뺀다');
ok('spreadOK 조건이 TGT_SPREAD_FLOOR를 쓴다', /spreadOK=\(fvr\.spreadMul==null\)\|\|\(fvr\.spreadMul>TGT_SPREAD_FLOOR\)/.test(T));
ok('fairValue가 spreadMul을 내보낸다 (밖에서 다시 계산하지 않는다)', /spreadMul:anaSpreadMul/.test(T));
ok('자격 미달이면 upside가 null (0이 아니다 — 모름과 0은 다르다)',
   /tgtVarF>0&&spreadOK\)\s*\?\s*\(k\.tgtUsed-price\)\/price\*100\*tgtVarF\s*:\s*null/.test(T.replace(/\s+/g,' ')),
   (T.match(/k\.upside=\(k\.tgtUsed[\s\S]{0,160}/)||[''])[0].replace(/\s+/g,' '));

console.log('\n[5] 관문 — G3·G9 제거');
ok("G3가 관문 배열에 없다", !/'G3'\]/.test(T));
ok("G9가 관문 배열에 없다", !/'G9'\]/.test(T));
ok('실적 임박 배지는 남아 있다 (정보를 잃지 않는다)', /📅 실적/.test(T));
ok('ETF 필터가 인덱스가 아니라 코드로 거른다',
   /ETF_SKIP=\['G4','G8'\]/.test(T)&&/gates\.filter\(g=>ETF_SKIP\.indexOf\(g\[2\]\)<0\)/.test(T));
ok('인덱스 필터가 남아 있지 않다', !/gates\.filter\(\(_,i\)=>i!==/.test(T));
ok('「하」 등급은 여전히 MIN_MARGIN을 본다 (G3의 역할은 여기 있었다)',
   /\['여력',U,MIN_MARGIN,'%'\]/.test(T));

console.log('\n[6] 규칙 버전 — 로그가 새로 쌓인다는 사실');
ok("RULE_VER가 v6.0", /const RULE_VER='v6\.0';/.test(T));
ok('사전등록 판도 함께 올라갔다 (규칙이 다른 관측을 한 장부에 섞지 않는다)', /PREREG_VER='v3'/.test(T));
ok('supersedes가 바로 앞 판을 가리킨다', /\+\(\+PREREG_VER\.slice\(1\)-1\)/.test(T));

console.log('\n[7] 화면이 왜 탈락인지 말한다');
ok('두 여력을 나란히 적는다', /애널 목표가 대비/.test(T)&&/적정가\(보수 혼합\) 대비/.test(T));
ok('관문에 쓰지 않는 값임을 밝힌다', /표시용, 관문에 쓰지 않음/.test(T));
ok('노후·괴리로 깎인 종목은 그 비율을 적는다', /노후\/괴리 /.test(T));
ok('분산 과다로 제외된 종목은 사유를 적는다', /목표가 분산 과다 — 여력 근거에서 제외/.test(T));

console.log('\n────────────────────────────');
console.log(pass+' passed · '+fail+' failed');
process.exit(fail?1:0);
