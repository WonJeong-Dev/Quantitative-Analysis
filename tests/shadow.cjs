/* (v5.6) 그림자 장부 · 횡단면 분모 — 명세 docs/SHADOW-5.6.md 에 대한 검증.
 * 합성 로그로 돌린다. 참값을 아는 경우만 쓰고, 실측 스냅샷은 반례에만 쓴다(§22-②). */
const {test}=require('node:test'),assert=require('node:assert/strict'),D=require('../src/domain.js');

const SEC=d=>Date.parse(d+'T00:00:00Z')/1000;
const COLS=['tier','tierNoCap','price'];
/* spec: {id:[tier,tierNoCap]} · fwd: {id:{r,q,e,z}} · types: {id:'etf'} */
function doc(d,spec,fwd,types){
  const rows={},inputs={},F={};
  for(const id of Object.keys(spec)){
    rows[id]=[spec[id][0],spec[id][1]!==undefined?spec[id][1]:spec[id][0],100];
    inputs[id]={cls:{type:(types||{})[id]||'stock'}};
    const f=(fwd||{})[id];
    if(f)F[id]=Object.assign({},f.r!=null?{r60:f.r}:{},f.q?{q60:f.q}:{},
      {e60:f.e!=null?f.e:SEC(d)+86400,z60:f.z!=null?f.z:SEC(d)+86400*90},
      f.x!=null?{x60:f.x}:{});
  }
  return {id:'v55_'+d,d,at:SEC(d)*1000,rv:'v5.5',cols:COLS,rows,inputs,fwd:F};
}
const R=(v,extra)=>Object.assign({r:v},extra||{});

/* ── 1. 문서 자신의 cols로 읽는다 ─────────────────────────────────────────── */
test('rowOf: 문서마다 다른 cols 순서여도 이름으로 정확히 읽는다',()=>{
  const a={cols:['tier','price'],rows:{X:['상',10]}};
  const b={cols:['price','tier'],rows:{X:[10,'상']}};
  assert.equal(D.rowOf(a,'X').tier,'상');
  assert.equal(D.rowOf(b,'X').tier,'상');          // 순서가 바뀌어도 같은 답
  assert.equal(D.rowOf(a,'없음'),null);
});

/* ── 2. 횡단면 분모 ──────────────────────────────────────────────────────── */
test('crossMedianExcess: 시장×유형 버킷, 자기 포함, 중앙값 대비',()=>{
  const d=doc('2026-01-05',{KR_1:['상'],KR_2:['하'],KR_3:['범위밖'],US_1:['상'],US_2:['하']},
    {KR_1:R(10),KR_2:R(0),KR_3:R(-10),US_1:R(5),US_2:R(1)});
  const m=D.crossMedianExcess(d,60);
  assert.equal(m.KR_1.m,10);assert.equal(m.KR_2.m,0);assert.equal(m.KR_3.m,-10);
  assert.equal(m.KR_1.mn,3);assert.equal(m.KR_1.bucket,'KR|stock');
  assert.equal(m.US_1.mn,2);assert.equal(m.US_1.bucket,'US|stock');   // 시장이 섞이지 않는다
});
test('crossMedianExcess: ETF는 주식과 다른 모집단 (지수 추종이라 중앙값을 끈다)',()=>{
  const d=doc('2026-01-05',{KR_1:['상'],KR_2:['하'],KR_E1:['중립'],KR_E2:['대기']},
    {KR_1:R(10),KR_2:R(0),KR_E1:R(100),KR_E2:R(200)},{KR_E1:'etf',KR_E2:'etf'});
  const m=D.crossMedianExcess(d,60);
  assert.equal(m.KR_1.mn,2);assert.equal(m.KR_E1.mn,2);
  assert.equal(m.KR_1.m,5);                                           // ETF 200%가 주식 중앙값을 안 건드린다
});
test('crossMedianExcess: 오염(q60) 행은 모집단과 결과 양쪽에서 빠진다',()=>{
  const d=doc('2026-01-05',{A:['상'],B:['하'],C:['하']},{A:R(10),B:R(0),C:R(-1000,{q:'split'})});
  const m=D.crossMedianExcess(d,60);
  assert.equal(m.C,undefined);
  assert.equal(m.A.mn,2);assert.equal(m.A.m,5);                       // C가 중앙값을 끌어내리지 못한다
});
test('★ 외부 충격은 분모에서 상쇄된다 — 전 종목 평행이동에 m이 불변',()=>{
  const base={KR_1:R(10),KR_2:R(0),KR_3:R(-10),KR_4:R(3)};
  const war ={KR_1:R(-10),KR_2:R(-20),KR_3:R(-30),KR_4:R(-17)};      // 전 종목 −20%p (전쟁)
  const spec={KR_1:['상'],KR_2:['중'],KR_3:['하'],KR_4:['범위밖']};
  const a=D.crossMedianExcess(doc('2026-01-05',spec,base),60);
  const b=D.crossMedianExcess(doc('2026-01-06',spec,war),60);
  for(const id of Object.keys(spec))assert.equal(a[id].m,b[id].m,id+' 의 m이 바뀌었다');
  assert.notEqual(base.KR_1.r,war.KR_1.r);                            // 원시 수익률은 분명히 다르다
});

