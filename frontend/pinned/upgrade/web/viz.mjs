// Small chart kit (6 October 2026), following the dataviz method: one hue per single series (no legend),
// thin marks with rounded data ends anchored to the baseline, values as text in text colours, a hover
// tooltip on every mark, and a plain-text equivalent for screen readers. No dependencies.
const compact=n=>Intl.NumberFormat('en-GB',{notation:'compact',maximumFractionDigits:1}).format(Number(n)||0);

// Ranked magnitudes (e.g. views per creator): horizontal bars with direct value labels.
export function barList(rows,{esc,format=compact,max=8,label='Values'}={}){
 const all=rows.filter(r=>Number(r.value)>0).sort((a,b)=>b.value-a.value),list=all.slice(0,max),rest=all.slice(max);
 if(!list.length)return '<p class="dt-empty">Not enough data yet.</p>';
 const top=list[0].value;
 // A shortened list says what it left out, so the bars never read as the whole set (7 Oct 2026).
 const more=rest.length?'<p class="viz-more">+'+rest.length+' more not shown ('+esc(format(rest.reduce((t,r)=>t+Number(r.value),0)))+' in total)</p>':'';
 return '<ol class="viz-bars" aria-label="'+esc(label)+'">'+list.map(r=>'<li title="'+esc(r.label+': '+format(r.value)+(r.note?' · '+r.note:''))+'"><span class="viz-bar-label">'+esc(r.label)+'</span><span class="viz-bar-track"><span class="viz-bar" style="--w:'+Math.max(2,Math.round(r.value/top*100))+'%"></span></span><b>'+esc(format(r.value))+'</b></li>').join('')+'</ol>'+more;
}

// Counts per day for one series: SVG columns, 2 px gaps, 4 px rounded tops, first/last day labelled.
export function columns(days,{esc,label='Per day',height=56,format=v=>v}={}){
 const n=days.length;if(!n)return '';
 const max=Math.max(1,...days.map(d=>d.missing?0:d.value)),w=100/n,gap=0.6;
 // A period without data ({missing:true}) is an empty dashed outline with "no data", never a 0 bar (7 Oct 2026).
 const bars=days.map((d,i)=>{if(d.missing)return '<g class="viz-col viz-col--gap"><title>'+esc(d.label+': no data')+'</title><rect class="viz-hit" x="'+(i*w)+'" y="0" width="'+w+'" height="'+height+'"></rect><rect class="viz-gap" x="'+(i*w+gap/2)+'" y="'+(height-8)+'" width="'+(w-gap)+'" height="8" rx="0.9"></rect></g>';
  const h=d.value?Math.max(3,d.value/max*(height-6)):0;const x=i*w+gap/2,y=height-h;
  return '<g class="viz-col"><title>'+esc(d.label+': '+format(d.value))+'</title><rect class="viz-hit" x="'+(i*w)+'" y="0" width="'+w+'" height="'+height+'"></rect>'+(h?'<rect class="viz-mark" x="'+x+'" y="'+y+'" width="'+(w-gap)+'" height="'+h+'" rx="0.9"></rect>':'')+'</g>'}).join('');
 const total=days.reduce((t,d)=>t+(d.missing?0:d.value),0);
 return '<figure class="viz-columns"><figcaption><span>'+esc(label)+'</span><b>'+esc(format(total))+'</b></figcaption><svg viewBox="0 0 100 '+height+'" preserveAspectRatio="none" role="img" aria-label="'+esc(label+': '+days.map(d=>d.label+' '+(d.missing?'no data':format(d.value))).join(', '))+'"><line class="viz-base" x1="0" x2="100" y1="'+height+'" y2="'+height+'"></line>'+bars+'</svg><div class="viz-axis"><span>'+esc(days[0].label)+'</span><span>'+esc(days[n-1].label)+'</span></div></figure>';
}

// Group dated items into the last N days (local dates), oldest first.
export function perDay(items,{days=14,at=i=>i.publishedAt,now=new Date()}={}){
 const out=[];for(let k=days-1;k>=0;k--){const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()-k);out.push({key:d.toDateString(),label:d.toLocaleDateString('en-GB',{day:'numeric',month:'short'}),value:0})}
 const index=new Map(out.map((d,i)=>[d.key,i]));
 for(const item of items){const t=new Date(at(item));if(Number.isNaN(t.getTime()))continue;const i=index.get(t.toDateString());if(i!=null)out[i].value++}
 return out;
}

