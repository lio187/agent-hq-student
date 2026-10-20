// Overview pulse (6 October 2026): the live state of the office in one band — agents working, open work
// by state, tokens per day and routine health — beside the 187N trace. Every tile reads data the Overview
// already loads (served from the warm cache). A tile without measured data says so instead of drawing.
import {sparkline,stackBar,ring} from './viz.mjs';
import {brandTrace} from './ui.mjs';
import {workStage} from './workspace-operations.mjs';
import {routineHealth} from './routine-health.mjs';

const compact=n=>Intl.NumberFormat('en-GB',{notation:'compact',maximumFractionDigits:1}).format(Number(n)||0);
const unavailable=v=>!v||v.state==='unavailable';

// Tokens per UTC day across every engine, last N days that have a measurement.
export function dailyTokens(usage,{days=14}={}){
 const by=new Map();
 for(const s of usage?.sources||[])for(const r of s.series||[]){if(!/^\d{4}-\d{2}-\d{2}$/.test(r?.date||''))continue;by.set(r.date,(by.get(r.date)||0)+(Number(r.tokens)||0))}
 return [...by.entries()].sort(([a],[b])=>a.localeCompare(b)).slice(-days).map(([date,value])=>({label:new Date(date+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'}),value}));
}

export function routineCounts(rows){
 const list=Array.isArray(rows)?rows.filter(r=>!r.unavailable):[];
 const health=list.map(routineHealth),active=health.filter(h=>!h.paused);
 return {total:list.length,active:active.length,paused:health.length-active.length,failing:active.filter(h=>h.needsAttention).length};
}

export function pulseHTML({dashboard,usage,routines,agents=[],now=new Date()},{esc}){
 const tasks=dashboard?.tasks||[],stages={queued:0,running:0,attention:0};
 for(const t of tasks){const s=workStage(t);if(s in stages)stages[s]++}
 const working=new Set((dashboard?.runs||[]).map(r=>r.profile).filter(Boolean)).size,total=agents.length;
 const series=unavailable(usage)?[]:dailyTokens(usage),spark=sparkline(series,{esc,label:'Tokens per day, last '+series.length+' days'});
 const tokens=series.reduce((t,p)=>t+p.value,0);
 const r=unavailable(routines)?null:routineCounts(routines);
 const tile=(section,body)=>'<button type="button" class="pulse-tile" data-action="section" data-id="'+esc(section)+'">'+body+'</button>';
 return '<div class="pulse-brand">'+brandTrace({mode:'intro',label:'187N'})+'<div><p>187N · Agent HQ</p><strong><span class="today-dot" aria-hidden="true"></span> Office answering · read '+esc(now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}))+'</strong></div></div>'
  +tile('agents','<small>Agents working now</small><div class="pulse-row">'+ring(working,total,{esc,label:'Agents working',tone:'live',center:''})+'<div><strong data-count="agents-working">'+esc(working)+'</strong><span> of '+esc(total)+' agents</span></div></div>')
  +tile('tasks','<small>Open agent work</small><strong data-count="open-work">'+esc(tasks.length)+'</strong>'+(tasks.length?stackBar([{label:'Queued',value:stages.queued,tone:'idle'},{label:'Running',value:stages.running,tone:'live'},{label:'Attention',value:stages.attention,tone:'warn'}],{esc,label:'Open agent work by state'}):'<span>No open work</span>'))
  +tile('usage','<small>Tokens · last '+(series.length||14)+' days</small><strong data-count="tokens">'+esc(series.length?compact(tokens):'—')+'</strong>'+(spark||'<span>'+(unavailable(usage)?'Usage source unavailable':'No daily usage measured yet')+'</span>'))
  +tile('routines','<small>HQ-managed routines</small>'+(r?'<strong data-count="routines">'+esc(r.total)+'</strong>'+stackBar([{label:'Healthy',value:r.active-r.failing,tone:'live'},{label:'Failing',value:r.failing,tone:'error'},{label:'Paused',value:r.paused,tone:'idle'}],{esc,label:'Routines by state'}):'<span>Routine status unavailable</span>'));
}
