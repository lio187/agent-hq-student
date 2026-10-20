// Finance (Phase 3.1, 7 Oct 2026): the historical register and ledger (8 Aug 2026) as a dashboard under the
// live revenue band. Tiles and charts come from `workspace/records/finance/summary`; the tables keep the
// original rows. Currencies are never added together, no net or profit is derived, internal moves are left
// out of the flows, and hashes only appear in the Source details. Pure rendering plus one small factory.
import {tileRow,chartBand,detailDialog,pageBanner,sourceDetails,panel,dayLabel,freshness} from './page-kit.mjs';
import {dataTable,stagePill} from './data-table.mjs';
import {columns,barList,stackBar} from './viz.mjs';

const escHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=(v,currency)=>v==null||v===''||!Number.isFinite(Number(v))?'Not recorded':new Intl.NumberFormat('en-GB',currency&&/^[A-Z]{3}$/.test(currency)?{style:'currency',currency,maximumFractionDigits:0}:{maximumFractionDigits:2}).format(Number(v));
// Ledger lines keep their cents (an FX fee of 0.40 must not read as 0).
const cents=(v,currency)=>!Number.isFinite(Number(v))?'Not recorded':new Intl.NumberFormat('en-GB',{style:'currency',currency:/^[A-Z]{3}$/.test(currency||'')?currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v));
const TYPE_LABEL={receivable:'Receivable',payable:'Payable',cash:'Cash',stripe:'Stripe'};
const STATUS_LABEL={todo:'To do'};
const STATUS_TONE={confirmed:'live',paid:'live',settled:'live',expected:'pending',provisional:'pending',conditional:'pending',pipeline:'pending',open:'warn',disputed:'error',todo:'idle'};
const monthLabel=m=>{const [y,mo]=String(m).split('-').map(Number);return Number.isFinite(y)&&mo?new Date(Date.UTC(y,mo-1,1)).toLocaleDateString('en-GB',{month:'short',year:'numeric',timeZone:'UTC'}):String(m)};

// Five finance roles; opening a conversation never executes anything financial.
export function renderFinanceActions(profiles=[],{esc=escHTML}={}){
 const roles=[['chief','Intake via Chief','Define the case, the source documents and the review you want.'],['finance-director','Finance review','Coordinates the analysis; keeps measured amounts, estimates and open points apart.'],['invoicing','Invoice draft','Needs an approved contract and proof of delivery; checks entity, currency, tax inputs, line items and duplicate invoice IDs.'],['accounts-payable','Payables review','Needs the supplied invoice and an approved purchase; checks duplicates and missing evidence.'],['reconciliation','Reconciliation','Needs ledger, invoice and transaction exports; explicit matching rules, currencies, dates and unmatched lines.']];
 return '<section class="surface"><h2>Discuss and review finance</h2><p>Open a conversation in the selected project. The register is not sent automatically. Name the canonical source paths and the draft or review outcome you want.</p><p class="notice">Opening a conversation does not start any financial execution. Issuing invoices, payments and changes to bank details or the original books are outside this review.</p>'+roles.map(([id,title,description])=>{
  const matches=profiles.filter(p=>p.id===id),profile=matches.length===1?matches[0]:null;
  return '<div class="operations-detail"><h3>'+esc(title)+'</h3><p>'+esc(description)+'</p>'+(profile?.installed===true?'<button data-action="agent" data-id="'+id+'">'+esc(id==='chief'?'Discuss with Chief':'Open '+(profile.name||title))+'</button>':'<p class="source">Agent not available in the current profile registry.</p>')+'</div>';
 }).join('')+'</section>';
}

