import './style.css';
import {
  algorithms,
  cloneSettings,
  defaults,
  effectCatalog,
  palettes,
  validateSettings,
  type Settings,
  type AlgorithmId,
  type EffectId,
} from './engine/catalog';
import { extractPalette } from './engine/color';
import { processImage, type Pixels } from './engine/process';
import {
  canvasPixels,
  decodeImage,
  download,
  imageCanvas,
  MAX_FILE_BYTES,
  parsePalette,
  rasterBlob,
  readProject,
  svgImage,
  zipFiles,
} from './files';
import { makeSample } from './sample';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const icon = (name: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${
    {
      upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',
      arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
      download: '<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      undo: '<path d="m8 4-5 5 5 5M3 9h10a7 7 0 0 1 0 14"/>',
      redo: '<path d="m16 4 5 5-5 5M21 9H11a7 7 0 0 0 0 14"/>',
      github:
        '<path d="M9 19c-4 1-4-2-6-2m12 5v-4a3 3 0 0 0-1-2c4 0 7-2 7-6a5 5 0 0 0-1-3 5 5 0 0 0 0-4s-2 0-4 2a14 14 0 0 0-8 0C6 3 4 3 4 3a5 5 0 0 0 0 4 5 5 0 0 0-1 3c0 4 3 6 7 6a3 3 0 0 0-1 2v4"/>',
      shield: '<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z"/><path d="m8 12 3 3 5-6"/>',
      expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
      shuffle: '<path d="m17 3 4 4-4 4M3 17l5-5m-5-5h4l10 10h4m-4-4 4 4-4 4M14 7h7"/>',
      close: '<path d="m6 6 12 12M6 18 18 6"/>',
      dots: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
      copy: '<rect x="8" y="8" width="12" height="13" rx="1"/><path d="M16 8V3H3v13h5"/>',
      check: '<path d="m5 12 4 4L19 6"/>',
    }[name] || ''
  }</svg>`;

const slider = (id: string, label: string, min: number, max: number, step = 1, suffix = '') =>
  `<label class="slider-label" for="${id}"><span>${label}</span><output id="${id}-value"></output></label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" data-setting="${id}" data-suffix="${suffix}">`;

$('app').innerHTML = `
  <header class="site-header">
    <a class="brand" href="./" aria-label="Dither4All home"><span class="brand-mark" aria-hidden="true">D<span>4</span></span><span>DITHER<span class="brand-four">4</span>ALL<span class="brand-sub">FREE ONLINE DITHER</span></span></a>
    <nav class="header-links" aria-label="Main navigation"><button id="help-open" class="text-button">The field guide <span>↗</span></button><a href="https://github.com/Gorskiz/Dither4All" target="_blank" rel="noopener noreferrer">${icon('github')} <span>Open source</span> ↗</a></nav>
  </header>
  <main>
    <section class="intro" aria-labelledby="intro-title"><div><p class="eyebrow"><span class="live-dot"></span> THE INTERNET NEEDS MORE TEXTURE.</p><h1 id="intro-title">Less color. <span>More character.</span></h1><p class="intro-copy">An image playground for dots, happy accidents, and beautiful limitations.</p></div><div class="free-stamp"><span>100%</span>FREE. FOREVER.<i>✳</i></div></section>
    <section class="studio" aria-label="Image editor">
      <div class="studio-menu"><div class="menu-start"><span class="workspace-dot"></span><span class="mono">THE WORKSHOP</span><span class="version">v0.1</span></div><div class="project-actions"><button id="open-project">Open project</button><button id="save-project">Save project</button><button id="batch-open">Batch images</button><button id="fullscreen" class="icon-button" aria-label="Toggle fullscreen">${icon('expand')}</button></div></div>
      <div class="editor-layout">
        <aside class="controls-panel" aria-label="Image controls">
          <div class="panel-heading"><span>MAKE IT YOURS</span><span class="panel-index">01—03</span></div>
          <div class="tabs" role="tablist" aria-label="Controls"><button role="tab" aria-selected="true" aria-controls="tab-dither" id="dither-tab" data-tab="dither">Dither</button><button role="tab" aria-selected="false" aria-controls="tab-adjust" id="adjust-tab" data-tab="adjust" tabindex="-1">Adjust</button><button role="tab" aria-selected="false" aria-controls="tab-palette" id="palette-tab" data-tab="palette" tabindex="-1">Palette</button></div>
          <div class="tab-content" id="tab-dither" role="tabpanel" aria-labelledby="dither-tab">
            <div class="section-title"><h2>Find your texture</h2><span class="count">32</span></div><p class="hint">A little structure. A little chaos.</p>
            <label class="sr-only" for="algorithm-search">Search algorithms</label><input id="algorithm-search" type="search" placeholder="Search algorithms…" class="search-input">
            <div class="family-filters" aria-label="Algorithm family">${['All', 'Diffusion', 'Ordered', 'Pattern', 'Other'].map((f, i) => `<button data-family="${f}" aria-pressed="${i === 0}">${f}</button>`).join('')}</div>
            <div id="algorithm-list" class="algorithm-list" aria-label="Dithering algorithms"></div>
            <div class="control-section">${slider('scale', 'Pixel scale', 1, 16, 1, '×')}${slider('strength', 'Dither strength', 0, 150, 1, '%')}${slider('patternSize', 'Pattern size', 2, 32, 1, 'px')}${slider('threshold', 'Threshold', 0, 100, 1, '%')}</div>
            <div class="seed-row"><label for="seed">Noise seed</label><input type="number" id="seed" min="0" max="999999" value="42"><button id="random-seed" class="icon-button" aria-label="Randomize noise seed">${icon('shuffle')}</button></div>
          </div>
          <div class="tab-content" id="tab-adjust" role="tabpanel" aria-labelledby="adjust-tab" hidden>
            <div class="section-title"><h2>Set the tone</h2><button id="reset-adjustments" class="small-link">Reset</button></div><p class="hint">Fine-tune the image before dithering.</p>
            <div class="control-section">${slider('brightness', 'Brightness', -100, 100)}${slider('contrast', 'Contrast', -100, 100)}${slider('gamma', 'Gamma', 0.2, 3, 0.05)}${slider('saturation', 'Saturation', 0, 200, 1, '%')}</div>
            <label class="toggle-row"><span>Invert source colors</span><input id="invert" type="checkbox" role="switch"></label>
            <div class="tip"><span>↳ A GOOD PLACE TO START</span><p>Lift contrast for bold shapes. Lower pixel scale to keep the fine detail.</p></div>
          </div>
          <div class="tab-content" id="tab-palette" role="tabpanel" aria-labelledby="palette-tab" hidden>
            <div class="section-title"><h2>Pick your ink</h2><span class="count" id="palette-count">2</span></div><p class="hint">Small palettes. Big personalities.</p>
            <label class="field-label" for="color-mode">Color mode</label><select id="color-mode"><option value="palette">Custom palette</option><option value="rgb">Full color · RGB quantization</option></select>
            <div id="rgb-controls" hidden>${slider('levels', 'Levels per channel', 2, 16)}</div>
            <div id="palette-controls"><label class="field-label" for="palette-select">Palette library</label><select id="palette-select">${palettes.map((p, i) => `<option value="${i}">${p.name}</option>`).join('')}<option value="custom">Custom palette</option></select>
            <div id="palette-colors" class="palette-colors"></div><button id="add-color" class="outline-button full-width">${icon('plus')} Add color</button>
            <div class="extract-row"><label for="extract-count">Extract colors</label><select id="extract-count">${[2, 3, 4, 6, 8, 12, 16].map((n) => `<option${n === 6 ? ' selected' : ''}>${n}</option>`).join('')}</select></div><button id="extract" class="outline-button full-width">↳ Extract from image</button>
            <div class="two-buttons"><button id="import-palette">Import palette</button><button id="export-palette">Export palette</button></div></div>
          </div>
          <div class="panel-bottom">${icon('shield')} Your images never leave this device.</div>
        </aside>
        <section class="preview-panel" aria-label="Image preview">
          <div class="preview-toolbar"><div class="view-modes" aria-label="Preview mode"><button data-view="output" aria-pressed="true">Dithered</button><button data-view="split" aria-pressed="false">Compare</button><button data-view="original" aria-pressed="false">Original</button></div><div class="history-buttons"><button id="undo" class="icon-button" aria-label="Undo settings" title="Undo (Ctrl/⌘ Z)">${icon('undo')}</button><button id="redo" class="icon-button" aria-label="Redo settings" title="Redo (Ctrl/⌘ Shift Z)">${icon('redo')}</button></div></div>
          <div id="drop-zone" class="canvas-stage"><div class="drop-hint">DROP SOMETHING GOOD.</div><div id="canvas-frame" class="canvas-frame"><canvas id="original-canvas" aria-label="Original image"></canvas><canvas id="output-canvas" aria-label="Dithered image"></canvas><div id="split-line" class="split-line" hidden><span>↔</span></div><span id="image-badge" class="image-badge">DITHERED / LIVE PREVIEW</span></div><div class="artwork-caption"><span id="image-name">ORBITAL STUDY — SAMPLE IMAGE</span><span id="dimensions">1200 × 900</span></div></div>
          <div id="compare-control" class="compare-control" hidden><label for="compare">Original / dithered split</label><input id="compare" type="range" min="0" max="100" value="50"></div>
          <div class="canvas-bottom"><button id="upload" class="upload-button">${icon('upload')} Open image <kbd>O</kbd></button><button id="sample" class="small-link">Use sample</button><label class="zoom-label" for="zoom">Zoom <select id="zoom"><option value="fit">Fit</option><option value="50">50%</option><option value="100">100%</option><option value="200">200%</option></select></label></div>
          <div class="preview-status"><span id="render-status" role="status" aria-live="polite">Preparing your pixels…</span><span>LOCAL PROCESSING <span class="live-dot"></span></span></div>
        </section>
        <aside class="output-panel" aria-label="Effects and export">
          <div class="panel-heading"><span>THE FINISHING TOUCH</span><span>✳</span></div>
          <div class="effects-section"><div class="section-title"><h2>Effects stack</h2><span class="count" id="effect-count">0 / 12</span></div><p class="hint">Layer it up. Order changes everything.</p><div id="effect-stack"></div><button id="add-effect" class="outline-button full-width">${icon('plus')} Add an effect</button></div>
          <div class="export-section"><div class="section-title"><h2>Make it a file</h2><span>↙</span></div><label class="field-label" for="format">Export format</label><select id="format"><option value="png">PNG · lossless</option><option value="jpg">JPG · smaller file</option><option value="webp">WebP · modern & light</option><option value="svg">SVG · color vectors</option><option value="svg-black">SVG · black ink only</option></select><label class="field-label" for="export-size">Output size</label><select id="export-size"><option value="1">Original resolution</option><option value=".5">50% · half size</option><option value=".25">25% · quarter size</option></select><p id="export-note" class="export-note">Full resolution. All the little details.</p><button id="export" class="export-button">Export image ${icon('download')}</button><div class="two-buttons"><button id="copy-image">${icon('copy')} Copy image</button><button id="share">Copy settings link ↗</button></div></div>
          <div class="preset-tools"><button id="save-preset" class="outline-button full-width">${icon('plus')} Save as preset</button><div class="two-buttons"><button id="import-preset">Import preset</button><button id="export-preset">Export preset</button></div><label class="field-label" for="saved-presets">Your saved presets</label><div class="saved-preset-row"><select id="saved-presets"><option value="">Choose a preset…</option></select><button id="delete-preset" class="icon-button" aria-label="Delete selected preset">${icon('close')}</button></div></div>
          <button id="reset" class="reset-button">Reset everything ↺</button>
        </aside>
      </div>
      <div class="preset-bar"><div class="preset-intro"><span class="eyebrow">SKIP THE BLANK CANVAS</span><h2>A few starting points<span>↗</span></h2><button id="shuffle" class="small-link">${icon('shuffle')} Surprise me</button></div><div id="preset-gallery" class="preset-gallery"></div></div>
    </section>
    <footer class="site-footer"><p>Made for making things. <span>No accounts. No uploads. No nonsense.</span></p><div><button id="about-open">About & privacy</button><a href="https://github.com/Gorskiz/Dither4All" target="_blank" rel="noopener noreferrer">MIT licensed ↗</a></div></footer>
  </main>
  <div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
  <dialog id="effect-dialog"><form method="dialog" class="dialog-header"><div><p class="eyebrow">ONE MORE LAYER</p><h2>Find your finishing touch.</h2></div><button class="icon-button" aria-label="Close effects">${icon('close')}</button></form><p>Effects run after dithering, from top to bottom. They can introduce new colors.</p><div id="effect-picker" class="effect-picker"></div></dialog>
  <dialog id="name-dialog"><form id="name-form"><div class="dialog-header"><h2>Save your recipe.</h2><button type="button" class="icon-button" id="name-close" aria-label="Close save preset">${icon('close')}</button></div><label class="field-label" for="preset-name">Preset name</label><input id="preset-name" maxlength="60" required placeholder="Something wonderfully crunchy"><button class="export-button" type="submit">Save preset ${icon('check')}</button></form></dialog>
  <dialog id="batch-dialog"><form method="dialog" class="dialog-header"><div><p class="eyebrow">A WHOLE LOT OF PIXELS</p><h2>Batch your images.</h2></div><button class="icon-button" aria-label="Close batch">${icon('close')}</button></form><p>Apply the current settings to up to 20 images. Download one ZIP of PNGs. Each image keeps its own dimensions.</p><label class="batch-drop" for="batch-input">${icon('upload')} Choose images<input id="batch-input" type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/gif,image/bmp" multiple></label><ul id="batch-list" class="batch-list"></ul><p id="batch-status" role="status" aria-live="polite">Nothing selected yet.</p><button id="batch-run" class="export-button" disabled>Process & download ZIP ${icon('download')}</button><button id="batch-cancel" class="small-link" hidden>Cancel batch</button></dialog>
  <dialog id="help-dialog"><form method="dialog" class="dialog-header"><div><p class="eyebrow">THE FIELD GUIDE</p><h2>Embrace the limitations.</h2></div><button class="icon-button" aria-label="Close guide">${icon('close')}</button></form><div class="guide-grid"><article><span>01</span><h3>Bring an image.</h3><p>Drop a PNG, JPG, WebP, AVIF, BMP, or GIF into the canvas. Paste from your clipboard, or start with our original sample. Animated files use their first frame.</p></article><article><span>02</span><h3>Find your texture.</h3><p>Diffusion gives organic grain. Ordered dithering gives a grid. Patterns give lines, dots, and halftones. Pixel scale changes texture size while preserving output dimensions.</p></article><article><span>03</span><h3>Pick your ink.</h3><p>Choose a palette, edit each swatch, or extract colors from your image. Full color mode quantizes RGB channels. CMYK uses source colors for a four-screen ink simulation.</p></article><article><span>04</span><h3>Break it beautifully.</h3><p>Add, toggle, and reorder effects. Save your settings as presets, share a settings link, or save a project with its image. Export raster images or actual SVG paths.</p></article></div><p class="guide-note">Keyboard: O opens an image; Ctrl/⌘ Z undoes; Ctrl/⌘ Shift Z redoes. Preview is reduced to 1100 px; export processes the selected full size. Images: up to 16 MP, 8192 px per side, 50 MB. SVG: up to 1 MP. Batch: 20 files, 100 MB combined.</p></dialog>
  <dialog id="about-dialog"><form method="dialog" class="dialog-header"><h2>Pixels for the people.</h2><button class="icon-button" aria-label="Close about">${icon('close')}</button></form><p>Dither4All is a free, MIT-licensed image editor. Your images are decoded and processed on your device. The app has no image upload endpoint, analytics, cookies, account system, or remote fonts. Presets are saved in your browser when you choose to save them.</p><p>The host receives normal web requests to load the app. Settings links contain settings only. Project files contain the image and should be shared intentionally. Clipboard access is requested only when you copy an image.</p><p>Built independently from documented dithering techniques. Custom effects are original implementations, not replicas of proprietary modules. No video or animation processing in this release.</p><a href="https://github.com/Gorskiz/Dither4All" target="_blank" rel="noopener noreferrer">Read the source, report a bug, make it better ↗</a></dialog>
  <input hidden id="image-input" type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/gif,image/bmp">
  <input hidden id="project-input" type="file" accept=".d4a,application/json">
  <input hidden id="palette-input" type="file" accept=".json,.txt,.hex,.gpl">
  <input hidden id="preset-input" type="file" accept=".json">
`;

let settings = cloneSettings(defaults),
  source = makeSample(),
  sourceName = 'Orbital study',
  family = 'All',
  view = 'output';
let previewAbort: AbortController | null = null,
  renderTimer: ReturnType<typeof setTimeout>,
  renderVersion = 0,
  toastTimer: ReturnType<typeof setTimeout>;
let history: Settings[] = [cloneSettings(settings)],
  historyIndex = 0;
let importVersion = 0;
let batchFiles: File[] = [],
  batchCancelled = false,
  batchBusy = false,
  batchAbort: AbortController | null = null;
let exportBusy = false;
const builtinPresets: { name: string; tag: string; settings: Settings }[] = [
  { name: 'The original', tag: 'DIFFUSION', settings: cloneSettings(defaults) },
  {
    name: 'Pocket nostalgia',
    tag: '4-COLOR',
    settings: {
      ...cloneSettings(defaults),
      algorithm: 'bayer-4',
      scale: 3,
      palette: palettes[2].colors,
    },
  },
  {
    name: 'After hours',
    tag: 'GLOW',
    settings: {
      ...cloneSettings(defaults),
      algorithm: 'atkinson',
      scale: 2,
      palette: palettes[3].colors,
      effects: [{ id: 'glow', type: 'glow', amount: 40, enabled: true }],
    },
  },
  {
    name: 'Print club',
    tag: 'HALFTONE',
    settings: {
      ...cloneSettings(defaults),
      algorithm: 'halftone',
      patternSize: 5,
      scale: 2,
      palette: palettes[7].colors,
    },
  },
  {
    name: 'Signal lost',
    tag: 'GLITCH',
    settings: {
      ...cloneSettings(defaults),
      algorithm: 'bayer-8',
      scale: 2,
      palette: palettes[5].colors,
      effects: [
        { id: 'split', type: 'rgb-split', amount: 22, enabled: true },
        { id: 'rows', type: 'row-shift', amount: 30, enabled: true },
      ],
    },
  },
];
function toast(message: string, error = false) {
  const el = $('toast');
  el.textContent = message;
  el.classList.toggle('error', error);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), error ? 8000 : 4000);
}
function fail(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return;
  console.error(error);
  toast(error instanceof Error ? error.message : 'Something went wrong. Please try again.', true);
}
function safely(fn: () => unknown) {
  try {
    const result = fn();
    if (result instanceof Promise) result.catch(fail);
  } catch (error) {
    fail(error);
  }
}
function bind(id: string, fn: () => unknown) {
  $(id).addEventListener('click', () => safely(fn));
}
function persistHistory() {
  if (JSON.stringify(history[historyIndex]) === JSON.stringify(settings)) return;
  history = history.slice(0, historyIndex + 1);
  history.push(cloneSettings(settings));
  if (history.length > 60) history.shift();
  historyIndex = history.length - 1;
  syncHistory();
}
function syncHistory() {
  $<HTMLButtonElement>('undo').disabled = historyIndex === 0;
  $<HTMLButtonElement>('redo').disabled = historyIndex === history.length - 1;
}
function change(update: (s: Settings) => void, commit = true) {
  update(settings);
  if (commit) persistHistory();
  syncControls();
  scheduleRender();
}
function applySettings(value: Settings) {
  settings = cloneSettings(value);
  persistHistory();
  syncControls();
  renderAlgorithms();
  renderEffects();
  scheduleRender();
}
function renderAlgorithms() {
  const term = $<HTMLInputElement>('algorithm-search').value.toLowerCase();
  const matches = algorithms.filter(
    (a) => (family === 'All' || a[2] === family) && a[1].toLowerCase().includes(term),
  );
  $('algorithm-list').innerHTML =
    matches
      .map(
        (a) =>
          `<button class="algorithm ${settings.algorithm === a[0] ? 'selected' : ''}" data-algorithm="${a[0]}" aria-pressed="${settings.algorithm === a[0]}" title="${a[3]}"><span class="texture-chip texture-${a[2].toLowerCase()}" aria-hidden="true"></span><span>${a[1]}</span><span class="algorithm-check">${settings.algorithm === a[0] ? '↗' : '+'}</span></button>`,
      )
      .join('') || '<p class="hint">No matching textures. Try another search.</p>';
  $('algorithm-list')
    .querySelectorAll<HTMLButtonElement>('[data-algorithm]')
    .forEach(
      (button) =>
        (button.onclick = () => {
          change((s) => (s.algorithm = button.dataset.algorithm as AlgorithmId));
          renderAlgorithms();
        }),
    );
}
function renderEffects() {
  $('effect-count').textContent = `${settings.effects.length} / 12`;
  $('effect-stack').innerHTML = settings.effects.length
    ? settings.effects
        .map(
          (e, i) =>
            `<div class="effect-layer ${e.enabled ? '' : 'muted'}"><div class="effect-top"><label><input type="checkbox" data-toggle="${i}" ${e.enabled ? 'checked' : ''}><span>${effectCatalog.find((a) => a[0] === e.type)![1]}</span></label><button data-remove="${i}" class="icon-button" aria-label="Remove ${effectCatalog.find((a) => a[0] === e.type)![1]}">${icon('close')}</button></div><div class="effect-slider"><label class="sr-only" for="effect-${i}">Effect intensity</label><input id="effect-${i}" type="range" min="0" max="100" value="${e.amount}" data-effect="${i}"><output id="effect-value-${i}">${e.amount}%</output></div><div class="effect-order"><span>LAYER ${String(i + 1).padStart(2, '0')}</span><button data-up="${i}" aria-label="Move layer ${i + 1} up" ${i === 0 ? 'disabled' : ''}>↑</button><button data-down="${i}" aria-label="Move layer ${i + 1} down" ${i === settings.effects.length - 1 ? 'disabled' : ''}>↓</button></div></div>`,
        )
        .join('')
    : '<div class="empty-stack"><div class="stack-glyph" aria-hidden="true">▱<br>▱<br>▱</div><p>A little extra, if you want it.</p><span>24 effects. Endless combinations.</span></div>';
  $('effect-stack')
    .querySelectorAll<HTMLInputElement>('[data-toggle]')
    .forEach(
      (el) =>
        (el.onchange = () => {
          change((s) => (s.effects[+el.dataset.toggle!].enabled = el.checked));
          renderEffects();
        }),
    );
  $('effect-stack')
    .querySelectorAll<HTMLButtonElement>('[data-remove]')
    .forEach(
      (el) =>
        (el.onclick = () => {
          change((s) => s.effects.splice(+el.dataset.remove!, 1));
          renderEffects();
        }),
    );
  $('effect-stack')
    .querySelectorAll<HTMLInputElement>('[data-effect]')
    .forEach((el) => {
      el.oninput = () => {
        change((s) => (s.effects[+el.dataset.effect!].amount = +el.value), false);
        $(`effect-value-${el.dataset.effect}`).textContent = el.value + '%';
      };
      el.onchange = () => persistHistory();
    });
  for (const direction of ['up', 'down'])
    $('effect-stack')
      .querySelectorAll<HTMLButtonElement>(`[data-${direction}]`)
      .forEach(
        (el) =>
          (el.onclick = () => {
            const index = +el.dataset[direction]!,
              next = index + (direction === 'up' ? -1 : 1);
            if (next < 0 || next >= settings.effects.length) return;
            change((s) => {
              [s.effects[index], s.effects[next]] = [s.effects[next], s.effects[index]];
            });
            renderEffects();
          }),
      );
  $<HTMLButtonElement>('add-effect').disabled = settings.effects.length >= 12;
}
function renderColors() {
  $('palette-count').textContent = String(settings.palette.length);
  $('palette-colors').innerHTML = settings.palette
    .map(
      (color, i) =>
        `<div class="color-row"><label class="color-swatch" style="--swatch:${color}"><span class="sr-only">Palette color ${i + 1}</span><input type="color" value="${color}" data-color="${i}"></label><span class="mono">${color.toUpperCase()}</span><button class="icon-button" data-remove-color="${i}" aria-label="Remove palette color ${i + 1}" ${settings.palette.length <= 2 ? 'disabled' : ''}>${icon('close')}</button></div>`,
    )
    .join('');
  $('palette-colors')
    .querySelectorAll<HTMLInputElement>('[data-color]')
    .forEach((el) => {
      el.oninput = () => {
        change((s) => (s.palette[+el.dataset.color!] = el.value), false);
        el.closest('.color-row')!.querySelector('.mono')!.textContent = el.value.toUpperCase();
        (el.parentElement as HTMLElement).style.setProperty('--swatch', el.value);
      };
      el.onchange = () => persistHistory();
    });
  $('palette-colors')
    .querySelectorAll<HTMLButtonElement>('[data-remove-color]')
    .forEach(
      (el) =>
        (el.onclick = () => {
          change((s) => s.palette.splice(+el.dataset.removeColor!, 1));
          renderColors();
        }),
    );
  $<HTMLButtonElement>('add-color').disabled = settings.palette.length >= 16;
}
function syncControls() {
  document.querySelectorAll<HTMLInputElement>('[data-setting]').forEach((el) => {
    const value = settings[el.dataset.setting as keyof Settings] as number;
    el.value = String(value);
    $(`${el.id}-value`).textContent = `${Number(value.toFixed(2))}${el.dataset.suffix || ''}`;
  });
  $<HTMLInputElement>('invert').checked = settings.invert;
  $<HTMLInputElement>('seed').value = String(settings.seed);
  $<HTMLSelectElement>('color-mode').value = settings.colorMode;
  $('rgb-controls').hidden = settings.colorMode !== 'rgb';
  $('palette-controls').hidden = settings.colorMode === 'rgb';
  const paletteIndex = palettes.findIndex(
    (p) => JSON.stringify(p.colors) === JSON.stringify(settings.palette),
  );
  $<HTMLSelectElement>('palette-select').value = paletteIndex < 0 ? 'custom' : String(paletteIndex);
  renderColors();
  syncHistory();
  updateExportNote();
}
function sourceAtSize(maxSide: number, ratio = 1): HTMLCanvasElement {
  const factor = Math.min(ratio, maxSide / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * factor));
  canvas.height = Math.max(1, Math.round(source.height * factor));
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}
function runWorker(pixels: Pixels, s: Settings, signal?: AbortSignal): Promise<Pixels> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Processing cancelled.', 'AbortError'));
      return;
    }
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const cleanup = () => {
      worker.terminate();
      signal?.removeEventListener('abort', cancel);
    };
    const cancel = () => {
      cleanup();
      reject(new DOMException('Processing cancelled.', 'AbortError'));
    };
    signal?.addEventListener('abort', cancel, { once: true });
    worker.onmessage = (event) => {
      cleanup();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.result);
    };
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || 'The image worker could not start.'));
    };
    worker.postMessage({ pixels, settings: s }, [pixels.data.buffer]);
  });
}
function scheduleRender() {
  clearTimeout(renderTimer);
  const version = ++renderVersion;
  previewAbort?.abort();
  previewAbort = null;
  updateExportNote();
  $('render-status').textContent = 'Developing pixels…';
  $('render-status').classList.add('rendering');
  renderTimer = setTimeout(
    () =>
      safely(async () => {
        const started = performance.now(),
          canvas = sourceAtSize(1100),
          ratio = canvas.width / source.width;
        const previewSettings = cloneSettings(settings);
        // Keep texture frequency close to the full-resolution export at reduced preview size.
        previewSettings.scale = Math.max(1, Math.round(settings.scale * ratio));
        const original = $<HTMLCanvasElement>('original-canvas');
        original.width = canvas.width;
        original.height = canvas.height;
        original.getContext('2d')!.drawImage(canvas, 0, 0);
        previewAbort = new AbortController();
        const result = await runWorker(canvasPixels(canvas), previewSettings, previewAbort.signal);
        if (version !== renderVersion) return;
        const target = $<HTMLCanvasElement>('output-canvas');
        target.width = result.width;
        target.height = result.height;
        target
          .getContext('2d')!
          .putImageData(
            new ImageData(new Uint8ClampedArray(result.data), result.width, result.height),
            0,
            0,
          );
        $('canvas-frame').style.aspectRatio = String(source.width / source.height);
        $('image-name').textContent =
          sourceName === 'Orbital study'
            ? 'ORBITAL STUDY — SAMPLE IMAGE'
            : sourceName.toUpperCase();
        $('dimensions').textContent = `${source.width} × ${source.height}`;
        $('render-status').textContent =
          `${algorithms.find((a) => a[0] === settings.algorithm)![1]} · ${Math.round(performance.now() - started)} ms`;
        $('render-status').classList.remove('rendering');
        previewAbort = null;
        updateZoom();
      }),
    90,
  );
}
async function loadImage(file: Blob, name: string) {
  const version = ++importVersion,
    canvas = await decodeImage(file);
  if (version !== importVersion) return;
  source = canvas;
  sourceName = name;
  history = [cloneSettings(settings)];
  historyIndex = 0;
  syncHistory();
  scheduleRender();
  renderPresetGallery();
  toast('Image opened. Make something good.');
}
function setView(value: string) {
  view = value;
  document
    .querySelectorAll<HTMLButtonElement>('[data-view]')
    .forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.view === view)));
  $('output-canvas').style.display = view === 'original' ? 'none' : 'block';
  $('compare-control').hidden = view !== 'split';
  $('split-line').hidden = view !== 'split';
  $('image-badge').textContent =
    view === 'original'
      ? 'ORIGINAL / BEFORE'
      : view === 'split'
        ? 'ORIGINAL / DITHERED'
        : 'DITHERED / LIVE PREVIEW';
  updateSplit();
}
function updateSplit() {
  const split = $<HTMLInputElement>('compare').value;
  $('output-canvas').style.clipPath = view === 'split' ? `inset(0 0 0 ${split}%)` : 'none';
  $('split-line').style.left = split + '%';
}
function updateZoom() {
  const value = $<HTMLSelectElement>('zoom').value,
    stage = $('drop-zone');
  const availableW = Math.max(180, stage.clientWidth - 64),
    availableH = Math.max(150, stage.clientHeight - 90);
  const width =
    value === 'fit'
      ? Math.min(availableW, (availableH * source.width) / source.height)
      : (source.width * Number(value)) / 100;
  $('canvas-frame').style.width = `${width}px`;
}
function updateExportNote() {
  const ratio = +$<HTMLSelectElement>('export-size').value,
    w = Math.max(1, Math.round(source.width * ratio)),
    h = Math.max(1, Math.round(source.height * ratio));
  const isSVG = $<HTMLSelectElement>('format').value.startsWith('svg');
  $('export-note').textContent = isSVG
    ? `${w} × ${h} · actual vector paths${w * h > 1_000_000 ? ' · choose a smaller size (1 MP limit)' : ''}`
    : `${w} × ${h} · ${ratio === 1 ? 'full resolution' : 'resized before processing'}`;
}
async function getExportPixels() {
  const ratio = +$<HTMLSelectElement>('export-size').value;
  return runWorker(canvasPixels(sourceAtSize(8192, ratio)), cloneSettings(settings));
}
function exportName(ext: string) {
  return `${sourceName.replace(/\.[^.]+$/, '').replace(/[^a-z0-9-_]/gi, '-') || 'image'}-dither4all.${ext}`;
}
async function exportImage(copy = false) {
  if (exportBusy) return;
  const format = copy ? 'png' : $<HTMLSelectElement>('format').value;
  const filename = exportName(format.startsWith('svg') ? 'svg' : format);
  const ratio = +$<HTMLSelectElement>('export-size').value;
  if (
    format.startsWith('svg') &&
    Math.round(source.width * ratio) * Math.round(source.height * ratio) > 1_000_000
  )
    throw new Error('Choose 50% or 25% output size for SVG (1 megapixel limit).');
  exportBusy = true;
  $<HTMLButtonElement>('export').disabled = true;
  $<HTMLButtonElement>('copy-image').disabled = true;
  $('export').innerHTML = `Developing… <span class="spinner"></span>`;
  try {
    // ClipboardItem accepts a promise, preserving transient user activation on Safari.
    const blobPromise = getExportPixels().then((p) =>
      format.startsWith('svg')
        ? new Blob([svgImage(p, format === 'svg-black')], { type: 'image/svg+xml' })
        : rasterBlob(p, format),
    );
    if (copy) {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        await blobPromise;
        throw new Error('Image clipboard is unavailable here. Export a PNG instead.');
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);
      toast('Image copied to your clipboard.');
    } else {
      download(await blobPromise, filename);
      toast('Your pixels are ready.');
    }
  } finally {
    exportBusy = false;
    $<HTMLButtonElement>('export').disabled = false;
    $<HTMLButtonElement>('copy-image').disabled = false;
    $('export').innerHTML = `Export image ${icon('download')}`;
  }
}
function savedPresets(): { name: string; settings: Settings }[] {
  try {
    const value = JSON.parse(localStorage.getItem('dither4all-presets') || '[]');
    if (!Array.isArray(value)) return [];
    return value.slice(0, 50).flatMap((p) => {
      try {
        return typeof p.name === 'string'
          ? [{ name: p.name.slice(0, 60), settings: validateSettings(p.settings) }]
          : [];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}
function renderSavedPresets() {
  $('saved-presets').innerHTML =
    '<option value="">Choose a preset…</option>' +
    savedPresets()
      .map((p, i) => `<option value="${i}">${escape(p.name)}</option>`)
      .join('');
}
function storePresets(presets: ReturnType<typeof savedPresets>) {
  try {
    localStorage.setItem('dither4all-presets', JSON.stringify(presets));
  } catch {
    throw new Error('Browser storage is unavailable or full. Export a preset JSON instead.');
  }
  renderSavedPresets();
}
function renderPresetGallery() {
  $('preset-gallery').innerHTML = builtinPresets
    .map(
      (p, i) =>
        `<button class="preset-card" data-preset="${i}"><canvas id="preset-thumb-${i}" aria-hidden="true"></canvas><span class="preset-title">${p.name}<span>↗</span></span><span class="preset-tag">${p.tag}</span></button>`,
    )
    .join('');
  const small = sourceAtSize(156),
    pixels = canvasPixels(small);
  builtinPresets.forEach((p, i) => {
    const s = cloneSettings(p.settings);
    s.scale = 1;
    s.patternSize = 4;
    const result = processImage(pixels, s),
      canvas = $<HTMLCanvasElement>(`preset-thumb-${i}`);
    canvas.width = result.width;
    canvas.height = result.height;
    canvas
      .getContext('2d')!
      .putImageData(
        new ImageData(new Uint8ClampedArray(result.data), result.width, result.height),
        0,
        0,
      );
  });
  $('preset-gallery')
    .querySelectorAll<HTMLButtonElement>('[data-preset]')
    .forEach(
      (el) =>
        (el.onclick = () => {
          applySettings(builtinPresets[+el.dataset.preset!].settings);
          toast(`Loaded “${builtinPresets[+el.dataset.preset!].name}”.`);
        }),
    );
}
function openDialog(id: string) {
  $<HTMLDialogElement>(id).showModal();
}
for (const id of ['help', 'about']) bind(`${id}-open`, () => openDialog(`${id}-dialog`));
document.querySelectorAll<HTMLDialogElement>('dialog').forEach((dialog) =>
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
        dialog.close();
    }
  }),
);
function selectTab(name: string) {
  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((el) => {
    const selected = el.dataset.tab === name;
    el.setAttribute('aria-selected', String(selected));
    el.tabIndex = selected ? 0 : -1;
    $(`tab-${el.dataset.tab}`).hidden = !selected;
  });
}
document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((el, index) => {
  el.onclick = () => selectTab(el.dataset.tab!);
  el.onkeydown = (e) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      const tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-tab]')],
        next =
          e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? 2
              : (index + (e.key === 'ArrowRight' ? 1 : 2)) % 3;
      selectTab(tabs[next].dataset.tab!);
      tabs[next].focus();
    }
  };
});
document.querySelectorAll<HTMLButtonElement>('[data-family]').forEach(
  (el) =>
    (el.onclick = () => {
      family = el.dataset.family!;
      document
        .querySelectorAll('[data-family]')
        .forEach((b) =>
          b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.family === family)),
        );
      renderAlgorithms();
    }),
);
$('algorithm-search').oninput = () => renderAlgorithms();
document.querySelectorAll<HTMLInputElement>('[data-setting]').forEach((el) => {
  el.oninput = () =>
    change(
      (s) => ((s as unknown as Record<string, unknown>)[el.dataset.setting!] = +el.value),
      false,
    );
  el.onchange = () => persistHistory();
});
$<HTMLInputElement>('invert').onchange = (e) =>
  change((s) => (s.invert = (e.target as HTMLInputElement).checked));