/* ── 3. 진입 사건 ────────────────────────────────────────────────────────── */
const ARM=k=>D.SHADOW_ARMS.find(a=>a.key===k);
test('진입은 전이에서만 — 계속 상 등급이어도 한 번만 센다',()=>{
  const docs=[doc('2026-01-05',{X:['범위밖']},{X:R(1)}),
              doc('2026-01-06',{X:['상']},    {X:R(2)}),
              doc('2026-01-07',{X:['상']},    {X:R(3)})];
  const {events}=D.shadowEvents(docs,ARM('A'),60,{});
  assert.equal(events.length,1);assert.equal(events[0].d,'2026-01-06');
});
test('첫 문서와 직전 행 결측은 진입으로 세지 않는다 (수집 공백 방어)',()=>{
  const first=D.shadowEvents([doc('2026-01-05',{X:['상']},{X:R(1)})],ARM('A'),60,{});
  assert.equal(first.events.length,0);                                // 직전이 없다
  const gap=D.shadowEvents([doc('2026-01-05',{Y:['상']},{Y:R(1)}),
                            doc('2026-01-06',{X:['상'],Y:['상']},{X:R(1),Y:R(1)})],ARM('A'),60,{});
  assert.equal(gap.events.length,0);                                  // X는 직전 문서에 행이 없다
});
test('엠바고 — 청산 전 재진입 불가, 청산 후 가능',()=>{
  const z=SEC('2026-01-10');
  const mk=(d,tier,zz)=>doc(d,{X:[tier]},{X:R(1,{z:zz})});
  const docs=[mk('2026-01-05','범위밖',z),mk('2026-01-06','상',z),
              mk('2026-01-07','범위밖',z),mk('2026-01-08','상',z),       // 청산 전 → 막힘
              mk('2026-01-12','범위밖',z),mk('2026-01-13','상',z)];      // 청산 후 → 허용
  const {events}=D.shadowEvents(docs,ARM('A'),60,{});
  assert.deepEqual(events.map(e=>e.d),['2026-01-06','2026-01-13']);
});
test('결과가 없거나 오염된 행은 사건이 아니다',()=>{
  const docs=[doc('2026-01-05',{A:['범위밖'],B:['범위밖'],C:['범위밖']},{A:R(1),B:R(1),C:R(1)}),
              doc('2026-01-06',{A:['상'],B:['상'],C:['상']},{A:R(5),B:{},C:R(5,{q:'jump'})})];
  const {events}=D.shadowEvents(docs,ARM('A'),60,{});
  assert.deepEqual(events.map(e=>e.id),['A']);
});

