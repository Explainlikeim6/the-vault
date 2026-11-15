export function changeRange(rows, initial, first, last, add=true) {
  const result=new Set(initial), from=Math.max(0,Math.min(first,last)), to=Math.min(rows.length-1,Math.max(first,last));
  for(let i=from;i<=to;i++) add?result.add(rows[i].id):result.delete(rows[i].id);
  return result;
}
export function initDragSelection({container,getRows,getSelected,applySelection,isBlocked,onDragState}) {
  let gesture=null,frame=0,suppressUntil=0;
  function indexAt(y) {
    const nodes=[...container.querySelectorAll('.history-row')]; if(!nodes.length)return -1;
    for(let i=0;i<nodes.length;i++){const rect=nodes[i].getBoundingClientRect();if(y<=rect.bottom)return i;}
    return nodes.length-1;
  }
  function update() {
    if(!gesture?.active)return;
    const index=indexAt(gesture.y);
    if(index>=0&&index!==gesture.last){gesture.last=index;applySelection(changeRange(getRows(),gesture.initial,gesture.start,index,gesture.add));}
  }
  function scroll() {
    if(!gesture?.active)return;
    const margin=48, top=document.querySelector('.topbar')?.getBoundingClientRect().bottom||0, y=gesture.y;
    const speed=y<top+margin?-Math.min(18,(top+margin-y)/3):y>innerHeight-margin?Math.min(18,(y-innerHeight+margin)/3):0;
    if(speed){window.scrollBy(0,speed);gesture.last=-1;update();}
    frame=requestAnimationFrame(scroll);
  }
  function finish(cancel=false) {
    if(!gesture)return;
    const active=gesture.active;
    if(cancel&&active)applySelection(new Set(gesture.initial));
    if(active){suppressUntil=performance.now()+300;document.body.classList.remove('drag-selecting');onDragState(false);}
    if(container.hasPointerCapture(gesture.pointerId))container.releasePointerCapture(gesture.pointerId);
    gesture=null;cancelAnimationFrame(frame);
  }
  container.addEventListener('pointerdown',event=>{
    if(isBlocked()||event.button!==0||!event.isPrimary||event.pointerType==='touch'||event.ctrlKey||event.metaKey||event.altKey)return;
    const row=event.target.closest('.history-row');
    if(!row||event.target.closest('button,details,summary'))return;
    const rows=getRows(),index=rows.findIndex(record=>record.id===row.dataset.id);if(index<0)return;
    gesture={pointerId:event.pointerId,start:index,x:event.clientX,y:event.clientY,originY:event.clientY,initial:new Set(getSelected()),add:!getSelected().has(rows[index].id),last:-1,active:false};
  });
  window.addEventListener('pointermove',event=>{
    if(!gesture||event.pointerId!==gesture.pointerId)return;
    gesture.y=event.clientY;
    if(!gesture.active&&Math.hypot(event.clientX-gesture.x,event.clientY-gesture.originY)>=5){
      gesture.active=true;document.body.classList.add('drag-selecting');window.getSelection()?.removeAllRanges();
      container.setPointerCapture(event.pointerId);onDragState(true);frame=requestAnimationFrame(scroll);
    }
    if(gesture.active){event.preventDefault();update();}
  },{passive:false});
  window.addEventListener('pointerup',event=>{if(gesture?.pointerId===event.pointerId){gesture.y=event.clientY;update();finish();}});
  window.addEventListener('pointercancel',()=>finish(true));
  window.addEventListener('blur',()=>finish(true));
  container.addEventListener('dragstart',event=>{if(gesture)event.preventDefault();});
  window.addEventListener('keydown',event=>{if(event.key==='Escape'&&gesture)finish(true);});
  container.addEventListener('click',event=>{if(performance.now()<suppressUntil){suppressUntil=0;event.preventDefault();event.stopImmediatePropagation();}},true);
}