$<HTMLInputElement>('seed').onchange = () => {
  const value = +$<HTMLInputElement>('seed').value;
  change((s) => (s.seed = Math.round(Math.max(0, Math.min(999999, value || 0)))));
};
bind('random-seed', () => change((s) => (s.seed = Math.floor(Math.random() * 1_000_000))));
bind('reset-adjustments', () =>
  change((s) => {
    s.brightness = 0;
    s.contrast = 0;
    s.gamma = 1;
    s.saturation = 100;
    s.invert = false;
  }),
);
$<HTMLSelectElement>('palette-select').onchange = () => {
  const i = +$<HTMLSelectElement>('palette-select').value;
  if (Number.isInteger(i) && palettes[i]) change((s) => (s.palette = [...palettes[i].colors]));
};
$<HTMLSelectElement>('color-mode').onchange = () =>
  change((s) => (s.colorMode = $<HTMLSelectElement>('color-mode').value as Settings['colorMode']));
bind('add-color', () => {
  if (settings.palette.length < 16) change((s) => s.palette.push('#b9ca6b'));
});
bind('extract', () =>
  change(
    (s) =>
      (s.palette = extractPalette(
        canvasPixels(sourceAtSize(256)).data,
        +$<HTMLSelectElement>('extract-count').value,
      )),
  ),
);
bind('import-palette', () => $('palette-input').click());
bind('export-palette', () =>
  download(
    new Blob([JSON.stringify({ name: 'Dither4All palette', colors: settings.palette }, null, 2)], {
      type: 'application/json',
    }),
    'dither4all-palette.json',
  ),
);
$<HTMLInputElement>('palette-input').onchange = (e) =>
  safely(async () => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      if (file.size > 100_000) throw new Error('Palette files must be under 100 KB.');
      const palette = parsePalette(await file.text());
      change((s) => (s.palette = palette));
      toast('Palette imported.');
    }
    (e.target as HTMLInputElement).value = '';
  });
