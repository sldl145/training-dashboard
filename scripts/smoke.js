#!/usr/bin/env node
// Real-browser smoke test. Run before every push: node scripts/smoke.js
// Loads index.html in headless Chromium, clicks all four tabs, and fails on
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

  // Goals (10/09/2026): one progress row per goal, status derived from the logged sets,
  // fill within 0-100%, and the section-label count agreeing with the rows.
  failures.push(...await page.evaluate(() => {
    const out = [];
    const rows = [...document.querySelectorAll('#goals .goal-row')];
    const label = (document.querySelector('#goals .section-label') || {}).textContent || '';
    if (!rows.length) return /no goals are set up/.test(label + document.getElementById('goals').textContent) ? [] : ['Goals: no rows and no empty state'];
    const m = /(\d+) targets? - (\d+) hit/.exec(label);
    if (!m) out.push(`Goals: section label "${label.trim()}" has no "N targets - M hit"`);
    else {
      if (+m[1] !== rows.length) out.push(`Goals: label says ${m[1]} targets, ${rows.length} rows rendered`);
      const done = rows.filter(r => r.dataset.done === '1').length;
      if (+m[2] !== done) out.push(`Goals: label says ${m[2]} hit, ${done} rows marked done`);
    }
    rows.forEach(r => {
      const fill = r.querySelector('.goal-fill');
      const w = parseFloat(fill && fill.style.width);
      if (!(w >= 0 && w <= 100)) out.push(`Goals: ${r.dataset.lift} fill width "${fill && fill.style.width}"`);
      if (r.dataset.done === '1' && w !== 100) out.push(`Goals: ${r.dataset.lift} is done but not full`);
      if (r.dataset.done === '1' && !fill.classList.contains('done')) out.push(`Goals: ${r.dataset.lift} done row not green`);
      if (!r.querySelector('.goal-status')) out.push(`Goals: ${r.dataset.lift} has no status`);
    });
    return out;
  }));

  // Range controls (10/09/2026): 12W default, presets, prev/next, URL state, reset, and
  // the y axis following the window. Bench Press stands in for every lift chart - they
  // all hang off the same RANGE tab.
  failures.push(...await page.evaluate(() => {
    const out = [];
    const bar = document.getElementById('range-training');
    if (!bar) return ['Training: #range-training is missing'];
    const chart = Chart.getChart(document.getElementById('chart-Bench_Press'));
    if (!chart) return ['Training: no Bench Press chart to test the range against'];
    const DAY = 864e5;
    const span = () => (chart.options.scales.x.max - chart.options.scales.x.min) / DAY;
    const near = (a, b) => Math.abs(a - b) <= 1.1;
    if (!near(span(), 84)) out.push(`Training: default window is ${span().toFixed(1)} days, expected 84 (12W)`);
    if (!bar.querySelector('[data-preset="12w"].active')) out.push('Training: 12W is not shown as the active preset');
    const yAll = chart.options.scales.y.max - chart.options.scales.y.min;
    bar.querySelector('[data-preset="4w"]').click();
    if (!near(span(), 28)) out.push(`Training: 4W gives ${span().toFixed(1)} days`);
    if (!/training=4w/.test(location.hash)) out.push(`Training: 4W not written to the URL fragment (${location.hash})`);
    const y4w = chart.options.scales.y.max - chart.options.scales.y.min;
    if (!(y4w > 0)) out.push('Training: y axis has no bounds after 4W');
    const before = chart.options.scales.x.min;
    bar.querySelector('[data-nav="prev"]').click();
    if (!(chart.options.scales.x.min < before)) out.push('Training: prev did not move the window back');
    if (!near(span(), 28)) out.push('Training: prev changed the window length');
    if (bar.querySelector('[data-preset].active')) out.push('Training: a preset still reads active after prev');
    bar.querySelector('[data-preset="all"]').click();
    if (!(span() > 300)) out.push(`Training: All gives only ${span().toFixed(0)} days`);
    if (!bar.querySelector('[data-nav="prev"]').disabled || !bar.querySelector('[data-nav="next"]').disabled)
      out.push('Training: prev/next not disabled on All');
    const yAllAgain = chart.options.scales.y.max - chart.options.scales.y.min;
    if (!(yAllAgain >= y4w)) out.push('Training: y axis did not widen again on All');
    bar.querySelector('[data-reset]').click();
    if (!near(span(), 84)) out.push('Training: reset did not restore 12W');
    chart.scales.x.ticks.forEach(t => {
      const d = new Date(t.value);
      if (d.getHours() || d.getMinutes()) out.push(`Training: x tick at ${d.toTimeString().slice(0, 8)}, not midnight`);
    });
    void yAll;
    return out;
  }));

  // Tab 2: Running
  await page.click('button.tab-button:has-text("Running")');
  await settle();
  failures.push(...await checkActiveTab('Running', 4));

  // Tab 3: Withings (6 charts) - its own tab since 10/09/2026, and deliberately opened
  // BEFORE InBody: both are built by initInBodyCharts, and opening Withings first once
  // left the tab empty. InBody's charts are then created hidden and must still size.
  await page.click('button.tab-button:has-text("Withings")');
  await settle();
  failures.push(...await checkActiveTab('Withings', 6));

  // Range bar present with 4W as the default, then widen to All so the point-count checks
  // below see every weigh-in whatever the record's length.
  failures.push(...await page.evaluate(() => {
    const bar = document.getElementById('range-withings');
    if (!bar) return ['Withings: #range-withings is missing'];
    if (!bar.querySelector('[data-preset="4w"].active')) return ['Withings: 4W is not the active default'];
    return [];
  }));
  await page.click('#range-withings [data-preset="all"]');
  await settle();

  // Withings block: every chart drawn, KPIs and the segmental outline filled in, and the
  // block kept OUTSIDE #dashboard so the Export-to-PDF button stays InBody-only.
  failures.push(...await page.evaluate(() => {
    const out = [];
    const block = document.getElementById('withings-block');
    if (!block) return ['Withings: #withings-block is missing'];
    if (document.getElementById('dashboard').contains(block))
      out.push('Withings: block is inside #dashboard - it would leak into the PDF export');
    if (!document.getElementById('withings').contains(block))
      out.push('Withings: block is not inside the #withings tab');

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

  // Tab 4: InBody (6 charts), opened AFTER Withings on purpose - see above. Also wires window.exportPDF on first open.
  await page.click('button.tab-button:has-text("InBody")');
  await settle();
  failures.push(...await checkActiveTab('InBody', 6));
  if (await page.evaluate(() => typeof window.exportPDF !== 'function'))
    failures.push('InBody: window.exportPDF is not wired');

  await browser.close();

  if (failures.length) {
    failures.forEach(f => console.error('FAIL: ' + f));
    console.error(`\nsmoke test FAILED - ${failures.length} problem(s)`);
    process.exit(1);
  }
  console.log('smoke test PASSED - all four tabs render, console clean, export wired');
})().catch(e => { console.error('smoke test crashed: ' + e.message); process.exit(1); });
