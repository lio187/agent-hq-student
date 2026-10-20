// Shared data table (5 October 2026), after the 21st.dev "data table + toolbar" pattern, in our own
// tokens: stage tabs with counts, sortable headers, two-line primary cells, stage pills, paging.
// State (sort, direction, page, tab) is kept per table id for the session; rendering is pure.
const tables=new Map();
export function tableState(id){if(!tables.has(id))tables.set(id,{sort:'',dir:'desc',page:0,tab:'all',filters:{}});return tables.get(id)}
// Saved views (7 Oct 2026, the 21st.dev / Linear "filter tokens + saved views" pattern): kept per viewer in this
// browser only; a blocked or private storage simply shows no saved views.
const VIEWS_KEY='hq-table-views';
const readViews=()=>{try{return JSON.parse(globalThis.localStorage?.getItem(VIEWS_KEY)||'{}')||{}}catch{return {}}};
const writeViews=v=>{try{globalThis.localStorage?.setItem(VIEWS_KEY,JSON.stringify(v));return true}catch{return false}};
export const savedViews=id=>(readViews()[id]||[]).filter(v=>v&&typeof v.name==='string'&&v.state);
const dec=v=>{try{return decodeURIComponent(v)}catch{return v}};
export function tableAction(kind,raw){
 const at=String(raw).indexOf(':');if(at<1)return;
 const s=tableState(String(raw).slice(0,at)),arg=String(raw).slice(at+1);
 if(kind==='sort'){if(s.sort===arg)s.dir=s.dir==='asc'?'desc':'asc';else{s.sort=arg;s.dir='desc'}s.page=0}
 else if(kind==='page')s.page=Math.max(0,Number(arg)||0);
 else if(kind==='tab'){s.tab=arg;s.page=0}
 else if(kind==='filter'){const eq=arg.indexOf('=');if(eq>0){s.filters={...s.filters,[dec(arg.slice(0,eq))]:dec(arg.slice(eq+1))};s.page=0}}
 else if(kind==='unfilter'){const f={...s.filters};delete f[dec(arg)];s.filters=f;s.page=0}
 else if(kind==='clear'){s.filters={};s.tab='all';s.page=0}
 else if(kind==='view-save'){const id=String(raw).slice(0,at),all=readViews(),list=savedViews(id),state={sort:s.sort,dir:s.dir,tab:s.tab,filters:s.filters},name=viewName(id,state);
  if(!list.some(v=>v.name===name)){all[id]=[...list,{name,state}].slice(-8);writeViews(all)}}
 else if(kind==='view'){const v=savedViews(String(raw).slice(0,at))[Number(arg)];if(v){Object.assign(s,{sort:v.state.sort||'',dir:v.state.dir||'desc',tab:v.state.tab||'all',filters:{...(v.state.filters||{})},page:0})}}
 else if(kind==='view-delete'){const id=String(raw).slice(0,at),all=readViews(),list=savedViews(id);list.splice(Number(arg),1);all[id]=list;writeViews(all)}
}
// A view is named by what it shows: "Stage is Booked · Source is Instagram · sorted by Updated".
function viewName(id,state){const config=configs.get(id),col=k=>config?.columns.find(c=>c.key===k)?.label||k,tab=config?.tabs?.find(t=>t.id===state.tab);
 const parts=[...(tab?[tab.label]:[]),...Object.entries(state.filters||{}).map(([k,v])=>col(k)+' is '+v),...(state.sort?['sorted by '+col(state.sort)]:[])];
 return parts.join(' · ')||'All records'}
export function relativeTime(value,now=Date.now()){
 const t=typeof value==='number'?(value<1e12?value*1000:value):Date.parse(value);if(!Number.isFinite(t))return '';
 const m=Math.round((now-t)/60000);if(m<1)return 'just now';if(m<60)return m+' min ago';const h=Math.round(m/60);if(h<24)return h+' h ago';const d=Math.round(h/24);if(d<30)return d+(d===1?' day ago':' days ago');
 return new Date(t).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:new Date(t).getFullYear()===new Date(now).getFullYear()?undefined:'numeric'});
}
export function stagePill(value,esc){const v=String(value||'—');return '<span class="stage-pill" data-stage="'+esc(v.toLowerCase().replace(/[^a-z0-9]+/g,'-'))+'">'+esc(v)+'</span>'}
/**
 * columns: [{key,label,value:row=>sortable,cell:row=>html,className}]; tabs: [{id,label,filter}].
 * Rows are filtered by the active tab, sorted, then paged.
 */
