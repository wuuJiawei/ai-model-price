import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const source = path.join(root, 'assets/logo.svg');
const outDir = path.join(root, '.generated');
const svg = fs.readFileSync(source, 'utf8');

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'logo.svg'), svg);
fs.writeFileSync(path.join(outDir, 'favicon.svg'), svg);

console.log('✓ 已生成 logo.svg 与 favicon.svg');
