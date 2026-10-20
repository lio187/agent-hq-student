// Reuse the canonical Creator Lab calculations; keep unknown measurements intact.
import {filterPosts,sortExamples,summarize,groupPosts} from '../../../../tools/creator-lab/public/research.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function selectResearch(posts,options={}){
 const metric=options.metric==='plays'?'plays':'views';
 const selected=sortExamples(filterPosts(posts,options).filter(post=>JSON.stringify(post).toLowerCase().includes((options.query||'').toLowerCase())),options.sort||'reach',metric);
 const groups=groupPosts(selected,options.dimension||'mechanism',metric).sort((a,b)=>(b[options.sort||'reach']??-Infinity)-(a[options.sort||'reach']??-Infinity)||b.n-a.n||a.key.localeCompare(b.key));
 const examples=options.category&&options.category!=='all'?groups.find(g=>g.key===options.category)?.posts||[]:selected;
 return {posts:examples,summary:summarize(examples,metric),metric,groups};
}
export function analysisControls(posts,options={}){
 const select=(name,title,entries)=>'<label>'+title+'<select data-research-filter="'+name+'">'+entries.map(([value,label])=>'<option value="'+esc(value)+'"'+(String(options[name]??'all')===value?' selected':'')+'>'+esc(label)+'</option>').join('')+'</select></label>';
 const values=key=>[['all','All'],...[...new Set(posts.filter(p=>!p.excludedReason).map(p=>p.analysis?.labels?.[key]?.value).filter(Boolean))].sort().map(value=>[value,value])];
 return select('dimension','Compare by',[['mechanism','Hook mechanism'],['topic','Topic'],['opening','Opening move'],['structure','Script structure'],['evidence','Evidence offered'],['emotion','Emotional appeal'],['specificity','Advice specificity'],['cta','Spoken CTA']])+select('topic','Topic',values('topic'))+select('hook','Hook mechanism',values('mechanism'))+select('metric','Reach measurement',[['views','Views'],['plays','Plays']])+select('sort','Order',[['reach','Reach'],['likeRate','Likes per 1,000'],['commentRate','Comments per 1,000']])+select('minConfidence','Minimum selected label confidence',[['0','Any'],['0.7','70%'],['0.9','90%']])+select('minAgeDays','Minimum age',[['0','Any'],['7','7 days'],['30','30 days']])+select('maxDuration','Maximum duration',[['0','Any'],['30','30 seconds'],['60','60 seconds'],['90','90 seconds']])+select('dedupe','Duplicates',[['true','Hide duplicates'],['false','Include duplicates']]);
}
export function researchPassages(post){
 const segments=post.analysis?.anatomy;
 if(!Array.isArray(segments)||!segments.length)return '';
 return '<h3>Script passages</h3><ol>'+segments.map(segment=>{
  const timed=typeof segment.start==='number'&&Number.isFinite(segment.start)&&segment.start>=0;
  const confidence=typeof segment.confidence==='number'&&Number.isFinite(segment.confidence)?' · Confidence '+Math.round(segment.confidence*100)+'%':'';
  return '<li><strong>'+esc(segment.value||'Unclassified')+'</strong><small> · '+(timed?esc(segment.start)+'s':'Timing unknown')+esc(confidence)+'</small><p style="white-space:pre-wrap">'+esc(segment.text)+'</p></li>';
 }).join('')+'</ol>';
}
export function researchSummary(result){
 const number=value=>value===null?'Unknown':Number(value.toFixed(2)).toLocaleString('en-GB');
 const s=result.summary;
 return '<p role="status">'+s.n+' matching posts · Median '+result.metric+': '+number(s.reach)+' ('+s.counts.reach+' measured) · Median likes per 1,000 '+result.metric+': '+number(s.likeRate)+' ('+s.counts.likeRate+' measured)</p>';
}

export function groupComparison(result,options={}){
 const {groups,metric}=result;
 const number=value=>value===null?'Unknown':Number(value.toFixed(2)).toLocaleString('en-GB');
 const cell=(group,key)=>number(group[key])+' <small>n='+group.counts[key]+'</small>';
 const rows=groups.map(g=>'<tr><th scope="row">'+esc(g.key)+'</th><td>'+g.n+(g.n<5?' · Small sample':'')+'</td><td>'+cell(g,'reach')+'</td><td>'+cell(g,'likeRate')+'</td><td>'+cell(g,'commentRate')+'</td><td><button data-research-category="'+esc(g.key)+'">See Reels</button></td></tr>').join('');
 const chooser=(key,title)=>'<label>'+title+'<select data-research-filter="'+key+'"><option value="">Choose a group</option>'+groups.map(g=>'<option value="'+esc(g.key)+'"'+(options[key]===g.key?' selected':'')+'>'+esc(g.key)+'</option>').join('')+'</select></label>';
 const a=groups.find(g=>g.key===options.compareA),b=groups.find(g=>g.key===options.compareB);
 let comparison='';
 if(a&&b&&a!==b){
  const delta=a.likeRate!==null&&a.likeRate>0&&b.likeRate!==null?esc(b.key)+' has '+Math.abs((b.likeRate/a.likeRate-1)*100).toFixed(0)+'% '+(b.likeRate>=a.likeRate?'higher':'lower')+' median likes per 1,000 '+metric+' than '+esc(a.key)+'.':'A relative comparison requires known rates and a nonzero baseline.';
  comparison='<div class="metrics">'+[a,b].map(g=>'<article><h4>'+esc(g.key)+'</h4><p>'+g.n+' Reels'+(g.n<5?' · Small sample':'')+'</p><dl>'+[['reach','Median '+metric],['likes','Median likes'],['likeRate','Likes per 1,000 '+metric],['commentRate','Comments per 1,000 '+metric]].map(([key,label])=>'<dt>'+label+'</dt><dd>'+cell(g,key)+'</dd>').join('')+'</dl><button data-research-category="'+esc(g.key)+'">See Reels</button></article>').join('')+'</div><p>'+delta+' Observed association in this filtered sample; this does not establish causation.</p>';
 }
 return '<section aria-label="Pattern comparison"><h3>Pattern comparison</h3><p>Classified, non-excluded Reels within the current filters. Counts are collection-time snapshots.</p><div style="overflow-x:auto"><table><thead><tr><th scope="col">Pattern</th><th scope="col">Reels</th><th scope="col">Median '+metric+'</th><th scope="col">Likes per 1,000</th><th scope="col">Comments per 1,000</th><th scope="col">Evidence</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+(groups.length?chooser('compareA','Baseline group')+chooser('compareB','Comparison group')+comparison:'<p>No classified Reels match these filters.</p>')+'<button data-research-category="all">Show all matching Reels</button></section>';
}