// Tiles: cash, receivables and payables per currency, disputes, Stripe. Sums never cross currencies.
export function financeTiles(summary,{esc=escHTML,number=money,now=Date.now()}={}){
 const r=summary?.register||{},bt=r.byType||{},per=r.countsByCurrency||{},age=freshness(summary?.asOf,{now}).age;
 const amount=(type,cur,statuses)=>statuses.reduce((t,s)=>t+(Number(bt[type]?.[cur]?.[s])||0),0);
 const others=(type,cur,keep)=>Object.entries(per[type]?.[cur]||{}).filter(([s])=>!keep.includes(s));
 const tiles=[];
 for(const c of r.cash||[])tiles.push({label:'Cash · '+c.currency,key:'cash-'+c.currency,value:number(c.amount,c.currency),caption:[c.counterparty,c.provider,String(c.description||'').toLowerCase()].filter(Boolean).join(' · '),age});
 const receivable=Object.keys(per.receivable||{}).sort();
 for(const cur of receivable){const rest=others('receivable',cur,['confirmed','paid']),n=rest.reduce((t,[,v])=>t+v,0);
  tiles.push({label:'Receivables · '+cur,key:'receivable-'+cur,value:number(amount('receivable',cur,['confirmed','paid']),cur),caption:'Confirmed + paid'+(n?' · '+n+' more not added: '+rest.map(([s])=>s).join(', '):''),age})}
 for(const cur of Object.keys(per.payable||{}).sort()){const open=per.payable[cur].open||0;if(!open)continue;
  tiles.push({label:'Payables open · '+cur,key:'payable-'+cur,value:number(amount('payable',cur,['open']),cur),caption:open+(open===1?' open payable':' open payables'),age})}
 for(const cur of Object.keys(per.payable||{}).sort()){const n=per.payable[cur].disputed||0;if(!n)continue;
  tiles.push({label:'Disputed · '+cur,key:'disputed-'+cur,value:number(amount('payable',cur,['disputed']),cur),caption:n+(n===1?' payable in dispute':' payables in dispute'),age})}
 if(r.counts?.stripe)tiles.push({label:'Stripe',key:'stripe',value:r.missingAmounts?.stripe?'Not exported':number(amount('stripe','USD',Object.keys(bt.stripe?.USD||{})),'USD'),caption:r.missingAmounts?.stripe?'The register has no Stripe amount; it needs a Stripe export':'Stripe balance in the register',age});
 return tileRow(tiles,{esc,number:v=>String(v)});
}

// Charts: monthly flows and spend by category (settled USD lines only, internal moves excluded) and the
// register by status (row counts, because amounts in different currencies cannot be combined).
export function financeCharts(summary,{esc=escHTML}={}){
 const l=summary?.ledger||{},months=l.months||[],usd=v=>money(v,'USD'),excluded=(l.excluded||[]).join(', ');
 const series=key=>months.map(m=>({label:monthLabel(m.month),value:Math.round(Number(m[key])||0)}));
 const flowNote='Settled USD lines only. Excluded: '+(excluded||'none')+'. The source’s P&L flag is unreliable, so no profit or net figure is shown.';
 const spend=(l.categories||[]).filter(c=>c.outflow>0).map(c=>({label:c.category,value:c.outflow,note:c.count+(c.count===1?' payment':' payments')}));
 const counts=summary?.register?.counts||{},byStatus={};
 for(const statuses of Object.values(counts))for(const [s,n] of Object.entries(statuses))byStatus[s]=(byStatus[s]||0)+n;
 const segments=Object.entries(byStatus).sort((a,b)=>b[1]-a[1]).map(([s,n])=>({label:STATUS_LABEL[s]||s[0].toUpperCase()+s.slice(1),value:n,tone:STATUS_TONE[s]||'idle'}));
 return chartBand({title:'Monthly outflow',meta:'USD · settled',body:months.length?columns(series('outflow'),{esc,label:'Money out per month',format:usd}):'',note:flowNote},
   {title:'Spend by category',meta:'USD · settled',body:barList(spend,{esc,format:usd,max:9,label:'Settled spend by category, USD'})},{esc})
  +chartBand({title:'Monthly inflow',meta:'USD · settled',body:months.length?columns(series('inflow'),{esc,label:'Money in per month',format:usd}):'',note:'Client payments, Stripe payouts and course pass-through as labelled in the source.'},
   {title:'Register by status',meta:(summary?.register?.rows??0)+' rows',body:stackBar(segments,{esc,format:String,label:'Register rows by status'}),note:'Counts of register rows, not amounts: the register holds EUR and USD.'},{esc});
}

