import fs from 'fs';
import path from 'path';
const root = 'game/src';
const files = fs.readdirSync(root).map((f) => `${root}/${f}`);
let bad = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const re = /from\s+'([^']+)'/g;
  let m;
  while ((m = re.exec(src))) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue;
    const resolved = path.join(path.dirname(f), spec);
    if (!fs.existsSync(resolved)) { console.log('MISSING', f, '->', spec); bad += 1; }
  }
}
console.log(bad ? `${bad} broken imports` : 'all relative imports resolve');
