// Department page kit (Phase 3.0, 7 Oct 2026). One set of pure builders so every department page reads
// like the benchmark (Marketing → Competitors): number tiles with captions, per-source status rows, a
// two-chart band, a media wall, a detail dialog, and a search + chip filter bar. Everything returns HTML
// strings; `esc` is always passed in; nothing here fetches, stores or touches the DOM, except the one
// delegated listener in bindKitControls().
//
// API for the next agents (Batch 2 and 3). All builders are pure; `esc` comes from the helper bag.
//   tileRow(tiles,{esc,number})            → '.metrics > .metric[data-count]'. tile={label,value,caption (required),
//                                            age?,currency?,key?,tone?,action?:{action,id}}. Missing value → '—'.
//   statusRows(sources,{esc,now})          → '.health-rows > .health-row[data-state]'. source={label,reason?,at?,
//                                            state?:'current'|'stale'|'unavailable'|'paused',staleHours?,action?:{label,action,id}}.
//                                            The state is derived from `at` (freshness) when not given.
//   chartBand(left,right,{esc})            → '.viz-grid' with exactly two '.surface' cards. card={title,body,note?,meta?,empty?};
//                                            an empty body renders '.dt-empty', never a blank card.
//   mediaWall(config)                      → re-exported from video-wall.mjs: the video wall for images, PDFs, posts and docs
//                                            (config.kind or item.tileKind), custom chips (config.groups) and a dialog
//                                            override (config.detail(item) → {title,html}); see video-wall.mjs.
//   detailDialog(sections,{esc,lead})      → '.pk-detail.pk-wide' body for preview(title,html). section={title?,fields:[[label,value,{html}]],
//                                            html?,note?,collapsed?}. null/'' → "Not recorded"; objects are flattened to text, never JSON.
//   filterBar({esc,search,selects,chips})  → filter controls for filters(html). search={value,placeholder,id:'search'} (bindFilters → query);
//                                            select={label,value,options:[[value,label]],id?|control?|name?} (id → bindFilters,
//                                            control → operations, name → kit state); chips={name,label,value,options:[{id,label,count}]}.
//   bindKitControls(root,onChange)         → one delegated listener for [data-pk-chip] / [data-pk-select]; stores the value
//                                            (kitValue(name,fallback)) and calls onChange(name,value). Idempotent per root.
//   freshness(at,{now})                    → {at,date,age,state,historical,label}: > 24 h → age badge text "as of 8 Aug 2026",
//                                            > 30 days → historical; put label "historical (8 Aug 2026)" in the section title.
//   pageBanner({title,body,tone},{esc})    → the '.sync-banner' line for a whole page whose source is old or partial.
//   sourceDetails(rows,{esc,title})        → '<details class="pk-source">' with the provenance (paths, hashes, files). SHA strings
//                                            belong here only, never in the page body.
//   panel(title,body,{esc,meta,cls})       → a '.surface' card with a heading (same markup as card()).
//   timelineList(events,{esc,now})         → '<ol class="pk-timeline">'. event={at,title,detail?,tone?}.
//   parseCSV(text,{header})                → RFC 4180 rows (quoted commas, "" escapes, CRLF, newlines in quotes, BOM).
//   englishMap(value,map)                  → map[value] (or lower-case key); unknown values pass through unchanged.
//   dayLabel(at)                           → "8 Aug 2026" (date-only strings are read as calendar dates, not shifted by time zone).
import {relativeTime} from './data-table.mjs';
export {mediaWall} from './video-wall.mjs';

const HOUR=3600000,DAY=24*HOUR;
const plainDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v);
export function parseAt(value){
 if(value==null||value==='')return null;
 if(typeof value==='number')return Number.isFinite(value)?(value<1e12?value*1000:value):null;
 const t=Date.parse(String(value));return Number.isFinite(t)?t:null;
}
export function dayLabel(value){
 const t=parseAt(value);if(t==null)return '';
 return new Date(t).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',...(plainDate(value)?{timeZone:'UTC'}:{})});
}
export function freshness(at,{now=Date.now(),staleHours=24,historicalDays=30}={}){
 const t=parseAt(at);
 if(t==null)return {at:null,date:'',age:'',state:'unavailable',historical:false,label:'never recorded'};
 const ms=now-t,date=dayLabel(at),stale=ms>staleHours*HOUR,historical=ms>historicalDays*DAY;
 return {at:t,date,age:stale?'as of '+date:'',state:stale?'stale':'current',historical,label:historical?'historical ('+date+')':stale?'as of '+date:relativeTime(t,now)};
}

