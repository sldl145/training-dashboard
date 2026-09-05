#!/usr/bin/env node
// Real-browser smoke test. Run before every push: node scripts/smoke.js
// Loads index.html in headless Chromium, clicks all three tabs, and fails on
// any console/page error or any canvas without a live Chart instance.
// Browsers are pre-installed in the Claude Code environment at /opt/pw-browsers
// (PLAYWRIGHT_BROWSERS_PATH) - NEVER run "playwright install".
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  const candidates = [process.env.CHROMIUM_PATH, path.join(base, 'chromium')].filter(Boolean);
  for (const c of candidates) {
    try {
      const st = fs.statSync(c);
      if (st.isFile()) return c;
      const inner = path.join(c, 'chrome-linux', 'chrome');
      if (st.isDirectory() && fs.existsSync(inner)) return inner;
    } catch {}
  }
  try {
    for (const d of fs.readdirSync(base)) {
      const p = path.join(base, d, 'chrome-linux', 'chrome');
      if (d.startsWith('chromium') && fs.existsSync(p)) return p;
    }
  } catch {}
  return null;
}

(async () => {
  const failures = [];
  const exe = findChromium();
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  page.on('pageerror', e => failures.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') failures.push('console error: ' + m.text()); });

  const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(url, { waitUntil: 'load' });

  // Charts are created in requestAnimationFrame callbacks - give them a beat
  const settle = () => page.waitForTimeout(700);

  const checkActiveTab = (label, minCharts) => page.evaluate(([label, minCharts]) => {
    const out = [];
    if (typeof window.Chart === 'undefined') { out.push(label + ': Chart.js did not load'); return out; }
    const canvases = [...document.querySelectorAll('.tab-content.active canvas')];
    if (canvases.length < minCharts)
      out.push(`${label}: expected >= ${minCharts} canvases, found ${canvases.length}`);
    canvases.forEach(c => {
      if (!(c.width > 0 && c.height > 0)) out.push(`${label}: canvas #${c.id || '(no id)'} has zero size`);
      if (!Chart.getChart(c)) out.push(`${label}: canvas #${c.id || '(no id)'} has no Chart instance`);
    });
    return out;
  }, [label, minCharts]);

  // Tab 1: Training (active on load)
  await settle();
  failures.push(...await checkActiveTab('Training', 5));

  // Tab 2: Running
  await page.click('button.tab-button:has-text("Running")');
  await settle();
  failures.push(...await checkActiveTab('Running', 4));

  // Tab 3: Body Composition - Withings block (6 charts) above InBody (6 charts).
  // Also wires window.exportPDF on first open.
  await page.click('button.tab-button:has-text("Body Composition")');
  await settle();
  failures.push(...await checkActiveTab('Body Composition', 12));
  if (await page.evaluate(() => typeof window.exportPDF !== 'function'))
    failures.push('Body Composition: window.exportPDF is not wired');

  // Withings block: every chart drawn, KPIs and the segmental outline filled in, and the
  // block kept OUTSIDE #dashboard so the Export-to-PDF button stays InBody-only.
  failures.push(...await page.evaluate(() => {
    const out = [];
    const block = document.getElementById('withings-block');
    if (!block) return ['Withings: #withings-block is missing'];
    if (document.getElementById('dashboard').contains(block))
      out.push('Withings: block is inside #dashboard - it would leak into the PDF export');

    ['wgWeightChart', 'wgFatPctChart', 'wgFatKgChart', 'wgMuscleChart', 'wgWaterChart', 'wgVfiChart'].forEach(id => {
      const c = document.getElementById(id);
      if (!c) { out.push(`Withings: canvas #${id} is missing`); return; }
      const chart = Chart.getChart(c);
      if (!chart) { out.push(`Withings: canvas #${id} has no Chart instance`); return; }
      if (!chart.data.datasets.some(d => (d.data || []).length))
        out.push(`Withings: chart #${id} has no plotted points`);
    });

    // Every raw series must carry one point per weigh-in. A metric silently dropping
    // rows, or points hidden under their own mean line, both show up here.
    const n = +(document.getElementById('withings-subtitle').textContent.match(/(\d+) weigh-in/) || [])[1];
    if (!n) out.push('Withings: could not read the weigh-in count from the subtitle');
    else ['wgWeightChart', 'wgFatPctChart', 'wgFatKgChart', 'wgMuscleChart', 'wgWaterChart', 'wgVfiChart'].forEach(id => {
      const chart = Chart.getChart(document.getElementById(id));
      if (!chart) return;
      chart.data.datasets
        .filter(d => d.showLine === false && d.label !== 'InBody (SATS)')
        .forEach(d => {
          const drawn = (d.data || []).filter(pt => pt && pt.y != null).length;
          if (drawn !== n) out.push(`Withings: ${id} series "${d.label}" draws ${drawn} points, expected ${n}`);
          if (!(d.pointRadius > 0)) out.push(`Withings: ${id} series "${d.label}" has no visible points`);
        });
      // Two metrics sharing a chart must stay visually separable. Near-collinear pairs
      // (fat % and fat kg) can otherwise land on the same pixels once each axis
      // auto-scales to its own range, which hides one series completely.
      const raws = chart.data.datasets
        .map((d, i) => ({ d, i }))
        .filter(x => x.d.showLine === false && x.d.label !== 'InBody (SATS)');
      for (let a = 0; a < raws.length; a++) for (let b2 = a + 1; b2 < raws.length; b2++) {
        const A = chart.getDatasetMeta(raws[a].i).data, B = chart.getDatasetMeta(raws[b2].i).data;
        A.forEach((pt, k) => {
          if (!B[k]) return;
          const gap = Math.hypot(pt.x - B[k].x, pt.y - B[k].y);
          if (gap < 8) out.push(
            `Withings: ${id} "${raws[a].d.label}" and "${raws[b2].d.label}" overlap at point ${k + 1} (${gap.toFixed(1)} px apart)`);
        });
      }

      // Axis labels are dates, so every tick must be a real calendar midnight.
      chart.scales.x.ticks.forEach(t => {
        const d = new Date(t.value);
        if (d.getHours() || d.getMinutes() || d.getSeconds())
          out.push(`Withings: ${id} has an x tick at ${d.toTimeString().slice(0, 8)}, not midnight`);
      });
    });

    const kpis = block.querySelectorAll('#withings-kpi-grid .inbody-kpi-card');
    if (kpis.length !== 6) out.push(`Withings: expected 6 KPI cards, found ${kpis.length}`);

    const boxes = block.querySelectorAll('#withings-seg-card .withings-seg-box');
    if (boxes.length !== 5) out.push(`Withings: expected 5 segment boxes, found ${boxes.length}`);

    if (!document.getElementById('withings-subtitle').textContent.trim())
      out.push('Withings: subtitle is empty');
    return out;
  }));

  // Phone width (380 px): the segmental boxes must stack, not squeeze into three columns.
  await page.setViewportSize({ width: 380, height: 900 });
  await page.waitForTimeout(200);
  failures.push(...await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('#withings-seg-card .withings-seg-box')];
    if (boxes.length < 2) return [];
    const lefts = new Set(boxes.map(b => Math.round(b.getBoundingClientRect().left)));
    return lefts.size === 1 ? [] : ['Withings: segment boxes do not stack at 380 px width'];
  }));
  await page.setViewportSize({ width: 1440, height: 1000 });

  await browser.close();

  if (failures.length) {
    failures.forEach(f => console.error('FAIL: ' + f));
    console.error(`\nsmoke test FAILED - ${failures.length} problem(s)`);
    process.exit(1);
  }
  console.log('smoke test PASSED - all three tabs render, console clean, export wired');
})().catch(e => { console.error('smoke test crashed: ' + e.message); process.exit(1); });
