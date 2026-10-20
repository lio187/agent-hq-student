const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function creatorVideoURL(value){
 try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port)return '';if(!['cdninstagram.com','fbcdn.net','apifyusercontent.com'].some(domain=>url.hostname===domain||url.hostname.endsWith('.'+domain)))return '';return url.href}catch{return ''}
}
export function creatorMedia(post){
 return '<div data-creator-preview-id="'+esc(post.id)+'">'+(creatorVideoURL(post.videoUrl)?'<button type="button" data-creator-play="'+esc(post.id)+'">Load Reel preview</button><p data-creator-media-status role="status">Loads the saved Instagram/Apify media URL when selected.</p>':'<p>No supported saved video URL. Use the original Reel link.</p>')+'</div>';
}
export function attachCreatorMedia(root,getRun){
 root.addEventListener('click',event=>{
  const button=event.target.closest('[data-creator-play]');if(!button)return;
  const run=getRun(),post=run?.posts?.find(p=>p.id===button.dataset.creatorPlay),url=creatorVideoURL(post?.videoUrl);
  const container=button.closest('[data-creator-preview-id]'),status=container?.querySelector('[data-creator-media-status]');if(!url||!container)return;
  const video=document.createElement('video');video.controls=true;video.playsInline=true;video.preload='none';video.style.maxWidth='100%';video.style.maxHeight='480px';video.setAttribute('aria-label','Original Reel '+post.id);
  video.addEventListener('error',()=>{status.textContent='Saved preview unavailable or expired. Open the original Reel; no new scrape was started.'});
  video.addEventListener('loadeddata',()=>{status.textContent='Original saved media URL. Use the video controls to play.'});
  video.src=url;video.preload='metadata';button.replaceWith(video);status.textContent='Loading original preview…';
 });
}
