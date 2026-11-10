/* (v6.14) 갱신 중 상호작용 보호 — **실제 함수를 작은 DOM 스텁 위에서 돌린다.**
 *
 * 왜 필요한가(실측 2026-11-10): 거래기록 탭에서 갱신 중 목록을 가로로 밀거나 글자를 선택하면
 * 1건 갱신마다 초기화됐다. 재현 측정에서 `host.innerHTML=g` 전후로 `.lgscroll`의 scrollLeft가
 * 150 → **0**, 확인용 인라인 스타일도 사라지고 요소가 다른 객체였다(t !== t2).
 * renderSoon이 180ms마다 그리므로 그 파괴가 초당 몇 번씩 반복됐다.
 *
 * 사용법: node tests/render-guard.cjs */
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
const piece=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)+a.length));

let pass=0,fail=0;
const ok=(n,c,x)=>{c?(pass++,console.log('  OK   '+n)):(fail++,console.log('  FAIL '+n+(x!==undefined?('  ← '+JSON.stringify(x)):'')));};

/* ── 최소 DOM 스텁. 실제 함수가 쓰는 것만 둔다 ───────────────────────────────── */
function makeEnv(){
  const handlers={};
  const el=(cls)=>({cls,scrollLeft:0,scrollTop:0});
  const host={ kids:[], contains(n){ return !!n&&(n===host||host.kids.includes(n)||n.inHost===true); },
    querySelectorAll(sel){ return host.kids.filter(k=>sel.split(',').some(s=>'.'+k.cls===s.trim())); } };
  const sel={isCollapsed:true,anchorNode:null};
  const env={
    S:{view:'ledger'}, lgPending:false,
    document:{ addEventListener(ev,fn){ (handlers[ev]=handlers[ev]||[]).push(fn); },
      documentElement:{scrollHeight:5000} },
    window:{ addEventListener(ev,fn){ (handlers[ev]=handlers[ev]||[]).push(fn); },
      getSelection:()=>sel, scrollY:0, innerHeight:800,
      scrollTo:(x,y)=>{ env.window.scrollY=y; } },
    setTimeout:(fn,ms)=>{ env._timers=(env._timers||[]); env._timers.push(fn); return 0; },
    clearTimeout:()=>{}, render(){ env._rendered=(env._rendered||0)+1; },
    renderLedger(){ env._lgRendered=(env._lgRendered||0)+1; },
    $:()=>host,
  };
  env.window.document=env.document;
  const ctx=vm.createContext(env);
  /* renderSoon 선언 직전까지 — uiPointer·uiBusy·uiFlush·scrollSnap·scrollRestore가 그 안에 있다 */
  vm.runInContext(piece('let renderTimer=null, renderPending=false;','function renderSoon(){'),ctx);
  const run=e=>vm.runInContext(e,ctx);
  const fire=(ev,arg)=>(handlers[ev]||[]).forEach(fn=>fn(arg||{}));
  const flushTimers=()=>{ const t=env._timers||[]; env._timers=[]; t.forEach(fn=>fn()); };
  return {env,host,sel,el,run,fire,flushTimers,handlers};
}

console.log('\n[1] 스크롤 위치 보존 — 같은 구조면 되돌린다');
{
  const {host,el,run}=makeEnv();
  host.kids=[el('lgscroll'),el('cfvwrap')];
  host.kids[0].scrollLeft=150; host.kids[1].scrollTop=40;
  const snap=run('scrollSnap($())');
  ok('두 스크롤러를 모두 떠 둔다', snap.n===2, snap);
  /* innerHTML 교체를 흉내낸다: 같은 구조의 **새 요소**로 바꾼다(실측에서 t !== t2였다) */
  host.kids=[el('lgscroll'),el('cfvwrap')];
  run('scrollRestore($(),'+JSON.stringify(snap)+')');
  ok('가로 위치를 되돌린다 (150)', host.kids[0].scrollLeft===150, host.kids[0].scrollLeft);
  ok('세로 위치도 되돌린다 (40)', host.kids[1].scrollTop===40, host.kids[1].scrollTop);
}

console.log('\n[2] 구조가 바뀌면 되돌리지 않는다 — 틀린 칸에 넣는 것이 더 나쁘다');
{
  const {host,el,run}=makeEnv();
  host.kids=[el('lgscroll'),el('cfvwrap')];
  host.kids[0].scrollLeft=150;
  const snap=run('scrollSnap($())');
  host.kids=[el('lgscroll')];                 // 하위탭이 바뀌어 개수가 달라졌다
  run('scrollRestore($(),'+JSON.stringify(snap)+')');
  ok('개수가 다르면 손대지 않는다', host.kids[0].scrollLeft===0, host.kids[0].scrollLeft);
  ok('스냅이 없으면 터지지 않는다', run('(scrollRestore($(),null),scrollRestore(null,null),true)'));
}

console.log('\n[3] 페이지 세로 위치 — 되돌릴 수 있을 때만');
{
  const {env,host,el,run}=makeEnv();
  host.kids=[el('lgscroll')];
  env.window.scrollY=400;
  const snap=run('scrollSnap($())');
  env.window.scrollY=0;                       // 교체로 브라우저가 위로 잘라냈다
  run('scrollRestore($(),'+JSON.stringify(snap)+')');
  ok('높이가 충분하면 되돌린다', env.window.scrollY===400, env.window.scrollY);
  /* 내용이 짧아져 돌아갈 자리가 없으면 부르지 않는다 — 부르면 화면이 위로 튄다 */
  env.document.documentElement.scrollHeight=500;   // 500-800 < 0
  env.window.scrollY=0;
  run('scrollRestore($(),'+JSON.stringify(snap)+')');
  ok('자리가 없으면 건드리지 않는다', env.window.scrollY===0, env.window.scrollY);
}

