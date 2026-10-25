/* (v5.7) 보수 적정가 + 개연성 하락가 — 순수함수 검증.
 * 확률 계층은 해석해가 있는 양이라 **알려진 값과 대조**한다. 자기참조 검사만 하면
 * 근사식 계수를 잘못 적어도 통과한다. */
const D=require('../src/domain.js');
let pass=0,fail=0;
const ok=(n,c,x)=>{c?(pass++,console.log('  OK   '+n)):(fail++,console.log('  FAIL '+n+(x!==undefined?('  ← '+x):'')));};
const near=(a,b,tol)=>a!=null&&Math.abs(a-b)<=tol;

console.log('\n[1] 표준정규 — 문헌값 대조');
ok('Φ(0)=0.5', near(D.normCdf(0),0.5,1e-9), D.normCdf(0));
ok('Φ(1)=0.8413447', near(D.normCdf(1),0.8413447461,2e-7), D.normCdf(1));
ok('Φ(1.96)=0.9750021', near(D.normCdf(1.96),0.9750021049,2e-7), D.normCdf(1.96));
ok('Φ(-2)=0.0227501', near(D.normCdf(-2),0.0227501319,2e-7), D.normCdf(-2));
ok('Φ(-1)+Φ(1)=1', near(D.normCdf(-1)+D.normCdf(1),1,1e-7));
ok('null 입력은 null', D.normCdf(null)===null && D.normCdf(NaN)===null);

console.log('\n[2] Φ⁻¹ — 문헌값 대조 및 역함수 성질');
ok('Φ⁻¹(0.75)=0.6744898', near(D.invPhi(0.75),0.6744897502,1e-8), D.invPhi(0.75));
ok('Φ⁻¹(0.975)=1.9599640', near(D.invPhi(0.975),1.9599639845,1e-8), D.invPhi(0.975));
ok('Φ⁻¹(0.5)=0', near(D.invPhi(0.5),0,1e-12));
ok('Φ⁻¹(0.01) 꼬리분기', near(D.invPhi(0.01),-2.3263478740,1e-8), D.invPhi(0.01));
ok('Φ⁻¹(0.99) 상단꼬리', near(D.invPhi(0.99),2.3263478740,1e-8), D.invPhi(0.99));
ok('정의역 밖은 null', D.invPhi(0)===null&&D.invPhi(1)===null&&D.invPhi(-0.1)===null);

console.log('\n[3] 도달확률 — 반사원리 해석해');
const P=100, V=0.40, H=60;              // σ_H = 0.40*sqrt(60/252) = 0.195180…
const sH=V*Math.sqrt(H/252);
ok('σ_H 계산', near(sH,0.1951800,1e-6), sH);
ok('1σ_H 아래는 2Φ(-1)=31.73%', near(D.touchProb(P,P*Math.exp(-sH),V,H),0.3173105,1e-6), D.touchProb(P,P*Math.exp(-sH),V,H));
ok('2σ_H 아래는 2Φ(-2)=4.55%', near(D.touchProb(P,P*Math.exp(-2*sH),V,H),0.0455003,1e-6));
ok('현재가 이상이면 1 (이미 닿아 있다)', D.touchProb(P,P,V,H)===1 && D.touchProb(P,P*1.1,V,H)===1);
ok('변동성 0이면 null (추정 불가)', D.touchProb(P,90,0,H)===null);
ok('지평 0이면 null', D.touchProb(P,90,V,0)===null);
ok('확률은 0~1에 갇힌다', (()=>{for(const L of [1,10,50,99.99]){const p=D.touchProb(P,L,V,H);if(!(p>=0&&p<=1))return false;}return true;})());

console.log('\n[4] probFloor ↔ touchProb 역함수 왕복');
for(const p of [0.5,0.3,0.2,0.1]){
  const L=D.probFloor(P,V,H,p);
  ok('p='+p+' 왕복', near(D.touchProb(P,L,V,H),p,1e-6), 'L='+L+' → '+D.touchProb(P,L,V,H));
}
ok('중앙 도달가는 exp(-0.6745σ_H)배', near(D.probFloor(P,V,H,0.5),P*Math.exp(-0.6744897502*sH),1e-9));
ok('변동성이 크면 더 멀리 내려간다', D.probFloor(P,0.6,H,0.5)<D.probFloor(P,0.2,H,0.5));
ok('지평이 길면 더 멀리 내려간다', D.probFloor(P,V,120,0.5)<D.probFloor(P,V,20,0.5));

