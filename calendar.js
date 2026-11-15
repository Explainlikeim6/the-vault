export function dateKey(date) {
  return String(date.getFullYear()).padStart(4,'0')+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
}
export function dayDate(value) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Choose a valid calendar date.');
  const [year,month,day]=value.split('-').map(Number), date=new Date(0);
  date.setFullYear(year,month-1,day);date.setHours(12,0,0,0);
  if(dateKey(date)!==value)throw new Error('Choose a valid calendar date.');
  return date;
}
export function addDays(value,days) {const date=value instanceof Date?new Date(+value):dayDate(value);date.setDate(date.getDate()+days);date.setHours(12,0,0,0);return date;}
export function monthDays(year,month) {
  const first=new Date(year,month,1,12), offset=(first.getDay()+6)%7, start=addDays(first,-offset);
  return Array.from({length:42},(_,index)=>addDays(start,index));
}
export function moveMonth(date,delta) {
  const last=new Date(date.getFullYear(),date.getMonth()+delta+1,0,12);
  return new Date(last.getFullYear(),last.getMonth(),Math.min(date.getDate(),last.getDate()),12);
}
export function calendarBounds({fromDay='',toDay=''}={}) {
  const start=fromDay?dayDate(fromDay):null;if(start)start.setHours(0,0,0,0);
  const from=start?+start:undefined;
  let to;
  if(toDay) {
    const next=addDays(toDay,1);next.setHours(0,0,0,0);to=+next;
  }
  if(from!=null&&to!=null&&from>=to)throw new Error('The end of the range must be later than its start.');
  return {from,to};
}
export function calendarRangeLabel({fromDay='',toDay=''}={}) {
  const label=day=>dayDate(day).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
  if(fromDay&&toDay)return fromDay===toDay?label(fromDay):label(fromDay)+' → '+label(toDay);
  return fromDay?'From '+label(fromDay):toDay?'To '+label(toDay):'';
}
