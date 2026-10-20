// The Setup steps that live in their own modules, in order. Each module's default export:
//   {id, label, after: '<step id it follows>', view(kit) → html, bind(kit), done(state) → bool,
//    summary?(state) → [label, text] for the Finish page, beforeNext?(kit) (runs on Continue)}
// kit = {state, refresh(), show(id, opts), footer(id, opts), polls} plus the helpers in setup-kit.mjs.
import agents from './setup-agents.mjs';
import tools from './setup-tools.mjs';
import brain from './setup-brain.mjs';
import voice from './setup-voice.mjs';
import research from './setup-research.mjs';
export const MODULES = [agents, tools, brain, voice, research];
