// Small, escaped Markdown subset. Never executes source HTML or embeds remote media.
export const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function safeLink(value){try{const url=new URL(value,'http://office.local');return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?value:null}catch{return null}}
// Inline: code, safe links, bold, italics and strikethrough, applied to already-escaped text (10 Oct 2026).
const emphasis=h=>h.replace(/\*\*([^*]+?)\*\*|__([^_]+?)__/g,(m,a,b)=>'<strong>'+(a??b)+'</strong>').replace(/(^|[\s(>])\*(?!\s)([^*]+?)\*(?=$|[\s.,;:!?)<])|(^|[\s(>])_(?!\s)([^_]+?)_(?=$|[\s.,;:!?)<])/g,(m,p1,a,p2,b)=>(p1??p2)+'<em>'+(a??b)+'</em>').replace(/~~([^~]+?)~~/g,'<del>$1</del>');
function inline(text){let html='',last=0;const plain=s=>emphasis(escapeHTML(s));for(const match of text.matchAll(/`([^`]+)`|\[([^\]]+)\]\(([^\s)]+)\)/g)){html+=plain(text.slice(last,match.index));if(match[1]!==undefined)html+='<code>'+escapeHTML(match[1])+'</code>';else html+=safeLink(match[3])?`<a href="${escapeHTML(match[3])}" target="_blank" rel="noopener noreferrer">${escapeHTML(match[2])}</a>`:escapeHTML(match[2]);last=match.index+match[0].length}return html+plain(text.slice(last))}

export function messageText(content){if(typeof content==='string')return content;if(Array.isArray(content))return content.filter(c=>c.type==='text'||c.type==='output_text').map(c=>c.text||'').join('\n');return ''}
// Blocks: fenced code, headings, quotes, bullet and numbered lists, tables, rules and paragraphs whose lines join
// (10 Oct 2026: Brain notes and agent replies showed a literal "> " and "**"). Everything is escaped; no raw HTML.
export function markdown(text){
 const lines=String(text??'').split('\n'),out=[];let i=0;
 const cells=row=>row.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim());
 while(i<lines.length){
  const line=lines[i];
  if(line.startsWith('```')){const code=[];i++;while(i<lines.length&&!lines[i].startsWith('```'))code.push(lines[i++]);i++;out.push('<pre><code>'+escapeHTML(code.join('\n'))+'</code></pre>');continue}
  if(!line.trim()){i++;continue}
  const heading=line.match(/^(#{1,4})\s+(.+)/);if(heading){const level=heading[1].length+2;out.push(`<h${level}>${inline(heading[2])}</h${level}>`);i++;continue}
  if(/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)){out.push('<hr>');i++;continue}
  if(/^\s*>/.test(line)){const quote=[];while(i<lines.length&&/^\s*>/.test(lines[i]))quote.push(lines[i++].replace(/^\s*>\s?/,''));out.push('<blockquote>'+markdown(quote.join('\n'))+'</blockquote>');continue}
  if(/^\s*\|.*\|\s*$/.test(line)&&/^\s*\|?\s*:?-{2,}/.test(lines[i+1]||'')){const head=cells(line);i+=2;const body=[];while(i<lines.length&&/^\s*\|.*\|\s*$/.test(lines[i]))body.push(cells(lines[i++]));out.push('<div class="md-table"><table><thead><tr>'+head.map(c=>'<th>'+inline(c)+'</th>').join('')+'</tr></thead><tbody>'+body.map(r=>'<tr>'+r.map(c=>'<td>'+inline(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>');continue}
  const bullet=/^\s*[-*+]\s+/,number=/^\s*\d+[.)]\s+/;
  if(bullet.test(line)||number.test(line)){const ordered=number.test(line),rule=ordered?number:bullet,items=[];while(i<lines.length&&rule.test(lines[i]))items.push(lines[i++].replace(rule,''));out.push((ordered?'<ol>':'<ul>')+items.map(t=>'<li>'+inline(t)+'</li>').join('')+(ordered?'</ol>':'</ul>'));continue}
  const para=[];while(i<lines.length&&lines[i].trim()&&!/^(```|#{1,4}\s|\s*>|\s*[-*+]\s|\s*\d+[.)]\s|\s*\|.*\|\s*$)/.test(lines[i]))para.push(lines[i++].trim());
  if(para.length)out.push('<p>'+inline(para.join(' '))+'</p>');else{out.push('<p>'+inline(line)+'</p>');i++}
 }
 return out.join('');
}
export function messageHTML(content){const text=messageText(content),html=markdown(text);return text.length>1400?'<details class="deliverable"><summary>Read full response · '+text.length.toLocaleString()+' characters</summary>'+html+'</details>':html}
export function usageSummary(runs){let input=0,output=0,reported=0;for(const r of runs){const u=r.usage;if(!u)continue;const i=u.input_tokens??u.prompt_tokens,o=u.output_tokens??u.completion_tokens;if(Number.isFinite(i)||Number.isFinite(o)){reported++;input+=Number.isFinite(i)?i:0;output+=Number.isFinite(o)?o:0}}return {input,output,reported,total:runs.length}}
