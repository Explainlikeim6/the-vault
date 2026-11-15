export function initSidebar() {
  const sidebar=document.querySelector('.sidebar'), toggle=document.querySelector('#sidebar-toggle'), backdrop=document.querySelector('#sidebar-backdrop'), media=matchMedia('(max-width:700px)');
  let desktopOpen=true, mobileOpen=false;
  try { desktopOpen=localStorage.getItem('history-vault-sidebar')!=='closed'; } catch {}
  function apply() {
    const open=media.matches?mobileOpen:desktopOpen;
    document.body.classList.toggle('sidebar-collapsed',!open);
    document.body.classList.toggle('sidebar-overlay',media.matches&&open);
    sidebar.inert=!open; backdrop.hidden=!(media.matches&&open);
    toggle.setAttribute('aria-expanded',String(open));
  }
  function closeMobile() {if(media.matches){mobileOpen=false;apply();}}
  toggle.addEventListener('click',()=>{
    if(media.matches) mobileOpen=!mobileOpen;
    else {desktopOpen=!desktopOpen;try{localStorage.setItem('history-vault-sidebar',desktopOpen?'open':'closed');}catch{}}
    apply();
  });
  backdrop.addEventListener('click',closeMobile); media.addEventListener('change',apply); apply();
  return {closeMobile};
}
