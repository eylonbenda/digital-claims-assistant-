// Cluster per-glyph text items into word segments and print them with x-ranges (for forms
// that store each letter separately, e.g. Migdal). Output is logical Hebrew (reversed) per row.
import fs from 'fs';

const pp = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const pageIdx = parseInt(process.argv[3] || '1', 10) - 1;
const gap = parseFloat(process.argv[4] || '6'); // x-gap (pt) that splits words
const p = pp[pageIdx];

const rows = {};
for (const it of p.items) {
  const yk = Math.round(it.y / 3) * 3;
  (rows[yk] ||= []).push(it);
}
const ys = Object.keys(rows).map(Number).sort((a, b) => b - a);

for (const y of ys) {
  const its = rows[y].slice().sort((a, b) => a.x - b.x); // visual left -> right
  const segs = [];
  let cur = [its[0]];
  for (let i = 1; i < its.length; i++) {
    const prev = its[i - 1];
    const d = its[i].x - (prev.x + (prev.w || 0));
    if (d > gap) { segs.push(cur); cur = [its[i]]; }
    else cur.push(its[i]);
  }
  segs.push(cur);
  const parts = segs.map((s) => {
    const txt = s.map((o) => o.s).join('');
    const left = Math.round(s[0].x);
    const right = Math.round(s[s.length - 1].x + (s[s.length - 1].w || 0));
    const logical = [...txt].reverse().join(''); // per-glyph visual L->R -> logical Hebrew
    return `[${left}-${right}] ${logical}`;
  });
  console.log(String(y).padStart(4) + '  ' + parts.reverse().join('  |  '));
}