/* ── 4. arm 정의 ─────────────────────────────────────────────────────────── */
test('A·B·C가 서로 다른 질문을 본다 (캡 강등 종목)',()=>{
  const prev=doc('2026-01-05',{X:['범위밖','범위밖']},{X:R(1)});
  const now =doc('2026-01-06',{X:['하','상']},{X:R(1)});              // 캡이 상→하로 강등
  const n=k=>D.shadowEvents([prev,now],ARM(k),60,{}).events.length;
  assert.equal(n('A'),0);   // tier='하' → 현행은 안 산다
  assert.equal(n('B'),1);   // tierNoCap='상' → 캡이 없었으면 샀다
  assert.equal(n('C'),1);   // 전등급은 '하'도 산다
});
test('D 무작위는 A와 같은 개수를 뽑고 결정론적이다',()=>{
  const prev=doc('2026-01-05',{A1:['범위밖'],A2:['범위밖'],A3:['범위밖'],A4:['범위밖']},
    {A1:R(1),A2:R(1),A3:R(1),A4:R(1)});
  const now=doc('2026-01-06',{A1:['상'],A2:['상'],A3:['범위밖'],A4:['범위밖']},
    {A1:R(1),A2:R(1),A3:R(1),A4:R(1)});
  const a=D.shadowEvents([prev,now],ARM('A'),60,{});
  assert.equal(a.events.length,2);
  const one=D.shadowEvents([prev,now],ARM('D'),60,{counts:a.counts,rngFor:d=>D.rngFrom('s|'+d.id)});
  const two=D.shadowEvents([prev,now],ARM('D'),60,{counts:a.counts,rngFor:d=>D.rngFrom('s|'+d.id)});
  assert.equal(one.events.length,2);                                   // A와 같은 개수
  assert.deepEqual(one.events.map(e=>e.id),two.events.map(e=>e.id));    // 몇 번을 돌려도 같다
});
test('E 동일가중은 전 종목을 담고 엠바고로만 끊긴다',()=>{
  const docs=[doc('2026-01-05',{X:['범위밖'],Y:['상']},{X:R(1),Y:R(1)}),
              doc('2026-01-06',{X:['범위밖'],Y:['상']},{X:R(1),Y:R(1)})];
  const {events}=D.shadowEvents(docs,ARM('E'),60,{});
  assert.equal(events.length,2);                                       // 첫날 두 종목, 이후는 엠바고
  assert.deepEqual(events.map(e=>e.d),['2026-01-05','2026-01-05']);
});

/* ── 5. 국면 ─────────────────────────────────────────────────────────────── */
test('regimeOf: 직전 h봉 수익률 부호 · 미래 봉에 영향받지 않는다',()=>{
  const t=[],c=[];for(let i=0;i<200;i++){t.push(SEC('2026-01-01')+i*86400);c.push(100+i);}
  const at=t[150]*1000;
  assert.equal(D.regimeOf({t,c},at,120),1);
  const cut={t:t.slice(0,151),c:c.slice(0,151)};
  assert.equal(D.regimeOf(cut,at,120),1);                              // 미래를 지워도 같다 = 선견 없음
  const down={t,c:c.map(v=>-v+400)};
  assert.equal(D.regimeOf(down,at,120),-1);
  assert.equal(D.regimeOf({t:t.slice(0,10),c:c.slice(0,10)},t[5]*1000,120),null);  // 이력 부족
});

/* ── 6. 통계 ─────────────────────────────────────────────────────────────── */
test('shadowStats: 중앙값·적중률·MDE를 함께 낸다',()=>{
  const ev=[1,2,3,4,100,-5,-6,-7].map((x,i)=>({x,d:'2026-01-0'+(i+1),id:'S'+i}));
  const s=D.shadowStats(ev,'x',{});
  assert.equal(s.n,8);assert.equal(s.uniq,8);
  assert.equal(s.med,1.5);                                             // 평균이면 11.5 — 100 하나가 지배한다
  assert.equal(s.hit,62.5);                                            // 8개 중 양수 5개
  assert.ok(s.mde>0,'MDE가 항상 나와야 한다');
  assert.deepEqual(D.shadowStats([],'x',{}),{n:0,uniq:0,dates:0,med:null,q25:null,q75:null,hit:null,mde:null,ci:null});
});
test('blockBootstrap: 결정론적이고 lo ≤ hi',()=>{
  const ev=[];for(let i=0;i<60;i++)ev.push({x:(i%7)-3,d:'2026-02-'+String((i%28)+1).padStart(2,'0')});
  const a=D.blockBootstrap(ev,'x',3,200,D.rngFrom('t'));
  const b=D.blockBootstrap(ev,'x',3,200,D.rngFrom('t'));
  assert.deepEqual(a,b);assert.ok(a.lo<=a.hi);assert.equal(a.blocks,3);
});

