import {rate,median} from '../../../../tools/creator-lab/public/research.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const display=value=>new Intl.NumberFormat('en-GB',{maximumFractionDigits:2}).format(value);

// Match the source chart: log reach, linear likes per 1k, fixed domain across categories.
export function scatterData(result){
 const metric=result.metric==='plays'?'plays':'views';
 const point=post=>({post,x:post[metric],y:rate(post,'likes',metric)});
 const eligible=post=>post.analysis&&!post.excludedReason&&typeof post[metric]==='number'&&Number.isFinite(post[metric])&&post[metric]>0&&Number.isFinite(rate(post,'likes',metric));
 const domain=(result.groups||[]).flatMap(group=>group.posts).filter(eligible).map(point);
 const points=result.posts.filter(eligible).map(point);
 const lo=domain.length?Math.floor(Math.log10(Math.min(...domain.map(p=>p.x)))):3;
 const hi=Math.max(lo+1,domain.length?Math.ceil(Math.log10(Math.max(...domain.map(p=>p.x)))):4);
 const ymax=Math.max(10,Math.ceil(Math.max(1,...domain.map(p=>p.y))/10)*10);
 const position=({x,y})=>({left:(Math.log10(x)-lo)/(hi-lo)*100,top:(1-y/ymax)*100});
 return {metric,lo,hi,ymax,points:points.map(p=>({...p,...position(p)})),median:points.length?position({x:median(points.map(p=>p.x)),y:median(points.map(p=>p.y))}):null,omitted:result.posts.length-points.length};
}

export function researchScatter(result){
 const chart=scatterData(result),{metric,points,lo,hi,ymax}=chart;
 if(!points.length)return '<section aria-label="Reel performance map"><h3>Reel performance map</h3><p>No classified Reels with positive '+metric+' and known likes in this selection. Missing or zero reach is not plotted on a logarithmic axis.</p></section>';
 const grid=Array.from({length:5},(_,i)=>{const top=i*25;return '<div style="position:absolute;left:0;right:0;top:'+top+'%;border-top:1px solid currentColor;opacity:.2" aria-hidden="true"></div><span style="position:absolute;right:calc(100% + 8px);top:'+top+'%;transform:translateY(-50%);font-size:11px">'+display(ymax*(1-i/4))+'</span>'}).join('');
 const ticks=Array.from({length:hi-lo+1},(_,i)=>'<span style="position:absolute;top:calc(100% + 8px);left:'+(i/(hi-lo)*100)+'%;transform:translateX(-50%);font-size:11px">'+esc(new Intl.NumberFormat('en',{notation:'compact'}).format(10**(lo+i)))+'</span>').join('');
 const med=chart.median?'<div aria-hidden="true" style="position:absolute;top:0;bottom:0;left:'+chart.median.left+'%;border-left:1px dashed currentColor"></div><div aria-hidden="true" style="position:absolute;left:0;right:0;top:'+chart.median.top+'%;border-top:1px dashed currentColor"></div>':'';
 const buttons=points.map(p=>{const label='Inspect Reel '+p.post.id+' · '+display(p.x)+' '+metric+' · '+display(p.y)+' likes per 1,000';return '<button type="button" data-research-inspect="'+esc(p.post.id)+'" aria-label="'+esc(label)+'" title="'+esc(label)+'" style="position:absolute;left:'+p.left+'%;top:'+p.top+'%;transform:translate(-50%,-50%);width:24px;height:24px;min-width:24px;min-height:24px;padding:0;border-radius:50%;border:1px solid currentColor;background:var(--accent, currentColor)"><span aria-hidden="true">·</span></button>'}).join('');
 return '<section aria-label="Reel performance map"><h3>Reel performance map</h3><p>'+points.length+' plotted · '+chart.omitted+' omitted (unclassified, excluded or missing valid measurements). Likes per 1,000 '+metric+' ↑. Dashed lines show medians of the plotted selection.</p><div style="padding:20px 30px 40px 70px"><div role="group" aria-label="Choose a Reel to inspect its original transcript and measurements" style="position:relative;height:300px">'+grid+ticks+med+buttons+'</div></div><p>'+metric+' · logarithmic scale →. Choose a point to open its saved evidence. Overlapping points are also accessible from the Reel list below.</p></section>';
}

export function inspectResearchPost(root,id){
 const row=[...root.querySelectorAll('[data-research-post]')].find(el=>el.dataset.researchPost===id);
 const details=row?.querySelector('details');if(!details)return false;
 details.open=true;details.querySelector('summary')?.focus();row.scrollIntoView?.({block:'nearest'});return true;
}