// The last configuration per table, so a sort/tab/page click re-renders only that table (no refetch).
const configs=new Map();
export function rerenderTable(id){const config=configs.get(id);return config?dataTable(config):null}
export function dataTable(config){configs.set(config.id,config);const {id,columns,rows,esc,pageSize=25,tabs,emptyText='No records match this view.',defaultSort}=config;
 const s=tableState(id);if(!s.sort&&defaultSort){s.sort=defaultSort.key;s.dir=defaultSort.dir||'desc'}
 const tabList=tabs?[{id:'all',label:'All',filter:()=>true},...tabs]:null;
 const active=tabList?.find(t=>t.id===s.tab)||tabList?.[0];
 // Filter fields: columns with 2–12 distinct text values (not the primary column); tokens narrow the rows first.
 const text=v=>v==null||v===''?'':String(v);
 const fields=config.filters===false?[]:columns.filter(c=>c.value&&c.label&&!/dt-primary|dt-action/.test(c.className||'')).map(c=>{const vals=rows.map(r=>c.value(r));if(vals.some(v=>typeof v==='number'))return null;const counts=new Map();for(const v of vals.map(text).filter(Boolean))counts.set(v,(counts.get(v)||0)+1);return counts.size>=2&&counts.size<=12?{key:c.key,label:c.label,value:c.value,counts}:null}).filter(Boolean);
 const filters=Object.entries(s.filters||{}).filter(([k])=>fields.some(f=>f.key===k));
 const base=filters.length?rows.filter(r=>filters.every(([k,v])=>text(fields.find(f=>f.key===k).value(r))===v)):rows;
 let list=active?base.filter(active.filter):base.slice();
 const col=columns.find(c=>c.key===s.sort&&c.value);
 if(col){const dir=s.dir==='asc'?1:-1;list=list.slice().sort((a,b)=>{const x=col.value(a),y=col.value(b);if(x==null&&y==null)return 0;if(x==null)return 1;if(y==null)return -1;return (typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),'en',{numeric:true,sensitivity:'base'}))*dir})}
 const pages=Math.max(1,Math.ceil(list.length/pageSize));if(s.page>=pages)s.page=pages-1;
 const from=s.page*pageSize,shown=list.slice(from,from+pageSize);
 const tabsHTML=tabList?'<div class="dt-tabs" role="group" aria-label="Filter">'+tabList.map(t=>{const n=base.filter(t.filter).length;return '<button type="button" data-action="table-tab" data-id="'+esc(id+':'+t.id)+'" aria-pressed="'+(t===active)+'">'+esc(t.label)+'<b>'+n+'</b></button>'}).join('')+'</div>':'';
 const head='<tr>'+columns.map(c=>{const sorted=s.sort===c.key&&c.value;return '<th scope="col" class="'+esc(c.className||'')+'"'+(sorted?' aria-sort="'+(s.dir==='asc'?'ascending':'descending')+'"':'')+'>'+(c.value?'<button type="button" data-action="table-sort" data-id="'+esc(id+':'+c.key)+'">'+esc(c.label)+'<span aria-hidden="true">'+(sorted?(s.dir==='asc'?' ↑':' ↓'):'')+'</span></button>':esc(c.label))+'</th>'}).join('')+'</tr>';
 // Keyboard rows (7 Oct 2026, the 21st.dev "keyboard data table" pattern): a row that opens something can take focus,
 // j/k or the arrow keys move between rows and Enter opens it (tableKeydown). The keys are named under the table.
 const cells=r=>columns.map(c=>'<td class="'+esc(c.className||'')+'">'+c.cell(r)+'</td>').join('');
 let keyed=0;const body=shown.length?shown.map(r=>{const html=cells(r),opens=/<button\b|data-hq-detail="/.test(html);if(opens)keyed++;return '<tr'+(opens?' tabindex="-1" data-dt-row':'')+'>'+html+'</tr>'}).join(''):'<tr><td class="dt-empty" colspan="'+columns.length+'">'+esc(emptyText)+'</td></tr>';
 const keys=keyed>1?'<span class="dt-keys" aria-hidden="true"><kbd>j</kbd><kbd>k</kbd> move · <kbd>Enter</kbd> open</span>':'';
 const foot=list.length>pageSize?'<footer class="dt-foot"><span>'+(from+1)+'–'+(from+shown.length)+' of '+list.length+'</span>'+keys+'<div><button type="button" data-action="table-page" data-id="'+esc(id+':'+(s.page-1))+'"'+(s.page?'':' disabled')+'>Previous</button><button type="button" data-action="table-page" data-id="'+esc(id+':'+(s.page+1))+'"'+(s.page<pages-1?'':' disabled')+'>Next</button></div></footer>':'<footer class="dt-foot"><span>'+list.length+(list.length===1?' record':' records')+'</span>'+keys+'</footer>';
 const views=fields.length?savedViews(id):[],enc=encodeURIComponent,changed=filters.length||s.tab!=='all';
 const toolbar=fields.length?'<div class="dt-filterbar" role="group" aria-label="Filters and saved views">'
  +filters.map(([k,v])=>{const f=fields.find(x=>x.key===k);return '<span class="dt-token"><span>'+esc(f.label)+'</span> is <b>'+esc(v)+'</b><button type="button" data-action="table-unfilter" data-id="'+esc(id+':'+enc(k))+'" aria-label="'+esc('Remove filter '+f.label+' is '+v)+'">×</button></span>'}).join('')
  +'<details class="row-more dt-add"><summary>+ Filter</summary><div class="row-menu dt-filter-menu">'+fields.map(f=>'<p class="dt-menu-head">'+esc(f.label)+'</p>'+[...f.counts].sort((a,b)=>b[1]-a[1]).map(([v,n])=>'<button type="button" data-action="table-filter" data-id="'+esc(id+':'+enc(f.key)+'='+enc(v))+'"'+(s.filters?.[f.key]===v?' aria-pressed="true"':'')+'>'+esc(v)+'<b>'+n+'</b></button>').join('')).join('')+'</div></details>'
  +(changed?'<button type="button" class="dt-link" data-action="table-clear" data-id="'+esc(id+':all')+'">Clear</button><button type="button" class="dt-link" data-action="table-view-save" data-id="'+esc(id+':save')+'">Save view</button>':'')
  +(views.length?'<span class="dt-views"><span class="dt-views-label">Views</span>'+views.map((v,i)=>'<span class="dt-token dt-view"><button type="button" class="dt-link" data-action="table-view" data-id="'+esc(id+':'+i)+'">'+esc(v.name)+'</button><button type="button" data-action="table-view-delete" data-id="'+esc(id+':'+i)+'" aria-label="'+esc('Delete saved view '+v.name)+'">×</button></span>').join('')+'</span>':'')
  +'</div>':'';
 return '<div class="dt" data-table="'+esc(id)+'"'+(keyed?' aria-keyshortcuts="j k ArrowDown ArrowUp Enter"':'')+'>'+toolbar+tabsHTML+'<div class="dt-scroll"><table class="dt-table"><thead>'+head+'</thead><tbody>'+body+'</tbody></table></div>'+foot+'</div>';
}

// Keyboard rows: call from a keydown listener on the page root; returns true when it handled the key.
// Typing in a field is never intercepted. From a sort header, ArrowDown or j enters the first row.
export function tableKeydown(e){
 if(e.defaultPrevented||e.metaKey||e.ctrlKey||e.altKey)return false;
 const t=e.composedPath?.()[0]||e.target;if(!t?.closest||t.closest('input,textarea,select,[contenteditable=""],[contenteditable=true]'))return false;
 const table=t.closest('.dt');if(!table)return false;
 const rows=[...table.querySelectorAll('tbody tr[data-dt-row]')];if(!rows.length)return false;
 const row=t.closest('tr[data-dt-row]'),at=rows.indexOf(row),down=e.key==='ArrowDown'||e.key==='j',up=e.key==='ArrowUp'||e.key==='k';
 if(down||up){const next=row?rows[Math.max(0,Math.min(rows.length-1,at+(down?1:-1)))]:down&&t.closest('thead')?rows[0]:null;if(!next)return false;next.focus();next.scrollIntoView?.({block:'nearest'});return true}
 if(e.key==='Enter'&&row&&t===row){const go=row.querySelector('td.dt-action button,td.dt-action [data-hq-detail]')||row.querySelector('button,[data-hq-detail]');if(!go)return false;go.click();return true}
 return false;
}
