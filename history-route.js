// Recover history tabs restored before Chrome finishes registering its override.
export function archiveTarget(tab,archiveUrl) {
  if(tab.incognito)return null;
  const address=tab.pendingUrl||tab.url||'';
  if(!/^(chrome|edge):\/\/history\/?(?:[?#]|$)/.test(address))return null;
  const source=new URL(address),target=new URL(archiveUrl),query=source.searchParams.get('q');
  if(query)target.searchParams.set('q',query);
  return target.href;
}
