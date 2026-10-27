/* (v5.9.2) 보유 재심사 · 사전 무효화 조건 — 배포본에서 실제 실행.
 * 사전 약속이 **매수 시점에** 굳는지, 그리고 그 뒤로 바뀌지 않는지가 이 장치의 전부다.
 * 사용법: node tests/review.cjs [dist/index.html] */
const fs=require('fs'),QADomain=require('../src/domain.js');
const HTML=process.argv[2]||__dirname+'/../dist/index.html';
const L=fs.readFileSync(HTML,'utf8').split('\n');
const cut=(from,to)=>{const a=L.findIndex(x=>x.startsWith(from)),b=L.findIndex(x=>x.startsWith(to));
  if(a<0||b<0||b<=a)throw Error('구간 미발견: '+from);return L.slice(a,b).join('\n');};
/* (v5.9.2) 이 구간은 판정영역(compute ~ GL_HORIZ) **밖**에 있어야 한다 —
 * 안에 두면 판정 해시가 바뀌고 RULE_VER을 올려야 해서 쌓인 로그가 집계에서 빠진다.
 * 끝 표식으로 CFV_STOP_H를 쓰는 것이 곧 '그 뒤에 있다'는 검사다. */
const srcReview=cut('function maskEntry(){','const CFV_STOP_H=');
const srcSnap=cut('function lgSnap(','/* ---------------- 거래내역 ----------------');

const S={calc:{},stocks:{},trades:[],ui:{}};
const RULE_VER='v5.5', CFV_STOP_H=20;
const findStockId=o=>Object.keys(S.stocks).find(id=>{const s=S.stocks[id];
  return s.market===o.market&&(s.code===o.code||s.name===o.name);})||null;

/* (v6.1.2) reviewOf는 분류를 **verdictOf에서 가져온다** — 두 곳에서 따로 가르면 갈라진다.
 * 여기서는 그 배선을 검사한다(판정 자체의 분류는 tests/consfv-ui.cjs가 본다).
 * 실제 verdictOf는 cfvOf·VERDICT 등 많은 것을 끌고 오므로, 조작 가능한 대역을 넣고
 * **failed/unknown이 판정 키를 그대로 따라오는가**만 본다. */
let VKEY=null;                                   // 테스트가 세우는 판정 키
const verdictOf=id=>VKEY==null?null:{key:VKEY};
const M=new Function('S','QADomain','RULE_VER','CFV_STOP_H','findStockId','verdictOf',
  srcReview+'\n'+srcSnap+'\n;return {maskEntry,stopOf,reviewOf,lgSnap};')
  (S,QADomain,RULE_VER,CFV_STOP_H,findStockId,verdictOf);

let pass=0,fail=0;
const ok=(n,c,x)=>{c?(pass++,console.log('  OK   '+n)):(fail++,console.log('  FAIL '+n+(x!==undefined?('  ← '+x):'')));};
const near=(a,b,t)=>a!=null&&Math.abs(a-b)<=t;

function stock(id,o){
  S.stocks[id]=Object.assign({id,market:'KR',type:'stock',code:'000001',name:id},o&&o.st||{});
  S.calc[id]=Object.assign({price:70000,currency:'KRW',annVol:0.38,tier:'중',
    grd:{n:2,downtrend:false,tierNoCap:'중',blockedCode:null}},o&&o.k||{});
}
const buy=(code,name,date,price,snap)=>({side:'buy',market:'KR',type:'stock',code,name,date,price,snap:snap===undefined?undefined:snap});