console.log('\n[5] 보수 적정가 — 방법 선택과 배제');
const base={price:100,quality:65,ceil:3,fairPerNow:12,fairPsrNow:1.5,vm:{per:2,pbr:2,psr:2}};
{ // 흑자: EPS·FCF·장부 3종, PSR은 제외
  const r=D.conservativeFV(Object.assign({},base,{perTtm:10,perFwd:8,psr:2,pbr:1.25,fcfPS:7}));
  const keys=r.used.map(m=>m.key);
  ok('흑자에서 PSR은 쓰지 않는다', keys.indexOf('rev')<0&&(r.skipped.find(s=>s.key==='rev')||{}).why.includes('흑자'));
  /* (v5.9.6) 낮은 쪽이 아니라 **정상화(후행·선행 평균)**. perTtm 10배·perFwd 8배 →
 * EPS 10과 12.5의 평균 11.25 → ×12 = 135. 낮은 쪽이었다면 120이었다. */
ok('EPS는 정상화(후행·선행 평균)', near((r.used.find(m=>m.key==='eps')||{}).value,11.25*12,1e-9),
   (r.used.find(m=>m.key==='eps')||{}).value);
ok('더 이상 낮은 쪽을 쓰지 않는다', (r.used.find(m=>m.key==='eps')||{}).value!==120);
ok('산출 문구가 무엇을 썼는지 말한다', /정상화 EPS\(후행·선행 평균\)/.test((r.used.find(m=>m.key==='eps')||{}).how||''),
   (r.used.find(m=>m.key==='eps')||{}).how);
  ok('FCF 7 × 12 = 84 (값은 그대로 낸다)', near((r.used.find(m=>m.key==='fcf')||{}).value,84,1e-9));
  ok('(v5.9.7) FCF는 참고 — 중앙값에 넣지 않는다', (r.used.find(m=>m.key==='fcf')||{}).ref===true);
  ok('장부가 100/1.25 = 80', near((r.used.find(m=>m.key==='book')||{}).value,80,1e-9));
  /* (v5.9.7) 이익력 135 · 장부 80 (FCF 84는 참고) → 2종 중앙값 = 평균 107.5 */
ok('참고를 뺀 2종 중앙값 = 107.5', near(r.fv,107.5,1e-9), r.fv+' / '+JSON.stringify(keys));
ok('n은 참고를 세지 않는다', r.n===2, r.n);
ok('n≥2면 「n종 중앙값」', r.basis==='2종 중앙값', r.basis);
}
{ // 적자: PSR 경로
  const r=D.conservativeFV(Object.assign({},base,{perTtm:null,perFwd:null,psr:2,pbr:1.25,fcfPS:null}));
  ok('적자면 PSR이 들어온다', r.used.some(m=>m.key==='rev'));
  ok('주당매출 50 × 1.5 = 75', near((r.used.find(m=>m.key==='rev')||{}).value,75,1e-9));
  ok('EPS 배제 사유가 흑자 없음', (r.skipped.find(s=>s.key==='eps')||{}).why.includes('흑자 EPS 없음'));
}
{ // VM_META 0 → 해당 방법 제외
  const r=D.conservativeFV(Object.assign({},base,{perTtm:10,perFwd:10,pbr:0.5,fcfPS:null,vm:{per:2,pbr:0,psr:1}}));
  ok('PBR 판별력 0이면 장부가 제외', !r.used.some(m=>m.key==='book'));
  ok('그 사유가 화면용 문장으로 남는다', (r.skipped.find(s=>s.key==='book')||{}).why.includes('판별력 없음'));
  /* perTtm=perFwd=10 → EPS 10 → ×12 = 120. PBR 판별력 0, FCF 없음 → 이익력 단독 */
ok('남은 1개면 그 값이 곧 대표값', near(r.fv,120,1e-9)&&r.n===1, r.fv+'/'+r.n);
ok('n=1이면 「중앙값」이라 하지 않고 방법 이름을 쓴다', r.basis==='이익력(EPS)', r.basis);
}
{ // 천장 초과 배제 (기존 FUND_CEIL_N 재사용)
  const r=D.conservativeFV(Object.assign({},base,{perTtm:0.2,perFwd:0.2,pbr:1.25,fcfPS:null}));
  ok('현재가 3배 초과는 이상치로 배제', !r.used.some(m=>m.key==='eps'));
  ok('배제 사유에 배수가 적힌다', (r.skipped.find(s=>s.key==='eps')||{}).why.includes('3배 초과'));
}
{ /* (v5.9.7) 재무제표 통화 ≠ 시세 통화면 PBR 비율을 검증할 수 없다.
     실측: TWD 재무·USD 시세 종목에서 PBR 2601.61 → 주당순자산 $0.16이 화면에 떴다. */
  const r=D.conservativeFV(Object.assign({},base,{price:418.51,perTtm:27,perFwd:20,pbr:2601.61,fcfPS:7,curMismatch:true}));
  ok('통화가 섞이면 자산 방법을 쓰지 않는다', !r.used.some(m=>m.key==='book'), JSON.stringify(r.used.map(m=>m.key)));
  ok('사유를 통화 문제로 적는다', /통화 .*PBR 비율의 통화·ADR 정합/.test((r.skipped.find(s=>s.key==='book')||{}).why||''),
     (r.skipped.find(s=>s.key==='book')||{}).why);
  const r2=D.conservativeFV(Object.assign({},base,{price:418.51,perTtm:27,perFwd:20,pbr:2601.61,fcfPS:7}));
  ok('통화가 같으면 종전대로 쓴다(터무니없는 값도 이상치 천장이 받는다)',
     !r2.used.some(m=>m.key==='book')||r2.used.find(m=>m.key==='book').value>0);
}
{ // FCF 음수는 '없음'이 아니라 '산출 불가'
  const r=D.conservativeFV(Object.assign({},base,{perTtm:10,perFwd:10,pbr:1.25,fcfPS:-3}));
  ok('FCF 음수는 0으로 치지 않는다', (r.skipped.find(s=>s.key==='fcf')||{}).why.includes('음수'));
}
{ // 전부 결측
  const r=D.conservativeFV({price:100,quality:65,ceil:3,fairPerNow:12,fairPsrNow:1.5,vm:{}});
  ok('쓸 방법이 없으면 fv=null (0이 아니다)', r.fv===null&&r.n===0&&r.basis===null);
  ok('그래도 배제 목록은 4종 전부 남는다', r.skipped.length===4, JSON.stringify(r.skipped.map(s=>s.key)));
}

