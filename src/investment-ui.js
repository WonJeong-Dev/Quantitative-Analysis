/* Explicit assumptions and prospective validation. No orders are submitted here. */
(()=>{
 'use strict';
 const I=QAInvestment,box=document.getElementById('investmentBody'),mask=document.getElementById('maskInvestment');
 let selected='',busy=false;const history=new Map();
 const e=x=>esc(String(x??'')),n=x=>I.num(x),fmt=x=>x==null?'미확인':Number(x).toLocaleString('ko-KR',{maximumFractionDigits:2});
 const defaults={assets:40000000,minCash:0,cash:null,stockMax:null,sectorMax:null,themeMax:null,lossMax:null,themeStress:null,riskPct:null};
 const input=(name,label,value,extra='')=>'<label>'+e(label)+'<input name="'+name+'" type="number" step="any" value="'+e(value??'')+'" '+extra+'></label>';
 const textInput=(name,label,value,type='text')=>'<label>'+e(label)+'<input name="'+name+'" type="'+type+'" value="'+e(value??'')+'"></label>';
 const getPolicy=()=>({...defaults,...S.settings.investmentPolicy});
 const getScenarios=()=>S.settings.investmentScenarios||{};
 const stockIds=()=>Object.keys(S.stocks).sort((a,b)=>String(S.stocks[a].name).localeCompare(String(S.stocks[b].name)));
 function status(text){document.getElementById('investmentStatus').textContent=text;}
 function render(){
  const ids=stockIds();if(!ids.includes(selected))selected=ids[0]||'';
  const p=getPolicy(),s=getScenarios()[selected]||{},k=S.calc[selected]||{},st=S.stocks[selected]||{};
  box.innerHTML='<p>규칙 등급은 후보 선별입니다. 가치 가정과 포트폴리오 위험을 함께 확인하세요. 비중의 분모는 현재 현금 + 원장 평가액(계산값)이며, 입력한 총자산은 대사 참고값입니다(0.5% 넘게 다르면 경고).</p>'
   +'<details open><summary>1. 투자정책 · 원화 기준</summary><form id="investmentPolicyForm"><div class="invest-grid">'
   +input('assets','현재 투자자산 총액 (원)',p.assets,'min="1"')+input('cash','현재 현금 (원화 환산)',p.cash,'min="0"')+input('minCash','최소 현금 (원)',p.minCash,'min="0"')
   +input('stockMax','종목 최대 비중 (%)',p.stockMax,'min="0.01" max="100"')+input('sectorMax','업종 최대 비중 (%)',p.sectorMax,'min="0.01" max="100"')+input('themeMax','공통 테마 최대 비중 (%)',p.themeMax,'min="0.01" max="100"')+input('lossMax','스트레스 손실한도 (%) — 단일 종목 전액손실·테마 동반하락 모두에 적용',p.lossMax,'min="0.01" max="100"')+input('themeStress','공통 테마 동반하락 가정 (%)',p.themeStress,'min="0.01" max="100"')+input('riskPct','1회 거래 위험 (%) — 한 종목이 틀렸을 때 잃기로 한 자산 비율',p.riskPct,'min="0.01" max="100"')
   +'</div><p class="note"><b>1회 거래 위험(%)</b>을 넣으면 목록에 수량이 제안됩니다 — 수량 = (총자산 × 이 비율) ÷ (지정가 × 20거래일 1σ 거리). 변동성이 큰 종목은 자동으로 적게 삽니다. 비워 두면 수량을 제안하지 않습니다(위험 선호는 모형이 정할 수 없습니다). 목록 수량에는 <b>종목 비중 한도</b>와 <b>최소 현금</b>만 반영됩니다 — 업종·테마 한도는 아래 3번에서 확인하세요. 빈 위험한도는 미정으로 저장됩니다. 현금 0원 보유도 허용하지만, 현금이 없으면 추가 매수예정액은 충당되지 않습니다. 입금·매도 후 잔액과 총자산을 갱신하세요. 새 계좌·미기록 자산이 있으면 비중 판정을 보류합니다.</p><button class="btn" type="submit">정책 저장</button></form></details>'
   +'<details open><summary>2. 종목별 시나리오 · 보유기간 1개월~3년</summary><label>종목<select id="investmentStock">'+ids.map(id=>'<option value="'+e(id)+'" '+(id===selected?'selected':'')+'>'+e(S.stocks[id].name||id)+'</option>').join('')+'</select></label>'
   +'<p>현재가 '+fmt(k.price)+' '+e(k.qcur||(st.market==='KR'?'KRW':'USD'))+' · 기존 휴리스틱 추정가와 별도로 계산합니다. 주당 값은 현재 거래되는 주식/ADR 1주 기준·시세 통화로 입력하세요.</p>'
   +(assetType(st)==='etf'?'<p class="lgalert">ETF에는 기업 EPS·매출 시나리오를 적용하지 않습니다. 포트폴리오 비중 점검만 사용하세요.</p>':'')
   +'<form id="investmentScenarioForm"><div class="invest-grid"><label>평가모델<select name="method"><option value="eps" '+(s.method!=='revenue'?'selected':'')+'>정상화 이익 × PER</option><option value="revenue" '+(s.method==='revenue'?'selected':'')+'>매출 → 순이익률 × PER</option></select></label>'
   +input('months','예상 보유기간 (개월)',s.months,'min="1" max="36"')+input('base','주당 정상화 연간 이익 또는 연간 매출',s.base,'min="0"')
   +textInput('asOf','기초 재무 기준일',s.asOf,'date')+textInput('source','근거 (공시·정상화 조정·통화/ADR 확인)',s.source)
   +textInput('sector','위험관리 업종',s.sector||st.sector)+textInput('theme','공통 테마 (예: AI 설비투자)',s.theme)+'</div>'
   +'<p class="note">적자 전환 기업은 매출 모델에 순이익률 가정을 명시하세요. 성장률은 총이익/총매출 기준이며 주식수 희석을 별도 반영합니다. EPS 성장률을 그대로 넣으면 희석을 중복 차감할 수 있습니다. 1개월 평가는 실적 모델의 설명력이 약하며, 실적·정책 이벤트를 별도 확인해야 합니다.</p><div class="invest-cases">'
   +['bear','base','bull'].map((key,i)=>{const c=s.cases?.[key]||{};return '<fieldset><legend>'+['보수','기준','낙관'][i]+'</legend>'+input(key+'_growth','연간 총이익/매출 성장률 (%)',c.growth)+input(key+'_pe','만기 PER (배)',c.pe,'min="0.01"')+input(key+'_discount','연간 요구수익률 (%)',c.discount,'min="0"')+input(key+'_dilution','연간 주식수 증가율 (%)',c.dilution)+input(key+'_margin','만기 순이익률 (매출 모델만, %)',c.margin,'min="0" max="100"')+'</fieldset>';}).join('')
   +'</div><button class="btn" type="submit">시나리오 저장·계산</button></form><div id="investmentScenarioResult"></div></details>'
   +'<details open><summary>3. 매수 전 집중도 확인</summary><form id="investmentOrderForm">'+input('amount','매수예정금액 (수수료 포함, 원)','', 'min="1"')+'<button class="btn" type="submit">비중·보류 사유 확인</button></form><div id="investmentRiskResult"></div><p class="note">로그인한 계정의 모든 원장 계좌를 합산합니다. 업종이 달라도 같은 테마면 함께 합산하며, ETF 내부 중복은 자동 분해하지 않습니다. 공통 테마 하락 가정은 그 테마 전체가 함께 하락하고 다른 자산은 그대로인 스트레스입니다. 종목 전액손실도 별도로 한도와 비교합니다. 전체 포트폴리오 상관·유동성·갭 하락은 별도 위험입니다. 한도 통과가 손실 최소화의 보증은 아닙니다.</p></details>'
   +'<details><summary>4. 사전 고정 전방 검증 · 비용 포함</summary><p>현재 모집단과 규칙·신호를 고정합니다. 이후 첫 거래일 시가 진입, 선택 거래일 종가 청산을 비교합니다. 단일시장·동일가중, 전체/품질만/타이밍만/복합 규칙과 지수를 함께 봅니다.</p><form id="investmentPlanForm"><div class="invest-grid"><label>시장<select name="market"><option value="US">미국 · S&P 500</option><option value="KR">한국 · KOSPI</option></select></label><label>보유 거래일<select name="horizon"><option value="20">20일 (약 1개월)</option><option value="60">60일</option><option value="120">120일</option><option value="252">252일 (약 1년)</option><option value="504">504일 (약 2년)</option><option value="756">756일 (약 3년)</option></select></label>'
   +input('costBps','주식 편도 비용 (수수료+슬리피지, bp)','', 'min="0" max="9999" required')+input('benchCostBps','비교지수 편도 가정 비용 (bp)','', 'min="0" max="9999" required')+'</div><p class="note">1bp=0.01%. 0도 직접 입력해야 합니다. 가격 수익률로 배당·세금·원화 환산은 제외됩니다. 지수는 직접 거래 가능한 상품이 아닙니다. 장기 검증은 최대 5년 가격 이력을 별도로 조회하며, 처음 완성된 관측값을 보존합니다. 모집단에 상장폐지·거래정지가 생겨도 제외하지 않고 미확보로 표시합니다.</p><button class="btn" type="submit">현재 조건으로 검증 시작</button></form><button class="btn" id="investmentEvaluate" type="button">검증 시세 조회·완료값 보존</button> <button class="btn" id="investmentExport" type="button">가정·검증 JSON 다운로드</button><div id="investmentPlanResults"></div></details>';
  box.querySelector('#investmentStock').addEventListener('change',ev=>{selected=ev.target.value;render();});
  box.querySelector('#investmentPolicyForm').addEventListener('submit',savePolicy);
  box.querySelector('#investmentScenarioForm').addEventListener('submit',saveScenario);
  box.querySelector('#investmentOrderForm').addEventListener('submit',checkOrder);
  box.querySelector('#investmentPlanForm').addEventListener('submit',startPlan);
  box.querySelector('#investmentEvaluate').addEventListener('click',refreshEvaluation);
  box.querySelector('#investmentExport').addEventListener('click',download);
  showScenario();showPlans();
 }
 async function saveSetting(key,value){
  if(!S.uid)throw Error('로그인 필요');const uid=S.uid;
  await D('qa_settings/global').set({[key]:value},{merge:true});
  if(S.uid!==uid)throw Error('계정이 변경되었습니다');S.settings[key]=value;
 }
 async function guarded(fn){if(busy)return;busy=true;try{await fn();}catch(err){status('저장/계산 실패: '+err.message);}finally{busy=false;}}
 function savePolicy(ev){ev.preventDefault();guarded(async()=>{const p=Object.fromEntries([...new FormData(ev.target)].map(([k,v])=>[k,n(v)]));
  const problems=I.policy(p).errors.filter(x=>!x.includes('미설정'));if(problems.length)throw Error(problems.join(' · '));
  await saveSetting('investmentPolicy',p);status('정책 저장됨'+(I.policy(p).complete?'':' · 미정 한도가 있어 매수 전 점검은 보류 상태입니다'));});}
 function saveScenario(ev){ev.preventDefault();guarded(async()=>{const d=Object.fromEntries(new FormData(ev.target)),s={method:d.method,months:n(d.months),base:n(d.base),asOf:d.asOf,source:d.source,sector:d.sector.trim(),theme:d.theme.trim(),cases:{}};
  for(const key of ['bear','base','bull'])s.cases[key]=Object.fromEntries(['growth','pe','discount','dilution','margin'].map(f=>[f,n(d[key+'_'+f])]));
  // Drafts are saved too; invalid values never produce a valuation.
  s.savedAt=Date.now();await saveSetting('investmentScenarios',{...getScenarios(),[selected]:s});showScenario();status('가정 저장됨 · 아래 계산 가능 여부를 확인하세요');});}
 function showScenario(){const s=getScenarios()[selected]||{},k=S.calc[selected]||{},r=I.scenario(s,k.price),el=box.querySelector('#investmentScenarioResult');
  if(assetType(S.stocks[selected]||{})==='etf'){el.textContent='ETF 기업가치 계산 제외';return;}
  el.innerHTML=!r.valid?'<p>평가 보류: '+e(r.errors.join(' · '))+'</p>':(r.warnings.length?'<p class="lgalert">'+e(r.warnings.join(' · '))+'</p>':'')+'<div class="invest-cases">'+r.rows.map((x,i)=>'<div class="evidence-card"><b>'+['보수','기준','낙관'][i]+'</b><p>할인 현재가치(보유 '+fmt(r.months)+'개월) '+fmt(x.present)+'<br>만기 추정가 '+fmt(x.terminal)+'<br>기대 연수익률 '+fmt(x.annual)+'% · 요구 '+fmt(x.required)+'%<br><b>판정용 현재가치(기간 불변)</b> '+fmt(x.presentGate)+' · 할인율 '+fmt(x.marginGate)+'%</p></div>').join('')+'</div><p>판정용 현재가치 = 1개월·36개월 두 끝에서 계산한 현재가치 중 작은 값 — 보유기간을 바꿔 결과를 움직일 수 없게 합니다. 성장은 기초 재무 기준일부터 셉니다. 손실 하한·수익 보장이 아닙니다. 배당 미포함, 보수 시나리오보다 더 나쁜 결과도 가능합니다.</p>';
 }
 function checkOrder(ev){ev.preventDefault();const amount=n(new FormData(ev.target).get('amount')),sc=getScenarios(),s=sc[selected]||{},k=S.calc[selected]||{},p=getPolicy();
  const holdings=positions().filter(h=>!h.valid||h.qty>0).map(h=>{const st=S.stocks[h.stockId]||{},sx=sc[h.stockId]||{},q=S.calc[h.stockId]||{},cur=q.qcur||(st.market==='KR'?'KRW':st.market==='US'?'USD':null),fx=fxOf(cur,'KRW'),rate=cur==='KRW'?true:(S.fx[cur+'KRW']?.ts&&Date.now()-S.fx[cur+'KRW'].ts<3*864e5);
   return {id:h.stockId,value:h.mval!=null&&fx!=null?h.mval*fx:null,valid:h.valid&&!q.dataStale&&!q.priceAnomaly&&!!rate,sector:sx.sector||st.sector,theme:sx.theme};});
  const r=I.exposure(p,holdings,{id:selected,amount,sector:s.sector||S.stocks[selected]?.sector,theme:s.theme});
  const why=[...r.errors];if(!S.settings.investmentPolicy)why.push('정책 미저장');
  /* (v5.5) 매수 대상 종목의 시세도 보유 종목과 같은 신선도·정합 조건을 요구한다. */
  if(k.dataStale)why.push('선택 종목 시세 낡음');if(k.priceAnomaly)why.push('선택 종목 가격 이상 신호');
  const d=classifyDetail(k);if(!d.tier)why.push('규칙 후보 조건 미충족');if(d.downtrend)why.push('하락추세: 신규 매수 검토 보류');
  if(assetType(S.stocks[selected]||{})!=='etf'){
   const v=I.scenario(s,k.price);if(!v.valid)why.push('시나리오 평가 미완료');else if(!(v.rows[0].marginGate>0))why.push('보수적 현재가치(기간 불변) 대비 할인 없음');
   if(k.earnDays==null||k.earnDays<=2)why.push('다가오는 실적 일정 확인 필요(G9와 같은 조건)');
  }
  box.querySelector('#investmentRiskResult').innerHTML='<p><b>'+e(why.length?'검토 보류':'입력한 한도 내 검토 가능 (매수 보장 아님)')+'</b></p><p>매수 후 종목 '+fmt(r.weights.stock)+'% · 업종 '+fmt(r.weights.sector)+'% · 공통 테마 '+fmt(r.weights.theme)+'% (분모: 현금+원장평가 '+fmt(r.total)+'원)<br>공통 테마 스트레스 손실 '+fmt(r.themeLoss)+'%<br>잔여 현금 '+fmt(r.cashAfter)+'원 · 입력 총자산과의 차이 '+fmt(r.residual)+'원</p><p>'+e([...new Set(why)].join(' · '))+'</p>'+(r.warnings&&r.warnings.length?'<p class="lgalert">'+e(r.warnings.join(' · '))+'</p>':'');
 }
 function chartOf(sym,isBench,id){if(isBench)return history.get(sym)||(sym===BENCH.US?S.bench.US:sym===BENCH.KR?S.bench.KR:null);return history.get(sym)||(id&&S.cache[id]);}
 function outcomeFull(plan){return I.planOutcome(plan,chartOf);}
 function outcome(plan){return outcomeFull(plan).out;}
 function report(plan){if(plan.outcomes)return I.evaluate(plan,plan.outcomes);const o=outcomeFull(plan);return I.evaluate(o.bench?{...plan,benchExitAt:o.bench.exitAt}:plan,o.out);}
 function refreshEvaluation(){guarded(async()=>{
  const uid=S.uid;if(!uid)throw Error('로그인 필요');const plans=S.settings.investmentPlans||[],symbols=[...new Set(plans.filter(p=>!p.outcomes).flatMap(p=>[p.benchmark,...p.rows.map(r=>r.symbol),...p.rows.map(r=>r.bench)]).filter(Boolean))];let fetched=0,failed=0;
  for(const sym of symbols){if(S.uid!==uid)throw Error('계정 변경');status('검증 가격 조회 '+(++fetched)+'/'+symbols.length);try{const ch=await fetchChart(sym,'5y');if(!ch?.t?.length)throw Error('시세 없음');if(ch.via==='public')throw Error('공개 프록시 값은 동결하지 않음');history.set(sym,ch);}catch{failed++;history.delete(sym);}}
  let saved;
  await db.runTransaction(async tx=>{if(S.uid!==uid)throw Error('계정 변경');const ref=D('qa_settings/global'),snap=await tx.get(ref),data=snap.exists?snap.data():{};
   saved=(data.investmentPlans||[]).map(p=>{if(p.outcomes)return p;const f=outcomeFull(p),pp=f.bench?{...p,benchExitAt:f.bench.exitAt}:p;return I.evaluate(pp,f.out).complete?{...pp,outcomes:f.out,evaluatedAt:Date.now(),dataSource:'Yahoo chart; benchmark calendar; first completed observation; price return'}:p;});
   const next={...data,investmentPlans:saved};if(new TextEncoder().encode(JSON.stringify(next)).length>800000)throw Error('설정 저장 용량 확인 필요');tx.set(ref,next);});
  if(S.uid!==uid)throw Error('계정 변경');S.settings.investmentPlans=saved;showPlans();status('조회 완료'+(failed?' · '+failed+'개 조회 실패':'')+' · 완성된 관측은 최초 값으로 보존합니다.');
 });}
 function showPlans(){const plans=S.settings.investmentPlans||[];box.querySelector('#investmentPlanResults').innerHTML=plans.length?plans.map(p=>{const r=report(p);return '<article class="evidence-card"><b>'+e(p.market+' '+p.horizon+'일 · '+new Date(p.at).toLocaleDateString('ko-KR')+' · '+p.rule)+'</b><p>'+e(r.note)+'</p>'+(r.complete?r.groups.map(g=>'<p'+(g.n<10?' style="opacity:.55"':'')+'>'+e(({all:'전체',quality:'품질만 Q≥60',timing:'타이밍만 RSI·%B 하단 + 추세 확인',rule:'복합 규칙(상·중·하)',tierHigh:'등급 상·중',tierLow:'등급 하'})[g.key])+': '+g.n+'종목 · 순수익 '+fmt(g.net)+'% · <b>전체 대비 '+(g.key==='all'?'—':fmt(g.vsAll)+'%p')+'</b> · 지수 대비 '+fmt(g.excess)+'%p'+(g.n<10?' · 해석 불가(n<10)':'')+'</p>').join('')+'<p class="note">주 지표는 같은 코호트 전체 대비 차이입니다(관심목록 구성·섹터 베타 상쇄). 지수 대비 초과는 보조 지표입니다.</p>':'<p>검증 대기/자료 미확보 '+r.pending.length+'/'+p.rows.length+'종목</p>')+(r.complete&&!p.archived?'<button class="btn sm" type="button" data-plan-archive="'+e(p.id)+'">완료 계획 보관(목록에서 이동)</button>':'')+'</article>';}).join(''):'<p>사전 고정 검증이 아직 없습니다. 기존 로그를 신규 사전 검증으로 소급하지 않습니다.</p>';}
 function startPlan(ev){ev.preventDefault();guarded(async()=>{
  const d=Object.fromEntries(new FormData(ev.target)),market=d.market,costBps=n(d.costBps),benchCostBps=n(d.benchCostBps);
  if(costBps===null||benchCostBps===null||costBps<0||benchCostBps<0||costBps>=10000||benchCostBps>=10000)throw Error('편도 비용 확인 필요');
  if(!['US','KR'].includes(market)||![20,60,120,252,504,756].includes(+d.horizon))throw Error('시장·기간 선택 오류');
  if(sumBusy||Q.active||Q.items.length)throw Error('진행 중인 데이터 조회가 끝난 뒤 시작하세요');
  const ids=stockIds().filter(id=>S.stocks[id].market===market&&assetType(S.stocks[id])!=='etf');if(!ids.length)throw Error('검증할 주식 없음');
  if(ids.some(id=>!S.calc[id]||S.calc[id].dataStale))throw Error('해당 시장 모집단의 시세를 모두 확보한 뒤 시작하세요');
  /* (v5.5) 점수 입력이 불완전한 종목도 모집단('전체')에는 넣는다 — v5.4는 전부 완전해야 시작할 수 있어,
   * 시작하려면 자료가 빈약한 종목(대개 소형·부진주)을 지워야 했다(모집단이 좋은 쪽으로 걸러짐).
   * 불완전 종목은 규칙군·품질군·타이밍군에서만 빠지고 사유가 계획에 동결된다. */
  const complete=k=>!(k.priceAnomaly||k.qMissW||k.aMissW||k.qInputMissing?.length||n(k.quality)===null||n(k.attract)===null);
  /* 계획 시각 = max(기기 시계, 모집단 최신 가격 시각) — 기기 시계가 늦으면 이미 반영된 가격으로 과거 봉에 진입했다. */
  const at=Math.max(Date.now(),...ids.map(id=>(S.calc[id].priceTs||0)*1000));
  const rows=ids.map(id=>{const k=S.calc[id],ok=complete(k),c=classifyDetail(k),rl=k.rsiLo??30,rh=k.rsiHi??70,sym=S.stocks[id].symbol||'';return {id,symbol:sym,name:S.stocks[id].name||id,
   bench:market==='KR'&&/\.KQ$/i.test(sym)?'^KQ11':null,inputsComplete:ok,
   quality:ok&&k.quality>=60,timing:ok&&k.rsi!=null&&k.pB!=null&&k.rsi<=rl+(rh-rl)*.35&&k.pB<=.3&&!c.downtrend,rule:ok&&!!c.tier,Q:k.quality??null,A:k.attract??null,tier:ok?(c.tier||null):null,basis:{rsi:k.rsi??null,pB:k.pB??null,rsiLo:rl,rsiHi:rh,downtrend:c.downtrend,gates:c.gates.map(([label,pass,code])=>({label,pass,code})),qParts:k.qParts||{},excluded:ok?null:'점수 입력 불완전'}};});
  const plan={id:'prospective-'+at,at,market,benchmark:BENCH[market],horizon:+d.horizon,costBps,benchCostBps,rule:RULE_VER,settings:glSettingsKey(),rows,method:'frozen-universe-bench-calendar-v2'};
  const uid=S.uid;if(!uid)throw Error('로그인 필요');let saved;
  await db.runTransaction(async tx=>{if(S.uid!==uid)throw Error('계정 변경');const ref=D('qa_settings/global'),snap=await tx.get(ref),data=snap.exists?snap.data():{},plans=data.investmentPlans||[];
   /* (v5.5) 한도는 **진행 중** 계획만 센다(완료분은 보관 컬렉션으로 옮길 수 있다). 겹침 차단은
    * 같은 시장·같은 기간 길이의 미완료 계획으로 좁힌다 — 756일 계획 하나가 그 시장을 3년간 잠갔다. */
   if(plans.filter(p=>!p.outcomes).length>=10)throw Error('진행 중 검증 10개 한도');
   if(plans.some(p=>p.market===market&&p.horizon===+d.horizon&&!p.outcomes&&!report(p).complete))throw Error('같은 시장·같은 기간의 이전 검증이 미완료입니다. 겹치는 표본을 새 독립 검증으로 만들지 않습니다');
   saved=[...plans,plan];const next={...data,investmentPlans:saved};if(new TextEncoder().encode(JSON.stringify(next)).length>800000)throw Error('설정 저장 한도에 근접했습니다. 검증 JSON을 보관하세요');tx.set(ref,next);});
  if(S.uid!==uid)throw Error('계정 변경');S.settings.investmentPlans=saved;showPlans();status('규칙·모집단·비용 고정됨. 이후 거래일이 쌓이면 결과를 확인할 수 있습니다.');
 });}
 function download(){const plans=S.settings.investmentPlans||[],payload={format:'qa-investment-review',version:1,exportedAt:new Date().toISOString(),policy:getPolicy(),scenarios:getScenarios(),plans:plans.map(p=>({...p,evaluation:report(p)})),limitations:'현지통화 가격수익률. 배당·환율·세금 제외. 단일 코호트는 통계적 정확성의 증거가 아닙니다.'};const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='qa-investment-'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function open(id){if(id)selected=id;render();status('입력 가정과 미확인 항목을 먼저 확인하세요');mask.classList.add('on');}
/* (v5.5) 완료 계획 보관 — qa_prereg/{id}에 **생성만** 하고(규칙이 수정·삭제를 막는다), 활성 목록에서 뺀다. */
 function archivePlan(id){guarded(async()=>{const uid=S.uid;if(!uid)throw Error('로그인 필요');let saved;
  await db.runTransaction(async tx=>{const ref=D('qa_settings/global'),snap=await tx.get(ref),data=snap.exists?snap.data():{},plans=data.investmentPlans||[],p=plans.find(x=>x.id===id);
   if(!p||!p.outcomes)throw Error('완료된 계획만 보관할 수 있습니다');const aref=D('qa_prereg/'+id),a=await tx.get(aref);
   if(!a.exists)tx.set(aref,{...p,archivedAt:Date.now()});saved=plans.filter(x=>x.id!==id);tx.set(ref,{...data,investmentPlans:saved});});
  if(S.uid!==uid)throw Error('계정 변경');S.settings.investmentPlans=saved;showPlans();status('보관했습니다 · 전체 백업에 qa_prereg로 포함됩니다');});}
 box.addEventListener('click',ev=>{const b=ev.target.closest('[data-plan-archive]');if(b)archivePlan(b.dataset.planArchive);});
 document.getElementById('btnInvestment').addEventListener('click',()=>open());
 document.addEventListener('click',ev=>{const b=ev.target.closest('[data-invest-id]');if(b)open(b.dataset.investId);});
})();