// Counts per hour over the last N hours (local time), oldest first; for "when did things happen today".
export function perHour(items,{hours=24,at=i=>i.at,now=new Date()}={}){
 const end=new Date(now);end.setMinutes(0,0,0);const out=[];
 for(let k=hours-1;k>=0;k--){const d=new Date(+end-k*3600000);out.push({key:+d,label:d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}),value:0})}
 const first=out[0].key;
 for(const item of items){const raw=at(item);const t=typeof raw==='number'?(raw<1e12?raw*1000:raw):Date.parse(raw);if(!Number.isFinite(t)||t<first||t>=+end+3600000)continue;out[Math.min(out.length-1,Math.floor((t-first)/3600000))].value++}
 return out;
}

// Trend of one series: a 2 px line over a faint area, the latest point marked. Needs two measured points.
export function sparkline(points,{esc,label='Trend',format=compact,height=34}={}){
 const values=points.map(p=>Number(p.value)||0);if(values.filter(v=>v>0).length<2)return '';
 const n=values.length,w=100,max=Math.max(...values)||1,x=i=>n===1?w:i/(n-1)*w,y=v=>height-2-v/max*(height-6);
 const line=values.map((v,i)=>(i?'L':'M')+x(i).toFixed(2)+','+y(v).toFixed(2)).join('');
 const hits=points.map((p,i)=>'<rect class="viz-hit" x="'+Math.max(0,x(i)-w/n/2).toFixed(2)+'" y="0" width="'+(w/n).toFixed(2)+'" height="'+height+'"><title>'+esc(p.label+': '+format(p.value))+'</title></rect>').join('');
 return '<figure class="viz-spark"><svg viewBox="0 0 '+w+' '+height+'" preserveAspectRatio="none" role="img" aria-label="'+esc(label+': '+points.map(p=>p.label+' '+format(p.value)).join(', '))+'"><path class="viz-area" d="'+line+'L'+w+','+height+'L0,'+height+'Z"></path><path class="viz-line" pathLength="1" d="'+line+'"></path>'+hits+'</svg><span class="viz-spark-dot" style="top:'+(y(values[n-1])/height*100).toFixed(1)+'%" aria-hidden="true"></span></figure>';
}

// Parts of one whole by state (for example queued / running / needs attention): one bar, a labelled legend.
// Tones are status names from tokens.css; segments keep 2 px gaps and a 3 px minimum so small parts show.
export function stackBar(segments,{esc,label='Breakdown',format=compact}={}){
 const list=segments.filter(s=>Number(s.value)>0),total=list.reduce((t,s)=>t+Number(s.value),0);
 if(!total)return '';
 const text=list.map(s=>s.label+' '+format(s.value)).join(', ');
 return '<figure class="viz-stack"><div class="viz-stack-bar" role="img" aria-label="'+esc(label+': '+text)+'">'+list.map(s=>'<span class="viz-seg" data-tone="'+esc(s.tone||'idle')+'" style="--g:'+Number(s.value)+'" title="'+esc(s.label+': '+format(s.value)+' ('+Math.round(Number(s.value)/total*100)+'%)')+'"></span>').join('')+'</div>'
  +'<figcaption class="viz-legend">'+segments.map(s=>'<span'+(Number(s.value)>0?'':' class="is-zero"')+'><i data-tone="'+esc(s.tone||'idle')+'" aria-hidden="true"></i>'+esc(s.label)+' <b>'+esc(format(s.value||0))+'</b></span>').join('')+'</figcaption></figure>';
}

// Ordered stages (for example research → contacted → replied): bars against the first stage, each with
// the share that reached it from the step before.
export function funnel(stages,{esc,label='Funnel',format=compact}={}){
 const list=stages.filter(s=>s&&s.label);const top=Math.max(0,...list.map(s=>Number(s.value)||0));
 if(!top)return '';
 return '<ol class="viz-funnel" aria-label="'+esc(label+': '+list.map(s=>s.label+' '+format(s.value||0)).join(', '))+'">'+list.map((s,i)=>{const v=Number(s.value)||0,prev=i?Number(list[i-1].value)||0:0;const step=i&&prev?Math.round(v/prev*100)+'% of previous':'';
  return '<li title="'+esc(s.label+': '+format(v)+(step?' · '+step:''))+'"><span class="viz-bar-label">'+esc(s.label)+'</span><span class="viz-bar-track"><span class="viz-bar" style="--w:'+Math.max(v?2:0,Math.round(v/top*100))+'%"></span></span><b>'+esc(format(v))+'</b><small>'+esc(step)+'</small></li>'}).join('')+'</ol>';
}

