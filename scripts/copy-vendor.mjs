// Copies the ALTCHA bot-check widget into public/vendor/altcha so the site
// serves it itself (no third-party script hosts). Runs before every build.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'node_modules/altcha/dist');
const dest = path.join(root, 'public/vendor/altcha');
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(path.join(dest, 'workers'), { recursive: true });
for (const f of ['altcha.js', 'altcha.css']) fs.copyFileSync(path.join(src, 'external', f), path.join(dest, f));
for (const f of fs.readdirSync(path.join(src, 'workers'))) fs.copyFileSync(path.join(src, 'workers', f), path.join(dest, 'workers', f));
console.log('Copied the ALTCHA widget to public/vendor/altcha');
