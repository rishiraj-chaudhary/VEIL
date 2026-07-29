/**
 * CONTROLLER MIGRATION CODEMOD — one-off
 *
 * Rewrites the uniform pattern
 *
 *   export const handler = async (req, res) => {
 *     try {
 *       <body>
 *     } catch (error) {
 *       console.error(...);
 *       res.status(500).json({ ... });
 *     }
 *   };
 *
 * into
 *
 *   export const handler = asyncHandler(async (req, res) => {
 *     <body>
 *   });
 *
 * Deliberately conservative: a handler is only rewritten when its trailing catch
 * does nothing but log and return a 5xx. Any catch that inspects the error,
 * returns a different status, or performs recovery is left alone, because that
 * behaviour is not equivalent to letting the error reach the central handler.
 * Whatever it skips is reported so the remainder can be done by hand.
 *
 * Run: node scripts/migrateControllers.js [--dry]
 */

import fs from 'fs';
import path from 'path';

const DRY = process.argv.includes('--dry');
const DIR = 'src/controllers';

// A terminal catch that only logs and sends a generic failure.
const TRIVIAL_CATCH = /^\}\s*catch\s*\(\s*\w+\s*\)\s*\{\s*(?:console\.(?:error|warn|log)\([\s\S]*?\);\s*)*(?:return\s+)?res\s*\.status\(\s*5\d\d\s*\)\s*\.json\(\{[\s\S]*?\}\);?\s*\}\s*$/;

const dedent = (block) => block
  .split('\n')
  .map(line => (line.startsWith('    ') ? line.slice(2) : line))
  .join('\n');

const migrateFile = (file) => {
  const original = fs.readFileSync(file, 'utf8');
  let source = original;

  const results = { converted: 0, skipped: [] };

  // Match a whole exported handler, non-greedy up to the closing `};` at column 0.
  const handlerPattern = /export const (\w+) = async \((req, res)(?:, next)?\) => \{\n([\s\S]*?)\n\};/g;

  source = source.replace(handlerPattern, (match, name, params, body) => {
    const trimmed = body.trimStart();

    if (!trimmed.startsWith('try {')) {
      results.skipped.push(`${name} (no leading try)`);
      return match;
    }

    // Split the outer try from its catch by tracking brace depth.
    const tryStart = body.indexOf('try {') + 'try {'.length;
    let depth = 1;
    let i = tryStart;
    for (; i < body.length && depth > 0; i++) {
      if (body[i] === '{') depth += 1;
      else if (body[i] === '}') depth -= 1;
    }

    const tryBody = body.slice(tryStart, i - 1);
    const tail = body.slice(i - 1);

    if (!TRIVIAL_CATCH.test(tail.trim())) {
      results.skipped.push(`${name} (catch does more than log)`);
      return match;
    }

    results.converted += 1;
    return `export const ${name} = asyncHandler(async (${params}) => {${dedent(tryBody).replace(/\s+$/, '')}\n});`;
  });

  if (results.converted > 0 && !source.includes("middleware/errorHandler.js")) {
    const lines = source.split('\n');
    const lastImport = lines.reduce((acc, l, idx) => (l.startsWith('import ') ? idx : acc), -1);
    const importLine = "import { asyncHandler } from '../middleware/errorHandler.js';";

    if (lastImport >= 0) lines.splice(lastImport + 1, 0, importLine);
    else lines.unshift(importLine);

    source = lines.join('\n');
  }

  if (source !== original && !DRY) fs.writeFileSync(file, source);
  return results;
};

let totalConverted = 0;
const allSkipped = [];

for (const entry of fs.readdirSync(DIR).sort()) {
  if (!entry.endsWith('.js')) continue;

  const file = path.join(DIR, entry);
  if (fs.readFileSync(file, 'utf8').includes('asyncHandler')) continue;

  const { converted, skipped } = migrateFile(file);
  if (converted > 0) console.log(`✅ ${entry}: converted ${converted}`);
  if (skipped.length) allSkipped.push(...skipped.map(s => `${entry}: ${s}`));
  totalConverted += converted;
}

console.log(`\nConverted ${totalConverted} handlers${DRY ? ' (dry run — nothing written)' : ''}`);

if (allSkipped.length) {
  console.log(`\nLeft for manual review (${allSkipped.length}):`);
  allSkipped.forEach(s => console.log(`  · ${s}`));
}
