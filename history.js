import {mergeDownloadDetails} from './download-ui.js';
import {blocked, formatBytes, normalizeDomain, rangeFor, safeUrl, validateRecord} from './core.js';
import {availableDays, batches, getRecords, metaGet, query, stats} from './db.js';
import {backupHeader} from './backup.js';
import {createEntryIcon, initTheme} from './appearance.js';
import {initDevices} from './devices.js';
import {initDateFilter} from './date-filter.js';
import {icon,initIcons} from './icons.js';
import {initSidebar} from './sidebar.js';
import {initDragSelection} from './selection.js';

const $ = selector => document.querySelector(selector);
const LOAD_SIZE = 100;
const params = new URLSearchParams(location.search);
let domainFilter = params.get('domain') || '';
let kind = 'visit', loadedLimit = LOAD_SIZE, rows = [], total = 0, selected = new Set(), anchor = null, queryToken = 0, exactUrl = params.get('url') || '', busy = false;
let lastCount = -1, toastTimer, searchTimer;
let queryPending=false,selectingAll=false,dragging=false,groupHours=false;
try{groupHours=localStorage.getItem('history-vault-group-hours')==='true';}catch{}
const state = {visits: 0, downloads: 0};
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
function button(text, className, action) {
  const node = element('button', className, text); node.type = 'button';
  node.addEventListener('click', () => run(action)); return node;
}
function toast(text, persistent = false) {
  clearTimeout(toastTimer); $('#toast').textContent = text; $('#toast').hidden = false;
  if (!persistent) toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 6500);
}
function showError(error) {
  $('#toast').hidden = true;
  const message = error.message || String(error);
  $('#error-banner').replaceChildren(document.createTextNode(message), button('Dismiss', 'text-button', async () => { $('#error-banner').hidden = true; $('#settings-error').hidden = true; await send({type: 'clear-error'}); }));
  $('#error-banner').hidden = false;
  if ($('#settings-dialog').open) { $('#settings-error').textContent = message; $('#settings-error').hidden = false; }
}
function setBusy(value) {
  busy = value; refreshSelection();
  for (const selector of ['#backup', '#backup-top', '#restore-button', '#restore-top', '#blacklist-form button', '#clear-all', '#retry-import']) $(selector).disabled = value;
}
async function run(action) { try { await action(); } catch (error) { showError(error); } }
async function send(msg) {
  const response = await chrome.runtime.sendMessage(msg);
  if (!response?.ok) throw new Error(response?.error || 'The archive did not respond. Reload this page and try again.');
  return response;
}
function filter() {
  let domain = domainFilter.trim();
  if (domain) domain = normalizeDomain(domain);
  const {from, to} = dateFilter.getRange();
  return {text: $('#search').value.trim(), kind, domain, from, to, url: exactUrl || undefined};
}
function dayName(time) {
  const date = new Date(time), today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  const name = date.toDateString() === today.toDateString() ? 'Today' : date.toDateString() === yesterday.toDateString() ? 'Yesterday' : date.toLocaleDateString(undefined, {weekday: 'long'});
  return `${name} · ${date.toLocaleDateString(undefined, {day: 'numeric', month: 'long', year: 'numeric'})}`;
}
function timeName(time) { return new Date(time).toLocaleTimeString(undefined, {hour: '2-digit', minute: '2-digit'}); }
function refreshSelection() {
  const disabled=busy||queryPending;
  for(const node of document.querySelectorAll('.history-row')){
    const checked=selected.has(node.dataset.id);node.classList.toggle('selected',checked);
    const check=node.querySelector('input');check.checked=checked;check.disabled=disabled;
  }
  for(const check of document.querySelectorAll('.day-checkbox input')){
    const group=rows.filter(record=>new Date(record.time).toDateString()===check.dataset.day);
    check.checked=group.length>0&&group.every(record=>selected.has(record.id));
    check.indeterminate=!check.checked&&group.some(record=>selected.has(record.id));check.disabled=disabled;
  }
  const hasSelection=selected.size>0,historyVisible=$('#devices-view').hidden;
  $('.topbar').hidden=!historyVisible;
  $('#search').placeholder=kind==='download'?'Search download':'Search history';
  $('#clear-search').hidden=!$('#search').value;
  if(!historyVisible&&$('#view-popover').matches(':popover-open'))$('#view-popover').hidePopover();
  const toggle=$('#sidebar-toggle');
  const toggleContainer=historyVisible?$('.topbar'):$('.devices-toolbar');
  if(toggle.parentElement!==toggleContainer)toggleContainer.prepend(toggle);
  $('#selected-count').textContent=selected.size.toLocaleString()+' selected';
  $('#search-tools').hidden=hasSelection||!historyVisible;
  $('#selection-tools').hidden=!hasSelection||!historyVisible;
  $('#search-actions').hidden=!(historyVisible&&hasFilters());
  $('#delete-selected').disabled=!hasSelection||disabled;
  $('#delete-matches').disabled=!total||disabled;
  for(const id of ['select-all-results','select-all-selected'])$('#'+id).disabled=!total||disabled||selectingAll||!historyVisible;
  $('#select-all-results').replaceChildren(document.createTextNode('Select all'),element('span','select-all-total',' ('+total.toLocaleString()+')'));
  for(const id of ['select-all-results','select-all-selected'])$('#'+id).setAttribute('aria-label','Select all '+total.toLocaleString()+' results including results not yet loaded');
}
function hasFilters(){const range=dateFilter.getRange();return Boolean($('#search').value.trim()||domainFilter||exactUrl||range.from!=null||range.to!=null);}
async function selectAllResults(){
  if(busy||queryPending||selectingAll)return;
  const snapshotFilter=filter(),signature=JSON.stringify(snapshotFilter);selectingAll=true;refreshSelection();
  try{
    const snapshot=await query(snapshotFilter,{keysOnly:true});
    if(signature!==JSON.stringify(filter())||queryPending)return;
    selected=new Set(snapshot.rows);anchor=null;
  }finally{selectingAll=false;refreshSelection();}
}
function clearSelection(){selected.clear();anchor=null;refreshSelection();}
function selectRow(index, checked, shift) {
  if (shift && anchor != null) {
    for (let i = Math.min(anchor, index); i <= Math.max(anchor, index); i++) checked ? selected.add(rows[i].id) : selected.delete(rows[i].id);
  } else checked ? selected.add(rows[index].id) : selected.delete(rows[index].id);
  anchor = index; refreshSelection();
}
function render() {
  const timeline=$('#timeline');timeline.replaceChildren();
  if(!rows.length){const empty=element('div','empty');empty.append(element('h3','','No matching activity'),element('p','','Try another search or date range.'));timeline.append(empty);}
  let dayKey='',hourKey='';
  for(const [index,row] of rows.entries()){
    const date=new Date(row.time),day=date.toDateString(),hour=day+'-'+date.getHours()+'-'+date.getTimezoneOffset();
    if(day!==dayKey){
      const heading=element('div','day-heading'),label=element('label','day-checkbox'),check=element('input');
      const dayRows=rows.filter(record=>new Date(record.time).toDateString()===day);
      check.type='checkbox';check.dataset.day=day;check.setAttribute('aria-label','Select visible records for '+date.toLocaleDateString());
      check.addEventListener('change',()=>{for(const record of dayRows)check.checked?selected.add(record.id):selected.delete(record.id);anchor=null;refreshSelection();});label.append(check);
      const menu=element('details','row-menu day-menu'),summary=element('summary');summary.setAttribute('aria-label','Actions for '+date.toLocaleDateString());summary.append(icon('more'));
      const actions=element('div','menu-items');actions.append(button('Delete this day…','danger',()=>deleteFilter({...rangeFor(row.time,'day'),kind},(kind==='download'?'Downloads':'Browsing history')+' on '+date.toLocaleDateString())));menu.append(summary,actions);
      heading.append(label,element('h3','',dayName(row.time)),menu);timeline.append(heading);dayKey=day;
    }
    if(groupHours&&hour!==hourKey){
      const heading=element('div','hour-heading');heading.append(element('span','',timeName(rangeFor(row.time,'hour').from)),button('Delete this hour…','text-button',()=>deleteFilter({...rangeFor(row.time,'hour'),kind},(kind==='download'?'Downloads':'Browsing history')+' in the hour starting '+new Date(rangeFor(row.time,'hour').from).toLocaleString())));timeline.append(heading);
    }
    hourKey=hour;
    const entry=element('article','history-row');entry.dataset.id=row.id;
    const checkbox=element('input');checkbox.type='checkbox';checkbox.setAttribute('aria-label','Select '+row.title);checkbox.addEventListener('click',event=>selectRow(index,event.currentTarget.checked,event.shiftKey));
    const time=element('time','entry-time',timeName(row.time));time.dateTime=date.toISOString();time.title=date.toLocaleString();
    const main=element('div','entry-main'),link=element('a','entry-title',row.title||row.url);
    if(safeUrl(row.url)){link.href=row.url;link.target='_blank';link.rel='noopener noreferrer';}
    link.title=row.title+'\n'+(row.filename||row.url);link.draggable=false;
    const domain=element('span','entry-domain',row.domain||'Local file');domain.title=row.url;main.append(link,domain);
    if(row.kind==='download'&&row.state==='complete'&&row.fileExists===false){link.classList.add('file-missing');link.title+='\nFile no longer available at its downloaded location';}
    if(row.kind==='download'){const info=element('span','entry-state',row.state.replaceAll('_',' '));info.title=(row.filename||row.url)+(row.fileSize?' · '+formatBytes(row.fileSize):'');main.append(info);}
    const menu=element('details','row-menu'),summary=element('summary');summary.append(icon('more'));summary.setAttribute('aria-label','Actions for '+row.title);
    const actions=element('div','menu-items');
    if(row.kind==='download'){
      const copy=button('Copy link','',async()=>{await navigator.clipboard.writeText(row.url);toast('Download link copied.');});
      copy.disabled=row.url.startsWith('data:');
      const show=button('Show in folder','',async()=>chrome.downloads.show(row.downloadId));
      show.disabled=!Number.isInteger(row.downloadId)||row.fileExists===false;
      if(show.disabled)show.title=row.fileExists===false?'The file is no longer at its downloaded location.':'This archived entry has no download record in this browser.';
      actions.append(copy,show,button('Delete entry…','danger',()=>deleteIds([row.id],'')));
    }else{
    actions.append(button('Delete this record…','danger',()=>deleteIds([row.id],'')),button('Delete all records for this URL…','',()=>deleteFilter({url:row.url,kind},'All archived browsing records for this exact URL: '+row.url)),button('Delete this hour…','danger',()=>deleteFilter({...rangeFor(row.time,'hour'),kind},(kind==='download'?'Downloads':'Browsing history')+' in the hour starting '+new Date(rangeFor(row.time,'hour').from).toLocaleString())));
    if(row.domain)actions.append(button('Find this domain','',async()=>{reset(false);domainFilter=row.domain;await load();}),button('Delete all records for this domain…','',()=>deleteFilter({domain:row.domain,kind},'All archived browsing records for '+row.domain+' and its subdomains')),button('Blacklist this domain…','danger',()=>addBlacklist(row.domain)));
    }
    menu.append(summary,actions);entry.append(checkbox,time,createEntryIcon(row),main,menu);
    entry.addEventListener('click',event=>{if(!event.target.closest('a,button,details,input'))selectRow(index,!selected.has(row.id),event.shiftKey);});timeline.append(entry);
  }
  $('#result-count').textContent=total.toLocaleString()+' records';
  timeline.setAttribute('aria-label',(kind==='visit'?'Browsing':'Downloads')+' results');
  $('#domain-filter-chip').hidden=!domainFilter;$('#domain-filter-label').textContent=domainFilter?'Site: '+domainFilter:'';
  $('#active-filters').hidden=!(domainFilter||exactUrl||!$('#date-filter-chip').hidden);
  $('#scroll-status').textContent=rows.length<total?'Scroll down to load more':rows.length?'All '+total.toLocaleString()+' records loaded':'';refreshSelection();
}
async function load(clear=true){
  if(clear)loadedLimit=LOAD_SIZE;
  const filters=filter(),token=++queryToken;queryPending=true;$('#scroll-status').textContent='Loading…';
  if(clear){selected.clear();anchor=null;}refreshSelection();$('#timeline').setAttribute('aria-busy','true');
  try{
    const data=await query(filters,{limit:loadedLimit});if(token!==queryToken)return;
    let currentRows=data.rows;
    const downloads=currentRows.filter(row=>row.kind==='download'&&Number.isInteger(row.downloadId));
    for(let i=0;i<downloads.length;i+=LOAD_SIZE){const details=await send({type:'refresh-downloads',ids:downloads.slice(i,i+LOAD_SIZE).map(row=>row.id)});if(token!==queryToken)return;currentRows=mergeDownloadDetails(currentRows,details.records).rows;}
    rows=currentRows;total=data.total;queryPending=false;render();$('#exact-url').hidden=!exactUrl;
    requestAnimationFrame(maybeLoadMore);
    if(exactUrl)$('#exact-url').textContent='Exact URL filter: '+exactUrl+'. Use Reset filters to clear it.';
  }finally{if(token===queryToken){queryPending=false;$('#timeline').setAttribute('aria-busy','false');refreshSelection();}}
}
function maybeLoadMore(){
  if(busy||queryPending||dragging||!$('#devices-view').hidden||document.querySelector('dialog[open], .row-menu[open]')||rows.length>=total)return;
  if($('#scroll-sentinel').getBoundingClientRect().top>innerHeight+350)return;
  loadedLimit=Math.max(loadedLimit,rows.length)+LOAD_SIZE;
  run(()=>load(false));
}
const scrollObserver=new IntersectionObserver(maybeLoadMore,{rootMargin:'350px'});
scrollObserver.observe($('#scroll-sentinel'));
window.addEventListener('scroll',maybeLoadMore,{passive:true});
window.addEventListener('resize',maybeLoadMore,{passive:true});
function reset(reload = true) {
  $('#search').value = ''; domainFilter = ''; dateFilter.clear(false);
  exactUrl = ''; loadedLimit = LOAD_SIZE;
  if (reload) return load();
}
function confirmAction({title, body, detail, action = 'Delete records', browser = false, destructive = true}) {
  return new Promise(resolve => {
    const dialog = $('#confirm-dialog');
    $('#confirm-title').textContent = title; $('#confirm-body').textContent = body; $('#confirm-detail').textContent = detail;
    $('#confirm-body').classList.toggle('confirm-detail',browser);
    $('#confirm-detail').hidden=!detail;
    $('#confirm-do').textContent = action; $('#confirm-do').className = `button ${destructive ? 'button-danger' : 'primary'}`;
    $('#browser-option').hidden = !browser; $('#browser-too').checked = false;
    $('#browser-too').onchange=browser?()=>{$('#confirm-do').textContent=$('#browser-too').checked?'Delete from both histories':action;}:null;
    dialog.returnValue = 'cancel';
    dialog.addEventListener('close', () => resolve({confirmed: dialog.returnValue === 'default', browserToo: browser && $('#browser-too').checked}), {once: true});
    dialog.showModal();
    dialog.querySelector('[value="cancel"]').focus();
  });
}
async function deleteIds(ids, description) {
  if (busy) return;
  if (!ids.length) { toast('No matching records to delete.'); return; }
  const containsDownloads=(await getRecords(ids)).some(row=>row.kind==='download');
  const choice = await confirmAction({title: `Delete ${ids.length.toLocaleString()} ${ids.length === 1 ? 'record' : 'records'}?`, body: (ids.length===1?'The selected record will be removed':'The selected records will be removed')+' from The Vault’s local archive.'+(containsDownloads?' The downloaded '+(ids.length===1?'file is':'files are')+' not deleted.':'')+' Your browser keeps a separate history, which stays unchanged unless you select the option below.', detail: description, action: 'Delete from The Vault', browser: true});
  if (!choice.confirmed) return;
  setBusy(true); toast('Deleting records…', true);
  try {
    const result = await send({type: 'delete', ids, browserToo: choice.browserToo});
    toast(`${result.removed.toLocaleString()} records deleted.${result.browserFailures ? ` Archive deletion succeeded, but ${result.browserFailures} browser deletions failed.` : ''}`);
    await load(); await refreshStats();
  } finally { setBusy(false); }
}
async function deleteFilter(filters, description) {
  if (busy) return;
  toast('Preparing an exact deletion preview…', true);
  const snapshot = await query(filters, {keysOnly: true});
  $('#toast').hidden = true;
  await deleteIds(snapshot.rows, description);
}
async function addBlacklist(input) {
  if (busy) return;
  const domain = normalizeDomain(input);
  const choice = await confirmAction({title: `Blacklist ${domain}?`, body: 'This domain and its subdomains will be excluded from future recording.', detail: 'Existing matching archived visits and download records will be deleted. Matching URLs will also be removed from the browser’s history. Native download records and files will remain.', action: 'Blacklist & clean up'});
  if (!choice.confirmed) return;
  setBusy(true); toast('Adding blacklist rule and cleaning existing records…', true);
  try {
    const result = await send({type: 'blacklist-add', domain});
    $('#blacklist-input').value = ''; toast(`${domain} blacklisted. ${result.removed.toLocaleString()} archived records removed.`);
    await renderSettings(); await load(); await refreshStats();
  } finally { setBusy(false); }
}
async function renderSettings() {
  const [list, imported, pending] = await Promise.all([metaGet('blacklist', []), metaGet('import'), metaGet('purgePending', [])]);
  const container = $('#blacklist-list'); container.replaceChildren();
  if (!list.length) container.append(element('p', 'muted', 'No blocked domains.'));
  for (const domain of list) {
    const row = element('div', 'blacklist-rule'); row.append(element('span', '', domain), button('Remove rule', 'text-button', async () => {
      await send({type: 'blacklist-remove', domain}); await renderSettings(); toast('Rule removed. New visits can be recorded; deleted records are not restored.');
    })); container.append(row);
  }
  $('#import-status').textContent = !imported ? 'Preparing initial import…' : imported.error ? `Import paused: ${imported.error}` : imported.complete ? `Initial import complete · ${imported.processed.toLocaleString()} URLs checked. New activity is recorded automatically.` : `Importing available browser history · ${imported.processed.toLocaleString()} URLs checked. You can keep browsing.`;
  $('#retry-import').hidden = !imported?.error;
  $('#purge-status').hidden = !pending.length;
  $('#purge-status').textContent = `Blacklist cleanup pending for ${pending.join(', ')}. It will retry automatically while the browser is running.`;
}
async function openSettings() { sidebar.closeMobile(); await renderSettings(); if (!$('#settings-dialog').open) $('#settings-dialog').showModal(); }
async function refreshStats() {
  Object.assign(state, await stats());
  $('#visit-count').textContent = state.visits.toLocaleString(); $('#download-count').textContent = state.downloads.toLocaleString();
  const storage = await navigator.storage.estimate(); $('#storage-size').textContent = storage.usage != null ? formatBytes(storage.usage) : 'Unavailable';
  const imported = await metaGet('import');
  if (imported && !imported.complete) {
    $('#notice').hidden = false; $('#notice').textContent = imported.error ? `Initial import is paused. Open Archive settings to retry. ${imported.error}` : `Building your archive · ${imported.processed.toLocaleString()} URLs imported so far. New browsing is already being recorded.`;
  } else if (params.has('welcome')) { $('#notice').hidden = false; $('#notice').textContent = 'Welcome to your vault. Available browser history has been imported. Your archive will now grow without an expiry date. Export backups regularly.'; }
  else $('#notice').hidden = true;
  const error = (await chrome.storage.local.get('lastError')).lastError;
  if (error) showError(new Error(`Recording or cleanup needs attention: ${error.message}`));
}
async function exportBackup() {
  if (busy) return; setBusy(true); toast('Preparing your full archive backup…', true);
  try {
    const parts = [await backupHeader()];
    let count = 0;
    for await (const batch of batches()) {
      parts.push((count ? ',' : '') + batch.map(row => JSON.stringify(row)).join(',')); count += batch.length;
    }
    parts.push(']}');
    const url = URL.createObjectURL(new Blob(parts, {type: 'application/json'})), link = element('a');
    link.href = url; link.download = `history-vault-${new Date().toISOString().replaceAll(':', '-')}.json`; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast(`Backup prepared with ${count.toLocaleString()} records. Keep the downloaded file safe.`);
  } finally { setBusy(false); }
}
async function restoreBackup(file) {
  if (!file || busy) return;
  setBusy(true); toast('Checking backup…', true);
  try {
    let backup;
    try { backup = JSON.parse(await file.text()); } catch { throw new Error('This file is not a readable JSON backup. No records were restored.'); }
    if (!backup || backup.format !== 'history-vault' || backup.version !== 1 || !Array.isArray(backup.records)) throw new Error('Choose a The Vault version 1 backup. No records were restored.');
    // Validate the entire file before allowing the first write.
    const list = await metaGet('blacklist', []);
    const records = backup.records.map(validateRecord).filter(row => !blocked(row, list));
    $('#toast').hidden = true;
    const choice = await confirmAction({title: `Restore ${records.length.toLocaleString()} records?`, body: 'Merge these records into your archive. Duplicate records are replaced; your other records remain.', detail: `${(backup.records.length - records.length).toLocaleString()} blacklisted records will be skipped. Previously deleted backed-up entries can return. Current blacklist rules remain in force. Native browser history will not change.`, action: 'Restore backup', destructive: false});
    if (!choice.confirmed) return;
    let count = 0;
    for (let i = 0; i < records.length; i += 500) {
      const result = await send({type: 'restore', records: records.slice(i, i + 500)}); count += result.restored;
      toast(`Restoring… ${Math.min(i + 500, records.length).toLocaleString()} / ${records.length.toLocaleString()}`, true);
    }
    toast(`Restore complete. ${count.toLocaleString()} records merged.`); await load(); await refreshStats();
  } catch (error) { $('#toast').hidden = true; throw error; }
  finally { setBusy(false); $('#restore-file').value = ''; }
}