// Number tiles. A caption is required: every number says what it counts.
export function tileRow(tiles,{esc,number=v=>String(v)}={}){
 const list=(tiles||[]).filter(Boolean);if(!list.length)return '';
 return '<div class="metrics">'+list.map(t=>{
  if(!String(t.caption??'').trim())throw new TypeError('tileRow: the tile "'+t.label+'" needs a caption');
  const value=t.value==null||t.value===''?'—':typeof t.value==='number'?(t.currency?number(t.value,t.currency):number(t.value)):String(t.value);
  const tag=t.action?'button':'article',attrs=t.action?' type="button" data-action="'+esc(t.action.action)+'" data-id="'+esc(t.action.id??'')+'"':'';
  return '<'+tag+attrs+' class="metric"'+(t.tone?' data-tone="'+esc(t.tone)+'"':'')+'><small>'+esc(t.label)+'</small><strong data-count="'+esc(t.key||t.label)+'">'+esc(value)+'</strong><span>'+esc(t.caption)+'</span>'+(t.age?'<em class="pk-age">'+esc(t.age)+'</em>':'')+'</'+tag+'>';
 }).join('')+'</div>';
}

// Per-source status rows (dot + plain reason + age + optional action), as on Competitors.
// fallback: the data is current but a backup source serves it (for example the course console while Mission Control is down).
const STATE_WORD={current:'Current',stale:'Stale',unavailable:'Unavailable',paused:'Paused',fallback:'Fallback in use',pending:'Pending',idle:'Idle'};
export function statusRows(sources,{esc,now=Date.now()}={}){
 const list=(sources||[]).filter(Boolean);if(!list.length)return '';
 return '<div class="health-rows">'+list.map(s=>{
  const f=freshness(s.at,{now,staleHours:s.staleHours??24});
  const state=s.state||f.state,when=f.at!=null&&s.age!==false?relativeTime(f.at,now):'';
  const reason=[s.reason,when].filter(Boolean).join(' · ');
  const action=s.action?'<button type="button" class="dt-action" data-action="'+esc(s.action.action)+'" data-id="'+esc(s.action.id??'')+'">'+esc(s.action.label)+'</button>':'';
  return '<div class="health-row" data-state="'+esc(state)+'"><span class="today-dot" aria-hidden="true"></span><span class="pk-sr">'+esc((STATE_WORD[state]||state)+': ')+'</span><strong>'+esc(s.label)+'</strong>'+(reason?'<small>'+esc(reason)+'</small>':'')+action+'</div>';
 }).join('')+'</div>';
}

export function panel(title,body,{esc,meta='',cls=''}={}){
 return '<section class="surface'+(cls?' '+esc(cls):'')+'"><div class="section-head"><h2>'+esc(title)+'</h2>'+(meta?'<span class="pk-meta">'+esc(meta)+'</span>':'')+'</div>'+body+'</section>';
}

// Two charts side by side; motion staggers the two cards. A card never renders blank.
export function chartBand(left,right,{esc}={}){
 const card=c=>{const filled=String(c?.body??'').trim();
  return '<section class="surface pk-chart"><div class="section-head"><h2>'+esc(c?.title||'')+'</h2>'+(c?.meta?'<span class="pk-meta">'+esc(c.meta)+'</span>':'')+'</div>'+(filled?c.body:'<p class="dt-empty">'+esc(c?.empty||'Not enough data yet.')+'</p>')+(c?.note?'<p class="viz-note">'+esc(c.note)+'</p>':'')+'</section>'};
 return '<div class="viz-grid">'+card(left)+card(right)+'</div>';
}

// Detail dialog body: business fields first (the caller orders them), unknowns say so, no JSON ever.
const NOT_RECORDED='<span class="dt-muted">Not recorded</span>';
function fieldText(value){
 if(value==null||value==='')return '';
 if(Array.isArray(value))return value.filter(v=>v!=null&&v!==''&&typeof v!=='object').join(', ');
 if(typeof value==='object')return Object.entries(value).filter(([,v])=>v!=null&&v!==''&&typeof v!=='object').map(([k,v])=>k+': '+v).join(' · ');
 if(typeof value==='boolean')return value?'Yes':'No';
 return String(value);
}
export function detailDialog(sections,{esc,lead=''}={}){
 const field=f=>{const [label,value,opts]=Array.isArray(f)?f:[f.label,f.value,f];
  const html=opts?.html&&value!=null&&value!==''?String(value):(fieldText(value)?esc(fieldText(value)):NOT_RECORDED);
  return '<div><dt>'+esc(label)+'</dt><dd>'+html+'</dd></div>'};
 return '<div class="pk-detail pk-wide">'+(lead?'<p class="pk-lead">'+esc(lead)+'</p>':'')+(sections||[]).filter(Boolean).map(s=>{
  const body=(s.fields?.length?'<dl class="pk-fields">'+s.fields.filter(Boolean).map(field).join('')+'</dl>':'')+(s.html||'')+(s.note?'<p class="pk-note">'+esc(s.note)+'</p>':'');
  return s.collapsed?'<details class="pk-section"><summary>'+esc(s.title||'Details')+'</summary>'+body+'</details>':'<section class="pk-section">'+(s.title?'<h3>'+esc(s.title)+'</h3>':'')+body+'</section>';
 }).join('')+'</div>';
}

