const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const validId=value=>typeof value==='string'&&/^[\w-]+$/.test(value);
export function creatorThumbnail(runId,post){
 return validId(runId)&&validId(post.id)&&post.thumbnailUrl?'/creator-lab/media/'+encodeURIComponent(runId)+'/'+encodeURIComponent(post.id):'';
}
export function researchWall(result,runId,{loadImages=false,page=0,selectedId=''}={}){
 const size=60,pages=Math.max(1,Math.ceil(result.posts.length/size));
 const current=Math.max(0,Math.min(pages-1,Number.isSafeInteger(page)?page:0));
 const posts=result.posts.slice(current*size,(current+1)*size);
 const cards=posts.map(post=>{
  const thumbnail=loadImages?creatorThumbnail(runId,post):'';
  const label=post.analysis?.opening||post.caption||post.id;
  const pattern=post.excludedReason?'Excluded from speech analysis':post.analysis?.labels?.mechanism?.value||'Unclassified';
  const reach=typeof post[result.metric]==='number'&&Number.isFinite(post[result.metric])&&post[result.metric]>=0?post[result.metric].toLocaleString('en-GB'):'Unknown';
  return '<button type="button" data-research-inspect="'+esc(post.id)+'" data-research-tile="'+esc(post.id)+'" aria-pressed="'+(selectedId===post.id)+'" aria-label="Inspect Reel '+esc(post.id)+'" style="display:flex;flex-direction:column;gap:6px;text-align:left;min-width:0;height:100%;white-space:normal">'+(thumbnail?'<img src="'+esc(thumbnail)+'" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" style="width:100%;aspect-ratio:4/5;object-fit:cover" data-research-thumbnail>':'')+'<strong style="overflow-wrap:anywhere">'+esc(String(label).slice(0,140))+'</strong><small>'+esc(post.id)+'</small><small>'+esc(pattern)+'</small><small>'+esc(reach)+' '+esc(result.metric)+'</small></button>';
 }).join('');
 return '<section aria-label="Reel library wall"><h3>Reel library</h3><p>'+result.posts.length+' matching Reels. Select a card to inspect its saved transcript and labels.</p><button type="button" data-research-wall-images="'+(!loadImages)+'">'+(loadImages?'Hide thumbnails':'Load original thumbnails')+'</button><p>Thumbnails load from the original Creator Lab media route when enabled. Expired images do not trigger a new scrape; text evidence remains available.</p><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(150px,100%),1fr));gap:12px">'+cards+'</div><p>Page '+(current+1)+' of '+pages+'</p><button type="button" data-research-wall-page="'+(current-1)+'"'+(current===0?' disabled':'')+'>Previous Reels</button> <button type="button" data-research-wall-page="'+(current+1)+'"'+(current===pages-1?' disabled':'')+'>Next Reels</button></section>';
}

export function selectWallTile(root,id){
 for(const tile of root.querySelectorAll('[data-research-tile]'))tile.setAttribute('aria-pressed',String(tile.dataset.researchTile===id));
}
