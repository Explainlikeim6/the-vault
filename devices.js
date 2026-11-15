import {safeUrl} from './core.js';
import {createEntryIcon} from './appearance.js';
export function remoteTabs(devices) {
  return devices.map(device => ({name: device.deviceName || 'Other device', tabs: device.sessions.flatMap(session => (session.tab ? [session.tab] : session.window?.tabs || []).filter(tab => safeUrl(tab.url)).map(tab => ({title: tab.title || tab.url, url: tab.url, modified: session.lastModified * 1000})))}));
}
export function initDevices({onOpen, onHistory, showError}) {
  const $ = selector => document.querySelector(selector);
  let devices = [], refreshToken = 0;
  const node = (tag, cls, text) => {const n = document.createElement(tag); n.className = cls; if (text != null) n.textContent = text; return n;};
  function render() {
    const container = $('#devices-list'); container.replaceChildren();
    const text = $('#device-search').value.trim().toLowerCase(); let count = 0;
    for (const device of devices) {
      const tabs = device.tabs.filter(tab => `${device.name}\n${tab.title}\n${tab.url}`.toLowerCase().includes(text));
      if (!tabs.length) continue;
      const section = node('section', 'device-group'), heading = node('div', 'device-heading');
      heading.append(node('h3', '', device.name), node('span', '', `${tabs.length} ${tabs.length === 1 ? 'tab' : 'tabs'}`)); section.append(heading);
      for (const tab of tabs) {
        const row = node('a', 'device-tab'); row.href = tab.url; row.target = '_blank'; row.rel = 'noopener noreferrer';
        const info = node('div', 'entry-main'); info.append(node('span', 'entry-title', tab.title), node('span', 'device-tab-url', tab.url));
        row.append(createEntryIcon({kind: 'visit', url: tab.url}), info, node('span', 'external-icon', '↗')); section.append(row); count++;
      }
      container.append(section);
    }
    $('#devices-count').textContent = `${count} ${count === 1 ? 'tab' : 'tabs'}`;
    if (!count) {
      const empty = node('div', 'empty'); empty.append(node('div', 'empty-symbol', '▣'), node('h3', '', text ? 'No matching tabs' : 'No tabs from other devices yet'), node('p', '', text ? 'Try another title, address, or device name.' : 'Your browser has not shared any tabs. Check that open-tab sync is enabled on both devices. Availability depends on your browser and account.'));
      container.append(empty);
    }
  }
  async function refresh() {
    const token = ++refreshToken; $('#devices-refresh').disabled = true;
    try {
      if (!chrome.sessions?.getDevices) throw new Error('This browser does not expose tabs from other devices to extensions.');
      const data = await chrome.sessions.getDevices();
      if (token !== refreshToken) return;
      devices = remoteTabs(data); render(); $('#devices-updated').textContent = `Last checked ${new Date().toLocaleTimeString()}. Only tabs made available by your browser’s sync are shown.`;
    } catch (error) { if (token === refreshToken) {devices = []; render(); $('#devices-updated').textContent = error.message;} }
    finally { if (token === refreshToken) $('#devices-refresh').disabled = false; }
  }
  $('#devices-open').addEventListener('click', () => {
    $('#history-view').hidden = true; $('#devices-view').hidden = false; $('#devices-open').classList.add('active');
    document.querySelectorAll('[data-kind]').forEach(button => button.classList.remove('active')); onOpen(); refresh().catch(showError); $('#device-search').focus();
  });
  for (const button of document.querySelectorAll('[data-kind]')) button.addEventListener('click', () => {
    $('#history-view').hidden = false; $('#devices-view').hidden = true; $('#devices-open').classList.remove('active'); onHistory();
  });
  $('#devices-refresh').addEventListener('click', () => refresh().catch(showError));
  $('#device-search').addEventListener('input', render);
  setInterval(() => { if (!$('#devices-view').hidden && !document.hidden) refresh().catch(showError); }, 60000);
}