// A share as a ring (0–100). The number sits in the middle; the label says what it counts.
export function ring(value,total,{esc,label='Share',tone='live',center}={}){
 const t=Number(total)||0,v=Math.max(0,Math.min(t,Number(value)||0)),pct=t?v/t*100:0;
 return '<figure class="viz-ring" data-tone="'+esc(tone)+'"><svg viewBox="0 0 36 36" role="img" aria-label="'+esc(label+': '+v+' of '+t)+'"><circle class="viz-ring-track" cx="18" cy="18" r="15.5" pathLength="100"></circle>'+(pct?'<circle class="viz-ring-value" cx="18" cy="18" r="15.5" pathLength="100" style="stroke-dashoffset:'+(100-pct).toFixed(2)+'"></circle>':'')+'</svg><span class="viz-ring-center">'+esc(center??Math.round(pct)+'%')+'</span></figure>';
}

// Agent avatar: initials on the agent's department colour; a ring pulses only while it runs.
const SMALL=/^(of|the|and|for|a|an)$/i;
export const initials=n=>{const words=String(n||'').replace(/[^\p{L}\p{N}\s]/gu,' ').trim().split(/\s+/).filter(Boolean),big=words.filter(w=>!SMALL.test(w));return (big.length?big:words).map(w=>w[0]).slice(0,2).join('').toUpperCase()||'?'};
const DEPARTMENTS=new Set(['ecom','outreach','growth','content','revenue','operations','build','finance','command']);
export function avatar({name,department,live=false,size='md'},{esc}){
 const dept=DEPARTMENTS.has(department)?department:'none';
 return '<span class="avatar avatar--'+esc(size)+'" data-dept="'+dept+'"'+(live?' data-live="true"':'')+' aria-hidden="true">'+esc(initials(name))+'</span>';
}

// The next 24 hours on one line, starting now: each item is a dot at its time; ticks every six hours.
// Dots closer than about 15 minutes on a 24 h track overlap; draw them as one dot with a count (7 Oct 2026).
const clusters=(list,pos,gap=1.2)=>list.reduce((out,i)=>{const last=out.at(-1);if(last&&pos(i.t)-pos(last[0].t)<gap)last.push(i);else out.push([i]);return out},[]);
export function dayTimeline(items,{esc,label='Next 24 hours',now=new Date()}={}){
 const start=+now,span=86400000,pos=t=>(t-start)/span*100;
 const list=items.map(i=>({...i,t:typeof i.at==='number'?(i.at<1e12?i.at*1000:i.at):Date.parse(i.at)})).filter(i=>Number.isFinite(i.t)&&i.t>=start&&i.t<start+span).sort((a,b)=>a.t-b.t);
 const clock=t=>new Date(t).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
 return '<figure class="viz-day"><div class="viz-day-track" role="img" aria-label="'+esc(label+': '+(list.length?list.map(i=>clock(i.t)+' '+i.label).join(', '):'nothing scheduled'))+'">'
  +[0,6,12,18].map(h=>'<span class="viz-day-tick" style="left:'+(h/24*100)+'%">'+(h?esc(clock(start+h*3600000)):'Now')+'</span>').join('')
  +clusters(list,pos).map(c=>{const first=c[0],tone=c.some(i=>i.tone==='error')?'error':first.tone||'info',title=c.map(i=>clock(i.t)+' · '+i.label).join('\n');
   return '<span class="viz-day-dot'+(c.length>1?' viz-day-dot--many':'')+'" data-tone="'+esc(tone)+'" style="left:'+pos(first.t).toFixed(2)+'%" title="'+esc(title)+'">'+(c.length>1?'<b>'+c.length+'</b>':'')+'</span>'}).join('')
  +'</div></figure>';
}

