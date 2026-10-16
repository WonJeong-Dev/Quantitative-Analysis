const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium}=require(process.env.QA_PLAYWRIGHT||'C:/Users/WonJeong Yu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=process.env.QA_ROOT||path.resolve(__dirname,'..'),out=process.env.QA_ARTIFACTS||path.join(root,'artifacts/investment');
(async()=>{let browser,server;const errors=[];try{
 fs.mkdirSync(out,{recursive:true});server=spawn(process.execPath,[path.join(root,'scripts/serve.cjs')],{cwd:root,env:{...process.env,QA_PORT:'4175'},stdio:['ignore','pipe','pipe'],windowsHide:true});
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',c=>reject(Error('Server exited '+c)));});
 browser=await chromium.launch({headless:true,channel:'msedge'});
 for(const width of [1440,768,390,320]){
  const context=await browser.newContext({viewport:{width,height:960},isMobile:width<600,hasTouch:width<600,acceptDownloads:true}),page=await context.newPage();
  page.on('pageerror',err=>errors.push(err.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto('http://127.0.0.1:4175');await page.locator('.row').first().waitFor();
  await page.locator('#btnInvestment').click();await page.locator('#maskInvestment.on').waitFor();
  assert.equal(await page.locator('#investmentPolicyForm [name=assets]').inputValue(),'40000000');
  assert.equal(await page.locator('#investmentPolicyForm [name=minCash]').inputValue(),'0');
  await page.locator('#investmentPolicyForm button').click();await page.waitForFunction(()=>S.settings.investmentPolicy?.assets===40000000);
  assert.equal(await page.evaluate(()=>S.settings.investmentPolicy.stockMax),null);
  await page.locator('#investmentStock').selectOption('US_NVDA');
  const form=page.locator('#investmentScenarioForm');
  for(const [key,value] of Object.entries({months:'12',base:'10',asOf:'2026-09-20',source:'합성 테스트 / USD 1주 EPS',sector:'반도체',theme:'AI 설비투자'}))await form.locator('[name="'+key+'"]').fill(value);
  for(const [i,key] of ['bear','base','bull'].entries())for(const [field,value] of Object.entries({growth:'0',pe:String(10+i*2),discount:'10',dilution:'0'}))await form.locator('[name="'+key+'_'+field+'"]').fill(value);
  await form.locator('button').click();await page.waitForFunction(()=>S.settings.investmentScenarios?.US_NVDA?.base===10);
  assert.match(await page.locator('#investmentScenarioResult').innerText(),/90.91/);
  await page.locator('#investmentOrderForm input').fill('1000000');await page.locator('#investmentOrderForm button').click();assert.match(await page.locator('#investmentRiskResult').innerText(),/검토 보류/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'page overflow '+width);
  assert.equal(await page.locator('.investment-modal').evaluate(el=>el.scrollWidth>el.clientWidth+1),false,'modal overflow '+width);
  await page.locator('.investment-modal').evaluate(el=>el.scrollTop=0);await page.screenshot({path:path.join(out,'policy-'+width+'.png')});
  await form.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'scenario-'+width+'.png')});
  await page.locator('#investmentBody details').last().locator('summary').click();
  await page.waitForFunction(()=>!sumBusy&&Q.active===0&&Q.items.length===0,null,{timeout:60000});
  await page.evaluate(()=>{for(const id of Object.keys(S.stocks).filter(id=>id.startsWith('US_'))){const k=S.calc[id];Object.assign(k,{dataStale:false,priceAnomaly:false,qMissW:0,aMissW:0,qInputMissing:[],quality:70,attract:70});}});
  await page.locator('#investmentPlanForm [name=costBps]').fill('10');await page.locator('#investmentPlanForm [name=benchCostBps]').fill('2');
  await page.locator('#investmentPlanForm [name=horizon]').selectOption(width===320?'756':'20');
  await page.locator('#investmentPlanForm button').click();await page.waitForFunction(()=>S.settings.investmentPlans?.length===1);
  const fixed=await page.evaluate(()=>JSON.stringify(S.settings.investmentPlans[0]));
  function firestoreShape(x,inArray=false){if(Array.isArray(x)){assert.equal(inArray,false,'Firestore forbids arrays directly nested in arrays');x.forEach(v=>firestoreShape(v,true));}else if(x&&typeof x==='object')Object.values(x).forEach(v=>firestoreShape(v,false));else assert.notEqual(x,undefined);}
  firestoreShape(JSON.parse(fixed));
  await page.locator('#investmentPlanForm button').click();await page.waitForFunction(()=>document.getElementById('investmentStatus').textContent.includes('이전 검증이 미완료'));
  assert.equal(await page.evaluate(()=>JSON.stringify(S.settings.investmentPlans[0])),fixed);
  const dl=page.waitForEvent('download');await page.locator('#investmentExport').click();const downloaded=await dl;const data=JSON.parse(fs.readFileSync(await downloaded.path(),'utf8'));assert.equal(data.plans.length,1);assert.equal(data.plans[0].evaluation.complete,false);assert.equal(data.scenarios.US_NVDA.base,10);
  if(width===1440){
   await page.evaluate(async()=>{const p=JSON.parse(JSON.stringify(S.settings.investmentPlans[0]));p.at=Date.now()-40*864e5;p.testFixture=true;
    const t=Array.from({length:24},(_,i)=>Math.floor(p.at/1000)+(i-1)*86400),ch={t,o:t.map(()=>100),c:t.map(()=>110)};fetchChart=async()=>ch;
    S.settings.investmentPlans=[p];await D('qa_settings/global').set({investmentPlans:[p]},{merge:true});});
   await page.locator('#investmentEvaluate').click();await page.waitForFunction(()=>!!S.settings.investmentPlans[0].outcomes);
   const first=await page.evaluate(()=>JSON.stringify(S.settings.investmentPlans[0].outcomes));
   await page.evaluate(()=>{fetchChart=async()=>{throw Error('Completed outcomes must not be refetched');};});
   await page.locator('#investmentEvaluate').click();await page.waitForFunction(()=>document.getElementById('investmentStatus').textContent.startsWith('조회 완료'));
   assert.equal(await page.evaluate(()=>JSON.stringify(S.settings.investmentPlans[0].outcomes)),first);
   assert.match(await page.locator('#investmentPlanResults').innerText(),/단일 전방 코호트/);
  }
  await page.keyboard.press('Escape');assert.equal(await page.locator('#maskInvestment').evaluate(el=>el.classList.contains('on')),false);
  await context.close();console.log('PASS investment workflows at '+width+'px');
 }
 assert.deepEqual(errors,[]);console.log('Investment browser verification passed');
 }finally{await browser?.close();server?.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
