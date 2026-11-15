const {chromium}=require('playwright');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
const extension=path.resolve(__dirname,'..'),root=path.resolve(extension,'../..');
let context,ui;const errors=[];
async function until(fn,label){for(let i=0;i<150;i++){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out: '+label);}
async function query(filter={}){return ui.evaluate(async filter=>(await import('./db.js')).query(filter),filter);}
async function clear(){if(await ui.locator('#clear-selection').isVisible())await ui.locator('#clear-selection').click();}
async function drag(first,last,{title=false}={}){
  const start=await ui.locator('.history-row').nth(first).boundingBox(),end=await ui.locator('.history-row').nth(last).boundingBox();
  const x=title?start.x+260:start.x+110;
  await ui.mouse.move(x,start.y+start.height/2);await ui.mouse.down();
  await ui.mouse.move(x,end.y+end.height/2,{steps:25});await ui.mouse.up();
}
(async()=>{
  context=await chromium.launchPersistentContext(path.join(root,'work','interaction-'+Date.now()),{executablePath:process.env.HISTORY_VAULT_BROWSER,headless:true,acceptDownloads:true,viewport:{width:1440,height:900},ignoreDefaultArgs:['--disable-extensions'],args:process.env.HISTORY_VAULT_CDP?['--enable-unsafe-extension-debugging']:['--disable-extensions-except='+extension,'--load-extension='+extension]});
  if(process.env.HISTORY_VAULT_CDP){const cdp=await context.browser().newBrowserCDPSession();await cdp.send('Extensions.loadUnpacked',{path:extension});await cdp.detach();}
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');worker.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  ui=await context.newPage();ui.on('pageerror',error=>errors.push(error.message));await ui.goto(worker.url().replace('background.js','history.html'));
  await until(async()=>(await ui.locator('#result-count').innerText()).includes('records'),'ready');
  const base=Date.now()-300000;
  const records=Array.from({length:135},(_,i)=>({id:'v:selection-fixture-'+i,kind:'visit',title:(i<127?'RemovalTarget ':'KeepFixture ')+i,url:'https://selection.test/'+(i<127?'target/':'keep/')+i,time:base-i*60000}));
  await ui.evaluate(async records=>{const response=await chrome.runtime.sendMessage({type:'restore',records});if(!response.ok)throw Error(response.error);},records);
  await ui.reload();await until(async()=>await ui.locator('.history-row').count()===100,'loaded page');
  assert.ok((await ui.locator('.history-row').first().boundingBox()).y<=175);
  assert.equal((await ui.locator('.history-row').first().boundingBox()).height,36);
  assert.equal((await ui.locator('.sidebar').boundingBox()).width,224);
  const cleanup=await ui.locator('#browsing-data-open').boundingBox(),storage=await ui.locator('.storage-card').boundingBox();
  assert.ok(cleanup.y+cleanup.height<=storage.y);
  const utility=await ui.locator('.utility-bar').boundingBox(),theme=await ui.locator('#theme-toggle').boundingBox(),searchbar=await ui.locator('.topbar').boundingBox();
  assert.ok(Math.abs(theme.x+theme.width/2-utility.x-utility.width/2)<1,'theme centered within main area');
  assert.ok(utility.y+utility.height<=searchbar.y,'utilities are above search');
  const brandContents=await ui.locator('.brand').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);const contents=range.getBoundingClientRect(),box=el.getBoundingClientRect();return {center:contents.x+contents.width/2,boxCenter:box.x+box.width/2};});
  assert.ok(Math.abs(brandContents.center-brandContents.boxCenter)<1,'brand centered');
  assert.equal(await ui.locator('.hour-heading').count(),0);
  assert.equal(await ui.locator('#selection-tools').isVisible(),false);
  await context.route('https://selection.test/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Normal link navigation</title><p>Test navigation</p>'}));
  const [opened]=await Promise.all([context.waitForEvent('page'),ui.locator('.entry-title').first().click()]);
  await opened.waitForLoadState();await opened.close();await ui.bringToFront();
  assert.equal(await ui.locator('#selected-count').innerText(),'0 selected');
  console.log('PASS dense rows, centered brand and theme, separate utility bar, bottom cleanup shortcut and normal link navigation');

  await ui.locator('.history-row input').first().check();await ui.locator('#delete-selected').click();
  await ui.locator('#confirm-dialog').waitFor({state:'visible'});
  assert.match(await ui.locator('#confirm-body').innerText(),/^The selected record will be removed/);
  assert.match(await ui.locator('#browser-option strong').innerText(),/^Navigation: Removes[\s\S]*\nDownloads: removes/);
  assert.equal(await ui.locator('#confirm-title').evaluate(e=>getComputedStyle(e).fontSize),'30px');
  assert.equal(await ui.locator('#confirm-body').evaluate(e=>getComputedStyle(e).fontSize),'13px');
  assert.equal(await ui.locator('#browser-option strong').evaluate(e=>getComputedStyle(e).fontSize),'12px');
  assert.equal(await ui.locator('#confirm-do').evaluate(e=>getComputedStyle(e).fontSize),'14px');
  await ui.locator('#confirm-dialog').screenshot({path:path.join(root,'outputs','Single-record-preview.png')});
  await ui.locator('#confirm-dialog [value="cancel"]').click();await clear();
  const pages=context.pages().length;await drag(0,7,{title:true});
  assert.equal(await ui.locator('#selected-count').innerText(),'8 selected');
  assert.equal(await ui.locator('.history-row input:checked').count(),8);
  assert.equal(context.pages().length,pages,'dragging links must not open tabs');
  const highlight=await ui.locator('.history-row.selected').first().boundingBox(),checkbox=await ui.locator('.history-row.selected input').first().boundingBox(),menu=await ui.locator('.history-row.selected .row-menu').first().boundingBox();
  assert.ok(checkbox.x-highlight.x>=10,'highlight extends left of checkbox');
  assert.ok(highlight.x+highlight.width-menu.x-menu.width>=9,'highlight extends right of menu');
  assert.equal((await ui.locator('.topbar').boundingBox()).height,56);
  assert.equal(await ui.locator('#search-tools').isVisible(),false);
  await drag(0,2);
  assert.equal(await ui.locator('#selected-count').innerText(),'5 selected');
  await clear();
  await ui.locator('.history-row input').nth(1).click();await ui.locator('.history-row input').nth(4).click({modifiers:['Shift']});
  assert.equal(await ui.locator('#selected-count').innerText(),'4 selected');await clear();
  await ui.locator('.history-row').first().dispatchEvent('pointerdown',{pointerId:9,pointerType:'touch',isPrimary:true,button:0,clientX:400,clientY:130});
  await ui.dispatchEvent('body','pointermove',{pointerId:9,pointerType:'touch',isPrimary:true,button:0,clientX:400,clientY:400});
  assert.equal(await ui.locator('#selected-count').innerText(),'0 selected');
  await ui.evaluate(()=>window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:9,pointerType:'touch'})));
  const start=await ui.locator('.history-row').nth(10).boundingBox();await ui.mouse.move(start.x+110,start.y+18);await ui.mouse.down();await ui.mouse.move(start.x+110,890,{steps:20});await ui.waitForTimeout(300);await ui.mouse.up();
  assert.ok(await ui.evaluate(()=>scrollY>0),'dragging near the edge should scroll');
  assert.ok((await ui.locator('.history-row input:checked').count())>10);
  const scrolled=await ui.evaluate(()=>scrollY),last=await ui.locator('.history-row input:checked').last().boundingBox();
  await ui.mouse.move(last.x+110,Math.min(850,last.y+18));await ui.mouse.down();
  const bar=await ui.locator('.topbar').boundingBox();await ui.mouse.move(last.x+110,bar.y+bar.height+25,{steps:20});
  await until(async()=>await ui.evaluate(before=>scrollY<before,scrolled),'upward auto-scroll beneath both toolbar rows');await ui.mouse.up();
  await clear();await ui.evaluate(()=>scrollTo(0,0));
  console.log('PASS link-safe drag selection, subtractive ranges, Shift-click, touch exclusion, and auto-scroll below the new toolbar');

  await ui.locator('#search').fill('RemovalTarget');
  await until(async()=>(await ui.locator('#result-count').innerText())==='127 records'&&!(await ui.locator('#select-all-results').isDisabled()),'search results');
  assert.equal(await ui.locator('#select-all-results').isVisible(),true);
  for(const width of [1024,960,800,701]){
    await ui.setViewportSize({width,height:900});
    assert.ok(await ui.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'search toolbar fits '+width);
    const search=await ui.locator('#search-tools').boundingBox(),utilities=await ui.locator('#view-options-toggle').boundingBox();
    assert.ok(search.x+search.width<=utilities.x,'toolbar controls do not overlap at '+width);
  }
  await ui.setViewportSize({width:1440,height:900});
  const red=await ui.locator('#delete-matches').evaluate(e=>getComputedStyle(e).color);
  assert.equal(red,'rgb(171, 56, 56)');assert.equal(await ui.locator('#delete-matches svg').count(),1);
  await ui.locator('#select-all-results').click();await until(async()=>(await ui.locator('#selected-count').innerText())==='127 selected','all results selected');
  assert.equal(await ui.locator('.history-row input:checked').count(),100);
  for(const width of [1024,960,800,701]){
    await ui.setViewportSize({width,height:900});
    assert.ok(await ui.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'selection toolbar fits '+width);
    const selection=await ui.locator('#selection-tools').boundingBox(),utilities=await ui.locator('#view-options-toggle').boundingBox();
    assert.ok(selection.x+selection.width<=utilities.x,'selection controls do not overlap at '+width);
  }
  await ui.setViewportSize({width:1440,height:900});
  await ui.locator('#next').click();await until(async()=>await ui.locator('.history-row').count()===27,'second page');
  assert.equal(await ui.locator('.history-row input:checked').count(),27);
  await ui.locator('#select-all-selected').click();await until(async()=>(await ui.locator('#selected-count').innerText())==='127 selected','reselect all');
  await ui.locator('#delete-selected').click();await ui.locator('#confirm-dialog').waitFor({state:'visible'});
  assert.match(await ui.locator('#confirm-title').innerText(),/127 records/);assert.equal(await ui.locator('#browser-too').isChecked(),false);
  assert.equal(await ui.locator('#confirm-eyebrow').count(),0);
  assert.equal(await ui.locator('#confirm-detail').isVisible(),false);
  assert.match(await ui.locator('#confirm-body').innerText(),/browser keeps a separate history/);
  assert.equal(await ui.locator('#confirm-body').evaluate(e=>e.classList.contains('confirm-detail')),true);
  assert.equal(await ui.locator('#confirm-do').innerText(),'Delete from The Vault');
  await ui.locator('#browser-too').check();assert.equal(await ui.locator('#confirm-do').innerText(),'Delete from both histories');
  await ui.locator('#browser-too').uncheck();assert.equal(await ui.locator('#confirm-do').innerText(),'Delete from The Vault');
  await ui.locator('#confirm-dialog').screenshot({path:path.join(root,'outputs','Deletion-preview.png')});
  await ui.locator('#confirm-dialog [value="cancel"]').click();assert.equal((await query({text:'RemovalTarget'})).total,127);
  await ui.locator('#delete-selected').click();await ui.locator('#confirm-do').click();
  await until(async()=>(await query({text:'RemovalTarget'})).total===0,'all matching records deleted');
  await until(async()=>!(await ui.locator('#timeline').getAttribute('aria-busy')==='true'),'deletion finished');
  assert.equal((await query({text:'KeepFixture'})).total,8);
  assert.ok((await ui.evaluate(()=>chrome.history.getVisits({url:'https://selection.test/target/0'}))).length>0);
  console.log('PASS all 127 matches selected across pages, exact confirmation, cancel, and deletion leaving unrelated/native records');

  await ui.locator('#search').fill('');await until(async()=>(await ui.locator('.history-row').count())>=8,'remaining visits');
  const [download]=await Promise.all([ui.waitForEvent('download'),ui.locator('#backup-top').click()]);
  const backup=JSON.parse(await fs.readFile(await download.path(),'utf8'));assert.equal(backup.format,'history-vault');
  assert.equal(backup.records.length,(await query()).total);
  const [chooser]=await Promise.all([ui.waitForEvent('filechooser'),ui.locator('#restore-top').click()]);
  await chooser.setFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'history-vault',version:1,records:[{id:'v:top-import',kind:'visit',title:'Imported from toolbar',url:'https://import.test/page',time:base}]}))});
  await ui.locator('#confirm-dialog').waitFor({state:'visible'});await ui.locator('#confirm-do').click();
  await until(async()=>(await query({text:'Imported from toolbar'})).total===1,'toolbar import');
  assert.equal(errors.length,0,JSON.stringify(errors));
  console.log('PASS top-right manual export/import and no worker/page errors');
})().catch(async error=>{console.error(error);console.error(errors);if(ui&&!ui.isClosed())try{console.error(await ui.locator('#error-banner').innerText());console.error('Current match count:',(await query({text:'RemovalTarget'})).total);await ui.screenshot({path:path.join(root,'work','interaction-failure.png'),fullPage:true});}catch{}process.exitCode=1;}).finally(async()=>{if(context)await context.close();});

