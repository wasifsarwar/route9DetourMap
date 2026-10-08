import {evaluateDetour,presetTime,stopImpact,ZONE} from './logic.js';
const $=id=>document.getElementById(id);
const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
const dateFormat=new Intl.DateTimeFormat('en-US',{timeZone:ZONE,month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
let data,map,layers,tileLayer,selectedPreset=null;
const state={detourId:'D17345',directionId:'1',time:'2026-10-07T21:54',path:'candidate'};
const getDetour=()=>data.detours.find(x=>x.id===state.detourId);
const getDirection=()=>data.directions.find(x=>x.id===state.directionId);
function pathFor(detour){return state.path==='candidate'&&detour.candidateGeometry?.length?detour.candidateGeometry:detour.geometry;}
function fitView(){const detour=getDetour();const status=evaluateDetour(detour,state.directionId,state.time);const points=status.showDetour&&pathFor(detour)?.length?pathFor(detour):getDirection().shape;map.fitBounds(L.latLngBounds(points),{paddingTopLeft:[45,115],paddingBottomRight:[70,115],maxZoom:16,animate:false});}
function link(text,url){const a=el('a',text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
function renderSource(detour){
  const target=$('source-content');target.replaceChildren();
  target.append(el('blockquote',detour.rawText));
  target.append(el('p',`Captured ${dateFormat.format(new Date(data.metadata.capturedAt))} Eastern. This page does not refresh the feed.`));
  target.append(el('p',`Published date window: ${dateFormat.format(new Date(detour.start))} – ${dateFormat.format(new Date(detour.end))} Eastern.`));
  const warnings=[...new Set([...(detour.conflicts??[]),...(detour.geometryWarnings??[])])];
  if(warnings.length){const list=el('ul');warnings.forEach(x=>list.append(el('li',x)));target.append(list);}
  if(state.path==='candidate'&&detour.candidateGeometry?.length)target.append(el('p',detour.candidateNotes??'The interpreted path follows the alert’s street sequence using agency map coordinates. It has not been verified in operation.'));
  const sources=el('p');sources.append(link('SEPTA detour feed',detour.sourceUrl));
  if(detour.geometrySourceUrl)sources.append(document.createTextNode(' · '),link('Agency map data',detour.geometrySourceUrl));
  sources.append(document.createTextNode(' · '),link('Route & stop data',data.metadata.sourceUrls.gtfs));target.append(sources);
  target.append(el('p','Uses one full-length route pattern per direction. Short trips, combined detours, arrivals, and temporary boarding points are outside this prototype.'));
}
function renderStops(detour,status){
  const impact=stopImpact(detour,status);$('stop-list').replaceChildren();
  $('stops-heading').textContent=status.state==='uncertain'?'Stops listed in this alert':'Stop changes';
  $('stop-count').textContent=impact.kind==='unknown'?'?':impact.stops.length?String(impact.stops.length):'—';
  if(impact.kind==='inactive'){$('stops-note').textContent='No stop changes from this selected alert at the chosen time and direction. Other alerts are not evaluated.';return;}
  if(impact.kind==='unknown'){$('stops-note').textContent='The feed does not identify skipped stops for this alert. An empty list does not mean all stops are served. No boarding location is confirmed.';return;}
  $('stops-note').textContent=impact.kind==='unconfirmed'?'SEPTA lists these stops, but the alert’s timing is unresolved. Do not treat these as confirmed closures at this replay time.':'These stop IDs are listed by SEPTA for the selected alert. Replacement boarding points are not provided.';
  impact.stops.forEach(stop=>{
    const popup=el('div');popup.append(el('strong',stop.name),el('p',impact.kind==='unconfirmed'?'Listed in alert · timing unconfirmed':'Skipped in selected alert'));
    const marker=L.marker([stop.lat,stop.lon],{icon:L.divIcon({className:'skipped-marker',html:'×',iconSize:[25,25],iconAnchor:[12,12]}),title:stop.name,keyboard:true}).addTo(layers).bindPopup(popup);
    const button=el('button',undefined,'stop-row');const label=el('span',stop.name);label.append(el('small',`Stop ${stop.id} · ${impact.kind==='unconfirmed'?'timing unconfirmed':'listed as skipped'}`));
    button.append(el('span','×','x'),label);button.addEventListener('click',()=>{map.setView([stop.lat,stop.lon],17,{animate:false});marker.openPopup();if(window.innerWidth<=800)$('map').scrollIntoView({behavior:'smooth',block:'center'});});$('stop-list').append(button);
  });
}
function render(){
  const detour=getDetour(),direction=getDirection();let status;
  try{status=evaluateDetour(detour,state.directionId,state.time);}catch(error){$('result').className='result uncertain';$('result').replaceChildren(el('p',error.message));layers.clearLayers();return;}
  $('detour-select').value=state.detourId;$('direction-select').value=state.directionId;$('replay-time').value=state.time;$('path-select').value=state.path;
  $('path-control').hidden=!detour.candidateGeometry?.length;
  document.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.preset===selectedPreset)));
  $('result').className=`result ${status.state}`;const title=el('div',undefined,'result-title');title.append(el('span',status.state==='uncertain'?'!':status.showDetour?'↳':'○','status-symbol'),el('span',status.title));
  $('result').replaceChildren(title,el('p',status.description));
  if(status.showDetour&&(detour.geometryWarnings?.length||detour.candidateGeometry?.length))$('result').append(el('p','Route needs review: the agency map and written directions do not fully agree.','timing'));
  if(status.showDetour&&!pathFor(detour)?.length)$('result').append(el('p','No mapped path is available for this alert.','timing'));
  const isCandidate=state.path==='candidate'&&detour.candidateGeometry?.length;
  $('map-title').textContent=`${direction.label} · ${direction.headsign}`;
  $('detour-legend').textContent=isCandidate?'Interpreted detour':status.state==='uncertain'?'Reported detour':'Agency detour';
  $('skipped-legend').textContent=status.state==='uncertain'?'Listed stop':'Skipped stop';
  $('map-note').textContent=status.showDetour?(isCandidate?'Text interpretation · unverified · no boarding guidance':(detour.geometryWarnings?.length?'Agency path has inconsistencies · needs review':'Recorded agency path · not field-verified')):'Normal route · selected alert is not applied';
  layers.clearLayers();
  L.polyline(direction.shape,{color:'#3769c5',weight:5,opacity:.74,lineJoin:'round'}).addTo(layers);
  if(status.showDetour){
    if(!isCandidate&&detour.unservedGeometry?.length)L.polyline(detour.unservedGeometry,{color:'#8693a6',weight:6,opacity:1,dashArray:'5 8'}).addTo(layers);
    const points=pathFor(detour);if(points?.length){L.polyline(points,{color:'#fff',weight:10,opacity:.95}).addTo(layers);L.polyline(points,{color:'#dd661c',weight:6,opacity:1,dashArray:status.state==='uncertain'?'9 7':undefined}).addTo(layers);}
  }
  direction.stops.forEach(stop=>L.circleMarker([stop.lat,stop.lon],{radius:3.5,color:'#3769c5',weight:1.5,fillColor:'#fff',fillOpacity:1}).addTo(layers).bindPopup(el('div',`${stop.name} · Scheduled stop; current service is not confirmed.`)));
  renderStops(detour,status);renderSource(detour);
  window.dispatchEvent(new CustomEvent('reroute:render',{detail:{...state,status:status.state}}));
}
function applySelection(input){
  if(input.detourId!==undefined&&!data.detours.some(d=>d.id===input.detourId))throw new Error('Unknown detour ID.');
  if(input.directionId!==undefined&&!data.directions.some(d=>d.id===input.directionId))throw new Error('Unknown direction.');
  if(input.time!==undefined)evaluateDetour(getDetour(),state.directionId,input.time);
  const detour=data.detours.find(x=>x.id===(input.detourId??state.detourId));
  if(input.path!==undefined&&!['candidate','agency'].includes(input.path))throw new Error('Unknown map path.');
  Object.assign(state,input);if(!detour.candidateGeometry?.length)state.path='agency';render();fitView();
  return {...state,status:evaluateDetour(getDetour(),state.directionId,state.time).state};
}
function registerTools(){
  if(!document.modelContext?.registerTool)return;
  const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  const tool={name:'configure_detour_replay',title:'Configure Route 9 replay',description:'Change the selected recorded Route 9 detour, direction, Philadelphia local time, and displayed path. This changes the map only; it does not provide live navigation.',inputSchema:{type:'object',properties:{detourId:{type:'string',enum:data.detours.map(x=>x.id)},directionId:{type:'string',enum:['0','1']},time:{type:'string',description:'Philadelphia local date/time: YYYY-MM-DDTHH:mm'},path:{type:'string',enum:['candidate','agency']}},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute(input){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['detourId','directionId','time','path'].includes(k)))throw new Error('Invalid replay configuration.');const result=applySelection(input);selectedPreset=null;render();return result;}};
  try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}
}
async function init(){
  const response=await fetch('./data/route9-data.json');if(!response.ok)throw new Error('The recorded data could not be loaded.');data=await response.json();
  map=L.map('map',{zoomControl:false,scrollWheelZoom:false});L.control.zoom({position:'topright'}).addTo(map);
  tileLayer=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
  let failures=0;tileLayer.on('tileerror',()=>{if(++failures>=3)$('tile-warning').hidden=false;});tileLayer.on('tileload',()=>{$('tile-warning').hidden=true;failures=0;});
  layers=L.layerGroup().addTo(map);
  $('detour-select').replaceChildren(...data.detours.map(d=>{const option=el('option',d.title==='Peco'?'PECO utility work':d.title);option.value=d.id;return option;}));
  $('direction-select').replaceChildren(...data.directions.map(d=>{const option=el('option',`${d.label} · ${d.headsign}`);option.value=d.id;return option;}));
  $('detour-select').disabled=false;$('direction-select').disabled=false;
  $('detour-select').addEventListener('change',e=>{const detour=data.detours.find(x=>x.id===e.target.value);selectedPreset=null;applySelection({detourId:detour.id,directionId:detour.directionId,path:detour.candidateGeometry?.length?'candidate':'agency'});});
  $('direction-select').addEventListener('change',e=>applySelection({directionId:e.target.value}));
  $('replay-time').addEventListener('change',e=>{if(!e.target.value)return;selectedPreset=null;try{applySelection({time:e.target.value});}catch(error){$('result').replaceChildren(el('p',error.message));}});
  $('path-select').addEventListener('change',e=>applySelection({path:e.target.value}));
  document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{selectedPreset=button.dataset.preset;applySelection({time:presetTime(getDetour(),selectedPreset)});}));
  $('fit-map').addEventListener('click',fitView);
  render();fitView();registerTools();
}
init().catch(error=>{$('result').className='result uncertain';$('result').replaceChildren(el('p',`Unable to load the prototype: ${error.message}`));$('map-title').textContent='Map unavailable';});