console.log('\n[1] 사전 무효화선 — 매수 시점에 굳는다');
stock('A',{st:{code:'000001',name:'A'}});
let sn=M.lgSnap('KR','000001','A',80000);
const d=0.38*Math.sqrt(20/252);
ok('거리 = σ√(20/252)', near(sn.stopD,+d.toFixed(4),1e-9), sn.stopD);
ok('지평을 함께 굳힌다', sn.stopH===20);
ok('무효화가 = **체결가** × (1−d)', near(sn.stop,+(80000*(1-d)).toFixed(4),1e-6), sn.stop);
ok('체결가를 그대로 남긴다 (제안 지정가가 아니다)', sn.entry===80000);
ok('그 시점 변동성도 남긴다', near(sn.annVol,0.38,1e-9));
{ const cur=M.lgSnap('KR','000001','A',null);
  ok('체결가가 없으면 선을 만들지 않는다', cur.stop===null&&cur.entry===null, JSON.stringify([cur.stop,cur.entry])); }
{ S.calc.A.annVol=null;
  const cur=M.lgSnap('KR','000001','A',80000);
  ok('변동성이 없으면 선을 지어내지 않는다', cur.stop===null&&cur.stopD===null);
  S.calc.A.annVol=0.38; }
ok('매도에는 선이 없다 (호출부가 price를 안 넘긴다)', M.lgSnap('KR','000001','A').stop===null);

console.log('\n[2] 포지션의 선 — 가장 최근 매수의 약속');
S.trades=[
  buy('000001','A','2026-03-01',60000,{at:Date.parse('2026-03-01'),stop:54000,entry:60000,stopD:0.10,stopH:20}),
  buy('000001','A','2026-08-01',80000,{at:Date.parse('2026-08-01'),stop:71000,entry:80000,stopD:0.1125,stopH:20})];
let so=M.stopOf('A');
ok('최근 매수(8월)의 선을 쓴다', so.stop===71000&&so.entry===80000, JSON.stringify(so));
ok('기록일도 함께 보인다', so.date==='2026-08-01');
S.trades=[S.trades[1],S.trades[0]];
ok('배열 순서와 무관하게 시각으로 고른다', M.stopOf('A').stop===71000);
S.trades=[buy('000001','A','2026-03-01',60000,null)];
so=M.stopOf('A');
ok('스냅샷 없는 매수는 선을 만들지 않고 이유를 남긴다', so.stop===null&&/판정 스냅샷이 없습니다/.test(so.why), so.why);
S.trades=[buy('000001','A','2026-03-01',60000,{at:1,stop:null,entry:60000,stopD:null,stopH:20})];
ok('그때 변동성이 없었으면 그렇게 적는다', /변동성이 확보되지 않아/.test(M.stopOf('A').why||''), M.stopOf('A').why);
S.trades=[{side:'sell',market:'KR',type:'stock',code:'000001',name:'A',date:'2026-09-01',price:90000,snap:{at:9,stop:1,entry:1}}];
ok('매도 기록은 선의 근거가 아니다', M.stopOf('A')===null);
S.trades=[buy('000002','B','2026-08-01',10000,{at:5,stop:9000,entry:10000,stopD:0.1,stopH:20})];
ok('다른 종목의 매수를 끌어오지 않는다', M.stopOf('A')===null);

console.log('\n[3] 재심사 — 두 가지만 본다');
S.trades=[buy('000001','A','2026-08-01',80000,{at:9,stop:71000,entry:80000,stopD:0.1125,stopH:20})];
stock('A',{k:{price:75000,tier:'중'}});
let r=M.reviewOf('A',{qty:10});
ok('선 위이고 관문 통과 → 아무 일 없음', r.hit===false&&r.failed===false&&r.breach===false, JSON.stringify(r));
stock('A',{k:{price:70999,tier:'중'}}); VKEY='watch';
r=M.reviewOf('A',{qty:10});
ok('선 아래로 내려오면 무효화 도달', r.breach===true&&r.hit===true);
ok('이유를 문장으로 남긴다', /무효화선 아래로/.test(r.why||''), r.why);
/* (v6.1) '지금이라면 안 삼'은 **평가해서 거절했을 때만** 쓴다.
 * 종전엔 tier가 없으면 전부 거절로 읽어, 데이터가 없어 평가조차 못 한 종목에도 붙었다. */
