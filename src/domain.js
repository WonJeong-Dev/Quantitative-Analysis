/* Pure domain functions. Units, identity and observation time are explicit. */
(function(root,factory){
  const api=factory(); if(typeof module==='object'&&module.exports)module.exports=api;
  else root.QADomain=api;
})(globalThis,function(){
  'use strict';
  const num=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
  const isYMD=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
  const accountKind=a=>String(a||'general').split(':')[0];
  /* (v5.5) 국내 코드는 .KS/.KQ 접미사를 뗀 6자리로 정규화한다 — 005930과 005930.KS가
   * 별개 포지션이 되고 분할 매칭이 빠지던 결함. 보드 매핑(app.js)과 같은 규칙이다. */
  const normCode=(market,code)=>{const c=String(code||'').trim().toUpperCase();return market==='KR'?c.replace(/\.(KS|KQ)$/,''):c;};
  const instrument=t=>[t.market,t.type||'stock',t.code?normCode(t.market,t.code):'name:'+String(t.name||'').trim()].join('|');
  const positionKey=t=>instrument(t)+'|'+(t.account||'general');
  const debtRatio=(manual,auto)=>{
    if(manual&&num(manual.de)!==null){
      if(!['ratio','percent'].includes(manual.deUnit))return null; // legacy manual units are unknowable
      return +manual.de/(manual.deUnit==='percent'?100:1);
    }
    if(auto&&num(auto.deRatio)!==null)return +auto.deRatio;
    // Legacy automatic field came directly from Yahoo's percent-valued debtToEquity.
    return auto&&num(auto.de)!==null?+auto.de/100:null;
  };
  function tradeError(t){
    if(!t||!isYMD(t.date))return '일자를 확인하세요';
    if(!['KR','US'].includes(t.market)||!['stock','etf'].includes(t.type||'stock')||!['buy','sell'].includes(t.side))return '시장·자산·구분을 확인하세요';
    if(!String(t.name||'').trim()||!String(t.code||'').trim())return '종목명과 코드가 필요합니다';
    if(!/^[A-Za-z0-9.^=\-]{1,20}$/.test(t.code))return '종목코드를 확인하세요';
    if(!(num(t.price)>0)||!(num(t.qty)>0))return '단가와 수량은 유한한 양수여야 합니다';
    if(t.sequence!=null&&(!Number.isInteger(+t.sequence)||+t.sequence<1))return '당일 순번은 1 이상의 정수여야 합니다';
    if(!/^(general|isa|pension|irp|cma)(:[^|\n\r]{1,40})?$/.test(t.account||'general'))return '계좌를 확인하세요';
    return null;
  }
  /* (v5.5) 지문에서 당일 순번을 뺀다 — 순번 유무만 다른 같은 체결이 새 거래로 들어가던 결함. */
  const fingerprint=t=>JSON.stringify([positionKey(t),t.date,t.side,+t.qty,+t.price]);
  function importPlan(rows,existing){
    const knownIds=new Set(existing.filter(t=>t.sourceId).map(t=>(t.account||'general')+'|'+t.sourceId));
    const known=new Set(existing.map(fingerprint));
    /* 거래ID가 없는 기존 거래(수동 입력)와 지문이 같으면 거래ID가 있어도 '확인 필요'로 보낸다.
     * v5.4는 sourceId가 있으면 지문 대조를 건너뛰어 수동 입력분과 이중 계상됐다. */
    const manualFp=new Set(existing.filter(t=>!t.sourceId).map(fingerprint));
    const add=[],duplicate=[],invalid=[],candidates=[];
    rows.forEach((r,index)=>{
      if(!r||typeof r!=='object'){invalid.push({index,error:'객체가 아닙니다'});return;}
      const side=r.구분??r.side;
      const t={date:String(r.일자??r.date??''),side:side==='매도'?'sell':side==='매수'?'buy':side,
        market:r.시장??r.market,type:r.유형??r.type??'stock',account:r.계좌??r.account??'general',
        name:String(r.종목명??r.name??'').trim(),code:String(r.코드??r.code??'').trim().toUpperCase(),
        price:num(r.단가??r.price),qty:num(r.수량??r.qty),sequence:num(r.순번??r.sequence),
        sourceId:String(r.sourceId??r.거래ID??'').trim(),snap:null,snapshotStatus:'historical-unverified'};
      const error=tradeError(t); if(error){invalid.push({index,error});return;}
      const sid=t.account+'|'+t.sourceId,fp=fingerprint(t);
      if(t.sourceId&&knownIds.has(sid)){duplicate.push(t);return;}
      if(t.sourceId?manualFp.has(fp):known.has(fp))candidates.push(t); else add.push(t);
      known.add(fp); if(t.sourceId)knownIds.add(sid);
    });
    return {add,duplicate,invalid,candidates};
  }
  function positions(trades,splitFactor){
    const groups=new Map();
    for(const t of trades){const key=positionKey(t);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);}
    return [...groups].map(([key,rows])=>{
      rows=rows.slice().sort((a,b)=>a.date.localeCompare(b.date)||((num(a.sequence)??Infinity)-(num(b.sequence)??Infinity))||String(a.id||'').localeCompare(String(b.id||'')));
      const t=rows[0],p={key,market:t.market,type:t.type||'stock',name:t.name,code:t.code||'',account:t.account||'general',
        qty:0,cost:0,realized:0,buys:0,sells:0,buyQty:0,sellQty:0,sellAmt:0,adj:false,over:false,
        first:t.date,last:t.date,firstBuy:null,lastSell:null,snap:null,snaps:[],ids:[],issues:[],valid:true};
      const days=new Map();
      rows.forEach(t=>{if(!days.has(t.date))days.set(t.date,[]);days.get(t.date).push(t);});
      for(const rs of days.values()){
        if(rs.some(t=>t.side==='buy')&&rs.some(t=>t.side==='sell')&&
          (rs.some(t=>!(num(t.sequence)>0))||new Set(rs.map(t=>+t.sequence)).size!==rs.length))p.issues.push('당일 매매 순서 미확인');
      }
      for(const t of rows){
        p.name=t.name;p.last=t.date;p.ids.push(t.id);
        const f=splitFactor(t),q=+t.qty*f,price=+t.price/f;
        if(!Number.isFinite(q)||!Number.isFinite(price)||q<=0||price<=0){p.issues.push('거래 입력 오류');continue;}
        if(f!==1)p.adj=true;
        if(t.side==='buy'){
          p.qty+=q;p.cost+=q*price;p.buys++;p.buyQty+=q;p.firstBuy??=t.date;
          if(t.snap&&t.snapshotStatus==='observed'){
            p.snap??=t.snap;p.snaps.push({d:t.date,q,px:price,s:t.snap});
          }else p.snapshotIncomplete=true;
        }else{
          const avg=p.qty>0?p.cost/p.qty:0;
          if(q>p.qty+1e-6){p.over=true;p.issues.push('매도 수량이 확인된 보유를 초과');}
          p.realized+=q*(price-avg);p.cost-=q*avg;p.qty-=q;
          p.sells++;p.sellQty+=q;p.sellAmt+=q*price;p.lastSell=t.date;
          if(Math.abs(p.qty)<1e-8){p.qty=0;p.cost=0;}
        }
      }
      p.issues=[...new Set(p.issues)];p.valid=!p.issues.length;
      if(!p.valid){p.cost=null;p.realized=null;p.snap=null;p.snaps=[];}
      return p;
    });
  }
  function lastIndex(times,at){let lo=0,hi=times.length-1,res=-1;while(lo<=hi){let m=(lo+hi)>>1;if(times[m]<=at){res=m;lo=m+1;}else hi=m-1;}return res;}
  // Entry: first regular-session bar opening strictly after the observation.
  // Exit: closing price of the h-th bar, counting entry as bar 1. Never use an unfinished bar.
  // (v5.5) '확정'은 그 뒤에 봉이 하나 더 있는 경우로만 인정한다. 시각(+86400)만 보면
  // 장중에 저장된 부분봉 종가가 청산가로 영구 기록됐다.
  function forward(chart,observedAt,h,now=Date.now()){
    if(!chart||!chart.t||!chart.o||!chart.c||!observedAt||!Number.isInteger(h)||h<1)return null;
    const i=lastIndex(chart.t,observedAt/1000)+1,j=i+h-1;
    if(j+1>=chart.t.length||chart.t[j]+86400>now/1000)return null;
    const a=chart.o[i],b=chart.c[j];if(!(a>0&&b>0&&Number.isFinite(a)&&Number.isFinite(b)))return null;
    return {value:(b/a-1)*100,entryAt:chart.t[i],exitAt:chart.t[j]};
  }
  /* (v5.5) 전방수익률 창 안의 오염 신호. 값을 고치지 않고 '판정 불가'로 둔다.
   *  split: 창 안(진입 초과 ~ 청산 이하)에 분할·병합 사건이 있다
   *  jump : 국내 종목의 일간 종가 변화가 가격제한폭(±30%)을 넘는다 — 조정되지 않은 분할뿐이다 */
  function forwardTaint(chart,entryAt,exitAt,opt){
    opt=opt||{};
    for(const d of (opt.splitDates||[])){const s=Date.parse(d+'T00:00:00Z')/1000;if(s>entryAt-86400&&s<=exitAt)return 'split';}
    if(opt.market==='KR'&&chart&&chart.t&&chart.c){
      const a=lastIndex(chart.t,entryAt),b=lastIndex(chart.t,exitAt);
      // 가격제한폭은 **전일 종가 대비 ±30%**다(비대칭 로그 아님) — 하한가 −30%는 정상 거래다.
      for(let k=Math.max(1,a);k<=b;k++){const x=chart.c[k-1],y=chart.c[k];if(x>0&&y>0){const q=y/x;if(q>1.3+1e-3||q<0.7-1e-3)return 'jump';}}
    }
    return null;
  }
  function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value;}
  function settingsKey(value){return JSON.stringify(stable(value));}
  const BACKUP_COLLECTIONS=['qa_stocks','qa_settings','qa_trades','qa_fx','qa_splits','qa_rights','qa_shrs','qa_cache','qa_gradelog','qa_bench','qa_prereg'];
  /* (v5.5) 복구로 쓰지 않는 컬렉션 — 규칙이 생성 시각·수정을 막는다(판정 로그는 백업에는 남는다). */
  const RESTORE_SKIP=['qa_gradelog'];
  function validateBackupRows(b){
    const bad=[];
    /* 복구 검증은 원장 계산에 **필수인** 필드만 본다(구버전 거래는 코드 없이 종목명만 있을 수 있다 — instrument의 name: 경로). */
    for(const row of (b.collections.qa_trades||[])){const t=row.data;
      if(!isYMD(t.date)||!['buy','sell'].includes(t.side)||!['KR','US'].includes(t.market)||!(num(t.price)>0)||!(num(t.qty)>0)||!(String(t.code||'').trim()||String(t.name||'').trim()))bad.push(row.id+': 거래 필수값');}
    for(const row of (b.collections.qa_gradelog||[])){const d=row.data;if(!/^\d{4}-\d{2}-\d{2}$/.test(String(d.d||''))||typeof d.rv!=='string')bad.push(row.id+': 판정 기록 형식');}
    return bad;
  }
  function validateBackup(b){
    if(!b||b.format!=='qa-board-backup'||b.version!==1||!b.collections||typeof b.collections!=='object')throw Error('지원하지 않는 백업 형식입니다');
    let count=0;
    for(const [col,rows] of Object.entries(b.collections)){
      if(!BACKUP_COLLECTIONS.includes(col)||!Array.isArray(rows))throw Error('알 수 없는 컬렉션');
      const seen=new Set();
      for(const row of rows){
        if(!row||typeof row.id!=='string'||!row.id||row.id.includes('/')||row.id==='.'||row.id==='..'||seen.has(row.id)||!row.data||Array.isArray(row.data)||typeof row.data!=='object')throw Error('문서 형식 또는 중복 ID 오류');
        seen.add(row.id);count++;
      }
    }
    if(count>20000)throw Error('한 번에 복구할 수 있는 문서 수를 초과했습니다');
    const bad=validateBackupRows(b);
    if(bad.length)throw Error('형식이 맞지 않는 문서 '+bad.length+'건: '+bad.slice(0,3).join(' · '));
    return count;
  }
  /* ===================== (v5.6) 그림자 장부 · 횡단면 분모 =====================
   * 명세: docs/SHADOW-5.6.md. 전부 순수함수이고 상수를 하나도 만들지 않는다.
   * 입력은 qa_gradelog 문서 배열뿐이며, 같은 입력에 대해 항상 같은 값을 낸다. */

  /* 결정론적 난수. 플라시보 arm이 같은 로그에서 늘 같은 표본을 뽑아야 재현이 된다. */
  function hashStr(s){let h=2166136261>>>0;s=String(s);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return h>>>0;}
  function rngFrom(seed){let x=(hashStr(seed)||1)>>>0;return function(){x^=x<<13;x>>>=0;x^=x>>>17;x^=x<<5;x>>>=0;return x/4294967296;};}
  function sampleK(arr,k,rng){const a=arr.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));const t=a[i];a[i]=a[j];a[j]=t;}return a.slice(0,Math.max(0,k));}

  const sortNum=a=>a.slice().sort((x,y)=>x-y);
  function quantile(sorted,p){if(!sorted.length)return null;const i=(sorted.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return lo===hi?sorted[lo]:sorted[lo]+(sorted[hi]-sorted[lo])*(i-lo);}
  function median(values){const s=sortNum(values.filter(v=>v!=null&&Number.isFinite(v)));return s.length?quantile(s,0.5):null;}

  /* 문서 자신의 cols로 행을 읽는다 — 스키마가 늘어도 과거 문서가 조용히 밀리지 않는다. */
  function rowOf(doc,id){
    const cs=(doc&&doc.cols)||[],r=((doc&&doc.rows)||{})[id];
    if(!r||!cs.length)return null;
    const o={};for(let i=0;i<cs.length;i++)o[cs[i]]=r[i];return o;
  }
  const marketOf=id=>String(id||'').indexOf('KR')===0?'KR':'US';
  const typeOf=(doc,id)=>((((doc||{}).inputs||{})[id]||{}).cls||{}).type||'stock';

  /* 횡단면 중앙값 대비 초과수익 — 같은 날짜·같은 시장·같은 자산유형.
   * 외부 충격(전쟁·금리)은 모집단 전체를 같은 방향으로 밀므로 중앙값에서 상쇄된다.
   * 참작 규칙이 아니라 분모다 — 자유 파라미터가 0개다(SHADOW-5.6 §1).
   * ★ 저장하지 않는다. 문서 안의 r{h}들만으로 결정되는 순수함수이므로 읽을 때 계산한다. */
  function crossMedianExcess(doc,h){
    const out={},buckets=new Map();
    const fwd=(doc||{}).fwd||{};
    for(const id of Object.keys(fwd)){
      const f=fwd[id]||{},r=f['r'+h];
      if(r==null||!Number.isFinite(r)||f['q'+h])continue;   // 값 없음·오염은 모집단에서 뺀다
      const key=marketOf(id)+'|'+typeOf(doc,id);
      if(!buckets.has(key))buckets.set(key,[]);
      buckets.get(key).push({id,r:+r});
    }
    for(const [key,rows] of buckets){
      const med=median(rows.map(x=>x.r));
      for(const x of rows)out[x.id]={m:+(x.r-med).toFixed(2),mn:rows.length,bucket:key,med:+med.toFixed(2)};
    }
    return out;
  }

  /* arm 정의 — 로그 열만 쓴다. 새 상수 없음(SHADOW-5.6 §2.3).
   *   D 무작위: 그날 A와 같은 개수를 같은 모집단에서 뽑는다 → 영가설 분포
   *   E 동일가중: 전 종목 보유 → '아무것도 안 하기' 벤치마크
   * D·E가 없으면 A·B·C의 숫자는 읽을 수 없다. */
  const SHADOW_ARMS=[
    {key:'A',label:'현행',      note:'tier ∈ {상,중}',      enter:r=>r.tier==='상'||r.tier==='중'},
    {key:'B',label:'캡 해제',    note:'tierNoCap ∈ {상,중}', enter:r=>r.tierNoCap==='상'||r.tierNoCap==='중'},
    {key:'C',label:'전등급',     note:'tier ∈ {상,중,하}',   enter:r=>r.tier==='상'||r.tier==='중'||r.tier==='하'},
    {key:'D',label:'무작위',     note:'플라시보 — A와 같은 개수',sample:true},
    {key:'E',label:'동일가중 보유',note:'벤치마크 — 전 종목',   always:true}
  ];

  /* 진입 사건. 독립 관측 단위는 '등급 진입 이벤트'다 — 같은 종목의 연속된 날은 독립이 아니다.
   *  ① 직전 문서에서 진입 조건이 거짓이었다가 참이 된 전이만 센다
   *  ② 직전 문서에 그 종목 행이 없으면 **판정하지 않는다**(수집 공백을 가짜 진입으로 세지 않는다)
   *  ③ 엠바고 — 같은 종목은 직전 사건의 청산 시각 이후에만 재진입한다 */
  function shadowEvents(docs,arm,h,opt){
    opt=opt||{};
    const events=[],counts={},openUntil=new Map();
    for(let di=0;di<docs.length;di++){
      const doc=docs[di],prev=di>0?docs[di-1]:null,atSec=(doc.at||0)/1000;
      const cand=[];
      for(const id of Object.keys((doc||{}).rows||{})){
        const f=((doc.fwd||{})[id])||{},r=f['r'+h];
        if(r==null||!Number.isFinite(r)||f['q'+h])continue;        // 결과가 없거나 오염이면 사건이 아니다
        const ou=openUntil.get(id);
        if(ou!=null&&atSec<=ou)continue;                            // 엠바고
        /* always(E)와 sample(D)은 진입 조건이 없다. D의 모집단은 그날의 **적격 전체**이고,
         * 거기서 A와 같은 개수를 뽑는 것이 플라시보의 정의다 — 조건을 걸면 무작위가 아니다. */
        if(arm.always||arm.sample){cand.push(id);continue;}
        const now=rowOf(doc,id);
        if(!now||!arm.enter(now))continue;
        if(!prev||!((prev.rows||{})[id]))continue;                  // 직전 관측 없음 → 전이 판정 불가
        const before=rowOf(prev,id);
        if(before&&arm.enter(before))continue;                      // 이미 진입 상태였다
        cand.push(id);
      }
      const want=arm.sample?Math.min(((opt.counts||{})[doc.id])||0,cand.length):cand.length;
      const chosen=arm.sample?sampleK(cand,want,opt.rngFor?opt.rngFor(doc):rngFrom(doc.id||doc.d)):cand;
      counts[doc.id]=chosen.length;
      for(const id of chosen){
        const f=doc.fwd[id];
        events.push({arm:arm.key,id,d:doc.d,docId:doc.id,at:doc.at,market:marketOf(id),type:typeOf(doc,id),
          r:+f['r'+h],x:(f['x'+h]!=null&&Number.isFinite(f['x'+h]))?+f['x'+h]:null,m:null,
          entryAt:f['e'+h]!=null?f['e'+h]:null,exitAt:f['z'+h]!=null?f['z'+h]:null});
        if(f['z'+h]!=null)openUntil.set(id,f['z'+h]);
      }
    }
    return {events,counts};
  }

  /* 국면 — 벤치마크의 **직전** h봉 수익률 부호. 판정 시점에 이미 아는 값이라 선견이 없다.
   * GL_HORIZ의 120을 재사용하므로 새 상수가 아니다(SHADOW-5.6 §2.5). */
  function regimeOf(bench,observedAt,h){
    if(!bench||!bench.t||!bench.c||!observedAt)return null;
    const i=lastIndex(bench.t,observedAt/1000);
    if(i<h)return null;
    const a=bench.c[i-h],b=bench.c[i];
    if(!(a>0&&b>0&&Number.isFinite(a)&&Number.isFinite(b)))return null;
    return b>=a?1:-1;
  }

  /* 이동블록 부트스트랩 — 날짜 단면을 블록으로 리샘플한다.
   * 겹치는 창 때문에 명목 N이 유효 표본을 크게 넘어선다(감사 §3-5). 블록이 그 자기상관을 흡수한다.
   * 점추정만 보고하지 않는다 — 이 표본 크기에서 점추정은 오해만 만든다. */
  function blockBootstrap(events,key,blockLen,iters,rng){
    const byDate={};
    for(const e of events){const v=e[key];if(v==null||!Number.isFinite(v))continue;(byDate[e.d]=byDate[e.d]||[]).push(v);}
    const dates=Object.keys(byDate).sort();
    if(dates.length<2)return null;
    const L=Math.max(1,Math.min(blockLen,dates.length));
    const nb=Math.ceil(dates.length/L),span=Math.max(1,dates.length-L+1),out=[];
    for(let it=0;it<iters;it++){
      const vals=[];
      for(let b=0;b<nb;b++){const s=Math.floor(rng()*span);
        for(let k=s;k<Math.min(s+L,dates.length);k++)for(const v of byDate[dates[k]])vals.push(v);}
      const md=median(vals);if(md!=null)out.push(md);
    }
    if(!out.length)return null;
    const s=sortNum(out);
    return {lo:+quantile(s,0.05).toFixed(2),hi:+quantile(s,0.95).toFixed(2),iters:out.length,blocks:L,dates:dates.length};
  }

  /* 통계. 중앙값을 쓴다 — 주식 수익률은 꼬리가 지배하고 평균은 한 종목이 결정한다.
   * MDE는 **항상 함께** 낸다. 효과크기 옆에 '그 표본으로 검출 가능한 최소 효과'가 없으면
   * '차이 없음'과 '검출 못 함'을 구분할 수 없다(감사 §3-6 ④).
   * 상수 1.645·0.842(z)와 1.253(중앙값 ARE)는 통계 관례이며 §20 (b)에 귀속된다. */
  function shadowStats(events,key,opt){
    opt=opt||{};
    const v=events.map(e=>e[key]).filter(x=>x!=null&&Number.isFinite(x));
    const n=v.length;
    if(!n)return {n:0,uniq:0,dates:0,med:null,q25:null,q75:null,hit:null,mde:null,ci:null};
    const s=sortNum(v),q25=quantile(s,0.25),q75=quantile(s,0.75);
    const dates=new Set(events.map(e=>e.d)).size;
    const sigma=(q75-q25)/1.349||0;                       // 로버스트 산포
    const nEff=Math.max(1,Math.min(n,dates));             // 같은 날짜 군집을 보수적으로 흡수
    const mde=sigma>0?+(2.487*1.253*sigma*Math.sqrt(2/nEff)).toFixed(2):null;
    return {n,uniq:new Set(events.map(e=>e.id)).size,dates,
      med:+quantile(s,0.5).toFixed(2),q25:+q25.toFixed(2),q75:+q75.toFixed(2),
      hit:+(v.filter(x=>x>0).length/n*100).toFixed(1),nEff,mde,
      ci:opt.blockLen?blockBootstrap(events,key,opt.blockLen,opt.iters||400,opt.rng||rngFrom('ci|'+key)):null};
  }

  /* 전체 실행 — 호출부가 하는 일은 문서 배열을 정렬해 넘기는 것뿐이다. */
  function shadowRun(docs,opt){
    opt=opt||{};
    const h=opt.h||60,iters=opt.iters||400;
    const list=(docs||[]).slice().sort((a,b)=>String(a.d).localeCompare(String(b.d)));
    const mAll={};
    for(const doc of list)mAll[doc.id]=crossMedianExcess(doc,h);
    const seedBase=opt.seed||'shadow|'+h;
    const rngFor=doc=>rngFrom(seedBase+'|'+(doc.id||doc.d));
    const out={h,arms:[],docs:list.length};
    let counts=null;
    for(const arm of SHADOW_ARMS){
      const res=shadowEvents(list,arm,h,{counts,rngFor});
      if(arm.key==='A')counts=res.counts;                 // D가 A와 같은 개수를 뽑는다
      for(const e of res.events){const mm=(mAll[e.docId]||{})[e.id];if(mm){e.m=mm.m;e.mn=mm.mn;}
        if(opt.bench)e.regime=regimeOf(opt.bench[e.market],e.at,opt.regimeH||120);}
      const so={blockLen:Math.max(1,Math.round(h/20)),iters,rng:rngFrom(seedBase+'|ci|'+arm.key)};
      out.arms.push({key:arm.key,label:arm.label,note:arm.note,events:res.events,
        x:shadowStats(res.events,'x',so),m:shadowStats(res.events,'m',so),r:shadowStats(res.events,'r',so)});
    }
    return out;
  }

  /* 승급 심사 — 감사 §3-6의 '상수 변경 최소 조건'을 코드로.
   * **통과해도 코드는 아무것도 바꾸지 않는다.** 후보를 제시하고 새 arm을 올릴 뿐이다(§4.2). */
  const PROMOTE={minEvents:30,minUniq:15,minDays:250,phases:2};
  function promoteCheck(armRes,baseRes,opt){
    opt=opt||{};const key=opt.key||'x',reasons=[],a=armRes[key],b=baseRes[key];
    if(!a||!b)return {ok:false,reasons:['통계 없음']};
    if(a.n<PROMOTE.minEvents||b.n<PROMOTE.minEvents)reasons.push('진입 사건 '+a.n+'/'+b.n+' < '+PROMOTE.minEvents);
    if(a.uniq<PROMOTE.minUniq||b.uniq<PROMOTE.minUniq)reasons.push('고유 종목 '+a.uniq+'/'+b.uniq+' < '+PROMOTE.minUniq);
    if((opt.days||0)<PROMOTE.minDays)reasons.push('누적 거래일 '+(opt.days||0)+' < '+PROMOTE.minDays);
    const byReg={};
    for(const e of armRes.events){if(e.regime==null)continue;(byReg[e.regime]=byReg[e.regime]||[]).push(e);}
    const regs=Object.keys(byReg);
    if(regs.length<PROMOTE.phases)reasons.push('국면 '+regs.length+'개 < '+PROMOTE.phases);
    else{
      const signs=[];
      for(const g of regs){
        const st=shadowStats(byReg[g],key,{blockLen:opt.blockLen||3,iters:opt.iters||400,rng:rngFrom('promote|'+g)});
        if(!st.ci){reasons.push('국면 '+g+' CI 산출 불가');continue;}
        if(st.ci.lo<=0&&st.ci.hi>=0)reasons.push('국면 '+g+' CI가 0을 포함 ['+st.ci.lo+', '+st.ci.hi+']');
        else signs.push(st.ci.lo>0?1:-1);
      }
      if(signs.length===regs.length&&new Set(signs).size>1)reasons.push('국면 간 부호 불일치');
    }
    return {ok:reasons.length===0,reasons,delta:(a.med!=null&&b.med!=null)?+(a.med-b.med).toFixed(2):null};
  }

  /* 사전등록 본문 — 정의를 문자열로 굳혀 해시한다. 규칙이 create-only이므로 덮어쓸 수 없고,
   * 나중에 정의가 바뀌면 해시 불일치로 드러난다(SHADOW-5.6 §5). */
  function preregBody(rv){
    const rows={arms:SHADOW_ARMS.map(a=>({key:a.key,label:a.label,note:a.note||(a.sample?'sample':a.always?'always':'')})),
      entry:'직전 문서에서 거짓→참 전이 · 직전 행이 없으면 판정 안 함',
      embargo:'같은 종목은 직전 사건의 청산 시각 이후에만 재진입',
      regime:'벤치마크 직전 120거래일 수익률의 부호',
      portfolio:'동일가중 사건 포트폴리오 · 자본제약·사이징·경로의존 청산 없음'};
    const outcomes={primary:'x60',secondary:'m60',horizons:[20,60,120],
      note:'x=지수 대비 · m=같은 날짜·시장·유형 중앙값 대비. 둘을 나란히 본다'};
    const promote=Object.assign({},PROMOTE,{correction:'holm',placebo:'arm D'});
    const body={id:rv+'_shadow_v1',rows,outcomes,promote};
    return Object.assign({},body,{hash:String(hashStr(settingsKey(body)))});
  }


  /* ==========================================================================
   * (v5.7) 보수 적정가 + 개연성 하락가 — **표시 전용**. 판정·게이트·그림자장부와 분리된다.
   *
   * 왜 기존 fvNow와 따로 두는가. 기존 엔진은 애널 목표가가 주 앵커다(목표가 0.90·신뢰도 대
   * 펀더멘털 0.18). 즉 '재무제표 기준 가격'이 아니라 '전문가 전망에 펀더멘털을 조금 섞은 값'이다.
   * 여기서 만드는 값은 **애널 입력을 한 방울도 쓰지 않는다** — 그래서 기존 값과 독립 정보가 되고,
   * 둘이 어긋날 때 그 어긋남 자체가 읽을 거리가 된다.
   *
   * 새 상수를 만들지 않는다(§20). 정당 멀티플 곡선은 app.js의 fairPER/fairPSR에 **성장 0**을
   * 넣어 호출한 결과를 숫자로 주입받는다 — 곡선을 여기에 다시 적지 않는다(§22-⑲ 로직 복제 금지).
   * 천장도 기존 FUND_CEIL_N을 주입받는다.
   * ========================================================================== */

  /* 표준정규 누적분포. Abramowitz & Stegun 7.1.26의 erf 근사(|오차| < 1.5e-7) —
   * 외부 수식이고 계수는 그 문헌 값이다(§20 외부사실). 자체 튜닝한 상수가 아니다. */
  function normCdf(z){
    if(z==null||!Number.isFinite(z))return null;
    const sgn=z<0?-1:1, x=Math.abs(z)/Math.SQRT2;
    const t=1/(1+0.3275911*x);
    const y=1-((((1.061405429*t-1.453152027)*t+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x);
    return 0.5*(1+sgn*y);
  }
  /* P(H거래일 안에 수준 L에 한 번이라도 닿는다) — 무드리프트 기하브라운운동 최저값 분포.
   * 반사원리: P(min_{t≤T} logS ≤ log L) = 2Φ(ln(L/P)/σ_H).  L≥P면 이미 닿아 있으므로 1.
   * ★ 드리프트를 0으로 둔다. 기대수익률을 넣으면 그것이 곧 전망이고, 전망은 이 값이 피하려는 것이다.
   *   0은 중립 가정이며 '보수적'이라는 주장은 하지 않는다 — 상승 추세주에서는 과대, 하락주에서는 과소다. */
  function touchProb(price,level,annVol,h){
    if(!(price>0)||!(level>0)||!(annVol>0)||!(h>0))return null;
    if(level>=price)return 1;
    const sH=annVol*Math.sqrt(h/252);
    if(!(sH>0))return null;
    const p=2*normCdf(Math.log(level/price)/sH);
    return p==null?null:Math.min(1,Math.max(0,p));
  }
  /* 도달확률이 정확히 p가 되는 수준. touchProb의 역함수.
   * p=0.5면 z=Φ⁻¹(0.75)=0.6744897…(중앙값 — 절반의 경우에 닿는 가격). */
  const Z75=0.6744897501960817;      // Φ⁻¹(0.75). 통계 상수이지 조정 손잡이가 아니다.
  function probFloor(price,annVol,h,p){
    if(!(price>0)||!(annVol>0)||!(h>0))return null;
    const z=(p===0.5)?Z75:invPhi(1-p/2);
    if(z==null)return null;
    return price*Math.exp(-z*annVol*Math.sqrt(h/252));
  }
  /* Φ⁻¹ — Acklam의 유리함수 근사(|오차| < 1.15e-9). 계수는 그 문헌 값이다(§20 외부사실). */
  function invPhi(q){
    if(!(q>0&&q<1))return null;
    const a=[-3.969683028665376e+01,2.209460984245205e+02,-2.759285104469687e+02,1.383577518672690e+02,-3.066479806614716e+01,2.506628277459239e+00];
    const b=[-5.447609879822406e+01,1.615858368580409e+02,-1.556989798598866e+02,6.680131188771972e+01,-1.328068155288572e+01];
    const c=[-7.784894002430293e-03,-3.223964580411365e-01,-2.400758277161838e+00,-2.549732539343734e+00,4.374664141464968e+00,2.938163982698783e+00];
    const d=[7.784695709041462e-03,3.224671290700398e-01,2.445134137142996e+00,3.754408661907416e+00];
    const pl=0.02425, ph=1-pl; let x;
    if(q<pl){const u=Math.sqrt(-2*Math.log(q));
      x=(((((c[0]*u+c[1])*u+c[2])*u+c[3])*u+c[4])*u+c[5])/((((d[0]*u+d[1])*u+d[2])*u+d[3])*u+1);}
    else if(q<=ph){const u=q-0.5,r=u*u;
      x=(((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*u/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);}
    else{const u=Math.sqrt(-2*Math.log(1-q));
      x=-(((((c[0]*u+c[1])*u+c[2])*u+c[3])*u+c[4])*u+c[5])/((((d[0]*u+d[1])*u+d[2])*u+d[3])*u+1);}
    return x;
  }

  /* 방법별 주당가치. 모든 입력은 **시세통화 기준으로 이미 정합된 멀티플**이다 —
   * 주당값을 price/멀티플로 되돌려 쓰기 때문에 통화 환산을 여기서 다시 하지 않는다(§22-⑲).
   * 못 쓰는 방법은 값 대신 **이유**를 남긴다 — 빈 칸과 '0'은 다른 뜻이다(§22-⑫·㉕). */
  function conservativeFV(inp){
    inp=inp||{};
    const price=num(inp.price), q=num(inp.quality);
    const vm=inp.vm||{}, ceil=num(inp.ceil);
    const fPer=num(inp.fairPerNow), fPsr=num(inp.fairPsrNow);
    const perT=num(inp.perTtm), perF=num(inp.perFwd), psr=num(inp.psr), pbr=num(inp.pbr);
    const fcfPS=num(inp.fcfPS);
    const used=[],skipped=[];
    const add=(key,label,value,how)=>{
      if(value==null||!Number.isFinite(value)||!(value>0)){skipped.push({key,label,why:how||'입력 결측'});return;}
      if(ceil!=null&&price>0&&value>price*ceil){skipped.push({key,label,why:'현재가 '+ceil+'배 초과 — 이상치 배제'});return;}
      used.push({key,label,value,how:how||''});
    };
    /* ① 이익력 — 후행·선행 EPS 중 **낮은 쪽**에 성장 0의 정당 PER. 낮은 쪽을 쓰는 것이 보수다.
     *   EPS는 price/PER로 되돌린다. 적자면 PER이 null이라 이 방법이 자동으로 빠진다. */
    const perMax=(perT!=null&&perF!=null)?Math.max(perT,perF):(perT!=null?perT:perF);
    if(!(price>0))                 skipped.push({key:'eps',label:'이익력(EPS)',why:'현재가 없음'});
    else if(fPer==null)            skipped.push({key:'eps',label:'이익력(EPS)',why:'정당 PER 산출 불가(종합점수 결측)'});
    else if(perMax==null)          skipped.push({key:'eps',label:'이익력(EPS)',why:'흑자 EPS 없음'});
    else if(vm.per===0)            skipped.push({key:'eps',label:'이익력(EPS)',why:'이 종목은 PER 판별력 없음(지표신뢰 0)'});
    else add('eps','이익력(EPS)',price/perMax*fPer,'낮은 EPS × 정당PER '+fPer.toFixed(1)+'배');
    /* ② 매출 — **흑자면 쓰지 않는다.** PSR은 이익이 없을 때의 대체이고, 기존 엔진도 같은 분기다.
     *   흑자인데 PSR을 median에 섞으면 마진을 전혀 못 보는 값이 추정치를 끌어당긴다. */
    if(!(price>0))                 skipped.push({key:'rev',label:'매출(PSR)',why:'현재가 없음'});
    else if(perMax!=null)          skipped.push({key:'rev',label:'매출(PSR)',why:'흑자 — 이익력으로 판단(PSR은 적자 대체)'});
    else if(psr==null||fPsr==null) skipped.push({key:'rev',label:'매출(PSR)',why:'주당매출 결측'});
    else if(vm.psr===0)            skipped.push({key:'rev',label:'매출(PSR)',why:'이 종목은 PSR 판별력 없음(지표신뢰 0)'});
    else add('rev','매출(PSR)',price/psr*fPsr,'주당매출 × 정당PSR '+fPsr.toFixed(1)+'배');
    /* ③ 현금흐름 — 주당 FCF를 이익력으로 보고 **같은** 정당 PER을 쓴다. 새 할인율을 만들지 않는다.
     *   FCF는 회계이익보다 손대기 어려워 독립 정보가 되고, 종종 EPS 기준보다 낮게 나온다. */
    if(fcfPS==null)                skipped.push({key:'fcf',label:'현금흐름(FCF)',why:'FCF 또는 주식수 미확인'});
    else if(!(fcfPS>0))            skipped.push({key:'fcf',label:'현금흐름(FCF)',why:'FCF 음수 — 가치 산출 불가'});
    else if(fPer==null)            skipped.push({key:'fcf',label:'현금흐름(FCF)',why:'정당 PER 산출 불가'});
    else add('fcf','현금흐름(FCF)',fcfPS*fPer,'주당FCF × 정당PER '+fPer.toFixed(1)+'배');
    /* ④ 자산 — 장부가(PBR 1.0배). 전통적 하한선이고 배수를 1로 고정하므로 자유 파라미터가 없다.
     *   무형자산 중심 기업은 PBR이 상시 수십 배라 판별력이 없다 — VM_META가 0으로 표시한 종목은 뺀다. */
    if(!(price>0))                 skipped.push({key:'book',label:'자산(장부가)',why:'현재가 없음'});
    else if(pbr==null)             skipped.push({key:'book',label:'자산(장부가)',why:'PBR 결측 — 주당순자산 역산 불가'});
    else if(vm.pbr===0)            skipped.push({key:'book',label:'자산(장부가)',why:'이 종목은 PBR 판별력 없음(무형·자산경량)'});
    else add('book','자산(장부가)',price/pbr,'주당순자산 × 1.0배');

    const fv=used.length?median(used.map(m=>m.value)):null;
    return {fv,n:used.length,used,skipped};
  }

  /* 보수 적정가(가치 축)와 개연성 하락가(확률 축)를 **곱하지 않고 교차**시킨다.
   * 둘은 다른 종류의 양이다 — 하나로 뭉개면 어느 쪽이 제약인지 사라진다(§22-⑫).
   * 제안 지정가 = min(두 값): '가치로 정당하고(≤보수적정가) 닿을 만한(≤중앙도달가) 가장 높은 가격'.
   * 상태 셋을 구분한다:
   *   at   현재가 ≤ 보수적정가            이미 가치 이하
   *   wait 중앙도달가 ≤ 보수적정가 < 현재가  기다리면 절반의 확률로 가치 이하 도달
   *   far  보수적정가 < 중앙도달가 < 현재가  개연성 있는 하락으로도 가치에 못 미친다 */
  function buyPlan(inp){
    inp=inp||{};
    const price=num(inp.price), annVol=num(inp.annVol), h=num(inp.h);
    const c=conservativeFV(inp);
    const out={fv:c.fv,n:c.n,used:c.used,skipped:c.skipped,h:h,annVol:annVol,
               sigmaH:null,probFloor:null,limit:null,limitProb:null,bind:null,state:null,why:null};
    if(annVol!=null&&annVol>0&&h>0&&price>0){
      out.sigmaH=annVol*Math.sqrt(h/252);
      out.probFloor=probFloor(price,annVol,h,0.5);
    }else{
      out.why='변동성 미확보 — 도달확률을 낼 수 없습니다(일간 수익률 21봉 이상 필요)';
    }
    if(c.fv==null){ out.why=(out.why?out.why+' / ':'')+'보수 적정가 산출 불가 — 쓸 수 있는 방법이 없습니다'; return out; }
    if(out.probFloor==null)return out;
    out.limit=Math.min(c.fv,out.probFloor);
    out.bind=(c.fv<=out.probFloor)?'value':'prob';
    out.limitProb=touchProb(price,out.limit,annVol,h);
    out.state=(price<=c.fv)?'at':((out.probFloor<=c.fv)?'wait':'far');
    return out;
  }

  return {num,isYMD,accountKind,normCode,instrument,positionKey,debtRatio,tradeError,fingerprint,importPlan,positions,lastIndex,forward,forwardTaint,settingsKey,BACKUP_COLLECTIONS,RESTORE_SKIP,validateBackup,
    hashStr,rngFrom,sampleK,quantile,median,rowOf,crossMedianExcess,SHADOW_ARMS,
    shadowEvents,regimeOf,blockBootstrap,shadowStats,shadowRun,PROMOTE,promoteCheck,preregBody,
    normCdf,invPhi,touchProb,probFloor,conservativeFV,buyPlan};
});
