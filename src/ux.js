/* Progressive enhancement; trading and score calculations stay in domain/app. */
const BACKUP_COLS=QADomain.BACKUP_COLLECTIONS;
let backupBusy=false,restoreDraft=null;
async function backupData(download=true){
  if(!S.uid)throw Error('로그인이 필요합니다');
  const uid=S.uid,collections={};
  for(const name of BACKUP_COLS){
    const snap=await C(name).get();collections[name]=[];
    snap.forEach(d=>collections[name].push({id:d.id,data:d.data()}));
    if(S.uid!==uid)throw Error('계정이 변경되었습니다');
  }
  const data={format:'qa-board-backup',version:1,createdAt:new Date().toISOString(),uid,collections};
  if(download)lgDownload('qa_backup_'+lgToday()+'.json',JSON.stringify(data,null,2),'application/json');
  return data;
}
async function restorePreview(file){
  if(!file||file.size>25*1024*1024)throw Error('25MB 이하 JSON 백업을 선택하세요');
  const b=JSON.parse(await file.text()),count=QADomain.validateBackup(b);
  if(b.uid!==S.uid)throw Error('현재 로그인한 사용자의 백업만 복구할 수 있습니다');
  const preview=document.querySelector('#backupPreview');
  restoreDraft=b;
  let collisions=0;
  for(const [name,rows] of Object.entries(b.collections)){
    const snap=await C(name).get(),ids=new Set();snap.forEach(d=>ids.add(d.id));
    collisions+=rows.filter(r=>ids.has(r.id)).length;
  }
  preview.innerHTML='<p><b>'+count+'개 문서</b> · 기존 ID '+collisions+'개. 현재 데이터의 백업을 먼저 내려받습니다.</p><p>복구는 백업 문서를 같은 ID에 덮어씁니다(판정 기록은 복구 대상이 아닙니다 — 규칙이 과거 날짜 생성을 막습니다. 사전 검증 보관본은 없는 것만 추가). 백업에 없는 현재 문서는 삭제하지 않습니다. 다른 기기의 편집을 중단한 뒤 진행하세요.</p><label><input type="checkbox" id="restoreAck"> 위 내용을 확인했습니다</label><button class="btn danger" id="restoreCommit">현재 백업 후 복구</button>';
}
async function restoreCommit(){
  if(!restoreDraft||backupBusy||!document.querySelector('#restoreAck')?.checked)return;
  backupBusy=true;const uid=S.uid,b=restoreDraft;
  try{
    if(uid!==b.uid)throw Error('계정이 변경되었습니다');
    await backupData(true);let done=0;
    /* (v5.5) 판정 기록은 복구하지 않는다 — 규칙(v5.5)이 생성을 '그날 서버 시각'으로만 허용해
     * 과거 날짜 문서를 만들 수 없다(그것이 불변성의 목적이다). 사전 고정 검증 보관본은 없는 ID만 만든다. */
    const preNow=new Set();(await C('qa_prereg').get()).forEach(d=>preNow.add(d.id));
    const rows=Object.entries(b.collections).filter(([col])=>!QADomain.RESTORE_SKIP.includes(col))
      .flatMap(([col,items])=>items.map(row=>({col,...row})))
      .filter(r=>!(r.col==='qa_prereg'&&preNow.has(r.id)));
    for(let i=0;i<rows.length;i+=350){
      if(S.uid!==uid)throw Error('계정이 변경되었습니다');
      const batch=db.batch();rows.slice(i,i+350).forEach(r=>batch.set(D(r.col+'/'+r.id),r.data));
      await batch.commit();done+=rows.slice(i,i+350).length;
      document.querySelector('#backupPreview').textContent=done+' / '+rows.length+'개 복구 중';
    }
    restoreDraft=null;toast('복구 완료 · 새로고침합니다');location.reload();
  }catch(e){toast('복구 중단: '+e.message+' · 일부 문서는 복구됐을 수 있습니다. 같은 파일로 재시도할 수 있습니다.','err');}
  finally{backupBusy=false;}
}
function enhanceLedger(){
  if(S.view!=='ledger'||S.lg.sub!=='tool'||document.querySelector('#backupPanel'))return;
  const panel=document.createElement('section');panel.id='backupPanel';panel.className='backup-panel';
  panel.innerHTML='<h3>전체 데이터 백업·복구</h3><p>거래·환전·주식수 변동·관심종목·설정·판정 기록을 내 계정 단위로 보관합니다.</p><div class="backup-actions"><button class="btn primary" id="backupAll">전체 백업 받기</button><label class="btn">복구 파일 선택<input id="restoreFile" type="file" accept=".json,application/json"></label></div><div id="backupPreview" role="status"></div>';
  document.querySelector('#lgBody').prepend(panel);
}
function enhance(){
  document.querySelectorAll('[data-mobile-view]').forEach(b=>b.setAttribute('aria-current',b.dataset.mobileView===S.view?'page':'false'));
  document.querySelectorAll('nav.tabs .tab').forEach(b=>b.setAttribute('aria-current',b.classList.contains('on')?'page':'false'));
  document.querySelectorAll('.row .main').forEach(el=>{
    el.setAttribute('tabindex','0');el.setAttribute('role','button');
    el.setAttribute('aria-expanded',el.closest('.row').classList.contains('open'));
    /* (v5.9.4) 이름만 읽어 주면 스크린리더 사용자는 목록을 훑을 수 없다 — 답(판정)과
     * 그 이유, 지정가까지 한 문장으로 들려준다. 화면에 보이는 것과 같은 정보다. */
    const nm=el.querySelector('.nm .k')?.textContent||'종목';
    const vd=el.querySelector('.vd')?.textContent?.trim()||'';
    const why=el.querySelector('.vdwhy')?.textContent?.trim()||'';
    const px=el.querySelector('.ex .p')?.textContent?.trim()||'';
    const q=el.querySelector('.ex .q')?.textContent?.trim()||'';
    el.setAttribute('aria-label',[nm,vd&&('판정 '+vd),why,px&&('지정가 '+px),q,'상세 보기']
      .filter(Boolean).join(' · '));
  });
  document.querySelectorAll('input,select,textarea').forEach(el=>{
    if(el.getAttribute('aria-label')||el.labels?.length)return;
    const label=el.parentElement.querySelector('label')?.textContent||el.title||el.placeholder||el.dataset.lgf||el.dataset.f;
    if(label)el.setAttribute('aria-label',label);
  });
  document.querySelectorAll('.lgscroll').forEach(el=>{el.tabIndex=0;el.setAttribute('role','region');el.setAttribute('aria-label','가로로 스크롤하는 상세 표');});
  const status=document.querySelector('#workspaceStatus');
  const count=Object.keys(S.stocks).length,issues=positions().filter(p=>!p.valid).length;
  const summary=S.uid?'관심종목 '+count+'개 · 원장 확인 '+issues+'건\n판정 근거는 종목 상세에서 확인하세요.':'로그인 후 나의 데이터를 불러옵니다.';
  if(status.textContent!==summary)status.textContent=summary;
  document.querySelector('#clearSearch').hidden=!document.querySelector('#searchIn').value;
  enhanceLedger();
}
let enhanceTimer;
const observer=new MutationObserver(()=>{clearTimeout(enhanceTimer);enhanceTimer=setTimeout(enhance,60);});
observer.observe(document.querySelector('#list'),{childList:true,subtree:true});
observer.observe(document.querySelector('#lgBody'),{childList:true,subtree:true});
document.querySelector('#clearSearch').addEventListener('click',()=>{const el=document.querySelector('#searchIn');el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));el.focus();});
document.querySelector('#onlyHeld').addEventListener('change',e=>{S.ui.onlyHeld=e.target.checked;render();});
/* (v5.9.2) 진입가 가림 — 기기별 보기 설정이라 localStorage에 둔다(판정·로그와 무관).
 * 저장이 막힌 환경(사생활 보호 창 등)에서도 토글 자체는 동작해야 하므로 전부 try로 감싼다. */