$('#search').value = params.get('q') || '';
initIcons();
const sidebar=initSidebar();
const dateFilter = initDateFilter({getAvailability: async () => ({days: await availableDays(kind), blockEmpty: kind === 'visit'}), onChange: () => run(async () => { loadedLimit = LOAD_SIZE; await load(); })});
initTheme();
initDevices({onOpen:()=>{clearSelection();sidebar.closeMobile();refreshSelection();},onHistory:()=>{sidebar.closeMobile();refreshSelection();$('#search').focus();},showError});
initDragSelection({container:$('#timeline'),getRows:()=>rows,getSelected:()=>selected,applySelection:ids=>{selected=ids;anchor=null;refreshSelection();},isBlocked:()=>busy||queryPending||Boolean(document.querySelector('dialog[open]')),onDragState:value=>{dragging=value;}});
$('#browsing-data-open').addEventListener('click', () => run(async () => {
  const edge = /Edg\//.test(navigator.userAgent);
  await chrome.tabs.create({url: edge ? 'edge://settings/clearBrowserData' : 'chrome://settings/clearBrowserData'});
}));
$('#search').addEventListener('input', () => {
  queryPending=true;selected.clear();refreshSelection();
  clearTimeout(searchTimer); searchTimer = setTimeout(() => run(async () => { loadedLimit = LOAD_SIZE; await load(); }), 220);
});
for (const item of document.querySelectorAll('[data-kind]')) item.addEventListener('click', () => run(async () => {
  kind = item.dataset.kind; dateFilter.close(); loadedLimit = LOAD_SIZE; sidebar.closeMobile(); document.querySelectorAll('[data-kind]').forEach(b => b.classList.toggle('active', b === item)); await load();
}));
$('#reset').addEventListener('click', () => run(() => reset()));
for(const id of ['select-all-results','select-all-selected'])$('#'+id).addEventListener('click',()=>{if($('#view-popover').matches(':popover-open'))$('#view-popover').hidePopover();run(selectAllResults);});
$('#clear-selection').addEventListener('click',clearSelection);
$('#group-hours').checked=groupHours;
$('#group-hours').addEventListener('change',event=>{groupHours=event.target.checked;try{localStorage.setItem('history-vault-group-hours',String(groupHours));}catch{}$('#view-popover').hidePopover();render();});
$('#clear-domain-filter').addEventListener('click', () => run(async () => { domainFilter = ''; loadedLimit = LOAD_SIZE; await load(); }));
$('#delete-selected').addEventListener('click', () => run(() => deleteIds([...selected], '')));
$('#delete-matches').addEventListener('click', () => run(() => deleteFilter(filter(), 'All records matching the current search, type, domain, and date filters, including results not yet loaded.')));
$('#storage-manage').addEventListener('click', () => run(openSettings));
$('#settings-close').addEventListener('click', () => $('#settings-dialog').close());
const settingsDialog = $('#settings-dialog');
let settingsBackdropPress = false;
function outsideSettings(event) {
  const rect = settingsDialog.getBoundingClientRect();
  return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
}
settingsDialog.addEventListener('pointerdown', event => {
  settingsBackdropPress = event.target === settingsDialog && outsideSettings(event);
});
settingsDialog.addEventListener('pointercancel', () => { settingsBackdropPress = false; });
settingsDialog.addEventListener('click', event => {
  if (settingsBackdropPress && event.target === settingsDialog && outsideSettings(event) && !$('#confirm-dialog').open) settingsDialog.close();
  settingsBackdropPress = false;
});
$('#blacklist-form').addEventListener('submit', event => { event.preventDefault(); run(() => addBlacklist($('#blacklist-input').value)); });
$('#clear-all').addEventListener('click', () => run(() => deleteFilter({}, 'The entire local archive: all browsing and download records, across all dates and domains. Blacklist rules remain.')));
for(const id of ['backup','backup-top'])$('#'+id).addEventListener('click',()=>run(exportBackup));
$('#restore-button').addEventListener('click', () => $('#restore-file').click());
$('#restore-top').addEventListener('click',()=>$('#restore-file').click());
$('#restore-file').addEventListener('change', event => run(() => restoreBackup(event.target.files[0])));
$('#retry-import').addEventListener('click', () => run(async () => { await send({type: 'retry-import'}); await renderSettings(); await refreshStats(); await load(); }));
document.addEventListener('click', event => { document.querySelectorAll('.row-menu[open]').forEach(menu => { if (!menu.contains(event.target)) menu.open = false; }); });
document.addEventListener('keydown', event => {
  if(event.key==='Escape'&&selected.size&&!document.querySelector('dialog[open], [popover]:popover-open'))clearSelection();
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) && !document.querySelector('dialog[open], #date-popover:popover-open')) { event.preventDefault(); ($('#devices-view').hidden ? $('#search') : $('#device-search')).focus(); }
});
run(async () => {
  await Promise.all([load(), refreshStats()]); lastCount = state.visits + state.downloads;
  if (location.hash === '#settings') await openSettings();
  if (params.get('block')) await addBlacklist(params.get('block'));
  else if (params.get('review') === 'delete' && exactUrl) await deleteFilter({url: exactUrl}, `All archived records for this URL: ${exactUrl}`);
  if (!document.querySelector('dialog[open]')) $('#search').focus();
});
setInterval(() => run(async () => {
  if (busy || dragging || queryPending) return;
  await refreshStats();
  if ($('#settings-dialog').open) await renderSettings();
  const count = state.visits + state.downloads;
  if(!selected.size&&!document.querySelector('dialog[open], .row-menu[open]')){
    const downloads=rows.filter(row=>row.kind==='download'&&Number.isInteger(row.downloadId));
    if(downloads.length){const token=queryToken;let changed=false;
      for(let i=0;i<downloads.length;i+=LOAD_SIZE){
        const details=await send({type:'refresh-downloads',ids:downloads.slice(i,i+LOAD_SIZE).map(row=>row.id)});
        if(token!==queryToken||selected.size||queryPending||dragging||document.querySelector('dialog[open], .row-menu[open]'))return;
        const merged=mergeDownloadDetails(rows,details.records);rows=merged.rows;changed||=merged.changed;
      }
      if(changed)render();
    }
  }
  if (count !== lastCount && !selected.size && !document.querySelector('dialog[open], .row-menu[open]')) { await load(false); lastCount = count; }
}), 15000);

$('#clear-search').addEventListener('click',()=>{$('#search').value='';$('#search').dispatchEvent(new Event('input'));$('#search').focus();});