/* ── 7. 승급 심사 — 통과해도 코드는 아무것도 바꾸지 않는다 ─────────────────── */
test('promoteCheck: 표본·국면·CI 조건을 각각 거부 사유로 낸다',()=>{
  const small={x:{n:5,uniq:2,med:3},events:[]};
  const r1=D.promoteCheck(small,small,{days:10});
  assert.equal(r1.ok,false);
  assert.ok(r1.reasons.some(x=>/진입 사건/.test(x)));
  assert.ok(r1.reasons.some(x=>/고유 종목/.test(x)));
  assert.ok(r1.reasons.some(x=>/누적 거래일/.test(x)));
  assert.ok(r1.reasons.some(x=>/국면/.test(x)));
});
test('promoteCheck: 국면이 하나뿐이면 통과하지 않는다',()=>{
  const ev=[];for(let i=0;i<40;i++)ev.push({x:5,d:'2026-03-'+String((i%28)+1).padStart(2,'0'),id:'U'+i,regime:1});
  const arm={x:{n:40,uniq:40,med:5},events:ev},base={x:{n:40,uniq:40,med:0},events:ev};
  const r=D.promoteCheck(arm,base,{days:300});
  assert.equal(r.ok,false);
  assert.ok(r.reasons.some(x=>/국면 1개/.test(x)));
  assert.equal(r.delta,5);
});

/* ── 8. 사전등록 ─────────────────────────────────────────────────────────── */
test('preregBody: 해시가 안정적이고 정의가 바뀌면 달라진다',()=>{
  const a=D.preregBody('v5.5'),b=D.preregBody('v5.5');
  assert.equal(a.hash,b.hash);
  assert.equal(a.id,'v5.5_shadow_'+D.PREREG_VER);
  /* (v5.9.3) 새 판은 이전 판을 **대체하지 않고 잇는다** — 어느 판을 이어받았는지 본문에 남긴다.
   * Firestore가 create-only라 이전 문서 자체는 고칠 수 없고, 비교 가능성이 그래서 유지된다.
   * (v6.0) 판 번호가 올라가도 '바로 앞 판'을 가리키는지 검사한다 — v1 고정이면 v3에서 틀린다. */
  if(D.PREREG_VER!=='v1')
    assert.equal(a.supersedes,'v5.5_shadow_v'+(+D.PREREG_VER.slice(1)-1));
  assert.equal(a.outcomes.primary,'x60');assert.equal(a.outcomes.secondary,'m60');
  assert.equal(a.promote.minEvents,30);assert.equal(a.promote.phases,2);
  const {hash,...body}=a;                                            // 해시가 본문 전체를 덮는가
  assert.equal(a.hash,String(D.hashStr(D.settingsKey(body))));       // → 정의가 바뀌면 반드시 달라진다
  assert.notEqual(D.hashStr('x'),D.hashStr('y'));
});

/* ── 8b. (v5.9.3) 추가 후보 arm ───────────────────────────────────────────── */
test('A~E의 정의는 그대로다 — 추가만 했다',()=>{
  const by=Object.fromEntries(D.SHADOW_ARMS.map(a=>[a.key,a]));
  assert.equal(by.A.note,'tier ∈ {상,중}');
  assert.equal(by.B.note,'tierNoCap ∈ {상,중}');
  assert.equal(by.C.note,'tier ∈ {상,중,하}');
  assert.ok(by.D.sample===true&&by.E.always===true);
  for(const k of ['F','G','H'])assert.ok(by[k]&&typeof by[k].enter==='function',k+' 미등록');
});
test('F 상만 / G 결측 없음 / H 가치 이하만 — 진입 조건',()=>{
  const by=Object.fromEntries(D.SHADOW_ARMS.map(a=>[a.key,a]));
  assert.equal(by.F.enter({tier:'상'}),true);
  assert.equal(by.F.enter({tier:'중'}),false);
  // G: 결측 0일 때만. **열이 없던 과거 문서(null)는 '결측 없음'이 아니라 '모름'이라 빠진다.**
  assert.equal(by.G.enter({tier:'중',qMissW:0,aMissW:0}),true);
  assert.equal(by.G.enter({tier:'중',qMissW:5,aMissW:0}),false);
  assert.equal(by.G.enter({tier:'중',qMissW:null,aMissW:null}),false,'null을 0으로 치면 안 된다');
  assert.equal(by.G.enter({tier:'하',qMissW:0,aMissW:0}),false);
  // H: 무성장 가치 이하. cfvState는 v5.9.3부터 기록되므로 과거 문서는 null → 진입 없음.
  assert.equal(by.H.enter({tier:'상',cfvState:'at'}),true);
  assert.equal(by.H.enter({tier:'중',cfvState:'wait'}),false);
  assert.equal(by.H.enter({tier:'중',cfvState:null}),false,'기록 전 구간은 표본에 들어오지 않는다');
  assert.equal(by.H.enter({tier:'범위밖',cfvState:'at'}),false);
});
test('새 arm은 A의 부분집합이거나(F·G·H) 더 넓지 않다',()=>{
  const by=Object.fromEntries(D.SHADOW_ARMS.map(a=>[a.key,a]));
  const rows=[{tier:'상',qMissW:0,aMissW:0,cfvState:'at'},{tier:'상',qMissW:9,aMissW:0,cfvState:'wait'},
              {tier:'중',qMissW:0,aMissW:0,cfvState:'far'},{tier:'하',qMissW:0,aMissW:0,cfvState:'at'},
              {tier:'범위밖',qMissW:0,aMissW:0,cfvState:'at'}];
  for(const k of ['F','G','H'])
    for(const r of rows)
      if(by[k].enter(r))assert.ok(by.A.enter(r),k+'가 A 밖의 행을 집었다: '+JSON.stringify(r));
});

