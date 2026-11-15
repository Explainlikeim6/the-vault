import {downloadType} from './download-ui.js';
export function faviconUrl(pageUrl) {
  const url = new URL(chrome.runtime.getURL('_favicon/'));
  url.searchParams.set('pageUrl', pageUrl);
  url.searchParams.set('size', '32');
  return url.href;
}
export function createEntryIcon(record) {
  const icon = document.createElement('span');
  icon.className = `entry-icon${record.kind === 'download' ? ' download' : ''}`;
  icon.setAttribute('aria-hidden', 'true');
  if (record.kind === 'download') {
    const img=document.createElement('img');img.className='file-icon';img.alt='';img.width=20;img.height=20;
    const fallback=chrome.runtime.getURL('icons/files/'+downloadType(record)+'.svg');img.src=fallback;icon.append(img);
    if(Number.isInteger(record.downloadId))chrome.downloads.getFileIcon(record.downloadId,{size:32}).then(url=>{if(url){img.onerror=()=>{img.onerror=null;img.src=fallback;};img.src=url;}}).catch(()=>{});
    return icon;
  }
  const fallback = document.createElement('span'); fallback.className = 'favicon-fallback'; fallback.textContent = '◎';
  const img = document.createElement('img'); img.className = 'favicon'; img.alt = ''; img.width = 20; img.height = 20; img.loading = 'lazy';
  img.addEventListener('error', () => { img.remove(); fallback.hidden = false; });
  img.addEventListener('load', () => { fallback.hidden = true; });
  img.src = faviconUrl(record.url); icon.append(fallback, img);
  return icon;
}
export function initTheme() {
  const control = document.querySelector('#theme-toggle'), system = matchMedia('(prefers-color-scheme: dark)');
  const stored = () => { try { return localStorage.getItem('history-vault-theme'); } catch { return null; } };
  function apply() {
    const theme = stored() || (system.matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    const label=document.createElement('span'); label.className='control-label'; label.textContent=theme==='dark'?'Light mode':'Dark mode';
    control.replaceChildren(icon(theme==='dark'?'sun':'moon'),label);
    control.setAttribute('aria-pressed', String(theme === 'dark'));
    control.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
  }
  control.addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('history-vault-theme', theme); } catch {}
    apply();
  });
  system.addEventListener('change', () => { if (!stored()) apply(); });
  addEventListener('storage', event => { if (event.key === 'history-vault-theme') apply(); });
  apply();
}
import {icon} from './icons.js';
