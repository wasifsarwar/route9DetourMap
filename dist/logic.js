export const ZONE = 'America/New_York';
const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23' });
function parts(instant) { return Object.fromEntries(formatter.formatToParts(new Date(instant)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value])); }
export function toWallTime(instant) { const p=parts(instant);return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; }
export function parseWallTime(value) {
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Choose a valid date and time.');
  const [year,month,day,hour,minute]=value.match(/\d+/g).map(Number);
  const wall=Date.UTC(year,month-1,day,hour,minute);let guess=wall;
  for(let i=0;i<3;i++){const p=parts(guess);const displayed=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);guess+=wall-displayed;}
  if(toWallTime(guess)!==value) throw new Error('This local time does not exist. Choose another time.');
  return guess;
}
export function withinSchedule(schedule, localTime) {
  if(!schedule) return true;
  const [date,time]=localTime.split('T');const day=new Date(`${date}T12:00:00Z`).getUTCDay();
  const minutes=s=>{const [h,m]=s.split(':').map(Number);return h*60+m;};
  const current=minutes(time),start=minutes(schedule.startTime??'00:00'),end=minutes(schedule.endTime??'24:00');
  const days=schedule.days??[0,1,2,3,4,5,6];
  if(start===end) return days.includes(day);
  if(start<end) return days.includes(day)&&current>=start&&current<end;
  return (current>=start&&days.includes(day))||(current<end&&days.includes((day+6)%7));
}
export function evaluateDetour(detour,directionId,localTime) {
  const instant=parseWallTime(localTime);
  if(String(directionId)!==String(detour.directionId)) return {state:'other-direction',showDetour:false,title:'Your direction is unaffected',description:'This selected alert applies to the opposite direction. The normal route is shown.'};
  if((detour.timingConflicts??detour.conflicts)?.length) return {state:'uncertain',showDetour:true,title:detour.uncertaintyKind==='source'?'Stop details need review':'Timing needs confirmation',description:detour.uncertaintyKind==='source'?'This stop relocation is missing from the richer map feed. Its boarding details need confirmation.':'The source information conflicts. The reported path is shown for inspection, but we cannot confirm when it applies.'};
  if(detour.start&&instant<Date.parse(detour.start)) return {state:'before',showDetour:false,title:'Detour has not started',description:'At this replay time, the selected detour has not begun. The normal route is shown.'};
  if(detour.end&&instant>=Date.parse(detour.end)) return {state:'after',showDetour:false,title:'Detour has ended',description:'At this replay time, the selected detour has ended. The normal route is shown.'};
  if(!withinSchedule(detour.schedule,localTime)) return {state:'outside-hours',showDetour:false,title:'Outside the detour hours',description:'The selected alert does not apply on this day or at this time. The normal route is shown.'};
  return {state:'active',showDetour:true,title:'Active by the alert dates',description:'This selected alert applies at the replay time. The map is a path to inspect, not a verified boarding guide.'};
}
export function stopImpact(detour,status) {
  if(!status.showDetour) return {kind:'inactive',stops:[]};
  if(detour.skippedStopsStatus!=='official_list') return {kind:'unknown',stops:[]};
  return {kind:status.state==='uncertain'?'unconfirmed':'listed',stops:detour.skippedStops??[]};
}
export function presetTime(detour,preset) {
  const start=Date.parse(detour.start),end=Date.parse(detour.end);
  if(preset==='before') return toWallTime(start-60*60*1000);
  if(preset==='after') return toWallTime(end+60*60*1000);
  return detour.exampleTime??toWallTime(start+60*60*1000);
}
