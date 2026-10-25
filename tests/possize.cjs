/* (v5.9) 변동성 기준 수량 — 순수함수 검증.
 * 핵심 성질: 변동성이 2배면 수량이 절반, 종목이 달라도 **1회 위험 금액은 같다**. */
const D=require('../src/domain.js');
let pass=0,fail=0;
const ok=(n,c,x)=>{c?(pass++,console.log('  OK   '+n)):(fail++,console.log('  FAIL '+n+(x!==undefined?('  ← '+x):'')));};
const near=(a,b,tol)=>a!=null&&Math.abs(a-b)<=tol;

console.log('\n[1] 무효화 거리 — σ√(h/252)');
let r=D.positionSize({limit:100,annVol:0.40,stopH:20,budget:4200});
ok('d = 40% × √(20/252) = 11.27%', near(r.d,0.40*Math.sqrt(20/252),1e-12), r.d);
ok('무효화 가격 = 지정가 × (1−d)', near(r.stop,100*(1-r.d),1e-12), r.stop);
ok('주당 위험 = 지정가 × d', near(r.perShare,100*r.d,1e-12), r.perShare);
ok('수량 = floor(예산 ÷ 주당위험)', r.qty===Math.floor(4200/(100*r.d)), r.qty+' / '+(4200/(100*r.d)));
ok('매수금액 = 수량 × 지정가', near(r.amount,r.qty*100,1e-9));
ok('실제 위험액 ≤ 예산', r.riskAmt<=4200, r.riskAmt);

console.log('\n[2] 변동성이 커지면 적게 산다 (같은 위험액)');
const a=D.positionSize({limit:100,annVol:0.20,stopH:20,budget:4200});
const b=D.positionSize({limit:100,annVol:0.40,stopH:20,budget:4200});
ok('변동성 2배 → 수량 약 절반', Math.abs(a.qty/b.qty-2)<0.02, a.qty+' vs '+b.qty);
ok('두 종목의 위험액이 서로 1주치 안쪽', Math.abs(a.riskAmt-b.riskAmt)<=Math.max(a.perShare,b.perShare),
   a.riskAmt.toFixed(1)+' vs '+b.riskAmt.toFixed(1));
const c1=D.positionSize({limit:20,annVol:0.40,stopH:20,budget:4200});
ok('가격이 낮으면 수량이 늘어 위험액은 유지', c1.qty>b.qty&&Math.abs(c1.riskAmt-b.riskAmt)<=Math.max(c1.perShare,b.perShare),
   c1.qty+' / '+c1.riskAmt.toFixed(1));

console.log('\n[3] 지평이 길면 거리가 멀어 수량이 준다');
const h20=D.positionSize({limit:100,annVol:0.40,stopH:20,budget:4200});
const h60=D.positionSize({limit:100,annVol:0.40,stopH:60,budget:4200});
ok('h=60이 h=20보다 적게 산다', h60.qty<h20.qty, h20.qty+' → '+h60.qty);
ok('거리 비율 = √3', near(h60.d/h20.d,Math.sqrt(3),1e-12));

console.log('\n[4] 금액 상한이 깎는다');
r=D.positionSize({limit:100,annVol:0.40,stopH:20,budget:4200,maxAmount:1000,capLabel:'종목 비중 한도'});
ok('상한이 수량을 깎는다', r.qty===10, r.qty);
ok('무엇이 깎았는지 남긴다', r.cap==='종목 비중 한도', r.cap);
r=D.positionSize({limit:100,annVol:0.40,stopH:20,budget:4200,maxAmount:1e9});
ok('상한이 넉넉하면 깎지 않는다', r.cap===null&&r.qty===Math.floor(4200/(100*0.40*Math.sqrt(20/252))), r.qty);
r=D.positionSize({limit:100,annVol:0.40,stopH:20,budget:4200,maxAmount:50,capLabel:'종목 비중 한도'});
ok('1주도 못 사면 0주 + 이유', r.qty===0&&/1주도 담을 수 없습니다/.test(r.why||''), r.qty+' '+r.why);

console.log('\n[5] 모르는 것은 꾸며내지 않는다');
for(const [n2,o,pat] of [
  ['지정가 없음',{limit:null,annVol:0.4,stopH:20,budget:4200},/지정가가 없어/],
  ['변동성 없음',{limit:100,annVol:null,stopH:20,budget:4200},/변동성 미확보/],
  ['지평 없음',{limit:100,annVol:0.4,stopH:null,budget:4200},/무효화 지평/],
  ['예산 미설정',{limit:100,annVol:0.4,stopH:20,budget:null},/위험예산 미설정/],
  ['예산 0',{limit:100,annVol:0.4,stopH:20,budget:0},/위험예산 미설정/]]){
  const x=D.positionSize(o);
  ok(n2+' → 수량 null + 이유', x.qty===null&&pat.test(x.why||''), JSON.stringify([x.qty,x.why]));
}
ok('인자 없이 불러도 터지지 않는다', D.positionSize().qty===null);

console.log('\n[6] 1회 위험 %가 그대로 금액이 된다');
{ const assets=42000000, rp=1.0, budget=assets*rp/100;
  const x=D.positionSize({limit:63445,annVol:0.38,stopH:20,budget:budget});
  ok('예산 ₩420,000', near(budget,420000,1e-9));
  ok('d ≈ 10.7%', near(x.d,0.38*Math.sqrt(20/252),1e-12)&&Math.abs(x.d-0.107)<0.001, x.d);
  ok('수량 61주', x.qty===61, x.qty+' (perShare '+x.perShare.toFixed(0)+')');
  ok('위험액이 예산을 넘지 않는다', x.riskAmt<=budget, x.riskAmt.toFixed(0));
}

console.log('\n────────────────────────────');
console.log(pass+' passed · '+fail+' failed');
process.exit(fail?1:0);
