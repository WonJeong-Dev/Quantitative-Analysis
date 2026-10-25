(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.QAInvestment=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const num=x=>(typeof x==='number'||typeof x==='string'&&x.trim()!=='')&&Number.isFinite(Number(x))?Number(x):null;
 const required=(o,keys)=>keys.filter(k=>num(o?.[k])===null);
 const labels={assets:'총자산',cash:'현재 현금',minCash:'최소 현금',stockMax:'종목 비중 한도',sectorMax:'업종 비중 한도',themeMax:'테마 비중 한도',lossMax:'손실한도',themeStress:'공통 테마 하락 가정',riskPct:'1회 위험'};
 function policy(p={}){
  const errors=required(p,['assets','cash','minCash','stockMax','sectorMax','themeMax','lossMax','themeStress']).map(k=>labels[k]+' 미설정');
  for(const k of ['assets','cash','minCash'])if(num(p[k])!==null&&(+p[k]<0||(k==='assets'&&+p[k]===0)))errors.push(labels[k]+' 범위 오류');
  for(const k of ['stockMax','sectorMax','themeMax','lossMax','themeStress','riskPct'])if(num(p[k])!==null&&(+p[k]<=0||+p[k]>100))errors.push(labels[k]+' 0 초과 100 이하 필요');
  /* (v5.9) riskPct(1회 위험 %)는 **필수 목록에 넣지 않는다** — 기존에 저장된 정책이 갑자기
   * 미완료로 바뀌면 매수 전 점검이 통째로 보류된다. 미설정이면 목록이 수량을 내지 않을 뿐이다. */
  if(num(p.assets)!==null&&num(p.cash)!==null&&+p.cash>+p.assets)errors.push('현금이 총자산 초과');
  if(num(p.cash)!==null&&num(p.minCash)!==null&&+p.minCash>+p.cash)errors.push('현재 현금이 최소 현금 미달');
  return {complete:!errors.length,errors};
 }
 function scenario(s={},price){
  const errors=[];const months=num(s.months),base=num(s.base);price=num(price);
  if(!['eps','revenue'].includes(s.method))errors.push('평가모델 선택 필요');
  if(!(months>=1&&months<=36))errors.push('보유기간 1~36개월 필요');
  if(!(base>0))errors.push('양수인 주당 기초값 필요');
  if(!(price>0))errors.push('현재가 없음');
  const date=Date.parse(s.asOf+'T00:00:00Z');
  if(typeof s.source!=='string'||!s.source.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(s.asOf||'')||!Number.isFinite(date)||new Date(date).toISOString().slice(0,10)!==s.asOf||date>Date.now())errors.push('입력 근거·유효한 과거/현재 기준일 필요');
  /* (v5.5) 기초값의 기준일이 오래되면 그 사이 실적이 이미 나왔다 — 15개월(연간 재무 1회 + 분기 1회)을
   * 넘으면 보류한다. 성장은 **기준일부터** 센다(age + 보유기간), 할인은 지금부터 보유기간만. */
  const age=Number.isFinite(date)?Math.max(0,Math.floor((Date.now()-date)/864e5))/365.25:0;   // 경과 일수(정수)
  if(Number.isFinite(date)&&age>15/12)errors.push('기초 재무 기준일이 15개월을 넘었습니다 — 최신 값으로 갱신 필요');
  const warnings=[];
  const rows=[];
  for(const key of ['bear','base','bull']){
   const a=s.cases?.[key]||{},missing=required(a,['growth','pe','discount','dilution',...(s.method==='revenue'?['margin']:[])]);
   if(missing.length){errors.push(({bear:'보수',base:'기준',bull:'낙관'})[key]+' 시나리오 가정 미입력');continue;}
   const g=+a.growth,d=+a.discount,di=+a.dilution,pe=+a.pe,mg=+a.margin;
   if(g<=-100||d<0||di<=-100||pe<=0||(s.method==='revenue'&&(mg<0||mg>100))){errors.push(key+' 가정 범위 오류');continue;}
   if(di<-20||pe>100||g>60)warnings.push(({bear:'보수',base:'기준',bull:'낙관'})[key]+' 가정이 극단적입니다(성장>60% · 만기 PER>100 · 연간 주식수 −20% 미만 중 하나)');
   const pv=y=>{const eps=base*Math.pow((1+g/100)/(1+di/100),age+y)*(s.method==='revenue'?mg/100:1);return {terminal:eps*pe,present:eps*pe/Math.pow(1+d/100,y)};};
   const years=months/12,{terminal,present}=pv(years);
   /* (v5.5) 게이트용 가치는 **보유기간과 무관**해야 한다. 만기 PER을 고정하면 현재가치가 보유기간에
    * 단조로 움직여(g>d면 증가: 1개월 0.7% → 36개월 23%), 기간만 늘려도 통과했다. 허용 범위(1~36개월)
    * 양 끝의 현재가치 중 **작은 값**을 쓴다 — 지수함수라 최솟값은 끝점에 있다. 새 상수 없음. */
   const lo=pv(1/12).present,hi=pv(3).present,presentGate=Math.min(lo,hi);
   if(!Number.isFinite(present)||!Number.isFinite(terminal)||!Number.isFinite(presentGate)){errors.push(key+' 계산 범위 초과');continue;}
   rows.push({key,terminal,present,presentGate,upside:(terminal/price-1)*100,margin:present>0?(1-price/present)*100:null,
     marginGate:presentGate>0?(1-price/presentGate)*100:null,annual:years>0&&terminal>0?(Math.pow(terminal/price,1/years)-1)*100:null,required:d,stress:(present/price-1)*100});
  }
  if(rows.length===3&&!(rows[0].present<=rows[1].present&&rows[1].present<=rows[2].present))errors.push('보수 ≤ 기준 ≤ 낙관 현재가치 순서 확인');
  return {valid:!errors.length,errors,warnings:[...new Set(warnings)],rows:errors.length?[]:rows,months,method:s.method,age};
 }
 function exposure(p,holdings,order){
  const errors=[...policy(p).errors],amount=num(order.amount),assets=num(p.assets),cash=num(p.cash);
  if(!(amount>0))errors.push('매수예정금액 필요');
  if(!order.id||!order.sector||!order.theme)errors.push('종목·업종·공통 테마 분류 필요');
  let invested=0,stock=0,sector=0,theme=0;
  for(const h of holdings){
   if(h.valid===false||num(h.value)===null||num(h.value)<0||!h.sector||!h.theme){errors.push('원장·가격·환율·분류 미확인 보유자산');continue;}
   invested+=+h.value;if(h.id===order.id)stock+=+h.value;if(h.sector===order.sector)sector+=+h.value;if(h.theme===order.theme)theme+=+h.value;
  }
  /* (v5.5) 분모는 **계산값**(현금 + 원장 평가액)이다. v5.4는 입력 총자산과의 차이가 1원을 넘으면
   * 보류했는데, 해외 종목 평가액은 실시간가×환율이라 원 단위로 맞을 수가 없어 보류가 상시화됐다.
   * 입력 총자산은 대사 참고값으로만 쓰고, 상대오차 0.5%를 넘으면 **경고**한다(보류 아님). */
  const warnings=[];
  const total=cash!==null?cash+invested:null;
  const residual=assets!==null&&total!==null?assets-total:null;
  if(residual!==null&&total>0&&Math.abs(residual)/total>0.005)warnings.push('입력 총자산과 현금+원장평가액 차이 '+(residual/total*100).toFixed(1)+'% — 미기록 자산·잔액 갱신 확인');
  if(amount!==null&&cash!==null&&cash-amount<+p.minCash)errors.push('매수 후 최소현금 미달');
  const weights=total>0&&amount!==null?{stock:(stock+amount)/total*100,sector:(sector+amount)/total*100,theme:(theme+amount)/total*100}:{};
  for(const h of holdings){ if(h.valid===false||!(num(h.value)>0)||!(total>0))continue;
    if(num(p.stockMax)!==null&&h.id!==order.id&&h.value/total*100>+p.stockMax)warnings.push('기존 보유 종목이 이미 종목 한도 초과');}
  for(const k of ['stock','sector','theme'])if(num(p[k+'Max'])!==null&&weights[k]>+p[k+'Max'])errors.push(labels[k+'Max']+' 초과');
  // Whole-company failure contribution is a stress, not a probabilistic maximum loss.
  if(num(p.lossMax)!==null&&weights.stock>+p.lossMax)errors.push('해당 종목 전액손실 스트레스가 포트폴리오 스트레스 손실한도 초과');
  const themeLoss=num(p.themeStress)!==null&&num(weights.theme)!==null?weights.theme*+p.themeStress/100:null;
  if(themeLoss!==null&&num(p.lossMax)!==null&&themeLoss>+p.lossMax)errors.push('공통 테마 동반하락 스트레스가 손실한도 초과');
  return {allowed:!errors.length,errors:[...new Set(errors)],warnings:[...new Set(warnings)],weights,themeLoss,residual,total,cashAfter:cash!==null&&amount!==null?cash-amount:null};
 }
 function netReturn(gross,bps){if(num(gross)===null||num(bps)===null||+gross< -100||+bps<0||+bps>=10000)return null;return ((1+ +gross/100)*(1- +bps/10000)/(1+ +bps/10000)-1)*100;}
 /* (v5.5) 사전 고정 계획의 관측값 — **비교지수 달력**으로 진입·청산을 정한다.
  * 진입 = 계획 시각 이후 비교지수 첫 세션의 시가, 청산 = 그로부터 h번째 세션 종가.
  * 종목은 진입 세션 이후 첫 봉의 시가(진입)와 청산 세션 이하 마지막 봉의 종가(청산)를 쓴다.
  * 종목 봉이 청산 세션보다 앞에서 끊겼으면(거래정지·상장폐지·결측) 마지막 종가로 청산하고
  * imputed='lastClose'를 남긴다 — 종목 하나의 봉 결측이 계획 전체를 영구 대기로 만들던 교착 제거.
  * 상장폐지 청산가는 알 수 없으므로 지어내지 않는다(−100%로 두지 않는다) — 플래그 수를 함께 보인다. */
 function lastIdx(t,at){let lo=0,hi=t.length-1,r=-1;while(lo<=hi){const m=(lo+hi)>>1;if(t[m]<=at){r=m;lo=m+1;}else hi=m-1;}return r;}
 function planOutcome(plan,chartOf,now=Date.now()){
  const out={},bn=chartOf(plan.benchmark,true);
  if(!bn?.t?.length||bn.t[0]*1000>plan.at)return {out,bench:null};
  const i=lastIdx(bn.t,plan.at/1000)+1,j=i+plan.horizon-1;
  if(j+1>=bn.t.length||bn.t[j]+86400>now/1000)return {out,bench:null};   // 청산 세션 뒤 봉이 있어야 확정
  const bench={entryAt:bn.t[i],exitAt:bn.t[j],value:(bn.c[j]/bn.o[i]-1)*100};
  for(const r of plan.rows||[]){
   const ch=chartOf(r.symbol,false,r.id),rb=r.bench?chartOf(r.bench,true):null;
   if(!ch?.t?.length||ch.t[0]*1000>plan.at)continue;
   const a=lastIdx(ch.t,bench.entryAt-1)+1;if(a>=ch.t.length||ch.t[a]>bench.exitAt)continue;
   if(ch.t[a]-bench.entryAt>86400)continue;   // 진입 세션에 종목 봉이 없다(진입일 거래정지 등) — 짧아진 창을 섞지 않는다
   const b=lastIdx(ch.t,bench.exitAt);if(b<a)continue;
   const imputed=(b===ch.t.length-1&&ch.t[b]<bench.exitAt-86400)?'lastClose':null;
   const o=ch.o[a],c=ch.c[b];if(!(o>0&&c>0))continue;
   let bv=bench.value;
   if(rb?.t?.length){const x=lastIdx(rb.t,bench.entryAt-1)+1,y=lastIdx(rb.t,bench.exitAt);if(x<rb.t.length&&y>=x&&rb.o[x]>0&&rb.c[y]>0)bv=(rb.c[y]/rb.o[x]-1)*100;}
   out[r.id]={asset:(c/o-1)*100,benchmark:bv,entryAt:bench.entryAt,exitAt:bench.exitAt,benchEntryAt:bench.entryAt,benchExitAt:bench.exitAt,imputed};
  }
  return {out,bench};
 }
 function evaluate(plan,outcomes){
  const pending=[],results=[];let entry=null,exit=null;
  for(const r of plan.rows||[]){const o=outcomes[r.id];
   if(!o||num(o.asset)===null||num(o.benchmark)===null||!(o.entryAt*1000>plan.at)||o.entryAt!==o.benchEntryAt||o.exitAt!==o.benchExitAt||o.exitAt<o.entryAt||false){pending.push(r.id);continue;}
   if(entry!==null&&(entry!==o.entryAt||exit!==o.exitAt)){pending.push(r.id);continue;}
   entry=o.entryAt;exit=o.exitAt;
   const net=netReturn(o.asset,plan.costBps),bench=netReturn(o.benchmark,plan.benchCostBps);
   if(net===null||bench===null){pending.push(r.id);continue;}results.push({...r,net,bench,excess:net-bench,imputed:o.imputed||null});
  }
  /* (v5.5) 비교지수 청산이 확정된 뒤 30일이 지나도 시세를 못 받은 종목은 '미확보'로 분리하고 완결한다
   * (영구 대기 방지). 그 전에는 대기다. */
  const settleAt=(plan.benchExitAt||0)*1000+30*864e5;
  if((pending.length&&!(plan.benchExitAt&&Date.now()>settleAt))||!results.length)return {complete:false,pending,groups:[],note:'고정 모집단의 동일 기간 가격 수익률을 확보하는 중입니다.'};
  const avg=(rows,key)=>rows.reduce((s,r)=>s+r[key],0)/rows.length;
  const pick={all:()=>true,quality:r=>r.quality===true,timing:r=>r.timing===true,rule:r=>r.rule===true,tierHigh:r=>r.tier==='상'||r.tier==='중',tierLow:r=>r.tier==='하'};
  const groups=Object.keys(pick).map(key=>{const rows=results.filter(pick[key]);return {key,n:rows.length,net:rows.length?avg(rows,'net'):null,benchmark:rows.length?avg(rows,'bench'):null,excess:rows.length?avg(rows,'excess'):null};});
  /* 주 지표 = 규칙군 − 같은 코호트 전체(섹터 베타 상쇄). 지수 대비 초과는 보조. n<10이면 해석 불가로 표시. */
  const all=groups[0];for(const g of groups)g.vsAll=(g.n&&all.n)?g.net-all.net:null;
  const imputed=results.filter(r=>r.imputed).length;
  return {complete:true,pending,missing:pending.length,imputed,groups,note:'동일가중 단일 전방 코호트 · 현지통화 가격수익률 · 배당·환율·세금 제외 · 유의성/승률 검증 아님'+(imputed?' · 마지막 종가 청산 '+imputed+'종목':'')+(pending.length?' · 시세 미확보 '+pending.length+'종목 제외':'')};
 }
 return {num,policy,scenario,exposure,netReturn,planOutcome,evaluate};
});
