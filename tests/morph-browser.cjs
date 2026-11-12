/* (v6.15) 거래기록 '바뀐 곳만 고치기'(morphInto) — **실제 브라우저 DOM**에서 검사한다.
 *
 * 왜 브라우저인가: template 파싱(표의 암묵 tbody 포함), 노드 동일성, MutationObserver 기록,
 * 입력칸의 value 속성/현재값 구분은 스텁으로 흉내 내면 검사가 아니라 가정이 된다.
 * 실행: QA_PLAYWRIGHT=<playwright 경로> node tests/morph-browser.cjs
 *       (경로를 안 주면 require('playwright') — Chromium이 있는 환경에서 돈다)
 * 오프라인 스위트(verify.cjs)에는 넣지 않는다 — 브라우저 검사는 따로 돈다(tests/browser.cjs와 같은 범주). */
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.QA_PLAYWRIGHT||'playwright');
const src=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
const piece=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)+a.length));
const MORPH=piece('const MORPH_KEEP=','function renderSoon(){');
if(!/function morphInto/.test(MORPH)){ console.error('morphInto 구간 미발견'); process.exit(2); }

(async()=>{
 const browser=await chromium.launch();
 const page=await browser.newPage();
 await page.setContent('<!doctype html><meta charset="utf-8"><div id="host"></div><div id="ref"></div><input id="outside">');
 await page.addScriptTag({content:MORPH});
 const R=await page.evaluate(()=>{
  const res=[]; const ok=(n,c,x)=>res.push({n,c:!!c,x:x===undefined?undefined:String(x).slice(0,160)});
  const host=document.getElementById('host'), ref=document.getElementById('ref');
  const watch=(fn)=>{ const recs=[]; const mo=new MutationObserver(r=>recs.push(...r));
    mo.observe(host,{childList:true,attributes:true,characterData:true,subtree:true}); fn();
    recs.push(...mo.takeRecords()); mo.disconnect(); return recs; };
  /* 결과 비교는 **속성을 정렬한 트리**로 한다. 기존 요소에 속성이 새로 붙으면 맨 뒤에 붙어
   * 직렬화 순서만 innerHTML과 달라진다(무작위 대조 1차에서 4건 — 전부 이 경우였다). 속성 순서는
   * 화면·CSS·동작에 영향이 없으므로 같은 것으로 본다. 다만 '순서만 다름'은 따로 세어 보인다 —
   * 비교를 느슨하게 해서 다른 차이가 숨지 않게 하려는 것이다. */
  const canon=n=>{ if(n.nodeType===3)return 'T'+JSON.stringify(n.nodeValue);
    if(n.nodeType===8)return 'C'+JSON.stringify(n.nodeValue);
    if(n.nodeType===11||n===host||n===ref)return [...n.childNodes].map(canon).join('');
    const at=[...n.attributes].map(a=>a.name+'='+JSON.stringify(a.value)).sort().join(' ');
    return '<'+n.tagName+(at?' '+at:'')+'>'+[...n.childNodes].map(canon).join('')+'</'+n.tagName+'>'; };
  let orderOnly=0;
  const same=(html)=>{ ref.innerHTML=html; const eq=canon(host)===canon(ref);
    if(eq&&host.innerHTML!==ref.innerHTML)orderOnly++; return eq; };
  const ledger=(v1,v2,w)=>'<div class="lgsec"><span class="t">보유</span></div>'
   +'<div class="lgscroll"><table class="lgtbl"><tr><th>종목</th><th>평가액</th></tr>'
   +'<tr data-id="A"><td>삼성전자</td><td class="num up">'+v1+'</td></tr>'
   +'<tr data-id="B"><td>SK하이닉스</td><td class="num dn">'+v2+'</td></tr></table></div>'
   +'<div class="bar"><i style="width:'+w+'%;background:#2f9e63"></i></div>'
   +'<button class="btn" data-lgact="sell">매도</button>';

  // ── 1. 같은 내용이면 아무것도 안 건드린다
  host.innerHTML=ledger('₩39,468,569','−₩5,373,169',89.85);
  const all0=[...host.querySelectorAll('*')];
  let rec=watch(()=>morphInto(host,ledger('₩39,468,569','−₩5,373,169',89.85)));
  ok('1 같은 내용 → 변경 기록 0건', rec.length===0, rec.length);
  ok('1 같은 내용 → 노드가 그대로', [...host.querySelectorAll('*')].every((e,i)=>e===all0[i]));

  // ── 2. 가격 틱 — 글자만 바뀐다 (실측: 차이 8개)
  const trB=host.querySelector('tr[data-id="B"]'), btn=host.querySelector('.btn');
  rec=watch(()=>morphInto(host,ledger('₩39,466,869','−₩5,374,869',89.86)));
  const kinds=rec.reduce((m,r)=>(m[r.type]=(m[r.type]||0)+1,m),{});
  ok('2 가격 틱 → childList 0건 (ux.js 관찰자를 깨우지 않는다)', !kinds.childList, JSON.stringify(kinds));
  ok('2 가격 틱 → 글자 2건 + style 1건만', kinds.characterData===2&&kinds.attributes===1, JSON.stringify(kinds));
  ok('2 마우스 아래 행이 같은 객체 (hover가 꺼지지 않는다)', host.querySelector('tr[data-id="B"]')===trB);
  ok('2 버튼이 같은 객체 (transition이 다시 돌지 않는다)', host.querySelector('.btn')===btn);
  ok('2 결과가 innerHTML과 같다', same(ledger('₩39,466,869','−₩5,374,869',89.86)));

  // ── 3. 스크롤이 저절로 유지된다
  const sc=host.querySelector('.lgscroll'); sc.style.cssText='';
  const st=document.createElement('style'); st.textContent='#host .lgscroll{max-width:80px;overflow-x:auto}#host table{width:600px}'; document.head.appendChild(st);
  sc.scrollLeft=150; const s0=sc.scrollLeft;
  morphInto(host,ledger('₩1','₩2',50));
  ok('3 스크롤러가 같은 객체', host.querySelector('.lgscroll')===sc);
  ok('3 가로 위치 유지 ('+s0+')', s0>0&&host.querySelector('.lgscroll').scrollLeft===s0, host.querySelector('.lgscroll').scrollLeft);
  st.remove();

  // ── 4. ux.js가 붙인 접근성 속성은 지우지 않는다 · 다른 속성은 innerHTML처럼 지운다
  host.innerHTML='<div class="lgscroll" data-x="1"><span>a</span></div>';
  const d=host.firstChild; d.tabIndex=0; d.setAttribute('role','region'); d.setAttribute('aria-label','가로로 스크롤하는 상세 표');
  morphInto(host,'<div class="lgscroll"><span>b</span></div>');
  ok('4 tabindex·role·aria-label 유지', d.getAttribute('tabindex')==='0'&&d.getAttribute('role')==='region'&&d.getAttribute('aria-label')==='가로로 스크롤하는 상세 표');
  ok('4 그 밖의 사라진 속성은 지운다', !d.hasAttribute('data-x'));
  morphInto(host,'<div class="lgscroll" aria-label="새 이름"><span>b</span></div>');
  ok('4 마크업이 직접 준 aria-label은 따른다', d.getAttribute('aria-label')==='새 이름');

  // ── 5. 입력칸 — 포커스 없는 칸은 현재값까지 맞추고, 포커스 있는 칸은 두지 않는다
  host.innerHTML='<input class="a" value=""><input class="b" value=""><input type="checkbox" class="c">'
   +'<select class="s"><option>0</option><option selected>1</option><option>2</option></select><textarea class="t">x</textarea>';
  const ia=host.querySelector('.a'), ib=host.querySelector('.b'), cb=host.querySelector('.c'), se=host.querySelector('.s'), ta=host.querySelector('.t');
  ia.value='사용자가 친 값'; ib.value='치는 중'; cb.checked=false; se.selectedIndex=2; ta.value='고친 글';
  ib.focus();
  morphInto(host,'<input class="a" value="상태값"><input class="b" value="상태값"><input type="checkbox" class="c" checked>'
   +'<select class="s"><option>0</option><option selected>1</option><option>2</option></select><textarea class="t">상태글</textarea>');
  ok('5 포커스 없는 칸: 값이 상태로 맞춰진다', ia.value==='상태값', ia.value);
  ok('5 포커스 있는 칸: 치는 값을 지킨다', ib.value==='치는 중'&&document.activeElement===ib, ib.value);
  ok('5 체크박스: 상태로 맞춰진다', cb.checked===true);
  ok('5 선택상자: 상태로 맞춰진다 (1번)', se.selectedIndex===1, se.selectedIndex);
  ok('5 글상자: 상태로 맞춰진다', ta.value==='상태글', ta.value);
  ib.blur(); document.getElementById('outside').focus();
  se.focus(); se.selectedIndex=2;
  morphInto(host,'<input class="a" value="상태값"><input class="b" value="상태값"><input type="checkbox" class="c" checked>'
   +'<select class="s"><option>0</option><option selected>1</option><option>2</option></select><textarea class="t">상태글</textarea>');
  ok('5 포커스 있는 선택상자는 두지 않는다', se.selectedIndex===2, se.selectedIndex);
  se.blur();

  // ── 6. 구조 변화 — 결과가 innerHTML과 같아야 한다
  const cases=[
   ['행 추가', ledger('1','2',10), ledger('1','2',10).replace('</table>','<tr data-id="C"><td>새</td><td>3</td></tr></table>')],
   ['행 삭제', ledger('1','2',10), ledger('1','2',10).replace(/<tr data-id="B">.*?<\/tr>/,'')],
   ['태그 바뀜', '<div><span>a</span></div>', '<div><b>a</b></div>'],
   ['id 바뀜', '<div id="x">a</div>', '<div id="y">a</div>'],
   ['입력 type 바뀜', '<input type="text" value="1">', '<input type="number" value="1">'],
   ['맨 앞 경고 끼어듦', ledger('1','2',10), '<div class="lgalert">확인</div>'+ledger('1','2',10)],
   ['전부 비움', ledger('1','2',10), ''],
   ['빈 곳에서 시작', '', ledger('1','2',10)],
   ['글자↔요소', '<div>a</div>', '<div><i>a</i></div>'],
  ];
  for(const [n,a,b] of cases){ host.innerHTML=a; morphInto(host,b); ok('6 '+n+' → innerHTML과 같다', same(b), host.innerHTML); }
  /* 결과 문자열이 같아도 **다른 요소로 봐야 하는** 경우. id가 다르면 다른 표·다른 칸이다 —
   * 같은 노드를 살려 두면 스크롤·입력 상태가 엉뚱한 요소로 이어 붙는다. 입력칸 type이 바뀌면
   * 값의 뜻이 달라진다(text→number). 출력 비교로는 이 규칙이 안 보이므로 노드 동일성으로 본다. */
  host.innerHTML='<div id="x" class="lgscroll">a</div>'; const ox=host.firstChild;
  morphInto(host,'<div id="y" class="lgscroll">a</div>');
  ok('6 id가 다르면 새 요소로 갈아끼운다', host.firstChild!==ox);
  host.innerHTML='<input type="text" value="1">'; const oi=host.firstChild;
  morphInto(host,'<input type="number" value="1">');
  ok('6 입력 type이 다르면 새 칸으로 갈아끼운다', host.firstChild!==oi);
  host.innerHTML='<div id="x">a</div>'; const os=host.firstChild;
  morphInto(host,'<div id="x">b</div>');
  ok('6 id가 같으면 살려 둔다', host.firstChild===os);

  // ── 7. 무작위 대조 300건 — 바뀐 곳만 고친 결과 = 통째 교체 결과
  let seed=12345; const rnd=()=>(seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff;
  const pick=a=>a[Math.floor(rnd()*a.length)];
  const T=['div','span','b','i','p','ul','li','small'];
  const gen=(dep)=>{ let h=''; const n=1+Math.floor(rnd()*4);
    for(let k=0;k<n;k++){
      const r=rnd();
      if(dep<=0||r<0.3){ h+=pick(['가','나','1,234','₩5','−3.2%',' ','x']); continue; }
      const t=pick(T); let at='';
      if(rnd()<0.5)at+=' class="'+pick(['up','dn','num','a b'])+'"';
      if(rnd()<0.3)at+=' style="width:'+Math.floor(rnd()*100)+'%"';
      if(rnd()<0.2)at+=' data-k="'+Math.floor(rnd()*3)+'"';
      if(rnd()<0.1)at+=' id="i'+Math.floor(rnd()*3)+'"';
      h+='<'+t+at+'>'+gen(dep-1)+'</'+t+'>';
    } return h; };
  const tbl=()=>'<table>'+Array.from({length:1+Math.floor(rnd()*3)},()=>'<tr>'+Array.from({length:1+Math.floor(rnd()*3)},()=>'<td>'+gen(1)+'</td>').join('')+'</tr>').join('')+'</table>';
  let bad=0, first=null;
  for(let k=0;k<300;k++){
   const a=(rnd()<0.3?tbl():'')+gen(3), b=(rnd()<0.3?tbl():'')+gen(3);
   host.innerHTML=a; morphInto(host,b);
   if(!same(b)){ bad++; if(!first)first={a,b,got:host.innerHTML,want:ref.innerHTML}; }
  }
  ok('7 무작위 300건 모두 innerHTML과 같다 (속성 순서 무시)', bad===0, bad?JSON.stringify(first):undefined);
  ok('7 속성 순서만 다른 경우는 따로 센다 ('+orderOnly+'건) — 0이 아니어도 정상', true);

  // ── 8. **조금만 다른** 대조 1,000건 — 실제 갱신의 모양(글자·클래스·속성 하나, 행 하나)
  //    7번은 두 구조가 통째로 달라 대부분 '교체' 경로만 탄다. 실제 갱신은 고치기 경로를 탄다.
  const tweak=(html)=>{
    const d=document.createElement('div'); d.innerHTML=html;
    const els=[...d.querySelectorAll('*')], txts=[];
    const w=document.createTreeWalker(d,NodeFilter.SHOW_TEXT); let t; while(t=w.nextNode())txts.push(t);
    const nEd=1+Math.floor(rnd()*3);
    for(let e=0;e<nEd;e++){
      const r=rnd();
      if(r<0.30&&txts.length){ pick(txts).nodeValue=pick(['1,235','₩6','−3.3%','다','']); }
      else if(r<0.50&&els.length){ const el=pick(els); el.className=pick(['up','dn','num','']); }
      else if(r<0.65&&els.length){ const el=pick(els); el.setAttribute('style','width:'+Math.floor(rnd()*100)+'%'); }
      else if(r<0.75&&els.length){ const el=pick(els); if(el.attributes.length)el.removeAttribute(el.attributes[0].name); }
      else if(r<0.87&&els.length){ const el=pick(els); el.insertBefore(document.createElement(pick(['span','b','i'])),el.childNodes[Math.floor(rnd()*(el.childNodes.length+1))]||null); }
      else if(els.length){ const el=pick(els); if(el.parentNode&&el.tagName!=='TBODY'&&el.tagName!=='TR')el.remove(); }
    }
    return d.innerHTML; };
  let bad2=0, first2=null, ordered=0, mutTotal=0;
  for(let k=0;k<1000;k++){
   const b=(rnd()<0.4?tbl():'')+gen(3), a=tweak(b);
   host.innerHTML=a;
   const kept=[...host.querySelectorAll('*')];
   const rec=watch(()=>morphInto(host,b)); mutTotal+=rec.length;
   if(!same(b)){ bad2++; if(!first2)first2={a,b,got:host.innerHTML}; }
   // 조금만 다를 때는 노드 대부분이 살아남아야 한다 — 통째 교체로 퇴화하지 않았는지 본다
   const now=new Set(host.querySelectorAll('*')); if(kept.filter(e=>now.has(e)).length>=kept.length*0.5)ordered++;
  }
  ok('8 조금만 다른 1,000건 모두 innerHTML과 같다 (속성 순서 무시)', bad2===0, bad2?JSON.stringify(first2):undefined);
  ok('8 대부분 노드가 살아남는다 (교체로 퇴화하지 않음) — '+ordered+'/1000', ordered>=900, ordered);
  return res;
 });
 await browser.close();
 let pass=0,fail=0;
 for(const r of R){ r.c?(pass++,console.log('  OK   '+r.n)):(fail++,console.log('  FAIL '+r.n+(r.x!==undefined?'  ← '+r.x:''))); }
 console.log('\n'+pass+' passed · '+fail+' failed');
 process.exit(fail?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