document
  .querySelectorAll<HTMLButtonElement>('[data-view]')
  .forEach((el) => (el.onclick = () => setView(el.dataset.view!)));
$('compare').oninput = () => updateSplit();
$('zoom').onchange = () => updateZoom();
new ResizeObserver(updateZoom).observe($('drop-zone'));
bind('undo', () => {
  if (historyIndex > 0) {
    settings = cloneSettings(history[--historyIndex]);
    syncControls();
    renderAlgorithms();
    renderEffects();
    scheduleRender();
  }
});
bind('redo', () => {
  if (historyIndex < history.length - 1) {
    settings = cloneSettings(history[++historyIndex]);
    syncControls();
    renderAlgorithms();
    renderEffects();
    scheduleRender();
  }
});
bind('upload', () => $('image-input').click());
$<HTMLInputElement>('image-input').onchange = (e) =>
  safely(async () => {
    const input = e.target as HTMLInputElement,
      file = input.files?.[0];
    if (file) await loadImage(file, file.name);
    input.value = '';
  });
bind('sample', () => {
  ++importVersion;
  source = makeSample();
  sourceName = 'Orbital study';
  scheduleRender();
  renderPresetGallery();
});
let dragDepth = 0;
document.addEventListener('dragover', (e) => {
  if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
});
document.addEventListener('drop', (e) => {
  if (e.dataTransfer?.files.length) {
    e.preventDefault();
    dragDepth = 0;
    $('drop-zone').classList.remove('dragging');
    const file = e.dataTransfer.files[0];
    safely(() => loadImage(file, file.name));
  }
});
$('drop-zone').addEventListener('dragenter', (e) => {
  if ((e as DragEvent).dataTransfer?.types.includes('Files')) {
    dragDepth++;
    $('drop-zone').classList.add('dragging');
  }
});
$('drop-zone').addEventListener('dragleave', () => {
  if (--dragDepth <= 0) $('drop-zone').classList.remove('dragging');
});
document.addEventListener('paste', (e) => {
  if ((e.target as HTMLElement).closest('input,textarea,[contenteditable]')) return;
  const image = [...(e.clipboardData?.items || [])]
    .find((item) => item.type.startsWith('image/'))
    ?.getAsFile();
  if (image) {
    e.preventDefault();
    safely(() => loadImage(image, 'Pasted image'));
  }
});
document.addEventListener('keydown', (e) => {
  if (
    (e.target as HTMLElement).closest('input,select,textarea,[contenteditable]') ||
    document.querySelector('dialog[open]')
  )
    return;
  if (e.key.toLowerCase() === 'o' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    $('image-input').click();
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    $(e.shiftKey ? 'redo' : 'undo').click();
  }
});
bind('add-effect', () => openDialog('effect-dialog'));
$('effect-picker').innerHTML = effectCatalog
  .map(
    (e) =>
      `<button data-add-effect="${e[0]}"><span>${e[1]}</span><small>${e[2]}</small><span>+</span></button>`,
  )
  .join('');
