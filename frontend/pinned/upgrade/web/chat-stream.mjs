// Chat stream and spoken-reply helpers (5 October 2026).
// Hermes also emits reasoning.available, whose text repeats the whole reply; only message.delta
// text belongs in the live stream, or every reply shows twice.

export function streamDelta(item){
 const d=item?.data||{};
 return item?.kind==='message.delta'&&typeof d.delta==='string'?d.delta:'';
}

export function hasText(content){
 if(typeof content==='string')return content.trim().length>0;
 if(Array.isArray(content))return content.some(part=>typeof part==='string'?part.trim().length>0:typeof part?.text==='string'&&part.text.trim().length>0);
 if(content&&typeof content==='object')return typeof content.text==='string'&&content.text.trim().length>0;
 return false;
}

// Tool-using runs leave empty assistant turns in the history; they are not shown as bubbles.
export function visibleMessages(rows){
 return (rows||[]).filter(m=>m.role==='user'||(m.role==='assistant'&&hasText(m.content)));
}

// Next piece of text ready to speak: a full sentence, or for the first piece of a reply a clause
// (after about 60 characters) so the first audio starts sooner. Returns [speak, rest] or null.
export function takeSpeech(pending,{first=false}={}){
 const sentence=pending.match(/^([\s\S]*?[.!?…](?:["')\]]*)\s)([\s\S]*)$/);
 if(sentence)return [sentence[1],sentence[2]];
 if(first&&pending.length>=60){
  const head=pending.slice(0,160),cut=Math.max(head.lastIndexOf(', '),head.lastIndexOf('; '),head.lastIndexOf(': '),head.lastIndexOf(' — '),head.lastIndexOf(' – '));
  if(cut>=30)return [pending.slice(0,cut+1)+' ',pending.slice(cut+2)];
 }
 return null;
}

// Plain text of a stored message, whatever shape the runtime used.
export function messageText(content){
 if(typeof content==='string')return content;
 if(Array.isArray(content))return content.map(part=>typeof part==='string'?part:part?.text||'').join('');
 return content&&typeof content==='object'&&typeof content.text==='string'?content.text:'';
}
