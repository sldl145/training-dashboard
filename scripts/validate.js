#!/usr/bin/env node
// Data + syntax validator for index.html. Run before every push: node scripts/validate.js
// Exit 0 = OK (warnings allowed), exit 1 = errors found.
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// ---- 1. Inline script must parse ----
const scriptStart = src.indexOf('<script>', src.indexOf('</head>'));
const script = src.slice(scriptStart + 8, src.lastIndexOf('</script>'));
try {
  new Function(script);
} catch (e) {
  console.error('ERROR: inline script does not parse: ' + e.message);
  process.exit(1);
}

// ---- 2. Extract the data blobs ----
function extract(name, next) {
  const start = src.indexOf('const ' + name + ' = ');
  const end = src.indexOf(next, start);
  if (start === -1 || end === -1) throw new Error('could not locate const ' + name);
  return src.slice(start, end).replace('const ' + name, 'globalThis.' + name);
}
eval(extract('exercises', '// ========== GRAVEYARD'));
eval(extract('graveyard', '// ========== HELPERS'));
eval(extract('runs', 'function formatPace'));
eval(extract('scans', 'const labels = scans'));

const errors = [];
const warnings = [];

// Rows where logging a lighter top weight than the heaviest set is documented as deliberate
const DELOAD_EXCEPTIONS = new Set([
  'Bench Press|2026-02-11',
  'Overhead Press|2026-02-23',
  'Overhead Press|2026-03-11',
]);

for (const [name, ex] of Object.entries(exercises)) {
  let prev = '';
  ex.data.forEach((d, i) => {
    if (d.date < prev) errors.push(`${name}: date out of order at index ${i}: ${d.date} after ${prev}`);
    prev = d.date;
    if (d.sets && d.sets.length) {
      if (!d.sets.some(s => s.w === d.weight && s.r === d.bestReps))
        errors.push(`${name} ${d.date}: summary ${d.weight} x ${d.bestReps} matches no logged set: ${JSON.stringify(d.sets)}`);
      const maxW = Math.max(...d.sets.map(s => s.w));
      if (d.weight !== maxW && !DELOAD_EXCEPTIONS.has(`${name}|${d.date}`))
        warnings.push(`${name} ${d.date}: top weight ${d.weight} below heaviest set ${maxW} (heaviest-weight rule - deliberate deload? add to DELOAD_EXCEPTIONS if so)`);
    } else {
      warnings.push(`${name} ${d.date}: no sets recorded (legacy rows only - new rows must have sets)`);
    }
  });
}

for (const [name, ex] of Object.entries(graveyard)) {
  let prev = '';
  ex.data.forEach((d, i) => {
    if (d.date < prev) errors.push(`graveyard ${name}: date out of order at index ${i}: ${d.date} after ${prev}`);
    prev = d.date;
  });
  if (!ex.reason) warnings.push(`graveyard ${name}: missing reason`);
  if (!ex.lastSession) warnings.push(`graveyard ${name}: missing lastSession`);
}

let prevRun = '';
runs.forEach(r => {
  if (r.date < prevRun) errors.push(`runs: date out of order: ${r.date} after ${prevRun}`);
  prevRun = r.date;
  const calc = Math.round(r.durationSec / r.distance);
  if (Math.abs(calc - r.avgPaceSec) > 2)
    errors.push(`run ${r.date}: avgPaceSec ${r.avgPaceSec} but duration/distance = ${calc}`);
});

const parseScan = s => { const [dd, mm, yy] = s.date.split('/'); return `${yy}-${mm}-${dd}`; };
let prevScan = '';
scans.forEach(s => {
  const iso = parseScan(s);
  if (iso < prevScan) errors.push(`scans: date out of order: ${s.date}`);
  prevScan = iso;
  if (s.bfm != null && s.pbf != null && Math.abs(s.bfm / s.weight * 100 - s.pbf) > 0.35)
    warnings.push(`scan ${s.date}: pbf ${s.pbf}% inconsistent with bfm/weight = ${(s.bfm / s.weight * 100).toFixed(1)}%`);
});

// ---- Numeric sanity: NaN/non-numeric values would silently break charts ----
const isNum = v => typeof v === 'number' && !Number.isNaN(v);
for (const [name, ex] of Object.entries(exercises)) {
  ex.data.forEach(d => {
    if (!isNum(d.weight) || !isNum(d.bestReps)) errors.push(`${name} ${d.date}: non-numeric weight/bestReps`);
    (d.sets || []).forEach((s, i) => { if (!isNum(s.w) || !isNum(s.r)) errors.push(`${name} ${d.date}: non-numeric set ${i + 1}`); });
  });
}
runs.forEach(r => { if (!isNum(r.distance) || !isNum(r.durationSec) || !isNum(r.avgPaceSec)) errors.push(`run ${r.date}: non-numeric distance/duration/pace`); });
scans.forEach(s => { ['score', 'weight', 'smm', 'bfm', 'pbf', 'bmi'].forEach(k => { if (!isNum(s[k])) errors.push(`scan ${s.date}: non-numeric ${k}`); }); });

// ---- Button wiring: every onclick must reach a real global function ----
// (ported from the legacy validator - this is the check that would have caught a broken PDF export)
const onclickFns = [...new Set([...src.matchAll(/onclick="([a-zA-Z_$][\w$]*)\s*\(/g)].map(m => m[1]))];
onclickFns.forEach(fn => {
  const topLevel = new RegExp('^function ' + fn + '\\b', 'm').test(script);
  const onWindow = new RegExp('window\\.' + fn + '\\s*=').test(script);
  if (!topLevel && !onWindow) errors.push(`button "${fn}" points at a function the page cannot reach`);
});

// TODAY must not be stale vs the newest data point (lifts or runs)
const today = (src.match(/const TODAY = "(\d{4}-\d{2}-\d{2})"/) || [])[1];
const newest = [
  ...Object.values(exercises).flatMap(e => e.data.map(d => d.date)),
  ...runs.map(r => r.date),
].sort().pop();
if (today && newest > today) errors.push(`TODAY (${today}) is older than the newest data point (${newest}) - bump it`);

warnings.forEach(w => console.log('warn: ' + w));
errors.forEach(e => console.error('ERROR: ' + e));
console.log(`\n${Object.keys(exercises).length} exercises, ${Object.keys(graveyard).length} graveyard, ${runs.length} runs, ${scans.length} scans - ${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