$('effect-picker')
  .querySelectorAll<HTMLButtonElement>('[data-add-effect]')
  .forEach(
    (el) =>
      (el.onclick = () => {
        if (settings.effects.length >= 12) return;
        change((s) =>
          s.effects.push({
            id: crypto.randomUUID(),
            type: el.dataset.addEffect as EffectId,
            amount: 40,
            enabled: true,
          }),
        );
        renderEffects();
        $<HTMLDialogElement>('effect-dialog').close();
      }),
  );
bind('export', () => exportImage());
bind('copy-image', () => exportImage(true));
$('format').onchange = updateExportNote;
$('export-size').onchange = updateExportNote;
bind('reset', () => applySettings(cloneSettings(defaults)));
bind('shuffle', () => {
  const p = cloneSettings(
    builtinPresets[Math.floor(Math.random() * builtinPresets.length)].settings,
  );
  p.algorithm = algorithms[Math.floor(Math.random() * algorithms.length)][0];
  p.seed = Math.floor(Math.random() * 1_000_000);
  applySettings(p);
});
bind('save-preset', () => {
  if (savedPresets().length >= 50)
    throw new Error('You have 50 saved presets. Delete one or export a JSON.');
  $<HTMLInputElement>('preset-name').value = '';
  openDialog('name-dialog');
});
bind('name-close', () => $<HTMLDialogElement>('name-dialog').close());
$('name-form').onsubmit = (e) => {
  e.preventDefault();
  safely(() => {
    const name = $<HTMLInputElement>('preset-name').value.trim();
    if (!name) throw new Error('Give your preset a name.');
    storePresets([...savedPresets(), { name, settings: cloneSettings(settings) }]);
    $<HTMLDialogElement>('name-dialog').close();
    toast('Preset saved on this device.');
  });
};
$<HTMLSelectElement>('saved-presets').onchange = () => {
  const value = $<HTMLSelectElement>('saved-presets').value;
  if (value !== '') {
    const p = savedPresets()[+value];
    if (p) applySettings(p.settings);
  }
};
bind('delete-preset', () => {
  const value = $<HTMLSelectElement>('saved-presets').value;
  if (value !== '') storePresets(savedPresets().filter((_, i) => i !== +value));
});
bind('export-preset', () =>
  download(
    new Blob([JSON.stringify({ version: 1, settings }, null, 2)], { type: 'application/json' }),
    'dither4all-preset.json',
  ),
);
bind('import-preset', () => $('preset-input').click());
$<HTMLInputElement>('preset-input').onchange = (e) =>
  safely(async () => {
    const input = e.target as HTMLInputElement,
      file = input.files?.[0];
    if (file) {
      if (file.size > 100_000) throw new Error('Preset files must be under 100 KB.');
      const value = JSON.parse(await file.text());
      applySettings(validateSettings(value.settings ?? value));
      toast('Preset imported.');
    }
    input.value = '';
  });