// Dated items across a period (Phase 3.0), for example milestone deadlines: one row per item, a dot for a
// date or a bar for a range, month ticks along the top and a "today" line when today is inside the period.
const toTime=v=>typeof v==='number'?(v<1e12?v*1000:v):Date.parse(v);
export function rangeTimeline(items,{esc,from,to,label='Timeline',max=12,now=Date.now()}={}){
 const list=items.map(i=>({...i,s:toTime(i.start??i.at),e:i.end!=null?toTime(i.end):NaN})).filter(i=>Number.isFinite(i.s)).sort((a,b)=>a.s-b.s).slice(0,max);
 if(!list.length)return '';
 const lo=Number.isFinite(toTime(from))?toTime(from):Math.min(...list.map(i=>i.s)),hiRaw=Number.isFinite(toTime(to))?toTime(to):Math.max(...list.map(i=>Number.isFinite(i.e)?i.e:i.s));
 const hi=hiRaw>lo?hiRaw:lo+86400000,pos=t=>Math.max(0,Math.min(100,(t-lo)/(hi-lo)*100));
 const day=t=>new Date(t).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
 const ticks=[],first=new Date(lo),years=new Date(lo).getFullYear()!==new Date(hi).getFullYear();
 for(let d=new Date(first.getFullYear(),first.getMonth()+(first.getDate()>1?1:0),1);+d<=hi&&ticks.length<24;d=new Date(d.getFullYear(),d.getMonth()+1,1))ticks.push(+d);
 const tickHTML=ticks.map(t=>'<span class="viz-range-tick" style="left:'+pos(t).toFixed(2)+'%">'+esc(new Date(t).toLocaleDateString('en-GB',years?{month:'short',year:'2-digit'}:{month:'short'}))+'</span>').join('');
 const today=now>=lo&&now<=hi?' style="--now:'+pos(now).toFixed(2)+'%" data-today="true"':'';
 const rows=list.map(i=>{const a=pos(i.s),b=Number.isFinite(i.e)&&i.e>i.s?pos(i.e):null,text=i.label+': '+day(i.s)+(b!=null?' – '+day(i.e):'')+(i.note?' · '+i.note:'');
  return '<li title="'+esc(text)+'"><span class="viz-bar-label">'+esc(i.label)+'</span><span class="viz-range-track">'+(b!=null?'<span class="viz-range-span" data-tone="'+esc(i.tone||'info')+'" style="left:'+a.toFixed(2)+'%;width:'+Math.max(1,b-a).toFixed(2)+'%"></span>':'<span class="viz-range-dot" data-tone="'+esc(i.tone||'info')+'" style="left:'+a.toFixed(2)+'%"></span>')+'</span></li>'}).join('');
 return '<figure class="viz-range"'+today+' role="img" aria-label="'+esc(label+': '+list.map(i=>i.label+' '+day(i.s)).join(', ')+(today?' · today marked':''))+'"><ol><li class="viz-range-head" aria-hidden="true"><span></span><span class="viz-range-axis">'+tickHTML+'</span></li>'+rows+'</ol></figure>';
}

// Signed magnitudes (Phase 3.0), for example growth per brand: bars grow left of zero for negative values
// and right for positive ones; the label carries the sign so colour is never the only cue.
const signed=n=>(n>0?'+':n<0?'−':'')+compact(Math.abs(n));
export function signedBars(rows,{esc,format=signed,label='Change',max=10}={}){
 const list=rows.filter(r=>Number.isFinite(Number(r.value))).map(r=>({...r,value:Number(r.value)})).sort((a,b)=>b.value-a.value).slice(0,max);
 if(!list.length||list.every(r=>r.value===0))return '';
 const neg=Math.max(0,...list.map(r=>-r.value)),pos=Math.max(0,...list.map(r=>r.value)),span=neg+pos||1,zero=neg/span*100;
 return '<ol class="viz-signed" aria-label="'+esc(label+': '+list.map(r=>r.label+' '+format(r.value)).join(', '))+'" style="--zero:'+zero.toFixed(2)+'%">'+list.map(r=>{const w=Math.abs(r.value)/span*100,left=r.value<0?zero-w:zero;
  return '<li title="'+esc(r.label+': '+format(r.value)+(r.note?' · '+r.note:''))+'"><span class="viz-bar-label">'+esc(r.label)+'</span><span class="viz-signed-track"><span class="viz-signed-bar" data-sign="'+(r.value<0?'neg':'pos')+'" style="left:'+left.toFixed(2)+'%;width:'+Math.max(r.value?1:0,w).toFixed(2)+'%"></span></span><b>'+esc(format(r.value))+'</b></li>'}).join('')+'</ol>';
}

// Status bar (7 Oct 2026, the 21st.dev / openstatus "status bar" pattern): one row per source, one bar per day,
// coloured by the recorded outcome. Days without a record are grey "no run", never a guessed success.
// rows: [{label, days:[{date, tone:'live'|'warn'|'error'|'idle', title}], summary}]
export function statusBar(rows,{esc,legend=[]}={}){
 if(!rows?.length)return '<p class="dt-empty">No history recorded yet.</p>';
 return '<div class="viz-status">'+rows.map(r=>'<div class="viz-status-row"><span class="viz-status-label">'+esc(r.label)+'</span><span class="viz-status-days" role="img" aria-label="'+esc(r.label+': '+(r.summary||''))+'">'
  +r.days.map(d=>'<i data-tone="'+esc(d.tone||'idle')+'" title="'+esc(d.title||d.date)+'"></i>').join('')+'</span><span class="viz-status-sum">'+esc(r.summary||'')+'</span></div>').join('')
  +(legend.length?'<p class="viz-status-legend">'+legend.map(([tone,text])=>'<span><i data-tone="'+esc(tone)+'" aria-hidden="true"></i>'+esc(text)+'</span>').join('')+'</p>':'')+'</div>';
}
