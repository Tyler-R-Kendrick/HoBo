#!/usr/bin/env node
// Design-system linter for control-plane UX exploration mockups.
// Enforces the mechanical half of each loop's design system:
//   1. tokens     — a :root block declares >= 6 CSS custom properties
//   2. token-use  — <= 8 hex color literals appear outside the :root token block
//                   (colors should flow through tokens, small SVG allowance)
//   3. offline    — no external requests (http(s):// in src/href/@import/url())
//   4. viewport   — has <title> and is sized for the 1600x1000 capture frame
//   5. fonts      — <= 4 distinct font-family declarations (loop type discipline)
// Usage: node design-lint.js <mockup.html> [...more]
import fs from 'node:fs';

let failed = false;
for (const file of process.argv.slice(2)) {
  const html = fs.readFileSync(file, 'utf8');
  const problems = [];

  const rootBlocks = [...html.matchAll(/:root\s*{[^}]*}/g)].map((m) => m[0]).join('\n');
  const tokenCount = (rootBlocks.match(/--[\w-]+\s*:/g) || []).length;
  if (tokenCount < 6) problems.push(`tokens: only ${tokenCount} custom properties in :root (need >= 6)`);

  const outsideRoot = html.replace(/:root\s*{[^}]*}/g, '');
  const svgStripped = outsideRoot.replace(/<svg[\s\S]*?<\/svg>/g, '');
  const looseHex = (svgStripped.match(/#[0-9a-fA-F]{3,8}\b/g) || []).filter((h) => !/^#\d+$/.test(h));
  if (looseHex.length > 8) problems.push(`token-use: ${looseHex.length} hex literals outside :root/svg (max 8)`);

  const external = html.match(/(src|href)\s*=\s*["']https?:\/\/|@import\s+url|url\(\s*["']?https?:/g);
  if (external) problems.push(`offline: ${external.length} external reference(s) found`);

  if (!/<title>[^<]+<\/title>/.test(html)) problems.push('viewport: missing <title>');
  if (!/1600/.test(html)) problems.push('viewport: no 1600px frame sizing found');

  const families = new Set(
    (html.match(/font-family\s*:\s*[^;}"']+/g) || []).map((f) => f.replace(/\s+/g, ' ').trim())
  );
  if (families.size > 4) problems.push(`fonts: ${families.size} distinct font-family declarations (max 4)`);

  if (problems.length) {
    failed = true;
    console.log(`FAIL ${file}`);
    for (const p of problems) console.log(`  - ${p}`);
  } else {
    console.log(`PASS ${file} (${tokenCount} tokens, ${families.size} font stacks)`);
  }
}
process.exit(failed ? 1 : 0);
