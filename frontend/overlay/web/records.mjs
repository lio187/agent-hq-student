// The student's own records (leads, client projects, income and expenses, team): add, change and remove them
// without code. Pages get an add bar on top and a "Manage" list below; forms open in the page's dialog.
const FIELDS = {
  lead: {title: 'lead', plural: 'leads', fields: [
    ['company', 'Company', 'text', {required: true}], ['contact', 'Contact person'], ['email', 'Email', 'email'],
    ['stage', 'Stage', 'select', {options: [['research', 'To research'], ['contacted', 'Contacted'], ['replied', 'Replied'], ['won', 'Won'], ['excluded', 'Not a fit']]}],
    ['source', 'Source', 'select', {options: [['website', 'Website'], ['referral', 'Referral'], ['instagram', 'Instagram'], ['linkedin', 'LinkedIn'], ['tiktok', 'TikTok'], ['event', 'Event'], ['cold', 'Cold outreach'], ['other', 'Other']]}],
    ['value', 'Deal value', 'number'], ['owner', 'Owner'], ['nextAction', 'Next step'], ['notes', 'Notes', 'textarea']]},
  project: {title: 'project', plural: 'projects', fields: [
    ['project', 'Project', 'text', {required: true}], ['client', 'Client', 'text', {required: true}],
    ['status', 'Status', 'select', {options: [['green', 'On track'], ['amber', 'At risk'], ['red', 'Blocked'], ['frozen', 'Paused']]}],
    ['priority', 'Priority', 'select', {options: [['P0', 'P0 · urgent'], ['P1', 'P1 · normal'], ['P2', 'P2 · later']], value: 'P1'}],
    ['accountable_lead', 'Owner'], ['next_milestone', 'Next milestone'], ['deadline', 'Deadline', 'date'], ['notes', 'Notes', 'textarea']]},
  entry: {title: 'income or expense', plural: 'income and expenses', fields: [
    ['type', 'Type', 'select', {options: [['income', 'Income'], ['expense', 'Expense']]}], ['date', 'Date', 'date', {required: true, today: true}],
    ['amount', 'Amount', 'number', {required: true}], ['currency', 'Currency', 'select', {options: [['EUR', 'EUR'], ['USD', 'USD'], ['GBP', 'GBP']]}],
    ['status', 'Status', 'select', {options: [['paid', 'Paid'], ['open', 'Open (still to be paid)']]}],
    ['counterparty', 'Customer or supplier', 'text', {required: true}], ['client', 'Client (for income, optional)'],
    ['category', 'Category', 'select', {options: ['Sales', 'Services', 'Coaching', 'Courses', 'Subscriptions', 'Software', 'Advertising', 'Contractors', 'Payroll', 'Office', 'Travel', 'Taxes', 'Other'].map(c => [c, c])}],
    ['description', 'Description']]},
  person: {title: 'team member', plural: 'team members', fields: [
    ['person', 'Name', 'text', {required: true}], ['role', 'Role', 'text', {required: true}], ['manager', 'Reports to'], ['assignment', 'Responsibilities'],
    ['status', 'Status', 'select', {options: [['Active', 'Active'], ['Part-time', 'Part-time'], ['Contractor', 'Contractor'], ['Intern', 'Intern']]}], ['review_date', 'Next review', 'date']]},
};
const summaryOf = (kind, r) => kind === 'lead' ? [r.company, r.contact, r.stage].filter(Boolean).join(' · ')
  : kind === 'project' ? [r.project, r.client, r.deadline].filter(Boolean).join(' · ')
  : kind === 'entry' ? [r.date, r.type === 'expense' ? 'Expense' : 'Income', (r.currency || '') + ' ' + Number(r.amount || 0).toLocaleString('en-GB', {minimumFractionDigits: 2}), r.counterparty].filter(Boolean).join(' · ')
  : [r.person, r.role].filter(Boolean).join(' · ');

export function bar(kind, label, {esc}) {
  return '<div class="actions record-bar" style="margin:0 0 16px"><button type="button" class="primary" data-action="record-add" data-id="' + esc(kind) + '">＋ ' + esc(label) + '</button></div>';
}
export async function manage(kind, {api, esc}) {
  let list = []; try { list = await api('records/' + kind) } catch { return '' }
  const f = FIELDS[kind];
  if (!list.length) return '<p class="notice" style="margin-top:18px">No ' + esc(f.plural) + ' yet. Use “Add” above; everything you add stays on this Mac.</p>';
  return '<details class="operations-detail record-manage" style="margin-top:18px"><summary>Manage your ' + esc(f.plural) + ' (' + list.length + ')</summary><div class="list">'
    + list.slice(0, 300).map(r => '<article class="row"><div><strong>' + esc(summaryOf(kind, r)) + '</strong><small>Updated ' + esc(String(r.updatedAt || '').slice(0, 10)) + '</small></div><div class="actions" style="margin:0">'
      + '<button type="button" data-action="record-edit" data-id="' + esc(kind + ':' + r.id) + '">Edit</button><button type="button" data-action="record-delete" data-id="' + esc(kind + ':' + r.id) + '">Delete</button></div></article>').join('')
    + '</div></details>';
}
function form(kind, existing, {esc}) {
  const f = FIELDS[kind], today = new Date().toISOString().slice(0, 10);
  return '<form id="record-form" data-self-busy class="record-form" style="display:grid;gap:12px">' + f.fields.map(([key, label, type = 'text', o = {}]) => {
    const v = existing?.[key] ?? o.value ?? (o.today ? today : '');
    const input = type === 'select' ? '<select name="' + key + '">' + o.options.map(([val, l]) => '<option value="' + esc(val) + '"' + (String(v) === val ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>'
      : type === 'textarea' ? '<textarea name="' + key + '" rows="3">' + esc(v) + '</textarea>'
      : '<input name="' + key + '" type="' + type + '"' + (type === 'number' ? ' step="0.01" min="0"' : '') + ' value="' + esc(v) + '"' + (o.required ? ' required' : '') + '>';
    return '<label>' + esc(label) + (o.required ? ' *' : '') + input + '</label>';
  }).join('') + '<p role="alert" data-record-error></p><div class="actions"><button class="primary" type="submit">' + (existing ? 'Save changes' : 'Add ' + esc(f.title)) + '</button></div></form>';
}
// Handles record-add, record-edit and record-delete clicks.
export async function act(action, id, {api, preview, esc, root, done}) {
  const [kind, rid] = action === 'record-add' ? [id, null] : String(id).split(':');
  const f = FIELDS[kind]; if (!f) return;
  if (action === 'record-delete') {
    if (!confirm('Delete this ' + f.title + '? This cannot be undone.')) return;
    await api('records/' + kind, {action: 'delete', id: rid}); return done();
  }
  const existing = rid ? (await api('records/' + kind)).find(r => r.id === rid) : null;
  preview((existing ? 'Edit ' : 'Add ') + f.title, form(kind, existing, {esc}));
  const el = root.querySelector('#record-form');
  el.onsubmit = async e => {
    e.preventDefault();
    const fields = Object.fromEntries(new FormData(el)), err = el.querySelector('[data-record-error]'), button = el.querySelector('button[type=submit]');
    button.disabled = true; err.textContent = '';
    try { await api('records/' + kind, existing ? {action: 'update', id: rid, fields} : {action: 'add', fields}); done() }
    catch (error) { err.textContent = error.message; button.disabled = false }
  };
}