const BLK={blocked:'최소 품질 — 종합점수 ≥ 45',blockedCode:'G8',assessable:true};
stock('A',{k:{price:90000,tier:null,grd:BLK}}); VKEY='out';
r=M.reviewOf('A',{qty:10});
ok('관문 탈락이면 선 위여도 재심사 걸림', r.failed===true&&r.breach===false&&r.hit===true);
ok('"지금 신규라면" 문장', /지금 신규라면 관문을 통과하지 못합니다/.test(r.why||''), r.why);
stock('A',{k:{price:70000,tier:null,grd:BLK}}); VKEY='out';
r=M.reviewOf('A',{qty:10});
ok('둘 다여도 관문 쪽을 먼저 말한다', r.failed&&r.breach&&/관문/.test(r.why));

/* 평가 불가 — 거절이 아니다. 경고색도 켜지 않는다. */
stock('A',{k:{price:90000,tier:null,grd:{blocked:null,blockedCode:null,assessable:false,
  unknown:['휴리스틱 현재가치 — 평가 불가 (근거가 목표가뿐이거나 없음)'],unknownCode:['G4']}}});
VKEY='na';
r=M.reviewOf('A',{qty:10});
ok('데이터가 없으면 거절로 읽지 않는다', r.failed===false&&r.unknown===true, JSON.stringify([r.failed,r.unknown]));
ok('모름에 경고색을 켜지 않는다 (선 위일 때)', r.hit===false, r.hit);
ok('나쁘다는 뜻이 아님을 문장에 적는다', /나쁘다는 뜻이 아닙니다/.test(r.why||''), r.why);
{ /* (v6.1.2) 배지와 판정이 어긋나면 안 된다 — 등급 미달(평가 완료)이 '평가 불가'로 떨어져
   * `탈락 [평가 불가]`가 뜬 적이 있다. 두 곳에서 따로 분류하면 반드시 갈라진다. */
  stock('A',{k:{price:90000,tier:null,grd:{gates:[['x',true,'G1']],blocked:null,blockedCode:null,
    assessable:true,unknown:null}}});
  VKEY='out';
  const q=M.reviewOf('A',{qty:10});
  ok('등급 미달은 거절로 읽는다 (평가 불가가 아니다)', q.failed===true&&q.unknown===false,
     JSON.stringify([q.failed,q.unknown]));
  VKEY='na';
  const q2=M.reviewOf('A',{qty:10});
  ok('판정이 평가 불가면 배지도 평가 불가', q2.unknown===true&&q2.failed===false);
  VKEY='watch';
  const q3=M.reviewOf('A',{qty:10});
  ok('판정이 관망이면 둘 다 아니다', q3.failed===false&&q3.unknown===false); }
/* 다만 무효화선을 깼다면 그건 **관측된 사실**이므로 경고는 켠다. */
stock('A',{k:{price:70000,tier:null,grd:{blocked:null,blockedCode:null,assessable:false,
  unknown:['x'],unknownCode:['G4']}}});
VKEY='na';
r=M.reviewOf('A',{qty:10});
ok('무효화선 도달은 모름과 무관하게 경고', r.breach===true&&r.hit===true);
ok('보유가 아니면 null', M.reviewOf('A',null)===null);
S.trades=[];
stock('A',{k:{price:1,tier:'중'}});
r=M.reviewOf('A',{qty:10});
ok('선이 없으면 아무리 떨어져도 무효화 도달이 아니다 (지어내지 않는다)', r.breach===false&&r.hit===false, JSON.stringify(r));

console.log('\n[4] 진입가 가림 — 판정을 바꾸지 않는다');
S.trades=[buy('000001','A','2026-08-01',80000,{at:9,stop:71000,entry:80000,stopD:0.1125,stopH:20})];
stock('A',{k:{price:70999,tier:'중'}});
const before=JSON.stringify(M.reviewOf('A',{qty:10}));
S.ui.maskEntry=true;
ok('가림을 켜도 재심사 결과가 같다', JSON.stringify(M.reviewOf('A',{qty:10}))===before);
ok('maskEntry가 상태를 읽는다', M.maskEntry()===true);
S.ui.maskEntry=false;
ok('끄면 false', M.maskEntry()===false);

console.log('\n────────────────────────────');
console.log(pass+' passed · '+fail+' failed');
process.exit(fail?1:0);
