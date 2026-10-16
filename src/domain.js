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

  return {num,isYMD,accountKind,normCode,instrument,positionKey,debtRatio,tradeError,fingerprint,importPlan,positions,lastIndex,forward,forwardTaint,settingsKey,BACKUP_COLLECTIONS,RESTORE_SKIP,validateBackup,
    hashStr,rngFrom,sampleK,quantile,median,rowOf,crossMedianExcess,SHADOW_ARMS,
    shadowEvents,regimeOf,blockBootstrap,shadowStats,shadowRun,PROMOTE,promoteCheck,preregBody};
});
