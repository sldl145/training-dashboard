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

  // Tab 3: Body Composition - Withings block (5 charts) above InBody (6 charts).
  // Also wires window.exportPDF on first open.
  await page.click('button.tab-button:has-text("Body Composition")');
  await settle();
  failures.push(...await checkActiveTab('Body Composition', 11));
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

    ['wgWeightChart', 'wgFatChart', 'wgMuscleChart', 'wgWaterChart', 'wgVfiChart'].forEach(id => {
      const c = document.getElementById(id);
      if (!c) { out.push(`Withings: canvas #${id} is missing`); return; }
      const chart = Chart.getChart(c);
      if (!chart) { out.push(`Withings: canvas #${id} has no Chart instance`); return; }
      if (!chart.data.datasets.some(d => (d.data || []).length))
        out.push(`Withings: chart #${id} has no plotted points`);
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