bind('share', async () => {
  const url = new URL(location.href);
  url.hash = 'recipe=' + encodeURIComponent(JSON.stringify(settings));
  await navigator.clipboard.writeText(url.toString());
  toast('Settings link copied. The image is not included.');
});
bind('save-project', async () => {
  const recipe = cloneSettings(settings),
    name = sourceName,
    filename = exportName('d4a'),
    blob = await rasterBlob(canvasPixels(source), 'png');
  if ((blob.size * 4) / 3 > MAX_FILE_BYTES - 100000)
    throw new Error(
      'This image is too large for a portable project file. Export the image and preset separately.',
    );
  const reader = new FileReader();
  reader.onload = () =>
    download(
      new Blob([JSON.stringify({ version: 1, name, settings: recipe, image: reader.result })], {
        type: 'application/json',
      }),
      filename,
    );
  reader.onerror = () => fail(new Error('Could not save the project file.'));
  reader.readAsDataURL(blob);
});
bind('open-project', () => $('project-input').click());
$<HTMLInputElement>('project-input').onchange = (e) =>
  safely(async () => {
    const input = e.target as HTMLInputElement,
      file = input.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES + 100000) throw new Error('Project files must be under 50 MB.');
    const project = readProject(await file.text()),
      version = ++importVersion;
    const encoded = project.image.split(',')[1],
      bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    const canvas = await decodeImage(
      new Blob([bytes], { type: project.image.slice(5, project.image.indexOf(';')) }),
    );
    if (version !== importVersion) return;
    source = canvas;
    sourceName = project.name;
    settings = project.settings;
    history = [cloneSettings(settings)];
    historyIndex = 0;
    syncControls();
    renderAlgorithms();
    renderEffects();
    renderPresetGallery();
    scheduleRender();
    input.value = '';
    toast('Project opened.');
  });