/* ── 9. 통합 ─────────────────────────────────────────────────────────────── */
test('shadowRun: 등록된 arm 전부가 나오고 D가 A와 같은 개수다',()=>{
  const docs=[];
  for(let i=0;i<12;i++){
    const d='2026-04-'+String(i+1).padStart(2,'0'),spec={},fwd={};
    for(let j=0;j<8;j++){const id='US_S'+j;
      spec[id]=[(i%3===0&&j<3)?'상':'범위밖'];
      fwd[id]=R(((i*7+j*13)%21)-10,{z:SEC(d)+86400});}
    docs.push(doc(d,spec,fwd));
  }
  const out=D.shadowRun(docs,{h:60,iters:50});
  assert.equal(out.arms.length,D.SHADOW_ARMS.length);
  assert.ok(out.arms.length>=8,'v5.9.3에서 후보 arm 3종을 더했다');
  const by=Object.fromEntries(out.arms.map(a=>[a.key,a]));
  assert.equal(by.D.events.length,by.A.events.length,'D는 A와 같은 개수여야 한다');
  assert.ok(by.E.events.length>=by.A.events.length);
  for(const k of ['A','D','E'])if(by[k].events.length)assert.ok(by[k].events.every(e=>e.m!=null),k+' 의 m이 비었다');
  const again=D.shadowRun(docs,{h:60,iters:50});
  assert.deepEqual(by.D.events.map(e=>e.id+e.d),
    Object.fromEntries(again.arms.map(a=>[a.key,a])).D.events.map(e=>e.id+e.d));
});

/* ══════════ (v7.0) 규칙 독립 arm 세트 ══════════
 * 왜 필요한가. A~H는 8개 중 6개가 tier/tierNoCap을 읽는다 → RULE_VER이 올라가면 표본이 0으로
 * 돌아간다. 실측: 같은 가중치로 기록된 24장(22거래일) 중 현행 필터가 고르는 것이 2장이었다.
 * I·J·K는 판정 **입력**만 읽으므로 그 초기화를 받지 않는다. 아래가 그 '받지 않음'을 못 박는다. */

/* ★ 가장 중요한 가드. 독립 arm을 더해도 기존 동결본(rv_shadow_v4)의 해시는 같아야 한다.
 * 실측 대조: 배포본(v6.10, arm A~H)에서 읽은 preregBody('v6.2').hash = 2597661583,
 * Firestore 저장 해시도 2597661583(frozen). 이 값이 바뀌면 '장부를 추가했다'는 이유만으로
 * 기존 동결본이 drift로 뜬다 — preregBody의 .filter(a=>!a.indep)를 지우면 깨진다. */
test('adding independent arms does not disturb the frozen v4 registration', () => {
  assert.equal(D.preregBody('v6.2').hash, '2597661583');
  assert.equal(D.PREREG_VER, 'v4');
  assert.deepEqual(D.preregBody('v6.2').rows.arms.map(a=>a.key), ['A','B','C','D','E','F','G','H']);
});

test('independent registration is its own document and carries no rule version', () => {
  const b = D.preregBodyIndep();
  assert.equal(b.id, 'indep_shadow_' + D.PREREG_INDEP_VER);
  assert.ok(!/v6|v5|RULE/.test(b.id), b.id);
  assert.deepEqual(b.rows.arms.map(a=>a.key), ['E','I','J','K','L']);
  assert.equal(b.supersedes, null);
  assert.match(b.promote.window, /동결 시각/);
  assert.notEqual(b.hash, D.preregBody('v6.2').hash);
});

