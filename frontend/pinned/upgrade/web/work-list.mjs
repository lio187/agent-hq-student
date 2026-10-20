// Preserve task identity, keyboard focus and the visible scroll anchor across polling.
export function captureWorkList(root,scrollHost){
 const nodes=new Map([...root.querySelectorAll('[data-work-key]')].map(node=>[node.dataset.workKey,{node,rect:node.getBoundingClientRect()}]));
 const host=scrollHost.getBoundingClientRect(),anchor=[...nodes].find(([,item])=>item.rect.bottom>host.top&&item.rect.top<host.bottom);
 const focus=root.contains(document.activeElement)?document.activeElement:null,focusedKey=focus?.closest('[data-work-key]')?.dataset.workKey;
 const cells=new Map([...root.querySelectorAll('[data-work-scroll]')].map(cell=>{const bounds=cell.getBoundingClientRect(),first=[...cell.querySelectorAll('[data-work-key]')].find(n=>n.getBoundingClientRect().bottom>bounds.top);return [cell.dataset.workScroll,{top:cell.scrollTop,left:cell.scrollLeft,anchor:first&&{key:first.dataset.workKey,offset:first.getBoundingClientRect().top-bounds.top}}]}));
 const focusControl=focus&&['data-progress-toggle','data-focus-worker','data-open-activity'].find(name=>focus.hasAttribute(name));
 return {nodes,cells,focusControl:focusControl?{name:focusControl,value:focus.getAttribute(focusControl)}:null,scrollLeft:scrollHost.scrollLeft,anchor:anchor&&{key:anchor[0],top:anchor[1].rect.top},focusedKey,focusTask:focus?.dataset?.task,filter:focus?.dataset?.filter,scroll:scrollHost.scrollTop};
}
function patch(current,next){
 for(const attribute of [...current.attributes])if(!next.hasAttribute(attribute.name))current.removeAttribute(attribute.name);
 for(const attribute of next.attributes)if(current.getAttribute(attribute.name)!==attribute.value)current.setAttribute(attribute.name,attribute.value);
 if(current.childNodes.length!==next.childNodes.length){current.replaceChildren(...next.childNodes);return}
 for(let i=0;i<current.childNodes.length;i++){const old=current.childNodes[i],fresh=next.childNodes[i];if(old.nodeType!==fresh.nodeType||old.nodeName!==fresh.nodeName){old.replaceWith(fresh.cloneNode(true));continue}if(old.nodeType===Node.TEXT_NODE){if(old.nodeValue!==fresh.nodeValue)old.nodeValue=fresh.nodeValue}else if(old.nodeType===Node.ELEMENT_NODE)patch(old,fresh)}
}
export function restoreWorkList(root,scrollHost,snapshot,{animate=true}={}){
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 for(const next of [...root.querySelectorAll('[data-work-key]')]){const previous=snapshot.nodes.get(next.dataset.workKey);if(previous){patch(previous.node,next);next.replaceWith(previous.node)}}
 scrollHost.scrollTop=snapshot.scroll;scrollHost.scrollLeft=snapshot.scrollLeft;
 for(const cell of root.querySelectorAll('[data-work-scroll]')){const saved=snapshot.cells.get(cell.dataset.workScroll);if(!saved)continue;cell.scrollTop=saved.top;cell.scrollLeft=saved.left;const first=[...cell.querySelectorAll('[data-work-key]')].find(n=>n.dataset.workKey===saved.anchor?.key);if(first)cell.scrollTop+=first.getBoundingClientRect().top-cell.getBoundingClientRect().top-saved.anchor.offset;}
 const anchor=[...root.querySelectorAll('[data-work-key]')].find(n=>n.dataset.workKey===snapshot.anchor?.key);
 if(anchor&&!snapshot.cells.size)scrollHost.scrollTop+=anchor.getBoundingClientRect().top-snapshot.anchor.top;
 const focused=[...root.querySelectorAll('[data-work-key]')].find(n=>n.dataset.workKey===snapshot.focusedKey)?.querySelector('[data-task]');
 const control=snapshot.focusControl&&[...root.querySelectorAll('['+snapshot.focusControl.name+']')].find(n=>n.getAttribute(snapshot.focusControl.name)===snapshot.focusControl.value&&n.closest('[data-work-key]')?.dataset.workKey===snapshot.focusedKey);
 if(control)control.focus({preventScroll:true});else if(focused&&snapshot.focusTask)focused.focus({preventScroll:true});else if(snapshot.filter)root.querySelectorAll('[data-filter]').forEach(n=>{if(n.dataset.filter===snapshot.filter)n.focus({preventScroll:true})});
 if(!animate||reduced)return;
 for(const node of root.querySelectorAll('[data-work-key]')){const old=snapshot.nodes.get(node.dataset.workKey);if(!old){node.animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'none'}],{duration:180});continue}const rect=node.getBoundingClientRect(),dx=old.rect.left-rect.left,dy=old.rect.top-rect.top;if(Math.abs(dx)+Math.abs(dy)>1)node.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'none'}],{duration:260,easing:'cubic-bezier(.2,.7,.2,1)'})}
}
