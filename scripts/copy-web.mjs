// www/ is the source of truth for the web app (index.html + css/ + js/).
// The only file this script copies in is the backend adapter, so there is one copy of it to maintain.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const www = resolve(projectRoot, 'www');
const backendClient = resolve(projectRoot, 'backend', 'supabase-client.js');

mkdirSync(www, { recursive: true });
if (existsSync(backendClient)) {
  copyFileSync(backendClient, resolve(www, 'supabase-client.js'));
  console.log('Copied backend/supabase-client.js → www/supabase-client.js');
}

// Fail the build early if index.html points at a script or stylesheet that does not exist.
const html = readFileSync(resolve(www, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^"#?]+\.(?:js|css))"/g)].map(m => m[1]).filter(p => !/^https?:/.test(p));
const missing = refs.filter(p => !existsSync(resolve(www, p)));
if (missing.length) {
  console.error('index.html references files that do not exist in www/:\n  ' + missing.join('\n  '));
  process.exit(1);
}
const unlisted = readdirSync(resolve(www, 'js')).filter(f => f.endsWith('.js') && !refs.includes('js/' + f));
if (unlisted.length) console.warn('Warning: js files not loaded by index.html: ' + unlisted.join(', '));
console.log(`Checked ${refs.length} asset references in www/index.html`);