test('arm sets partition by layer and share only the benchmark', () => {
  const r = D.armSet('rule'), i = D.armSet('indep');
  assert.deepEqual(r, ['A','B','C','D','E','F','G','H']);
  assert.deepEqual(i, ['E','I','J','K','L']);
  assert.deepEqual(r.filter(k=>i.includes(k)), ['E'], '공유되는 것은 벤치마크 하나뿐이어야 한다');
  assert.equal(r.length + i.length - 1, D.SHADOW_ARMS.length, '어떤 arm도 빠지거나 겹치지 않는다');
});

/* 플라시보는 pair가 가리키는 arm의 개수를 쓴다. pair가 배열에서 **앞**에 있어야
 * 개수가 이미 채워져 있다 — 순서를 바꾸면 조용히 0건이 된다. */
test('every placebo arm has a pair declared earlier in the array', () => {
  const keys = D.SHADOW_ARMS.map(a=>a.key);
  for (const a of D.SHADOW_ARMS) {
    if (!a.sample) continue;
    assert.ok(a.pair, a.key + ' 에 pair 가 없다');
    assert.ok(keys.indexOf(a.pair) >= 0 && keys.indexOf(a.pair) < keys.indexOf(a.key),
      a.key + ' 의 pair(' + a.pair + ')가 앞에 없다');
  }
});

/* 독립 arm의 진입 술어는 판정 산출물을 **한 글자도** 읽지 않아야 한다.
 * ① 소스에 그 이름이 없는지 ② 그 값을 오염시켜도 결과가 변하지 않는지, 둘 다 본다.
 *   (①만 보면 간접 호출로 새고, ②만 보면 우연히 같은 값이 나와 통과한다) */
test('independent arms read no judgement output', () => {
  const BAD = ['tier','tierNoCap','gate','upside','upEff','cfvState','blockedCode','downtrend'];
  const indep = D.SHADOW_ARMS.filter(a=>a.indep && a.enter);
  assert.equal(indep.length, 3);
  for (const a of indep) {
    const src = String(a.enter);
    for (const b of BAD) assert.ok(src.indexOf(b) < 0, a.key + ' 가 ' + b + ' 를 읽는다: ' + src);
  }
  const base = {pB:0.10, qMissW:0, aMissW:0};
  const poison = Object.assign({}, base, {tier:'범위밖', tierNoCap:'범위밖', gate:'G1',
    upside:-99, upEff:-99, cfvState:'far', downtrend:1});
  for (const a of indep)
    assert.equal(a.enter(poison), a.enter(base), a.key + ' 가 판정 오염에 반응한다');
});

test('arm I uses the shared PB_LOW threshold and treats missing as missing', () => {
  const I = D.SHADOW_ARMS.find(a=>a.key==='I');
  assert.equal(D.PB_LOW, 0.30);
  assert.equal(I.enter({pB:D.PB_LOW}), true, '경계는 포함');
  assert.equal(I.enter({pB:D.PB_LOW + 1e-4}), false);
  assert.equal(I.enter({pB:null}), false, 'null 은 거짓이 아니라 모름 — 진입하지 않는다');
  assert.equal(I.enter({}), false);
  assert.equal(I.enter({pB:NaN}), false);
  assert.match(I.note, /0\.30/);
});

test('arm J treats a missing weight column as unknown, not as zero', () => {
  const J = D.SHADOW_ARMS.find(a=>a.key==='J');
  assert.equal(J.enter({qMissW:0, aMissW:0}), true);
  assert.equal(J.enter({qMissW:0, aMissW:2}), false);
  assert.equal(J.enter({qMissW:null, aMissW:0}), false, '열이 없던 문서는 결측 0이 아니다');
  assert.equal(J.enter({}), false);
});

test('arm K is the conjunction of I and J with no restated predicate', () => {
  const [I,J,K] = ['I','J','K'].map(k=>D.SHADOW_ARMS.find(a=>a.key===k));
  const rows = [{pB:0.1,qMissW:0,aMissW:0},{pB:0.9,qMissW:0,aMissW:0},
                {pB:0.1,qMissW:3,aMissW:0},{pB:0.9,qMissW:3,aMissW:0},{pB:null,qMissW:0,aMissW:0}];
  for (const r of rows) assert.equal(K.enter(r), I.enter(r) && J.enter(r), JSON.stringify(r));
  assert.ok(String(K.enter).indexOf('pB') < 0, 'K가 술어를 다시 적고 있다 (§22-⑲)');
});