(function(){
  const el=document.querySelector('#maskEntry'); if(!el)return;
  try{ S.ui.maskEntry=localStorage.getItem('qa.maskEntry')==='1'; }catch(e){}
  el.checked=!!S.ui.maskEntry;
  el.addEventListener('change',e=>{
    S.ui.maskEntry=e.target.checked;
    try{ localStorage.setItem('qa.maskEntry',e.target.checked?'1':'0'); }catch(err){}
    render();
  });
})();
document.querySelector('#list').addEventListener('keydown',e=>{
 if(e.target.matches('.row .main')&&['Enter',' '].includes(e.key)){e.preventDefault();e.target.click();}
});
document.addEventListener('click',async e=>{
 const button=e.target.closest('button');if(!button)return;
 try{
  if(button.dataset.mobileView){selectTab(button.dataset.mobileView==='ledger'?'ledger':S.tab);window.scrollTo({top:0,behavior:'smooth'});enhance();}
  if(button.id==='mobileAdd'){selectTab('ledger');lgOpenForm('new',null,null);document.querySelector('#lgBody').scrollIntoView({behavior:'smooth'});enhance();}
  if(button.id==='importCommit'){button.disabled=true;await lgImportCommit();}
  if(button.id==='backupAll'){if(backupBusy)return;backupBusy=true;button.disabled=true;try{await backupData();toast('전체 백업을 저장했습니다');}finally{backupBusy=false;button.disabled=false;}}
  if(button.id==='restoreCommit')await restoreCommit();
 }catch(err){toast(err.message,'err');}
});
document.addEventListener('change',async e=>{if(e.target.id==='restoreFile')try{await restorePreview(e.target.files[0]);}catch(err){restoreDraft=null;toast(err.message,'err');}});
// Dialog focus trap, Escape and focus restoration apply to touch and keyboards.
let activeDialog=null,returnFocus=null;
function syncDialog(){
 const open=[...document.querySelectorAll('.mask.on')].at(-1);
 if(open===activeDialog)return;
 if(open){if(!activeDialog)returnFocus=document.activeElement;activeDialog=open;
  const dialog=open.querySelector('.modal');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label',dialog.querySelector('h2')?.textContent||'대화상자');
  setTimeout(()=>dialog.querySelector('input,select,button,[tabindex]')?.focus(),0);
 }else{activeDialog=null;returnFocus?.focus();}
 document.querySelector('.wrap').inert=!!open;document.body.classList.toggle('dialog-open',!!open);
}
document.querySelectorAll('.mask').forEach(el=>new MutationObserver(syncDialog).observe(el,{attributes:true,attributeFilter:['class']}));
document.addEventListener('keydown',e=>{
 if(!activeDialog)return;
 if(e.key==='Escape'&&activeDialog.id!=='loginMask'){e.preventDefault();activeDialog.classList.remove('on');return;}
 if(e.key!=='Tab')return;
 const all=[...activeDialog.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter(x=>!x.disabled&&x.getClientRects().length);
 if(!all.length)return;const first=all[0],last=all.at(-1);
 if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
 else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
});
function network(){document.querySelector('#networkNotice').hidden=navigator.onLine;if(navigator.onLine&&S.uid){refreshQuotes();}}
window.addEventListener('offline',network);window.addEventListener('online',network);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&S.uid){glMaybeSave();glBackfill();}});
document.querySelector('#btnDiag').setAttribute('aria-label','데이터 자기점검');
document.querySelector('#btnSettings').setAttribute('aria-label','설정 열기');
syncDialog();enhance();network();
