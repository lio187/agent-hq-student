// Read-only: replays every cut and counted patch of the student export against a dashboard source, writes nothing.
// For the office team before promoting changes to shared files:
//   node "projects/agent-hq-student/frontend/check-patches.mjs" --web "projects/agent-hq/staging/web"
// Without --web it checks the pinned source.
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';

const i = process.argv.indexOf('--web'), env = {...process.env, HQ_CHECK_ONLY: '1'};
if (i > 0) env.HQ_WEB = resolve(process.argv[i + 1]);
const r = spawnSync(process.execPath, [resolve(import.meta.dirname, 'export.mjs')], {env, stdio: 'inherit'});
process.exit(r.status ?? 1);