bind('fullscreen', async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  else if ($('app').requestFullscreen) await $('app').requestFullscreen();
  else toast('Fullscreen is not supported in this browser.', true);
});
bind('batch-open', () => openDialog('batch-dialog'));
$<HTMLInputElement>('batch-input').onchange = (e) =>
  safely(() => {
    if (batchBusy) return;
    const files = [...((e.target as HTMLInputElement).files || [])];
    if (files.length > 20) throw new Error('Choose up to 20 images per batch.');
    if (files.reduce((sum, f) => sum + f.size, 0) > 100 * 1024 * 1024)
      throw new Error('Keep the combined batch under 100 MB.');
    batchFiles = files;
    $('batch-list').innerHTML = files
      .map((f) => `<li>${escape(f.name)}<span>${(f.size / 1024).toFixed(0)} KB</span></li>`)
      .join('');
    $('batch-status').textContent =
      `${files.length} image${files.length === 1 ? '' : 's'} selected.`;
    $<HTMLButtonElement>('batch-run').disabled = !files.length;
  });
bind('batch-cancel', () => {
  batchCancelled = true;
  batchAbort?.abort();
  $('batch-status').textContent = 'Cancelling batch…';
});
function finishBatch() {
  batchBusy = false;
  $<HTMLButtonElement>('batch-run').disabled = !batchFiles.length;
  $<HTMLInputElement>('batch-input').disabled = false;
  $('batch-cancel').hidden = true;
}
bind('batch-run', async () => {
  if (batchBusy || !batchFiles.length) return;
  batchBusy = true;
  batchCancelled = false;
  $<HTMLButtonElement>('batch-run').disabled = true;
  $<HTMLInputElement>('batch-input').disabled = true;
  $('batch-cancel').hidden = false;
  batchAbort = new AbortController();
  const recipe = cloneSettings(settings),
    files = [...batchFiles],
    results: { name: string; data: Uint8Array }[] = [];
  let total = 0;
  try {
    for (const [i, file] of files.entries()) {
      if (batchCancelled) return;
      $('batch-status').textContent = `Processing ${i + 1} / ${files.length}: ${file.name}`;
      const canvas = await decodeImage(file);
      if (batchCancelled) return;
      const result = await runWorker(canvasPixels(canvas), recipe, batchAbort.signal);
      if (batchCancelled) return;
      const blob = await rasterBlob(result, 'png');
      total += blob.size;
      if (total > 250 * 1024 * 1024)
        throw new Error('The output ZIP would exceed 250 MB. Try fewer images.');
      results.push({
        name: `${String(i + 1).padStart(2, '0')}-${file.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9-_]/gi, '-')}.png`,
        data: new Uint8Array(await blob.arrayBuffer()),
      });
    }
    if (!batchCancelled) {
      download(zipFiles(results), 'dither4all-batch.zip');
      $('batch-status').textContent = `Done. ${results.length} images in one ZIP.`;
      toast('Batch exported.');
    }
  } catch (error) {
    if (!batchCancelled) {
      $('batch-status').textContent = 'Batch stopped. No partial ZIP was downloaded.';
      throw error;
    }
  } finally {
    if (batchCancelled) $('batch-status').textContent = 'Batch cancelled.';
    batchAbort = null;
    finishBatch();
  }
});

try {
  if (location.hash.startsWith('#recipe=')) {
    if (location.hash.length > 16000) throw new Error('That settings link is too long.');
    settings = validateSettings(JSON.parse(decodeURIComponent(location.hash.slice(8))));
    history = [cloneSettings(settings)];
  }
} catch (error) {
  fail(error);
}
syncControls();
renderAlgorithms();
renderEffects();
renderSavedPresets();
renderPresetGallery();
scheduleRender();