/* shadowRun 의 arm 선택 — 장부당 문서 집합이 다르므로 섞어 돌릴 수 없다 */
test('shadowRun runs only the requested arms and pairs each placebo with its own arm', () => {
  const docs = [];
  for (let i = 0; i < 10; i++) {
    const d = '2026-06-' + String(i+1).padStart(2,'0'), spec = {}, fwd = {};
    for (let j = 0; j < 6; j++) { spec['US_S'+j] = ['범위밖','범위밖']; fwd['US_S'+j] = R(((i*7+j*3)%19)-9); }
    const doc0 = doc(d, spec, fwd);
    /* pB·결측 열을 붙인다 — 4일마다 앞 3종목이 하단권으로 전이한다 */
    doc0.cols = COLS.concat(['pB','qMissW','aMissW']);
    for (let j = 0; j < 6; j++)
      doc0.rows['US_S'+j] = doc0.rows['US_S'+j].concat([(i%4===0&&j<3)?0.2:0.6, (i%5===0)?3:0, 0]);
    docs.push(doc0);
  }
  const all = D.shadowRun(docs, {h:60, iters:30});
  assert.deepEqual(all.arms.map(a=>a.key), D.SHADOW_ARMS.map(a=>a.key), '지정 없으면 전부');

  const ind = D.shadowRun(docs, {h:60, iters:30, arms:D.armSet('indep')});
  assert.deepEqual(ind.arms.map(a=>a.key), ['E','I','J','K','L']);
  const by = Object.fromEntries(ind.arms.map(a=>[a.key,a]));
  assert.ok(by.I.events.length > 0, 'I 가 pB 전이를 잡지 못했다');
  assert.ok(by.J.events.length > 0, 'J 가 결측 해소 전이를 잡지 못했다');

  /* L은 I와 **같은 개수**를 뽑는다 — A가 표에 없어도 그렇다(옛 구현은 A에 고정이었다) */
  const cnt = (a) => { const m = {}; for (const e of a.events) m[e.d] = (m[e.d]||0)+1; return m; };
  assert.deepEqual(cnt(by.L), cnt(by.I), 'L 이 I 와 같은 날짜별 개수가 아니다');

  /* 규칙 층만 돌려도 D는 여전히 A를 따라간다 */
  const rul = D.shadowRun(docs, {h:60, iters:30, arms:D.armSet('rule')});
  const br = Object.fromEntries(rul.arms.map(a=>[a.key,a]));
  assert.deepEqual(cnt(br.D), cnt(br.A), 'D 가 A 와 같은 날짜별 개수가 아니다');

  /* 같은 입력은 같은 결과 */
  const again = D.shadowRun(docs, {h:60, iters:30, arms:D.armSet('indep')});
  assert.deepEqual(again.arms.map(a=>a.events.map(e=>e.id+e.d).join()),
                   ind.arms.map(a=>a.events.map(e=>e.id+e.d).join()));
});

/* arm I의 임계는 app.js 신뢰도 항목에 이미 있던 값이다 — 새 상수가 아니라는 것을 여기서 묶는다.
 * app.js 쪽에서 QADomain.PB_LOW를 읽게 하면 판정 폐포에 의존이 늘어 RULEHASH가 바뀌고,
 * 그러면 RULE_VER을 올려야 하고, 그러면 규칙 의존 층의 표본이 또 0으로 돌아간다.
 * 그래서 코드는 떨어뜨려 두고 **값의 일치만** 검사한다(§20 (c) 기존상수 재사용). */
test('shadow arm I reuses the confidence item threshold rather than introducing a constant', () => {
  const app = require('node:fs').readFileSync(require('node:path').join(__dirname,'../src/app.js'),'utf8');
  const m = app.match(/볼린저 하단권 \(%B ≤ ([\d.]+)\)',\s*k\.pB!=null&&k\.pB<=([\d.]+)\]/);
  assert.ok(m, 'app.js 신뢰도 항목의 %B 임계를 찾지 못했다 — 표현이 바뀌면 이 가드가 조용히 죽는다');
  assert.equal(Number(m[1]), D.PB_LOW, '화면 문구의 임계가 arm I 와 다르다');
  assert.equal(Number(m[2]), D.PB_LOW, '판정 코드의 임계가 arm I 와 다르다');
});
