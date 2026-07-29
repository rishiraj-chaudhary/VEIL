/**
 * IMPORT RESOLUTION CHECK
 *
 * Fails if any relative import points at a path that does not exist, matching
 * the exact casing on disk.
 *
 * macOS is case-insensitive, so `models/Debate.js` resolves locally even when
 * the file is `models/debate.js` — and then fails at boot on Linux. This repo
 * shipped that bug twice before there was anything to catch it.
 *
 * Run: node scripts/checkImports.js
 */

import fs from 'fs';
import path from 'path';

const ROOTS = ['src', 'server.js'];

// Only real statements: `import x from '...'` / `export * from '...'`, and the
// closing line of a multi-line import. JSDoc examples inside comment blocks are
// skipped, which a naive grep over the whole file cannot distinguish.
const IMPORT_LINE = /^\s*(?:import\s[\s\S]*?|export\s[\s\S]*?|\}\s*)from\s+['"](\.[^'"]+)['"]/;
const BARE_IMPORT = /^\s*import\s+['"](\.[^'"]+)['"]/;

const collect = (target, files = []) => {
  const stat = fs.statSync(target);

  if (stat.isFile()) {
    if (target.endsWith('.js')) files.push(target);
    return files;
  }

  for (const entry of fs.readdirSync(target)) {
    if (entry === 'node_modules') continue;
    collect(path.join(target, entry), files);
  }
  return files;
};

const files = ROOTS.flatMap(root => (fs.existsSync(root) ? collect(root) : []));
const problems = [];

for (const file of files) {
  const dir = path.dirname(file);

  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('//')) continue;

    const match = line.match(IMPORT_LINE) || line.match(BARE_IMPORT);
    if (!match) continue;

    const specifier = match[1];
    const resolved = path.join(dir, specifier);

    // Case-sensitive existence: readdir the parent and compare exactly, since
    // fs.existsSync is case-insensitive on macOS and would pass here.
    const parent = path.dirname(resolved);
    const base = path.basename(resolved);

    const exists = fs.existsSync(parent) && fs.readdirSync(parent).includes(base);
    if (!exists) problems.push({ file, specifier });
  }
}

if (problems.length === 0) {
  console.log(`✅ All relative imports resolve (${files.length} files checked)`);
  process.exit(0);
}

for (const { file, specifier } of problems) {
  console.error(`::error file=${file}::unresolved import '${specifier}'`);
}
console.error(`\n❌ ${problems.length} unresolved import(s)`);
process.exit(1);