// Register: one tab per record type; Details opens the original row (bound to the source revision).
export function renderRegister(data,{esc=escHTML,number=money,now=Date.now()}={}){
 const records=data?.records||[],types=[...new Set(records.map(r=>r.record_type).filter(Boolean))],sha=data?.source?.sha256||'';
 const label=freshness(data?.asOf||records.map(r=>r.evidence_date).filter(Boolean).sort().at(-1),{now});
 return panel('Register'+(label.historical?' · '+label.label:''),dataTable({id:'finance-register',esc,rows:records,pageSize:20,defaultSort:{key:'evidence',dir:'desc'},emptyText:'No register rows in this view.',
  tabs:types.length>1?['receivable','payable','cash','stripe',...types.filter(t=>!TYPE_LABEL[t])].filter(t=>types.includes(t)).map(t=>({id:t,label:TYPE_LABEL[t]||t,filter:r=>r.record_type===t})):undefined,
  columns:[
   {key:'party',label:'Party',value:r=>r.counterparty,className:'dt-primary pk-cap',cell:r=>'<strong>'+esc(r.counterparty||'Not recorded')+'</strong><small>'+esc([TYPE_LABEL[r.record_type]||r.record_type,r.description].filter(Boolean).join(' · '))+'</small>'},
   {key:'amount',label:'Amount',value:r=>r.amount==null?null:Number(r.amount),cell:r=>r.amount==null?'<span class="dt-muted pk-nowrap">Not recorded</span>':'<span class="dt-num pk-nowrap">'+esc(number(r.amount,r.currency))+'</span>'},
   {key:'status',label:'Status',value:r=>r.status,cell:r=>stagePill(r.status,esc)},
   {key:'evidence',label:'Evidence',value:r=>r.evidence_date||null,cell:r=>'<span class="dt-muted pk-nowrap">'+esc(dayLabel(r.evidence_date)||'—')+'</span>'},
   {key:'due',label:'Due or payout',value:r=>r.due_or_payout_date||null,cell:r=>'<span class="dt-muted pk-nowrap">'+esc(dayLabel(r.due_or_payout_date)||'—')+'</span>'},
   {key:'owner',label:'Owner',value:r=>r.owner,cell:r=>esc(r.owner||'—')},
   {key:'open',label:'',className:'dt-action',cell:r=>r.recordId?'<button type="button" class="dt-action" data-action="finance-detail" data-id="'+esc(r.recordId)+'" data-revision="'+esc(sha)+'">Details</button>':''}]}),{esc,meta:records.length+' rows · confidence A–C per row in Details'});
}

// Ledger: every transaction of the export, month tabs, 25 per page; declined and reversed lines stay visible.
export function renderLedger(data,{esc=escHTML,number=money,now=Date.now()}={}){
 const records=data?.records||[],months=[...new Set(records.map(r=>String(r.date||'').slice(0,7)).filter(Boolean))].sort().reverse();
 const last=records.map(r=>r.date).filter(Boolean).sort().at(-1),label=freshness(last,{now});
 return panel('Ledger'+(label.historical?' · '+label.label:''),'<p class="viz-note pk-lead">This file is not a current bank balance. Statuses and categories are the source’s own labels; declined, reversed and returned lines stay visible.</p>'+dataTable({id:'finance-ledger',esc,rows:records,pageSize:25,defaultSort:{key:'date',dir:'desc'},emptyText:'No transactions in this month.',
  tabs:months.length>1?months.map(m=>({id:m,label:monthLabel(m),filter:r=>String(r.date||'').startsWith(m)})):undefined,
  columns:[
   {key:'date',label:'Date',value:r=>r.date||null,cell:r=>'<span class="dt-muted pk-nowrap">'+esc(dayLabel(r.date)||'—')+'</span>'},
   {key:'description',label:'Description',value:r=>r.description,className:'dt-primary pk-cap',cell:r=>'<strong>'+esc(r.description||'No description')+'</strong><small>'+esc([r.subcategory,'row '+r.dataRow].filter(Boolean).join(' · '))+'</small>'},
   {key:'category',label:'Category',value:r=>r.category,cell:r=>esc(r.category||'—')},
   {key:'amount',label:'Amount',value:r=>Number(r.amount),cell:r=>'<span class="dt-num pk-nowrap" data-sign="'+(Number(r.amount)<0?'neg':'pos')+'">'+esc(cents(r.amount,r.currency||'USD'))+'</span>'},
   {key:'status',label:'Status',value:r=>r.status,cell:r=>stagePill(r.status,esc)},
   {key:'account',label:'Account',value:r=>r.account,cell:r=>'<span class="dt-muted">'+esc(r.account||'—')+'</span>'}]}),{esc,meta:records.length+' transactions'+(months.length?' · '+monthLabel(months.at(-1))+' – '+monthLabel(months[0]):'')});
}

