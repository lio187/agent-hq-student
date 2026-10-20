import codex from './engine-logos/codex.png';
import claude from './engine-logos/claude.png';
import hermes from './engine-logos/hermes.png';
const logos={codex,claude,hermes};
export const engineLogo=id=>logos[id]?'<img class="engine-logo" src="'+logos[id]+'" alt="" aria-hidden="true" width="28" height="28">':'';
