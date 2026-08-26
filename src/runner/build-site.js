import * as fs from 'node:fs';
import * as path from 'node:path';

const srcDataDir = path.resolve('data');
const destDataDir = path.resolve('src/site/data');

if (!fs.existsSync(destDataDir)) {
  fs.mkdirSync(destDataDir, { recursive: true });
}

for (const file of ['issues.json', 'feed.xml']) {
  const src = path.join(srcDataDir, file);
  const dest = path.join(destDataDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied ${file} to src/site/data/`);
  }
}