console.log('\n[5b] 정상화 EPS — 단독 케이스와 app.js 정의와의 일치 (v5.9.6)');
{ const r2=D.conservativeFV(Object.assign({},base,{perTtm:10,perFwd:null,pbr:1.25,fcfPS:null}));
  ok('후행만 있으면 그 값', near((r2.used.find(m=>m.key==='eps')||{}).value,10*12,1e-9));
  const r3=D.conservativeFV(Object.assign({},base,{perTtm:null,perFwd:8,pbr:1.25,fcfPS:null}));
  /* (v5.9.7) 기존 엔진의 '선행 단독 ×0.92'는 **쓰지 않는다** — 성장 0 PER이 이미 할인이고,
     또 깎으면 같은 종류의 이중 적용이다. 실측에서 그 할인이 값을 8.7% 낮췄다. */
  ok('선행만 있으면 그대로 쓴다 (0.92를 곱하지 않는다)', near((r3.used.find(m=>m.key==='eps')||{}).value,12.5*12,1e-9),
     (r3.used.find(m=>m.key==='eps')||{}).value);
  ok('산출 문구에 0.92가 없다', /^선행 EPS ×/.test((r3.used.find(m=>m.key==='eps')||{}).how||''),
     (r3.used.find(m=>m.key==='eps')||{}).how);
}
{ /* ★ §22-⑲ 재사용은 주장이 아니라 검사 — app.js의 fundamentalFV가 쓰는 eNow 정의와
     같은 숫자를 쓰는지 **배포본에서 직접 읽어** 확인한다. 한쪽만 바뀌면 여기서 깨진다. */
  const fs=require('fs');
  const T=fs.readFileSync(__dirname+'/../dist/index.html','utf8');
  ok('app.js의 50:50 평균 정의가 그대로다', /eNow=\(epsTtm\*0\.5\+epsFwd\*0\.5\)/.test(T));
  /* 기존 엔진에는 0.92가 그대로 있어야 한다(판정 불변) — 다만 보수 적정가는 쓰지 않는다. */
  ok('app.js의 0.92는 손대지 않았다(판정 불변)', /eNow=epsFwd\*0\.92/.test(T));
}

