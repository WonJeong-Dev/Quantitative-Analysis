const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.QA_PLAYWRIGHT||'C:/Users/WonJeong Yu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 const out=path.join(__dirname,'../artifacts');fs.mkdirSync(out,{recursive:true});
 const issues=[];
 for(const width of [1440,1024,768,390,320]){
  const context=await browser.newContext({viewport:{width,height:960},deviceScaleFactor:1,isMobile:width<600,hasTouch:width<600});
  const page=await context.newPage();page.on('pageerror',e=>issues.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto(process.env.QA_URL||'http://127.0.0.1:4173');await page.locator('.row').first().waitFor();await page.waitForTimeout(600);
  await page.screenshot({path:path.join(out,'board-'+width+'.png'),fullPage:true});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,'board overflow '+width);
  await page.locator('#searchIn').fill('삼성');await page.waitForTimeout(300);assert.equal(await page.locator('.row').count(),1);
  await page.locator('#clearSearch').click();await page.waitForTimeout(250);
  await page.locator('#onlyHeld').check();assert.equal(await page.locator('.row').count(),1);await page.locator('#onlyHeld').uncheck();
  await page.locator('[data-tab="KR_etf"]').click();await page.waitForTimeout(200);assert.ok(await page.locator('.row').count()>0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'ETF overflow '+width);
  await page.locator('[data-tab="KR_stock"]').click();
  await page.locator('.row .main').first().click();await page.locator('.evidence-card').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'detail overflow '+width);
  await page.screenshot({path:path.join(out,'detail-'+width+'.png'),fullPage:true});
  if(width<600)await page.locator('[data-mobile-view="ledger"]').click();else await page.locator('[data-tab="ledger"]').click();
  await page.locator('#lgNew').click();
  await page.locator('[data-lgf="code"]').fill('000001');await page.locator('[data-lgf="name"]').fill('테스트 종목');
  await page.locator('[data-lgf="price"]').fill('100');await page.locator('[data-lgf="qty"]').fill('10');await page.locator('[data-lgf="sequence"]').fill('1');
  await page.screenshot({path:path.join(out,'ledger-'+width+'.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'ledger overflow '+width);
  await page.locator('[data-lgact="save"]').click();await page.waitForTimeout(350);
  const saved=await page.evaluate(()=>[...__fixture.store.values()].some(t=>t.code==='000001'&&t.qty===10));assert.ok(saved,'trade saved');
  await page.locator('#btnSettings').click();await page.locator('#maskSet.on').waitFor();
  await page.keyboard.press('Escape');assert.equal(await page.locator('#maskSet').evaluate(e=>e.classList.contains('on')),false);
  await page.locator('[data-lg="tool"]').click();await page.locator('#backupAll').waitFor();
  await page.locator('#impBox').fill(JSON.stringify([{market:'KR',code:'000003',name:'수입검사',side:'buy',type:'stock',account:'isa',date:'2026-08-04',qty:4,price:300,sourceId:'source-1'}]));
  await page.locator('[data-lgact="import"]').click();await page.locator('#importCommit').click();await page.waitForTimeout(300);
  assert.ok(await page.evaluate(()=>[...__fixture.store.values()].some(t=>t.code==='000003'&&t.account==='isa')),'import committed');
  const download=page.waitForEvent('download');await page.locator('#backupAll').click();const d=await download;const backupPath=path.join(out,'test-backup-'+width+'.json');await d.saveAs(backupPath);
  const backup=JSON.parse(fs.readFileSync(backupPath,'utf8'));assert.equal(backup.format,'qa-board-backup');
  await page.locator('#restoreFile').setInputFiles(backupPath);await page.locator('#restoreCommit').waitFor();
  if(width===390){await page.locator('#restoreAck').check();await page.locator('#restoreCommit').click();await page.waitForTimeout(600);}
  await context.close();console.log('PASS browser '+width+'px');
 }
 await browser.close();assert.deepEqual(issues,[]);console.log('No page errors');
})().catch(e=>{console.error(e);process.exitCode=1;});
