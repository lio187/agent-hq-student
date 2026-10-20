import {escapeHTML as esc} from './message-view.mjs';

export function renderRevision(root, {task, api, openTask, onCreated}) {
 const storageKey = 'hq-revision-' + task.board + '-' + task.task.id;
 let pending = JSON.parse(localStorage.getItem(storageKey) || 'null'), busy = false, completed = false;
 root.innerHTML = `<p class="muted">${esc(task.task.title)} · ${esc(task.office_project)}</p><form id="revision-form"><label>Feedback<textarea id="revision-text" rows="7" required maxlength="30000"></textarea></label><p id="revision-message" role="status"></p><button id="revision-send" type="submit" class="primary">Create revision task</button></form>`;
 const form = root.querySelector('form'), input = root.querySelector('textarea'), button = root.querySelector('button'), message = root.querySelector('[role=status]');
 function restore() {
  if (pending) {input.value = pending.body.feedback;input.readOnly = true;button.textContent = 'Retry same revision';message.textContent = 'Confirmation is missing. Retry checks the same revision request.';}
 }
 restore();
 form.onsubmit = async event => {
  event.preventDefault();if (busy || completed || !form.reportValidity()) return;
  busy = true;button.disabled = true;
  try {
   const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
   pending = stored || {key:crypto.randomUUID(),body:{feedback:input.value.trim()}};
   localStorage.setItem(storageKey,JSON.stringify(pending));restore();
   message.textContent = 'Waiting for the revision receipt…';
   const result = await api('tasks/' + task.task.id + '/revise',pending.body,{key:pending.key});
   if (!result?.id) throw new Error('No revision receipt was returned. Retry the same request.');
   if (JSON.parse(localStorage.getItem(storageKey)||'null')?.key === pending.key) localStorage.removeItem(storageKey);
   completed = true;message.textContent = 'Revision created · ' + result.id;
   input.readOnly = true;button.hidden = true;
   const link = document.createElement('button');link.type='button';link.textContent='Open revision ↗';link.onclick=()=>openTask(result.id);form.append(link);
   onCreated(result);
  } catch (error) {
   // Only explicit pre-admission validation failures permit editing a new request.
   if ([400,403,404,422].includes(error.status)) {
    if (JSON.parse(localStorage.getItem(storageKey)||'null')?.key === pending?.key) localStorage.removeItem(storageKey);
    pending=null;input.readOnly=false;button.textContent='Create revision task';
   } else restore();
   message.textContent=error.message;
  } finally {busy=false;button.disabled=completed;}
 };
}