console.log('\n[4] 끌고 있는 동안에는 바쁘다고 답한다');
{
  const {run,fire,host}=makeEnv();
  ok('평상시는 바쁘지 않다', run('uiBusy($())')===false);
  fire('pointerdown');
  ok('포인터를 누르면 바쁘다', run('uiBusy($())')===true);
  fire('pointerup');
  ok('손을 떼면 풀린다', run('uiBusy($())')===false);
}

console.log('\n[5] 글자를 선택해 두면 — 이 화면 안일 때만');
{
  const {run,sel,host}=makeEnv();
  const node={inHost:true};
  sel.isCollapsed=false; sel.anchorNode=node;
  ok('호스트 안 선택은 바쁘다', run('uiBusy($())')===true);
  sel.anchorNode={inHost:false};
  ok('호스트 밖 선택은 바쁘지 않다', run('uiBusy($())')===false);
  sel.isCollapsed=true; sel.anchorNode=node;
  ok('접힌 선택(단순 클릭)은 바쁘지 않다', run('uiBusy($())')===false);
}

console.log('\n[6] 미뤘던 렌더가 손을 떼면 흘러간다');
{
  const {env,run,fire,flushTimers}=makeEnv();
  env.S.view='ledger';
  run('lgPending=true');
  fire('pointerdown'); fire('pointerup'); flushTimers();
  ok('거래기록 렌더가 한 번 돈다', env._lgRendered===1, env._lgRendered);
  ok('미룸 표시가 풀린다', run('lgPending')===false);
  /* 보드 화면에서는 render()가 흘러간다 */
  const b=makeEnv(); b.env.S.view='board';
  b.run('renderPending=true');
  b.fire('pointerup'); b.flushTimers();
  ok('보드 렌더가 한 번 돈다', b.env._rendered===1, b.env._rendered);
  /* 미뤄 둔 것이 없으면 아무 일도 하지 않는다 — 손을 떼는 것만으로 렌더가 생기면 안 된다 */
  const c=makeEnv();
  c.fire('pointerup'); c.flushTimers();
  ok('미룬 것이 없으면 그리지 않는다', !c.env._lgRendered&&!c.env._rendered,
     [c.env._lgRendered,c.env._rendered]);
}

console.log('\n[7] pointerup을 놓쳐도 스스로 풀린다 (영구 정지 방지)');
{
  const {env,run,fire,flushTimers}=makeEnv();
  fire('pointerdown');
  ok('눌린 상태', run('uiBusy($())')===true);
  fire('pointermove',{buttons:1});
  ok('버튼이 눌린 채 움직이면 계속 바쁘다', run('uiBusy($())')===true);
  fire('pointermove',{buttons:0});            // 창 밖에서 손을 뗀 뒤 첫 움직임
  ok('버튼이 풀린 움직임에서 스스로 풀린다', run('uiBusy($())')===false);
  /* 창에서 포커스를 잃어도 풀린다 */
  const b=makeEnv(); b.fire('pointerdown');
  b.fire('blur');
  ok('창 포커스를 잃으면 풀린다', b.run('uiBusy($())')===false);
}

console.log('\n[8] 선택이 풀리는 순간 미뤘던 렌더가 흘러간다');
{
  const {env,run,fire,sel,flushTimers}=makeEnv();
  run('lgPending=true');
  sel.isCollapsed=false; fire('selectionchange');
  flushTimers();
  ok('선택이 남아 있으면 그리지 않는다', !env._lgRendered, env._lgRendered);
  sel.isCollapsed=true; fire('selectionchange');
  flushTimers();
  ok('선택이 풀리면 그린다', env._lgRendered===1, env._lgRendered);
}

console.log('\n[9] 배선 — 두 렌더 경로가 모두 보호를 쓴다');
{
  ok('거래기록: 바쁘면 미룬다', /if\(uiBusy\(host\)\)\{ lgPending=true; return; \}/.test(src));
  ok('거래기록: 교체 전후로 위치를 뜨고 되돌린다',
     /const snap=scrollSnap\(host\);[\s\S]{0,80}host\.innerHTML=g;\s*\n\s*scrollRestore\(host,snap\);/.test(src));
  ok('보드: 바쁘면 미룬다', /if\(S\.view!=='ledger'&&uiBusy\(\$\('#list'\)\)\)\{ renderPending=true; return; \}/.test(src));
  ok('보드: 교체 전 위치를 뜬다', /const snap=scrollSnap\(list\);/.test(src));
  ok('보드: 캔버스 뒤에 되돌린다', /drawChart\(cv,id\)\); \} \}\);\s*\n\s*scrollRestore\(list,snap\);/.test(src));
  ok('판정 폐포는 건드리지 않았다', require('../docs/RULEHASH.json').hash==='6f68ace58f9a3d93');
}

console.log('\n────────────────────────────');
console.log(pass+' passed · '+fail+' failed');
process.exit(fail?1:0);
