import {researchWall,selectWallTile} from './creator-wall.mjs';
import {createResearchReplay,replayControls} from './creator-replay.mjs';
import {researchScatter,inspectResearchPost} from './creator-scatter.mjs';
import {createRadarControls} from './creator-radar-controls.mjs';
import {loadRadarReports} from './creator-radar.mjs';
import {creatorMedia,attachCreatorMedia} from './creator-media.mjs';
import {createCreatorProgress} from './creator-progress.mjs';
import {selectResearch,analysisControls,researchPassages,researchSummary,groupComparison} from './creator-analysis.mjs';
import {creatorWrite} from './creator-client.mjs';
import {createWatchlists} from './creator-watchlists.mjs';
import {createConnections,parseScrapeImport} from './creator-connections.mjs';
import {dataTable,relativeTime,stagePill} from './data-table.mjs';
const when=v=>{const d=new Date(v);return Number.isNaN(+d)?String(v??''):d.toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'})};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const count=value=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('en-GB'):'Unknown';
export function researchCapture(run,post,fields){
 if(!run?.id||!post?.id||!run.posts?.some(p=>p.id===post.id))throw Error('Choose a post from the saved analysis.');
 const url=new URL(post.url);
 if(url.protocol!=='https:'||url.username||url.password||!['instagram.com','www.instagram.com'].includes(url.hostname))throw Error('This post has no supported original Reel URL.');
 if(!post.scrapedAt||!fields.accountId||!fields.title?.trim()||!fields.idea?.trim())throw Error('Choose an account and enter a title and your own angle. Source observation date is required.');
 return {action:'research.capture',accountId:fields.accountId,title:fields.title.trim(),idea:fields.idea.trim(),source:{platform:'instagram',id:'ig:'+post.id,url:url.href,handle:'@'+post.creator,observedAt:post.scrapedAt,report:'creator-lab run '+run.id},signals:{likes:post.likes??null,comments:post.comments??null,views:post.views??null,jev:post.analysis?.labels||{}}};
}
export function researchAccounts(data,business='all'){
 const bound={tao:'liogpt','187n':'187n'}[business];
 return [...new Map([...(data.accounts||[]),...(data.accountRegistry||[])].map(a=>[a.id,a])).values()].filter(a=>!bound||a.id===bound);
}
export async function captureAndVerify(api,payload,path='workspace/team/content'){
 if(!payload.accountId||payload.accountId==='all'||!payload.title?.trim()||!payload.idea?.trim())throw Error('Choose an account and enter a title and your own angle.');
 const sourceId=payload.source?.id||payload.sourceId||payload.id;
 if(!sourceId)throw Error('Choose an original research source.');
 const receipt=await api(path,payload);
 let snapshot;try{snapshot=await api('workspace/team/content?account='+encodeURIComponent(payload.accountId))}catch{throw Error('Submission received, but source readback failed. Check the content library before submitting again.')}
 const item=snapshot.items?.find(item=>item.id===receipt.id&&item.researchRef?.id===sourceId&&(item.accountRegistryId||item.accountId)===payload.accountId);
 if(!item)throw Error('The source has not confirmed this idea. Check the content library before submitting again.');
 if(item.title!==payload.title.trim()||item.shots!==payload.idea.trim())throw Error('This source already has a different or edited idea ('+item.id+'). Your submitted title or angle was not confirmed. Open that item in the content library; your text remains here.');
 if(payload.source&&['url','observedAt','report'].some(key=>item.researchRef?.[key]!==payload.source[key]))throw Error('The saved idea refers to different source evidence. Check the original item before continuing.');
 return item;
}
export function researchPost(post){
 let source='';try{const url=new URL(post.url);if(url.protocol==='https:'&&!url.username&&!url.password&&['instagram.com','www.instagram.com'].includes(url.hostname))source='<a href="'+esc(url.href)+'" target="_blank" rel="noopener noreferrer">Original Reel ↗</a>'}catch{}
 const labels=Object.entries(post.analysis?.labels||{}).map(([name,value])=>'<dt>'+esc(name)+'</dt><dd>'+esc(typeof value==='object'?JSON.stringify(value):value)+'</dd>').join('');
 return '<details class="usage-detail"><summary>'+esc(post.analysis?.opening||post.caption||post.id)+'</summary><p class="source">'+esc(post.id)+' · '+esc(post.status)+' · Published '+esc(post.publishedAt||'Unknown')+'</p><p>Likes '+count(post.likes)+' · Comments '+count(post.comments)+' · Views '+count(post.views)+' · Plays '+count(post.plays)+'</p>'+source+creatorMedia(post)+'<h3>Transcript</h3><p style="white-space:pre-wrap">'+esc(post.transcript?.text||'No saved transcript')+'</p><h3>Jev labels</h3>'+(labels?'<dl>'+labels+'</dl>':'<p>No saved classification</p>')+researchPassages(post)+'</details>';
}
export function createCreatorResearch({root,filters,refresh,prepareResearch}){
 let selected='',query='',currentRun=null,token='',notice='';
 const wall={loadImages:false,page:0,selectedId:''};
 function renderWall(){const target=root.querySelector('[data-research-wall]');if(target)target.innerHTML=researchWall(selectResearch(currentRun?.posts||[],{...options,query}),currentRun?.id,wall)}
 attachCreatorMedia(root,()=>currentRun);
 root.addEventListener('error',event=>{const image=event.target;if(!image?.hasAttribute?.('data-research-thumbnail'))return;image.hidden=true;const note=root.ownerDocument.createElement('small');note.textContent='Thumbnail unavailable';image.replaceWith(note)},true);
 const options={dimension:'mechanism',category:'all',compareA:'',compareB:'',topic:'all',hook:'all',metric:'views',sort:'reach',minConfidence:0,minAgeDays:0,maxDuration:0,dedupe:true};
 let replayResult=null;
 const replay=createResearchReplay({onFrame:frame=>{
  const status=root.querySelector('[data-research-replay-status]');if(!status)return;
  status.textContent=frame.status==='empty'?'No classified Reels match these filters.':frame.status==='stopped'?'Replay stopped. Showing the current saved analysis.':(frame.active?'Saved evidence replay':'Replay complete')+' · '+frame.index+' / '+frame.total;
  const start=root.querySelector('[data-research-replay="start"]'),stop=root.querySelector('[data-research-replay="stop"]');if(start)start.disabled=frame.active;if(stop)stop.disabled=!frame.active;
  const map=root.querySelector('[data-research-map]');if(map&&replayResult)map.innerHTML=researchScatter(frame.status==='stopped'?selectResearch(currentRun?.posts||[],{...options,query}):{...replayResult,posts:frame.visible});
  const evidence=root.querySelector('[data-research-replay-evidence]');if(evidence){evidence.innerHTML=frame.current&&frame.status!=='stopped'?'<p class="source">'+esc(frame.current.id)+'</p><h4>'+esc(frame.current.analysis?.opening||'Saved classification')+'</h4>'+researchPassages(frame.current)+'<button type="button" data-research-inspect="'+esc(frame.current.id)+'">Inspect original Reel evidence</button>':''}
 }});
 function resetReplay(){replay.stop({notify:false});replayResult=null;wall.page=0;wall.selectedId=''}
 function results(){const result=selectResearch(currentRun?.posts||[],{...options,query});return '<div data-research-wall>'+researchWall(result,currentRun?.id,wall)+'</div>'+replayControls()+'<div data-research-map>'+researchScatter(result)+'</div>'+groupComparison(result,options)+researchSummary(result)+result.posts.map(post=>'<div data-research-post="'+esc(post.id)+'">'+researchPost(post)+(prepareResearch?'<button data-research-idea="'+esc(post.id)+'">Prepare own idea</button>':'')+'</div>').join('')}
 function renderResults(){const target=root.querySelector('[data-research-results]');if(!target)return;const open=new Set([...target.querySelectorAll('[data-research-post]')].filter(el=>el.querySelector('details')?.open).map(el=>el.dataset.researchPost));const previews=new Map([...target.querySelectorAll('[data-creator-preview-id]')].filter(el=>el.querySelector('video')).map(el=>[el.dataset.creatorPreviewId,el]));target.innerHTML=results();for(const el of target.querySelectorAll('[data-creator-preview-id]')){const previous=previews.get(el.dataset.creatorPreviewId);if(previous)el.replaceWith(previous)}for(const el of target.querySelectorAll('[data-research-post]'))if(open.has(el.dataset.researchPost))el.querySelector('details').open=true}
 root.addEventListener('change',event=>{const key=event.target.dataset?.researchFilter;if(!Object.hasOwn(options,key))return;resetReplay();if(key==='dimension'){options.category='all';options.compareA='';options.compareB=''}options[key]=key==='dedupe'?event.target.value==='true':['minConfidence','minAgeDays','maxDuration'].includes(key)?Number(event.target.value):event.target.value;renderResults()});
 root.addEventListener('submit',async event=>{
  const form=event.target;if(!['creator-new-run','creator-run-control','creator-attach-run'].includes(form.id))return;
  event.preventDefault();const submitter=event.submitter;if(!submitter||submitter.disabled)return;
  const fields=Object.fromEntries(new FormData(form));const status=form.querySelector('[data-creator-status]');
  let path,body;
  if(form.id==='creator-new-run'){path='runs';body={creator:fields.creator,limit:Number(fields.limit),budget:Number(fields.budget),concurrency:Number(fields.concurrency),language:fields.language||''}}
  else if(form.id==='creator-attach-run'){if(!currentRun)return;path='runs/'+encodeURIComponent(currentRun.id)+'/attach';body={runId:fields.runId}}
  else{if(!currentRun)return;const action=submitter.value;if(!['run','pause'].includes(action))return;if(action==='run'&&!form.querySelector('[name="spend_ack"]').checked){status.textContent='Confirm the provider spending before starting or resuming.';return}path='runs/'+encodeURIComponent(currentRun.id)+'/'+action;body=action==='run'?{concurrency:Number(fields.concurrency)}:{}}
  const inputs=[...form.querySelectorAll('button,input,select')];inputs.forEach(input=>input.disabled=true);status.textContent='Submitting once to the original source…';
  try{if(form.id==='creator-new-run'){const file=form.querySelector('[name="import_file"]')?.files?.[0];if(file){if(file.size>19*1024*1024)throw Error('Import file exceeds the supported 19 MiB limit.');body.rows=parseScrapeImport(await file.text())}}const receipt=await creatorWrite(path,body,token);if(form.id==='creator-new-run'){if(!receipt.id)throw Error('Source receipt has no run ID. Check the original app before retrying.');selected=receipt.id;query=''}notice=path.endsWith('/pause')?'Pause requested. In-flight requests may still finish.':'Source accepted the action. Status below is read back from the original run.';await refresh()}
  catch(error){status.textContent=error.message}
  finally{inputs.forEach(input=>input.disabled=false)}
 });
 async function read(path){const response=await fetch('/creator-lab/api/'+path,{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw new Error('Creator Lab is unavailable ('+response.status+'). Open the original app to check its status.');return response.json()}
 const progress=createCreatorProgress({read,onState:message=>{const el=root.querySelector('[data-creator-live]');if(el)el.textContent=message},onRun:run=>{
  currentRun=run;
  for(const el of root.querySelectorAll('[data-creator-run-state]'))el.textContent=run.status||'Unknown';
  const events=root.querySelector('[data-creator-events]');if(events)events.textContent=(run.events||[]).map(e=>e.at+' '+e.message).join('\n');
  const error=root.querySelector('[data-creator-error]');if(error)error.textContent=run.error||'No source error reported';
  const cost=root.querySelector('[data-creator-cost]');if(cost)cost.textContent=run.costs?.apify==null?'Unknown':'$'+run.costs.apify;
  const resultsRoot=root.querySelector('[data-research-results]');if(!replay.active&&!resultsRoot?.contains(root.ownerDocument?.activeElement)&&![...(resultsRoot?.querySelectorAll('video')||[])].some(video=>!video.paused))renderResults();
 }});
 const watchlists=createWatchlists({root,read,write:(path,body)=>creatorWrite(path,body,token)});
 const radarControls=createRadarControls({root,read,write:(path,body)=>creatorWrite(path,body,token),refresh});
 const connections=createConnections({root,read,write:(path,body)=>creatorWrite(path,body,token)});
 root.addEventListener('click',event=>{const wallImages=event.target.closest('[data-research-wall-images]');if(wallImages){wall.loadImages=wallImages.dataset.researchWallImages==='true';renderWall();return}const wallPage=event.target.closest('[data-research-wall-page]');if(wallPage){wall.page=Number(wallPage.dataset.researchWallPage);renderWall();return}const replayButton=event.target.closest('[data-research-replay]');if(replayButton){if(replayButton.dataset.researchReplay==='stop')replay.stop();else{replayResult=selectResearch(currentRun?.posts||[],{...options,query});replay.start(replayResult.posts)}return}const inspect=event.target.closest('[data-research-inspect]');if(inspect){wall.selectedId=inspect.dataset.researchInspect;selectWallTile(root,wall.selectedId);inspectResearchPost(root,wall.selectedId);return}const category=event.target.closest('[data-research-category]');if(category){resetReplay();options.category=category.dataset.researchCategory;renderResults();return}const idea=event.target.closest('[data-research-idea]');if(idea){const post=currentRun?.posts?.find(p=>p.id===idea.dataset.researchIdea);if(post&&prepareResearch)prepareResearch(currentRun,post);return}const button=event.target.closest('[data-research-run]');if(button){resetReplay();wall.loadImages=false;selected=button.dataset.researchRun;query='';options.topic='all';options.hook='all';options.category='all';options.compareA='';options.compareB='';currentRun=null;refresh()}});
 root.addEventListener('input',event=>{if(event.target.id!=='creator-research-query')return;resetReplay();query=event.target.value;renderResults()});
 const view=async()=>{
  filters('');
  const boot=await read('bootstrap');
  const radar=await loadRadarReports();
  const radarControlView=await radarControls();
  token=boot.token||'';
  let watchlistView;try{watchlistView=await watchlists()}catch(error){watchlistView='<p class="notice">'+esc(error.message)+'</p>'}
  const runs=boot.runs||[];
  if(selected&&!runs.some(run=>run.id===selected))selected='';
  // Saved analyses as a sortable table (Phase 3.3); "Read analysis" keeps its data-research-run handler.
  const statuses=[...new Set(runs.map(run=>run.status).filter(Boolean))];
  const listing='<section class="card"><h2>Saved analyses · '+runs.length+'</h2>'+dataTable({id:'creator-runs',esc,rows:runs,pageSize:15,defaultSort:{key:'created',dir:'desc'},emptyText:'No saved analyses yet.',
   tabs:statuses.length>1?statuses.map(st=>({id:'s-'+st,label:st[0].toUpperCase()+st.slice(1),filter:run=>run.status===st})):undefined,
   columns:[{key:'creator',label:'Creator',value:run=>run.creator,className:'dt-primary',cell:run=>'<strong>@'+esc(run.creator)+'</strong><small>'+esc(when(run.createdAt))+'</small>'},
    {key:'status',label:'Status',value:run=>run.status,cell:run=>stagePill(run.status||'Unknown',esc)},
    {key:'created',label:'Created',value:run=>Date.parse(run.createdAt)||null,cell:run=>'<span class="dt-muted">'+esc(relativeTime(run.createdAt)||'—')+'</span>'},
    {key:'classified',label:'Classified',value:run=>Number(run.completed)||0,cell:run=>esc(count(run.completed)+' of '+count(run.count))},
    {key:'open',label:'',className:'dt-action',cell:run=>'<button type="button" class="dt-action" data-research-run="'+esc(run.id)+'"'+(run.id===selected?' aria-current="true"':'')+'>Read analysis</button>'}]})+'</section>';
  let detail='';
  if(selected){
   const run=await read('runs/'+encodeURIComponent(selected));
   if(run.id!==selected)throw new Error('Source returned a different analysis; reload before continuing.');
   currentRun=run;
   detail='<section class="card"><h2>@'+esc(run.creator)+' · saved research</h2><p class="source">Original run '+esc(run.id)+' · '+'<span data-creator-run-state>'+esc(run.status)+'</span> · '+esc(run.createdAt)+'</p><a href="/creator-lab/api/runs/'+encodeURIComponent(run.id)+'/export" download>Download original analysis JSON</a><label>Search transcripts and labels<input id="creator-research-query" type="search" value="'+esc(query)+'"></label>'+analysisControls(run.posts||[],options)+'<div data-research-results>'+results()+'</div></section>';
  }
  const controls=currentRun&&selected?'<section class="card"><h2>Run controls</h2><p class="source">'+esc(currentRun.id)+' · '+'<span data-creator-run-state>'+esc(currentRun.status)+'</span> · Speech provider '+esc(boot.transcriptionProvider||'Unknown')+'</p><p>Requested Reels: '+count(currentRun.limit)+' · Apify cap: $'+esc(currentRun.budget??'Unknown')+' · Recorded Apify cost: '+'<span data-creator-cost>'+(currentRun.costs?.apify==null?'Unknown':'$'+esc(currentRun.costs.apify))+'</span></p><p data-creator-live role="status">Connecting live updates…</p><form id="creator-run-control"><label>Concurrency<input name="concurrency" type="number" min="1" max="12" value="'+esc(currentRun.concurrency||4)+'" required></label><label><input type="checkbox" name="spend_ack">I authorize starting or resuming this analysis with provider spending. The Apify cap does not cover transcription or Jev.</label><button type="submit" value="run">Start / resume analysis</button><button type="submit" value="pause" formnovalidate>Request pause</button><p data-creator-status role="status"></p></form><details><summary>Source events and errors</summary><p data-creator-error>'+esc(currentRun.error||'No source error reported')+'</p><pre class="script-reader" data-creator-events>'+esc((currentRun.events||[]).map(e=>e.at+' '+e.message).join('\n'))+'</pre></details></section>':'';
  const creation='<details class="card"><summary>Prepare a new analysis</summary><p>Creating a run saves its settings. Collection starts only after you select Start / resume.</p><form id="creator-new-run"><label>Instagram handle<input name="creator" pattern="[A-Za-z0-9_.]{1,30}" required maxlength="30" placeholder="Without @"></label><label>Reel limit<input name="limit" type="number" min="1" max="1000" value="20" required></label><label>Apify cap (USD; transcription and Jev extra)<input name="budget" type="number" min="0.05" max="30" step="0.01" value="3" required></label><label>Concurrency<input name="concurrency" type="number" min="1" max="12" value="4" required></label><label>Language (optional, two letters)<input name="language" pattern="[a-z]{2}" maxlength="2"></label><label>Optional Apify Reel JSON import<input name="import_file" type="file" accept="application/json,.json"></label><p>Import up to 1,000 existing scraper rows; transcription and classification still require a separate start.</p><button type="submit">Create run settings</button><p data-creator-status role="status"></p></form></details>';
  const recovery=currentRun&&selected?'<details class="card"><summary>Recover an existing Apify run</summary><p>Pause the analysis first. Enter the original Apify run ID after an uncertain launch; this checks and attaches that run without starting another scrape.</p><p class="source">Current Apify run: '+esc(currentRun.scrape?.id||'Not attached')+' · Uncertain launch: '+(currentRun.scrapeUncertain?'Yes':'No')+'</p><form id="creator-attach-run"><label>Existing Apify run ID<input name="runId" required pattern="[A-Za-z0-9_-]{5,60}" maxlength="60"></label><button type="submit">Check and attach existing run</button><p data-creator-status role="status"></p></form></details>':'';
  return '<p class="intro">Browse saved Creator Lab research. Views and plays stay separate; missing measurements remain unknown.</p><p><a href="http://127.0.0.1:5190/" target="_blank" rel="noopener noreferrer">Connections, watchlists and original controls ↗</a></p><p role="status">'+esc(notice)+'</p>'+connections(boot)+creation+controls+recovery+detail+listing+radarControlView+radar+watchlistView;
 }; view.mount=()=>progress.start(selected);
 view.stop=()=>{resetReplay();progress.stop()};
 return view;
}