console.log('\n[6] buyPlan — 가치 축과 확률 축의 교차');
const bp=o=>D.buyPlan(Object.assign({},base,{annVol:V,h:H},o));
/* 이익력 100/15×12=80 · 장부 100/1.25=80 → 2종 중앙값 80. 중앙도달가 87.67 > 80 → 가치가 제약 */
{ const r=bp({perTtm:15,perFwd:15,pbr:1.25,fcfPS:7});
  ok('중앙도달가 > 보수적정가 → 가치가 제약', r.bind==='value', r.bind+' fv='+r.fv+' pf='+r.probFloor);
  ok('제안 지정가 = 보수 적정가', near(r.limit,80,1e-9), r.limit);
  ok('상태 far (개연성 하락으로도 가치 미달)', r.state==='far', r.state);
  ok('제안가의 도달확률을 함께 낸다', r.limitProb>0&&r.limitProb<0.5, r.limitProb);
}
{ const r=bp({perTtm:15,perFwd:15,pbr:1.25,fcfPS:7,annVol:1.2});  // 변동성 큼 → 도달가 67.4 < 80
  ok('변동성 크면 확률 축이 제약', r.bind==='prob', r.bind+' pf='+r.probFloor);
  ok('상태 wait (기다리면 가치 이하 도달)', r.state==='wait', r.state);
  ok('제안가 도달확률 ≈ 50%', near(r.limitProb,0.5,1e-6), r.limitProb);
}
{ const r=bp({price:70,perTtm:7,perFwd:7,pbr:0.875,fcfPS:4.9}); // 현재가가 이미 싸다
  ok('현재가 ≤ 보수적정가면 상태 at', r.state==='at', r.state+' fv='+r.fv);
}
{ const r=bp({perTtm:15,perFwd:15,pbr:1.25,fcfPS:7,annVol:null});
  ok('변동성 없으면 지정가를 만들지 않는다', r.limit===null&&r.probFloor===null);
  ok('보수 적정가는 그래도 나온다', near(r.fv,80,1e-9), r.fv);
  ok('이유를 문장으로 남긴다', /변동성 미확보/.test(r.why||''), r.why);
}
{ const r=D.buyPlan({price:100,annVol:V,h:H,quality:65,ceil:3,fairPerNow:12,fairPsrNow:1.5,vm:{}});
  ok('방법이 없으면 why에 그 사실을 적는다', /보수 적정가 산출 불가/.test(r.why||''), r.why);
  ok('지정가도 null', r.limit===null);
}

console.log('\n[7] 단조성 — 입력이 좋아지면 값이 커진다');
{
  const a=D.conservativeFV(Object.assign({},base,{perTtm:10,perFwd:10,pbr:1.25,fcfPS:7}));
  const b=D.conservativeFV(Object.assign({},base,{perTtm:5,perFwd:5,pbr:1.25,fcfPS:7}));  // EPS 2배
  ok('EPS가 커지면 보수 적정가가 작아지지 않는다', b.fv>=a.fv, a.fv+' → '+b.fv);
  const c=D.conservativeFV(Object.assign({},base,{perTtm:10,perFwd:10,pbr:1.25,fcfPS:7,fairPerNow:15}));
  ok('정당 PER이 커지면 값도 커진다', c.fv>a.fv, a.fv+' → '+c.fv);
}

console.log('\n────────────────────────────');
console.log(pass+' passed · '+fail+' failed');
process.exit(fail?1:0);