// One register row in the detail dialog: business fields, the note in the source, then (collapsed) the source.
export function renderFinanceDetail(data,{esc=escHTML}={}){
 const r=data?.record||{};
 return detailDialog([
  {title:'Record',fields:[['Party',r.counterparty],['Description',r.description],['Amount (as in source)',r.amount==null||r.amount===''?null:r.amount+(r.currency?' '+r.currency:'')],['Type',TYPE_LABEL[r.record_type]||r.record_type],['Status',r.status],['Evidence date',dayLabel(r.evidence_date)||r.evidence_date],['Due or payout',dayLabel(r.due_or_payout_date)||r.due_or_payout_date],['Source confidence',r.confidence],['Owner',r.owner]]},
  {title:'Note in source',html:'<p class="script-reader">'+esc(r.notes||'No note recorded.')+'</p>'},
  {title:'Source · row '+(data?.dataRow??'?'),collapsed:true,fields:[['File',data?.source?.reference],['Source row',data?.dataRow],['SHA-256',data?.source?.sha256]]},
 ],{esc,lead:'Original register row (historical). The note is source information, not a new bank check or payment instruction.'});
}

// The whole page from settled reads; each part fails on its own and says which file is missing.
export function financePage({summary,register,ledger,live,profiles=[]},{esc=escHTML,number=money,now=Date.now()}={}){
 const ok=r=>r?.status==='fulfilled'&&r.value&&typeof r.value==='object';
 const s=ok(summary)?summary.value:null,asOf=s?.asOf||(ok(register)?register.value.records?.map(r=>r.evidence_date).filter(Boolean).sort().at(-1):null);
 const f=freshness(asOf,{now}),date=f.date||'an unknown date';
 const parts=[
  pageBanner({title:'Finance register and ledger are from '+date+(f.historical?' (historical)':'')+'.',body:'This is not a current bank balance, payment instruction or confirmation of employment. Refresh the exports to see current numbers.'},{esc}),
  live?.status==='fulfilled'&&live.value?'<section class="pk-band" aria-label="Live revenue">'+live.value+'</section>':live?'<p class="notice">Live revenue sources are not available right now. The historical register below is unaffected.</p>':'',
  '<div class="section-head pk-heading"><div><p class="eyebrow">REGISTER AND LEDGER</p><h2>Cash, receivables and payables</h2></div><span class="pk-meta">'+esc(f.historical?f.label:'as of '+date)+'</span></div>',
  s?financeTiles(s,{esc,number,now})+financeCharts(s,{esc}):'<p class="notice">The finance summary is not available. No substitute numbers are shown.</p>',
  ok(register)?renderRegister({...register.value,asOf},{esc,number,now}):'<p class="notice">The finance register is not available. No substitute rows are shown.</p>',
  ok(ledger)?renderLedger(ledger.value,{esc,number,now}):'<p class="notice">The historical transaction file is not available. No substitute transactions are shown.</p>',
  sourceDetails([['Register file',ok(register)?register.value.source?.reference:s?.source?.register?.reference],['Register SHA-256',ok(register)?register.value.source?.sha256:s?.source?.register?.sha256],['Ledger file',ok(ledger)?ledger.value.source?.reference:s?.source?.ledger?.reference],['Ledger SHA-256',ok(ledger)?ledger.value.source?.sha256:s?.source?.ledger?.sha256],['Export files',(s?.source?.exports||[]).map(e=>e.name+' · '+e.rows+' rows · '+dayLabel(e.first)+' – '+dayLabel(e.last)).join('; ')],['Read',dayLabel(s?.source?.register?.observedAt||register?.value?.source?.observedAt)],['Rules',s?.source?.note]],{esc,title:'Source files and checks'}),
  '<div class="actions pk-actions"><button type="button" data-finance-actions>Finance actions</button><button type="button" data-action="section" data-id="revenue">Current revenue sources</button></div>',
 ];
 return parts.join('');
}

export function createBusinessRecords({api,root,filters,getBoot=()=>({}),preview,liveRevenue,esc=escHTML,number=money,getSerial=()=>0}){
 root?.addEventListener('click',e=>{if(!e.target.closest?.('[data-finance-actions]'))return;preview?.('Finance actions',renderFinanceActions(getBoot()?.profiles||[],{esc}))});
 return {finance:async()=>{
  filters('');
  const [summary,register,ledger,live]=await Promise.allSettled([api('workspace/records/finance/summary'),api('workspace/records/finance'),api('workspace/records/ledger'),...(liveRevenue?[liveRevenue()]:[])]);
  return financePage({summary,register,ledger,live:liveRevenue?live:null,profiles:getBoot()?.profiles||[]},{esc,number});
 }};
}
