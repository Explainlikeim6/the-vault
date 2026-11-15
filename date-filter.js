import {dateKey,dayDate,addDays,monthDays,moveMonth,calendarBounds,calendarRangeLabel} from './calendar.js';

export function initDateFilter({onChange,getAvailability}) {
  const $=selector=>document.querySelector(selector),popover=$('#date-popover'),trigger=$('#date-range-button'),grid=$('#calendar-grid');
  const empty=()=>({fromDay:'',toDay:''});
  let applied=empty(),draft=empty(),view=new Date(),focused=dateKey(new Date()),endpoint='from',fresh=true;
  let savedDays=new Set(),years=[],blockEmpty=true,loading=false,requestToken=0,messageTimer;
  const monthSelect=$('#calendar-month'),yearSelect=$('#calendar-year');
  for(let month=0;month<12;month++){const option=document.createElement('option');option.value=String(month);option.textContent=new Date(2026,month,1).toLocaleDateString(undefined,{month:'long'});monthSelect.append(option);}
  for(let weekday=0;weekday<7;weekday++){const label=document.createElement('span');label.textContent=new Date(2026,10,2+weekday).toLocaleDateString(undefined,{weekday:'short'});$('#calendar-weekdays').append(label);}
  function position() {
    const anchor=trigger.getBoundingClientRect(),box=popover.getBoundingClientRect();
    popover.style.left=Math.max(12,Math.min(anchor.right-box.width,innerWidth-box.width-12))+'px';
    popover.style.top=(anchor.bottom+8+box.height<=innerHeight-12?anchor.bottom+8:Math.max(12,anchor.top-box.height-8))+'px';
  }
  function updateApplied() {
    const active=Boolean(applied.fromDay||applied.toDay);
    $('#date-filter-chip').hidden=!active;$('#date-filter-label').textContent=calendarRangeLabel(applied);
    trigger.classList.toggle('filter-active',active);
    $('#date-filter-open').title='Edit date range. Includes the selected last day, in local time.';
  }
  function paint(preview='') {
    let from=draft.fromDay,to=draft.toDay;
    if(preview&&endpoint==='to'&&from){to=preview;if(to<from)[from,to]=[to,from];}
    for(const cell of grid.querySelectorAll('.calendar-cell')){
      const day=cell.dataset.date,button=cell.querySelector('button'),start=day===from,end=day===to;
      const inside=Boolean(from&&to&&day>=from&&day<=to);
      cell.classList.toggle('in-range',inside);cell.classList.toggle('range-start',start);cell.classList.toggle('range-end',end);
      button.classList.toggle('range-start',start);button.classList.toggle('range-end',end);
      if(!preview){cell.setAttribute('aria-selected',String(inside||start||end));button.setAttribute('aria-pressed',String(start||end));}
    }
  }
  function choose(day) {
    if(loading)return;
    if((blockEmpty&&!savedDays.has(day))||!years.includes(dayDate(day).getFullYear())){
      clearTimeout(messageTimer);$('#calendar-toast').textContent=blockEmpty?'No browsing history saved for this day.':'No download history saved for this year.';$('#calendar-toast').hidden=false;
      messageTimer=setTimeout(()=>{$('#calendar-toast').hidden=true;},2800);return;
    }
    $('#date-error').hidden=true;focused=day;
    if(fresh){draft.fromDay=day;draft.toDay=day;endpoint='to';fresh=false;}
    else if(endpoint==='from'){draft.fromDay=day;if(draft.toDay&&day>draft.toDay)draft.toDay=day;endpoint='to';}
    else {draft.toDay=day;if(draft.fromDay&&day<draft.fromDay)[draft.fromDay,draft.toDay]=[draft.toDay,draft.fromDay];endpoint='from';fresh=true;}
    view=dayDate(day);render(true);
  }
  function render(focus=false) {
    monthSelect.value=String(view.getMonth());
    yearSelect.value=String(view.getFullYear());
    monthSelect.disabled=yearSelect.disabled=loading||!years.length;
    $('#calendar-previous').disabled=loading||!years.length||(view.getFullYear()===years[0]&&view.getMonth()===0);
    $('#calendar-next').disabled=loading||!years.length||(view.getFullYear()===years.at(-1)&&view.getMonth()===11);
    $('#date-filter-form [type="submit"]').disabled=loading||!years.length;
    grid.setAttribute('aria-busy',String(loading));
    const label=view.toLocaleDateString(undefined,{month:'long',year:'numeric'});grid.setAttribute('aria-label',label);
    const days=monthDays(view.getFullYear(),view.getMonth());if(!days.some(day=>dateKey(day)===focused))focused=dateKey(new Date(view.getFullYear(),view.getMonth(),1,12));
    grid.replaceChildren();const today=dateKey(new Date());
    for(let week=0;week<6;week++){
      const row=document.createElement('div');row.className='calendar-week';row.setAttribute('role','row');
      for(let index=0;index<7;index++){
        const day=days[week*7+index],key=dateKey(day),cell=document.createElement('div'),button=document.createElement('button');
        cell.className='calendar-cell';cell.dataset.date=key;cell.setAttribute('role','gridcell');
        button.type='button';button.className='calendar-day';button.dataset.date=key;button.textContent=String(day.getDate());button.tabIndex=key===focused?0:-1;
        button.classList.toggle('outside-month',day.getMonth()!==view.getMonth());button.classList.toggle('today',key===today);
        const saved=savedDays.has(key);button.classList.toggle('has-history',saved);button.classList.toggle('no-history',!saved);
        button.disabled=loading;button.setAttribute('aria-disabled',String((blockEmpty&&!saved)||!years.includes(day.getFullYear())));
        button.setAttribute('aria-label',day.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long',year:'numeric'})+(saved?', saved history':', no saved history'));if(key===today)button.setAttribute('aria-current','date');
        button.addEventListener('click',()=>choose(key));button.addEventListener('pointerenter',()=>{if(!blockEmpty||saved)paint(key);else paint();});cell.append(button);row.append(cell);
      }
      grid.append(row);
    }
    for(const bound of ['from','to']){
      const value=draft[bound+'Day'];$('#date-'+bound+'-label').textContent=value?dayDate(value).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}):'Any date';
      $('#date-'+bound+'-select').setAttribute('aria-pressed',String(endpoint===bound));$('#date-'+bound+'-clear').disabled=!value;
    }
    $('#calendar-status').textContent=draft.fromDay&&draft.toDay&&fresh?'Range selected. Apply to filter history.':endpoint==='to'?'Choose the last day, or Apply for a single day.':'Choose the first day of your range.';
    if(loading)$('#calendar-status').textContent='Loading saved dates…';
    else if(!years.length)$('#calendar-status').textContent=blockEmpty?'No browsing history saved yet.':'No download history saved yet.';
    paint();if(focus)grid.querySelector('button[data-date="'+focused+'"]')?.focus();
    if(popover.matches(':popover-open'))requestAnimationFrame(position);
  }
  grid.addEventListener('pointerleave',()=>paint());
  function navigate(next,focus=false){
    if(loading||!years.length)return;
    let year=next.getFullYear();
    if(year<years[0]||year>years.at(-1))return;
    if(!years.includes(year)){
      year=next>view?years.find(saved=>saved>year):years.findLast(saved=>saved<year);
      next=new Date(year,next.getMonth(),Math.min(next.getDate(),new Date(year,next.getMonth()+1,0).getDate()),12);
    }
    focused=dateKey(next);view=next;render(focus);
  }
  grid.addEventListener('keydown',event=>{
    const button=event.target.closest('.calendar-day');if(!button)return;
    let date=dayDate(button.dataset.date),next;
    if(event.key==='ArrowLeft')next=addDays(date,-1);else if(event.key==='ArrowRight')next=addDays(date,1);
    else if(event.key==='ArrowUp')next=addDays(date,-7);else if(event.key==='ArrowDown')next=addDays(date,7);
    else if(event.key==='Home')next=addDays(date,-((date.getDay()+6)%7));else if(event.key==='End')next=addDays(date,6-((date.getDay()+6)%7));
    else if(event.key==='PageUp')next=moveMonth(date,event.shiftKey?-12:-1);else if(event.key==='PageDown')next=moveMonth(date,event.shiftKey?12:1);else return;
    event.preventDefault();navigate(next,true);
  });
  $('#calendar-previous').addEventListener('click',()=>navigate(moveMonth(view,-1)));
  $('#calendar-next').addEventListener('click',()=>navigate(moveMonth(view,1)));
  monthSelect.addEventListener('change',()=>navigate(new Date(view.getFullYear(),Number(monthSelect.value),1,12)));
  yearSelect.addEventListener('change',()=>navigate(new Date(Number(yearSelect.value),view.getMonth(),1,12)));
  for(const bound of ['from','to']){
    $('#date-'+bound+'-select').addEventListener('click',()=>{endpoint=bound;fresh=false;if(draft[bound+'Day']&&years.includes(dayDate(draft[bound+'Day']).getFullYear()))view=dayDate(draft[bound+'Day']);render();});
    $('#date-'+bound+'-clear').addEventListener('click',()=>{draft[bound+'Day']='';endpoint=bound;fresh=false;render();});
  }
  function clear(notify=true) {
    applied=empty();draft=empty();$('#date-error').hidden=true;updateApplied();
    if(notify)onChange();
  }
  popover.addEventListener('beforetoggle',event=>{
    const token=++requestToken;clearTimeout(messageTimer);$('#calendar-toast').hidden=true;
    if(event.newState==='open'){
      draft={...applied};endpoint='from';fresh=true;view=draft.fromDay?dayDate(draft.fromDay):draft.toDay?dayDate(draft.toDay):new Date();
      focused=draft.fromDay||draft.toDay||dateKey(new Date());
      $('#date-error').hidden=true;
      loading=true;savedDays=new Set();years=[];yearSelect.replaceChildren();
      render();requestAnimationFrame(position);
      getAvailability().then(availability=>{
        if(token!==requestToken)return;
        savedDays=new Set(availability.days);blockEmpty=availability.blockEmpty;
        years=[...new Set(availability.days.map(day=>dayDate(day).getFullYear()))].sort((a,b)=>a-b);
        yearSelect.replaceChildren(...years.map(year=>{const option=document.createElement('option');option.value=String(year);option.textContent=String(year);return option;}));
        const monthPrefix=dateKey(view).slice(0,7);
        if(years.length&&(!years.includes(view.getFullYear())||(!draft.fromDay&&!draft.toDay&&!availability.days.some(day=>day.startsWith(monthPrefix))))){view=dayDate(availability.days.at(-1));focused=dateKey(view);}
        loading=false;render();
      }).catch(()=>{
        if(token!==requestToken)return;
        loading=false;render();$('#date-error').textContent='Could not load saved dates. Close the calendar and try again.';$('#date-error').hidden=false;requestAnimationFrame(position);
      });
    }
  });
  popover.addEventListener('toggle',event=>{for(const button of [trigger,$('#date-filter-open')])button.setAttribute('aria-expanded',String(event.newState==='open'));});
  $('#date-filter-open').addEventListener('click',()=>popover.showPopover());
  for(const event of ['resize','scroll'])window.addEventListener(event,()=>{if(popover.matches(':popover-open'))position();},{passive:true,capture:true});
  $('#date-filter-form').addEventListener('submit',event=>{
    event.preventDefault();
    try{
      calendarBounds(draft);
      applied={...draft};updateApplied();popover.hidePopover();onChange();$('#search').focus();
    }catch(error){$('#date-error').textContent=error.message;$('#date-error').hidden=false;requestAnimationFrame(position);}
  });
  $('#date-cancel').addEventListener('click',()=>popover.hidePopover());
  $('#date-clear').addEventListener('click',()=>{clear();popover.hidePopover();$('#search').focus();});
  $('#clear-date-filter').addEventListener('click',()=>{clear();$('#search').focus();});
  updateApplied();return {getRange:()=>calendarBounds(applied),clear,close:()=>popover.hidePopover()};
}