// Filter bar: the ids bindFilters() already binds (#search → query, #category, [data-control]) or kit state.
export function filterBar({esc,search,selects=[],chips}={}){
 let html='';
 if(search)html+='<label class="search">'+esc(search.label||'Search')+'<input id="'+esc(search.id||'search')+'" type="search" value="'+esc(search.value||'')+'" placeholder="'+esc(search.placeholder||'Search…')+'"></label>';
 for(const s of selects.filter(Boolean)){
  const bind=s.id?'id="'+esc(s.id)+'"':s.control?'data-control="'+esc(s.control)+'"':'data-pk-select="'+esc(s.name)+'"';
  html+='<label>'+esc(s.label)+'<select '+bind+'>'+s.options.map(([value,label])=>'<option value="'+esc(value)+'"'+(String(value)===String(s.value)?' selected':'')+'>'+esc(label)+'</option>').join('')+'</select></label>';
 }
 if(chips?.options?.length)html+='<div class="dt-tabs pk-chips" role="group" aria-label="'+esc(chips.label||'Show')+'">'+chips.options.map(o=>'<button type="button" data-pk-chip="'+esc(chips.name)+'" data-value="'+esc(o.id)+'" aria-pressed="'+(String(o.id)===String(chips.value))+'">'+esc(o.label)+(o.count!=null?'<b>'+esc(o.count)+'</b>':'')+'</button>').join('')+'</div>';
 return html;
}
const kitState=new Map();
export function kitValue(name,fallback){return kitState.has(name)?kitState.get(name):fallback}
export function setKitValue(name,value){kitState.set(name,value)}
const boundRoots=new WeakSet();
export function bindKitControls(root,onChange){
 if(!root||boundRoots.has(root))return;boundRoots.add(root);
 root.addEventListener('click',e=>{const b=e.target?.closest?.('[data-pk-chip]');if(!b)return;setKitValue(b.dataset.pkChip,b.dataset.value);onChange?.(b.dataset.pkChip,b.dataset.value)});
 root.addEventListener('change',e=>{const s=e.target?.closest?.('[data-pk-select]');if(!s)return;setKitValue(s.dataset.pkSelect,s.value);onChange?.(s.dataset.pkSelect,s.value)});
}

export function pageBanner({title,body='',tone='attention'},{esc}={}){
 return '<div class="sync-banner" data-tone="'+esc(tone)+'" role="status"><span class="today-dot" aria-hidden="true"></span><div><strong>'+esc(title)+'</strong>'+(body?'<small>'+esc(body)+'</small>':'')+'</div></div>';
}
export function sourceDetails(rows,{esc,title='Source'}={}){
 const list=(rows||[]).filter(r=>r&&r[1]!=null&&r[1]!=='');if(!list.length)return '';
 return '<details class="pk-source"><summary>'+esc(title)+'</summary><dl class="pk-fields">'+list.map(([label,value])=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(fieldText(value))+'</dd></div>').join('')+'</dl></details>';
}

export function timelineList(events,{esc,now=Date.now(),empty='Nothing recorded yet.'}={}){
 const list=(events||[]).filter(Boolean).map(e=>({...e,t:parseAt(e.at)})).sort((a,b)=>(b.t??0)-(a.t??0));
 if(!list.length)return '<p class="dt-empty">'+esc(empty)+'</p>';
 return '<ol class="pk-timeline">'+list.map(e=>'<li data-tone="'+esc(e.tone||'idle')+'"><span class="pk-timeline-dot" aria-hidden="true"></span><div><strong>'+esc(e.title)+'</strong>'+(e.detail?'<small>'+esc(e.detail)+'</small>':'')+'</div>'+(e.t!=null?'<time datetime="'+esc(new Date(e.t).toISOString())+'">'+esc(relativeTime(e.t,now))+'</time>':'')+'</li>').join('')+'</ol>';
}

// RFC 4180: commas and line breaks inside quotes, "" as an escaped quote, CRLF or LF rows, optional BOM.
export function parseCSV(text,{header=false}={}){
 const s=String(text??'').replace(/^﻿/,''),rows=[];let row=[],field='',quoted=false,i=0;
 while(i<s.length){const c=s[i];
  if(quoted){if(c==='"'){if(s[i+1]==='"'){field+='"';i+=2;continue}quoted=false;i++;continue}field+=c;i++;continue}
  if(c==='"'&&field===''){quoted=true;i++;continue}
  if(c===','){row.push(field);field='';i++;continue}
  if(c==='\r'||c==='\n'){row.push(field);field='';rows.push(row);row=[];i+=c==='\r'&&s[i+1]==='\n'?2:1;continue}
  field+=c;i++;
 }
 if(field!==''||row.length)rows.push([...row,field]);
 const clean=rows.filter(r=>r.length>1||r[0]!=='');
 if(!header)return clean;
 const [head=[],...body]=clean;return body.map(r=>Object.fromEntries(head.map((h,k)=>[h.trim(),r[k]??''])));
}

export function englishMap(value,map={}){
 if(value==null)return value;const key=String(value);
 return Object.hasOwn(map,key)?map[key]:Object.hasOwn(map,key.toLowerCase())?map[key.toLowerCase()]:value;
}
