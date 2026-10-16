import { readOutput, applyOutput, type OutputSettings } from './output-settings';
import { setupExportPanel } from './export-panel';
import { setupWorkspace, LookPicker } from './workspace-ui';
import { readDraft, writeDraft, deleteDraft, type Draft } from './recovery';
import { methodLimits, assertProcessingSize, assertMotionBudget } from './engine/limits';
import { FrameProcessor } from './motion/processor';
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
import type { Pixels } from './engine/process';
import {
  canvasPixels,
  decodeImage,
  download,
  MAX_FILE_BYTES,
  parsePalette,
  rasterBlob,
  readProject,
  svgImage,
  zipFiles,
} from './files';
import { makeSample } from './sample';
import { MotionEditor, type MotionState } from './motion/editor';
import { StylePicker } from './style-picker';
import { outputDimensions, frameCount } from './motion/model';

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
  `<label class="slider-label" for="${id}"><span>${label}</span><output id="${id}-value" aria-hidden="true"></output></label><input type="range" id="${id}" aria-label="${label}" min="${min}" max="${max}" step="${step}" data-setting="${id}" data-suffix="${suffix}">`;

$('app').innerHTML = `
  <header class="site-header">
    <a class="brand" href="./"><span class="brand-mark">D4</span><span>Dither4All</span></a>
    <nav class="document-actions" aria-label="Document actions"><button id="open-project">Open project</button><button id="save-project">Save project</button><button id="batch-open">Batch</button></nav>
    <nav class="header-links" aria-label="Help and application"><button id="help-open">Guide</button><button id="about-open">About</button><a href="https://github.com/Gorskiz/Dither4All" aria-label="Dither4All on GitHub" target="_blank" rel="noopener noreferrer">${icon('github')}</a><button id="fullscreen" class="icon-button" aria-label="Toggle fullscreen">${icon('expand')}</button></nav>
  </header>
  <div id="recovery-banner" class="recovery-banner" hidden><span id="recovery-message"></span><button id="restore-draft" class="outline-button">Restore draft</button><button id="discard-draft">Discard draft</button></div>
  <main>
    <h1 class="sr-only">Dither4All image and motion editor</h1>
    <section class="studio" aria-label="Image editor">
      <div class="editor-layout">
        <section class="preview-panel" aria-label="Image preview">
          <div class="document-bar"><span class="document-indicator"></span><span id="draft-status" role="status">Not saved yet</span><span id="image-name">Orbital study — sample image</span><span class="document-kind">IMAGE</span></div>
          <div class="preview-toolbar"><div class="view-modes" aria-label="Preview mode"><button data-view="output" aria-pressed="true">Dithered</button><button data-view="split" aria-pressed="false">Compare</button><button data-view="original" aria-pressed="false">Original</button></div><div class="history-buttons"><button id="undo" class="icon-button" aria-label="Undo settings" title="Undo (Ctrl/⌘ Z)">${icon('undo')}</button><button id="redo" class="icon-button" aria-label="Redo settings" title="Redo (Ctrl/⌘ Shift Z)">${icon('redo')}</button><button id="reset" class="icon-button" aria-label="Reset settings" title="Reset image settings (animation is preserved)">↺</button></div></div>
          <div id="drop-zone" class="canvas-stage"><div class="drop-hint">Drop an image or video to open</div><div id="canvas-frame" class="canvas-frame"><canvas id="original-canvas" aria-label="Original image"></canvas><canvas id="output-canvas" aria-label="Dithered image"></canvas><div id="split-line" class="split-line" hidden><span>↔</span></div><span id="image-badge" class="sr-only">Dithered preview</span></div></div>
          <div id="compare-control" class="compare-control" hidden><label for="compare">Original / dithered split</label><input id="compare" type="range" min="0" max="100" value="50"></div>
          <div class="canvas-bottom"><span id="dimensions">1200 × 900</span><button id="sample" class="small-link">Use sample</button><label class="zoom-label" for="zoom">Zoom <select id="zoom" aria-label="Zoom"><option value="fit">Fit</option><option value="50">50%</option><option value="100">100% preview</option><option value="200">200% preview</option></select></label></div>
          <div class="preview-status"><span id="render-status" role="status" aria-live="polite">Preparing preview…</span><button id="cancel-preview" class="small-link" hidden>Cancel preview</button><span>${icon('shield')} Local processing</span></div>
        </section>
        <aside class="inspector" aria-label="Image controls">
          <div class="inspector-actions"><button id="upload" class="outline-button">${icon('upload')} Open media</button><button id="export" class="export-button">Export image ${icon('download')}</button><button id="cancel-image-export" class="small-link" hidden>Cancel export</button></div>
          <div class="inspector-body">
            <section class="panel-section" aria-labelledby="dither-heading"><div class="section-title"><h2 id="dither-heading">Dithering</h2><span class="count">${algorithms.length} styles</span></div>
              <div class="field-row style-search"><label for="style-search">Find</label><input id="style-search" type="search" placeholder="Search ${algorithms.length} styles" autocomplete="off"></div><div class="field-row"><label for="algorithm-select">Style</label><select id="algorithm-select">${[
                'Diffusion',
                'Variable diffusion',
                'Curve diffusion',
                'Dot diffusion',
                'Tiles',
                'Optimization',
                'Lippens–Philips',
                'Grid',
                'Ordered',
                'Pattern',
                'Other',
              ]
                .map(
                  (group) =>
                    `<optgroup label="${group}">${algorithms
                      .filter((a) => a[2] === group)
                      .map((a) => `<option value="${a[0]}">${a[1]}</option>`)
                      .join('')}</optgroup>`,
                )
                .join('')}</select></div>
              <div class="style-browser-heading"><span>Image previews</span><span id="style-results">${algorithms.length} styles</span></div>
              <div id="style-gallery" class="style-gallery" role="group" aria-label="Style previews" tabindex="0"></div>
              <p id="style-empty" class="hint" hidden>No styles match. Try a different name.</p>
              <p class="style-preview-note">Your current image, fixed comparison settings. Select a style to apply it to your media.</p>
              <div class="field-row"><label for="builtin-preset">Preset</label><select id="builtin-preset"><option value="custom">Custom settings</option><option value="0">The original</option><option value="1">Pocket nostalgia</option><option value="2">After hours</option><option value="3">Print club</option><option value="4">Signal lost</option></select><button id="shuffle" class="icon-button" aria-label="Randomize style" title="Randomize style">${icon('shuffle')}</button></div>
              <p id="algorithm-description" class="hint"></p><p id="method-budget" class="hint budget-hint" hidden></p><div id="dbs-controls" class="control-section" hidden>${slider('dbsPasses', 'DBS passes', 1, 8)}</div><div id="grid-controls" class="control-section" hidden>${slider('gridWidth', 'Grid width', 1, 32)}${slider('gridHeight', 'Grid height', 1, 32)}${slider('gridMinimum', 'Minimum ink', 0, 4096)}</div>
              <div class="control-section">${slider('scale', 'Pixel scale', 1, 16, 1, '×')}${slider('strength', 'Dither strength', 0, 150, 1, '%')}${slider('patternSize', 'Pattern size', 2, 32, 1, 'px')}${slider('threshold', 'Threshold', 0, 100, 1, '%')}${slider('jitter', 'Jitter', 0, 100, 1, '%')}<div id="matrix-step-controls" class="control-subsection" hidden>${slider('matrixStep', 'Matrix step', 1, 128)}</div><div id="history-controls" class="control-subsection" hidden>${slider('errorHistory', 'Error history', 4, 64)}</div></div><label id="serpentine-row" class="toggle-row"><input id="serpentine" type="checkbox"> Serpentine scan</label><div id="matrix-rotation-row" class="field-row" hidden><label for="matrix-rotation">Rotate</label><select id="matrix-rotation"><option value="0">0°</option><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></div>
            </section>
            <section class="panel-section" aria-labelledby="palette-heading"><div class="section-title"><h2 id="palette-heading">Color</h2><span class="count" id="palette-count">2 colors</span></div>
              <div class="field-row"><label for="working-space">Space</label><select id="working-space"><option value="srgb">sRGB · classic</option><option value="linear">Linear light · accurate mixing</option></select></div><div class="field-row"><label for="color-distance">Match</label><select id="color-distance"><option value="weighted-rgb">Weighted RGB · classic</option><option value="rgb">RGB distance</option><option value="lab">CIELAB · perceptual</option><option value="ciede2000">CIEDE2000 · perceptual, slower</option><option value="luminance">Luminance only</option></select></div><div class="field-row"><label for="color-mode">Mode</label><select id="color-mode"><option value="palette">Palette</option><option value="rgb">Full color · RGB</option></select></div>
              <p id="cmyk-note" class="hint" hidden>CMYK uses source colors for four ink screens. Choose another style to use a palette.</p><div id="rgb-controls" hidden>${slider('levels', 'Levels per channel', 2, 16)}</div>
              <div id="palette-controls"><div class="field-row"><label for="palette-select">Palette</label><select id="palette-select">${palettes.map((p, i) => `<option value="${i}">${p.name}</option>`).join('')}<option value="custom">Custom palette</option></select></div>
              <div class="palette-edit"><div id="palette-colors" class="palette-colors"></div><button id="add-color" class="icon-button" aria-label="Add color" title="Add color">${icon('plus')}</button></div>
              <div class="field-row"><label for="quantizer">Extract</label><select id="quantizer"><option value="median-cut">Median cut · balanced</option><option value="wu">Wu · variance</option><option value="kmeans">K-means · refined</option><option value="kdtree">KD-tree · unique colors</option></select></div><div class="palette-actions"><button id="extract" class="small-link">Extract from image</button><label class="sr-only" for="extract-count">Number of extracted colors</label><select id="extract-count">${[2, 3, 4, 6, 8, 12, 16, 32, 64, 128, 256].map((n) => `<option${n === 6 ? ' selected' : ''}>${n}</option>`).join('')}</select><button id="import-palette" class="small-link">Import</button><button id="export-palette" class="small-link">Save</button></div></div>
            </section>
            <section class="panel-section" aria-labelledby="tone-heading"><div class="section-title"><h2 id="tone-heading">Adjustments</h2><button id="reset-adjustments" class="small-link">Reset</button></div>
              <div class="control-section">${slider('brightness', 'Brightness', -100, 100)}${slider('contrast', 'Contrast', -100, 100)}${slider('gamma', 'Gamma', 0.2, 3, 0.05)}${slider('saturation', 'Saturation', 0, 200, 1, '%')}</div><label class="toggle-row"><input id="invert" type="checkbox"> Invert source colors</label>
            </section>
            <section class="panel-section" aria-labelledby="effects-heading"><div class="section-title"><h2 id="effects-heading">Effects</h2><span class="count" id="effect-count">0 / 12</span></div><p class="hint">Applied in order, after dithering.</p><div id="effect-stack"></div><div class="effect-add-row"><label class="sr-only" for="effect-type">Effect to add</label><select id="effect-type">${[
              'Light',
              'Color',
              'Texture',
              'Glitch',
            ]
              .map(
                (group) =>
                  `<optgroup label="${group}">${effectCatalog
                    .filter((e) => e[2] === group)
                    .map((e) => `<option value="${e[0]}">${e[1]}</option>`)
                    .join('')}</optgroup>`,
              )
              .join(
                '',
              )}</select><button id="add-effect" class="outline-button" aria-label="Add an effect">${icon('plus')} Add</button></div></section>
            <section class="panel-section" aria-labelledby="export-heading"><div class="section-title"><h2 id="export-heading">Output</h2><button id="copy-image" class="small-link">Copy image</button></div><div class="field-row"><label for="format">Format</label><select id="format"><option value="png">PNG · lossless</option><option value="jpg">JPG</option><option value="webp">WebP</option><option value="svg">SVG · color vectors</option><option value="svg-black">SVG · black ink</option></select></div><div class="field-row"><label for="export-size">Size</label><select id="export-size"><option value="1">Original resolution</option><option value=".5">50% · half size</option><option value=".25">25% · quarter size</option></select></div><p id="export-note" class="hint"></p></section>
            <section class="panel-section" aria-labelledby="presets-heading"><div class="section-title"><h2 id="presets-heading">Your presets</h2><button id="save-preset" class="small-link">Save preset</button></div><div class="saved-preset-row"><label class="sr-only" for="saved-presets">Your saved presets</label><select id="saved-presets"><option value="">Choose a preset…</option></select><button id="delete-preset" class="icon-button" aria-label="Delete selected preset">${icon('close')}</button></div><div id="name-dialog" class="inline-preset" hidden><form id="name-form"><label class="field-label" for="preset-name">Preset name</label><input id="preset-name" maxlength="60" required placeholder="Name your preset"><div class="two-buttons"><button type="submit" class="outline-button">Save</button><button type="button" id="name-close" class="small-link">Cancel</button></div></form></div><div class="two-buttons"><button id="import-preset">Import preset</button><button id="export-preset">Export preset</button><button id="share">Share settings</button></div></section>
            <section class="panel-section advanced-section" aria-labelledby="noise-heading"><h2 id="noise-heading">Noise & variation</h2><div class="seed-row"><label for="seed">Seed</label><input type="number" id="seed" min="0" max="999999" value="42"><button id="random-seed" class="icon-button" aria-label="Randomize noise seed">${icon('shuffle')}</button></div></section>
          </div>
        </aside>
      </div>
    </section>
  </main>
  <div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
  <dialog id="batch-dialog" aria-labelledby="batch-dialog-title"><form method="dialog" class="dialog-header"><div><p class="eyebrow">A WHOLE LOT OF PIXELS</p><h2 id="batch-dialog-title">Batch your images.</h2></div><button class="icon-button" aria-label="Close batch">${icon('close')}</button></form><p>Apply the current settings to up to 20 images. Download one ZIP of PNGs. Each image keeps its own dimensions.</p><label class="batch-drop" for="batch-input">${icon('upload')} Choose images<input id="batch-input" type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/gif,image/bmp" multiple></label><ul id="batch-list" class="batch-list"></ul><p id="batch-status" role="status" aria-live="polite">Nothing selected yet.</p><button id="batch-run" class="export-button" disabled>Process & download ZIP ${icon('download')}</button><button id="batch-cancel" class="small-link" hidden>Cancel batch</button></dialog>
  <dialog id="help-dialog" aria-labelledby="help-dialog-title"><form method="dialog" class="dialog-header"><div><p class="eyebrow">THE FIELD GUIDE</p><h2 id="help-dialog-title">Embrace the limitations.</h2></div><button class="icon-button" aria-label="Close guide">${icon('close')}</button></form><div class="guide-grid"><article><span>01</span><h3>Bring an image.</h3><p>Drop a PNG, JPG, WebP, AVIF, BMP, or GIF into the canvas. Paste from your clipboard, or start with our original sample. Animated image imports use their first frame. Open MP4, WebM or MOV to process video; choose Animate image for stills. Use Space to play, scrub the timeline, set trim points, and add adjustment keyframes. Export MP4, WebM, GIF, or a ZIP of PNG frames. Video projects store a poster and timeline; reopen the original video to relink.</p></article><article><span>02</span><h3>Find your texture.</h3><p>Diffusion gives organic grain. Ordered dithering gives a grid. Patterns give lines, dots, and halftones. Pixel scale changes texture size while preserving output dimensions.</p></article><article><span>03</span><h3>Pick your ink.</h3><p>Choose a palette, edit each swatch, or extract colors from your image. Full color mode quantizes RGB channels. CMYK uses source colors for a four-screen ink simulation.</p></article><article><span>04</span><h3>Break it beautifully.</h3><p>Add, toggle, and reorder effects. Save your settings as presets, share a settings link, or save a project with its image. Export raster images or actual SVG paths.</p></article></div><p class="guide-note">Keyboard: O opens media; + / − zoom; . resets zoom; double-click the canvas to fit; Ctrl/⌘ Z undoes; Ctrl/⌘ Shift Z redoes. Preview is reduced to 1100 px. Export opens size and format options; Inspect output pixels renders the selected output at actual pixel size before encoding. Undo covers image, motion, keyframe and output edits. Still image preserves your animation. Opening new media starts a new history. A local draft can be restored after reloading. Images: up to 16 MP, 8192 px per side, 50 MB. SVG: up to 1 MP. Batch: 20 files, 100 MB combined.</p></dialog>
  <dialog id="about-dialog" aria-labelledby="about-dialog-title"><form method="dialog" class="dialog-header"><h2 id="about-dialog-title">Pixels for the people.</h2><button class="icon-button" aria-label="Close about">${icon('close')}</button></form><p>Dither4All is a free, MIT-licensed image editor. Your images are decoded and processed on your device. The app has no image upload endpoint, analytics, cookies, account system, or remote fonts. A recoverable image and editing draft is saved automatically in this browser. Video drafts store a poster and edits; reopen the original video to relink. Presets and favorites also stay on this device. You can discard the draft from the recovery banner.</p><p>The host receives normal web requests to load the app. Settings links contain settings only. Project files contain the image and should be shared intentionally. Clipboard access is requested only when you copy an image.</p><p>Built from documented dithering techniques, with credited libdither algorithm/table adaptations inspired by Ditherista. Custom effects are original implementations, not replicas of proprietary modules. Video and still animation use the same local effects engine. MP4/WebM encoding depends on browser codecs. <a href="./third-party-notices.txt" target="_blank">Media libraries and licenses</a>.</p><a href="https://github.com/Gorskiz/Dither4All" target="_blank" rel="noopener noreferrer">Read the source, report a bug, make it better ↗</a></dialog>
  <input hidden id="image-input" type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/gif,image/bmp,video/mp4,video/webm,video/quicktime,video/x-matroska,.mkv,.mov">
  <input hidden id="project-input" type="file" accept=".d4a,application/json">
  <input hidden id="palette-input" type="file" accept=".json,.txt,.hex,.gpl">
  <input hidden id="preset-input" type="file" accept=".json">
`;

let settings = cloneSettings(defaults),
  source = makeSample(),
  sourceName = 'Orbital study',
  view = 'output';
let previewAbort: AbortController | null = null,
  renderTimer: ReturnType<typeof setTimeout>,
  renderVersion = 0,
  toastTimer: ReturnType<typeof setTimeout>;
interface EditorSnapshot {
  settings: Settings;
  motion: MotionState;
  output: OutputSettings;
}
let history: EditorSnapshot[] = [],
  historyIndex = 0;
let documentReady = false,
  restoringHistory = false;
let recoveryTimer: ReturnType<typeof setTimeout>;
let recoveryRevision = 0,
  savedRevision = 0;
let recoveryQueue: Promise<void> = Promise.resolve();
let pendingDraft: Draft | undefined;
let draftImageSource: HTMLCanvasElement | undefined;
let draftImage: Promise<Blob> | undefined;
let importVersion = 0;
let batchFiles: File[] = [],
  batchCancelled = false,
  batchBusy = false,
  batchAbort: AbortController | null = null;
let exportBusy = false;
let imageExportAbort: AbortController | null = null;
let proofAbort: AbortController | null = null;
let codecRevision = 0;
let codecSignature = '';
let codecProblem = '';
let codecPending = false;
function exportRatio() {
  return $<HTMLSelectElement>('export-size').value === 'custom'
    ? Number($<HTMLInputElement>('export-width').value) / source.width
    : Number($<HTMLSelectElement>('export-size').value);
}
function invalidateProof() {
  proofAbort?.abort();
  proofAbort = null;
  if ($('output-proof')) {
    $('output-proof').hidden = true;
    const canvas = $<HTMLCanvasElement>('proof-canvas');
    canvas.width = 1;
    canvas.height = 1;
  }
  if ($('inspect-output')) $<HTMLButtonElement>('inspect-output').disabled = false;
}
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
function snapshot(): EditorSnapshot {
  return {
    settings: cloneSettings(settings),
    motion: motion.snapshot(),
    output: readOutput(source.width, source.height),
  };
}
function persistHistory() {
  if (!documentReady || restoringHistory) return;
  const next = snapshot();
  if (JSON.stringify(history[historyIndex]) === JSON.stringify(next)) return;
  history = history.slice(0, historyIndex + 1);
  history.push(next);
  if (history.length > 60) history.shift();
  historyIndex = history.length - 1;
  syncHistory();
  scheduleRecovery();
  updateExportNote();
}
function newDocument() {
  history = [snapshot()];
  historyIndex = 0;
  syncHistory();
  scheduleRecovery();
}
function syncHistory() {
  $<HTMLButtonElement>('undo').disabled = historyIndex === 0 || restoringHistory || motion?.busy;
  $<HTMLButtonElement>('redo').disabled =
    historyIndex >= history.length - 1 || restoringHistory || motion?.busy;
}
function scheduleRecovery() {
  if (!documentReady || restoringHistory) return;
  ++recoveryRevision;
  pendingDraft = undefined;
  $('recovery-banner').hidden = true;
  $('draft-status').textContent = 'Saving draft…';
  clearTimeout(recoveryTimer);
  recoveryTimer = setTimeout(saveRecovery, 250);
}
function saveRecovery() {
  clearTimeout(recoveryTimer);
  const revision = recoveryRevision,
    state = snapshot(),
    imageSource = source,
    name = sourceName;
  if (draftImageSource !== imageSource || !draftImage) {
    draftImageSource = imageSource;
    draftImage = new Promise<Blob>((resolve, reject) =>
      imageSource.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Could not save the image.'))),
        'image/png',
      ),
    );
  }
  const image = draftImage;
  recoveryQueue = recoveryQueue
    .catch(() => {})
    .then(async () => {
      try {
        const blob = await image;
        if (revision !== recoveryRevision) return;
        await writeDraft({ version: 1, name, image: blob, ...state, savedAt: Date.now() });
        savedRevision = revision;
        if (revision === recoveryRevision)
          $('draft-status').textContent = 'Draft saved on this device';
      } catch {
        draftImage = undefined;
        if (revision === recoveryRevision)
          $('draft-status').textContent = 'Draft unavailable — save a project';
      }
    });
}
function travelHistory(offset: number) {
  motion.assertIdle();
  if (exportBusy) throw new Error('Finish or cancel the export before undoing.');
  const index = historyIndex + offset;
  if (index < 0 || index >= history.length) return;
  historyIndex = index;
  restoringHistory = true;
  try {
    const state = history[index];
    settings = cloneSettings(state.settings);
    applyOutput(state.output);
    motion.restoreState(state.motion);
    syncControls();
    renderEffects();
    scheduleRender();
  } finally {
    restoringHistory = false;
  }
  syncHistory();
  scheduleRecovery();
}
function change(update: (s: Settings) => void, commit = true) {
  update(settings);
  if (commit) persistHistory();
  else scheduleRecovery();
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
  const search = $<HTMLInputElement>('style-search').value.trim().toLowerCase();
  const select = $<HTMLSelectElement>('algorithm-select');
  for (const option of select.options)
    option.hidden =
      option.value !== settings.algorithm &&
      !!search &&
      !algorithms
        .find((a) => a[0] === option.value)
        ?.join(' ')
        .toLowerCase()
        .includes(search);
  $<HTMLSelectElement>('algorithm-select').value = settings.algorithm;
  $('algorithm-description').textContent = algorithms.find((a) => a[0] === settings.algorithm)![3];
  stylePicker.sync(settings.algorithm, search);
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
    : '<p class="empty-stack hint">No effects. Choose one below to add a layer.</p>';
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
  $('palette-count').textContent = `${settings.palette.length} colors`;
  $('palette-colors').innerHTML = settings.palette
    .map(
      (color, i) =>
        `<div class="color-row"><label class="color-swatch" style="--swatch:${color}" title="${color.toUpperCase()}"><span class="sr-only">Palette color ${i + 1}</span><input type="color" value="${color}" data-color="${i}"></label><span class="sr-only mono">${color.toUpperCase()}</span><button class="icon-button" data-remove-color="${i}" aria-label="Remove palette color ${i + 1}" ${settings.palette.length <= 2 ? 'disabled' : ''}>${icon('close')}</button></div>`,
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
  $<HTMLButtonElement>('add-color').disabled = settings.palette.length >= 256;
}
function syncControls() {
  document.querySelectorAll<HTMLInputElement>('[data-setting]').forEach((el) => {
    const value = settings[el.dataset.setting as keyof Settings] as number;
    el.value = String(value);
    $(`${el.id}-value`).textContent = `${Number(value.toFixed(2))}${el.dataset.suffix || ''}`;
  });
  $<HTMLSelectElement>('working-space').value = settings.workingSpace;
  $<HTMLSelectElement>('color-distance').value = settings.colorDistance;
  $<HTMLSelectElement>('quantizer').value = settings.quantizer;
  $<HTMLSelectElement>('matrix-rotation').value = String(settings.matrixRotation);
  $<HTMLInputElement>('serpentine').checked =
    settings.serpentine || settings.algorithm.endsWith('-serpentine');
  $<HTMLInputElement>('serpentine').disabled = settings.algorithm.endsWith('-serpentine');
  const group = algorithms.find((a) => a[0] === settings.algorithm)![2];
  const limits = methodLimits(settings.algorithm);
  $('dbs-controls').hidden = !settings.algorithm.startsWith('dbs-');
  $('grid-controls').hidden = !settings.algorithm.startsWith('grid-');
  $('method-budget').hidden = !limits;
  $('method-budget').textContent = limits
    ? `Preview ≤ ${limits.previewSide} px. Export ≤ ${limits.pixels.toLocaleString()} working pixels (after Pixel scale). Motion ≤ ${limits.motionPixels.toLocaleString()} working pixels/frame, ${limits.motionFrames} frames${settings.algorithm.startsWith('dbs-') ? ', ≤12 FPS' : ''}. Bounded work and time; export size is never reduced automatically.`
    : '';

  $('serpentine-row').hidden = !['Diffusion', 'Variable diffusion'].includes(group);
  $('matrix-rotation-row').hidden = group !== 'Ordered';
  $('matrix-step-controls').hidden = !settings.algorithm.startsWith('variable-');
  $('history-controls').hidden = !(
    settings.algorithm.startsWith('riemersma') || settings.algorithm.startsWith('curve-')
  );
  $<HTMLInputElement>('invert').checked = settings.invert;
  $<HTMLInputElement>('seed').value = String(settings.seed);
  $<HTMLSelectElement>('color-mode').value = settings.colorMode;
  const cmyk = settings.algorithm === 'cmyk';
  $('cmyk-note').hidden = !cmyk;
  $<HTMLSelectElement>('color-mode').disabled =
    cmyk || group === 'Tiles' || group === 'Optimization' || group === 'Grid';
  $<HTMLSelectElement>('working-space').disabled = cmyk;
  $<HTMLSelectElement>('color-distance').disabled =
    cmyk ||
    settings.colorMode === 'rgb' ||
    group === 'Tiles' ||
    group === 'Optimization' ||
    group === 'Grid' ||
    settings.algorithm === 'auto-threshold';
  $('rgb-controls').hidden = cmyk || settings.colorMode !== 'rgb';
  $('palette-controls').hidden = cmyk || settings.colorMode === 'rgb';
  const pattern = algorithms.find((a) => a[0] === settings.algorithm)?.[2] === 'Pattern';
  $<HTMLInputElement>('patternSize').disabled = !pattern;
  $<HTMLInputElement>('patternSize').hidden = !pattern;
  document.querySelector<HTMLLabelElement>('label[for="patternSize"]')!.hidden = !pattern;
  $<HTMLInputElement>('strength').disabled =
    cmyk ||
    group === 'Tiles' ||
    group === 'Optimization' ||
    group === 'Grid' ||
    settings.algorithm === 'threshold' ||
    settings.algorithm === 'auto-threshold';
  $<HTMLInputElement>('jitter').disabled =
    cmyk || group === 'Tiles' || group === 'Optimization' || group === 'Grid';
  $<HTMLInputElement>('threshold').disabled = cmyk || settings.algorithm === 'auto-threshold';
  for (const id of ['patternSize', 'strength', 'threshold']) {
    document
      .querySelector(`label[for="${id}"]`)
      ?.setAttribute('aria-disabled', String($<HTMLInputElement>(id).disabled));
  }
  const paletteIndex = palettes.findIndex(
    (p) => JSON.stringify(p.colors) === JSON.stringify(settings.palette),
  );
  $<HTMLSelectElement>('palette-select').value = paletteIndex < 0 ? 'custom' : String(paletteIndex);
  if (!document.activeElement?.matches('[data-color]')) renderColors();
  renderAlgorithms();
  const preset = builtinPresets.findIndex(
    (p) =>
      JSON.stringify(validateSettings(p.settings)) === JSON.stringify(validateSettings(settings)),
  );
  $<HTMLSelectElement>('builtin-preset').value = preset < 0 ? 'custom' : String(preset);
  lookPicker.sync(preset);
  document.querySelectorAll<HTMLInputElement>('[data-number-for]').forEach((input) => {
    const slider = $<HTMLInputElement>(input.dataset.numberFor!);
    input.value = slider.value;
    input.disabled = slider.disabled;
    input.closest<HTMLElement>('.slider-label')!.hidden = slider.hidden;
  });
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
async function runWorker(
  pixels: Pixels,
  s: Settings,
  signal?: AbortSignal,
  intent: 'preview' | 'export' = 'export',
): Promise<Pixels> {
  const processor = new FrameProcessor();
  try {
    return await processor.process(pixels, s, intent, signal);
  } finally {
    processor.dispose();
  }
}
function scheduleRender() {
  invalidateProof();
  updateExportNote();
  stylePicker.setSource(source);
  lookPicker.setSource(source);
  if (motion.active) {
    clearTimeout(renderTimer);
    ++renderVersion;
    previewAbort?.abort();
    motion.refresh();
    return;
  }
  clearTimeout(renderTimer);
  const version = ++renderVersion;
  previewAbort?.abort();
  previewAbort = null;
  updateExportNote();
  $('render-status').textContent = 'Developing pixels…';
  $('render-status').classList.add('rendering');
  $('cancel-preview').hidden = !methodLimits(settings.algorithm);
  renderTimer = setTimeout(
    () =>
      safely(async () => {
        const started = performance.now(),
          canvas = sourceAtSize(methodLimits(settings.algorithm)?.previewSide ?? 1100),
          ratio = canvas.width / source.width;
        const previewSettings = cloneSettings(settings);
        // Keep texture frequency close to the full-resolution export at reduced preview size.
        previewSettings.scale = Math.max(1, Math.round(settings.scale * ratio));
        const original = $<HTMLCanvasElement>('original-canvas');
        original.width = canvas.width;
        original.height = canvas.height;
        original.getContext('2d')!.drawImage(canvas, 0, 0);
        previewAbort = new AbortController();
        const result = await runWorker(
          canvasPixels(canvas),
          previewSettings,
          previewAbort.signal,
          'preview',
        ).catch((error) => {
          if (
            version === renderVersion &&
            !(error instanceof DOMException && error.name === 'AbortError')
          ) {
            $('render-status').textContent =
              error instanceof Error
                ? error.message
                : 'Preview failed. Try a smaller image or reset the settings.';
            $('render-status').classList.remove('rendering');
            $('cancel-preview').hidden = true;
          }
          throw error;
        });
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
          `${algorithms.find((a) => a[0] === settings.algorithm)![1]} · ${Math.round(performance.now() - started)} ms${result.notice ? ` · ${result.notice}` : ''}`;
        $('render-status').classList.remove('rendering');
        $('cancel-preview').hidden = true;
        previewAbort = null;
        updateZoom();
      }),
    90,
  );
}
async function loadImage(file: Blob, name: string) {
  motion.assertIdle();
  if (
    file instanceof File &&
    (file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv|m4v)$/i.test(name))
  ) {
    ++importVersion;
    clearTimeout(renderTimer);
    ++renderVersion;
    previewAbort?.abort();
    await motion.open(file);
    newDocument();
    return;
  }
  const version = ++importVersion,
    canvas = await decodeImage(file);
  if (version !== importVersion) return;
  motion.reset();
  source = canvas;
  sourceName = name;
  newDocument();
  scheduleRender();
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
  if (!stage.clientWidth || !stage.clientHeight) return;
  const padding = getComputedStyle(stage);
  const availableW = Math.max(
      1,
      stage.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight) - 4,
    ),
    availableH = Math.max(
      1,
      stage.clientHeight - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom) - 4,
    );
  const frame = $('canvas-frame');
  const preview = $<HTMLCanvasElement>('output-canvas');
  const border = getComputedStyle(frame);
  const borderW = parseFloat(border.borderLeftWidth) + parseFloat(border.borderRightWidth);
  const borderH = parseFloat(border.borderTopWidth) + parseFloat(border.borderBottomWidth);
  const width =
    value === 'fit'
      ? Math.min(availableW, (availableH * source.width) / source.height)
      : (preview.width * Number(value)) / 100 + borderW;
  frame.style.width = `${width}px`;
  frame.style.height =
    value === 'fit' ? '' : `${(preview.height * Number(value)) / 100 + borderH}px`;
}
function updateExportNote() {
  if (!documentReady) return;
  exportPanel.sync(motion.active);
  const format = $<HTMLSelectElement>('format').value;
  $('quality-row').hidden = !['jpg', 'webp'].includes(format);
  $('custom-size').hidden = motion.active || $<HTMLSelectElement>('export-size').value !== 'custom';
  const ratio = exportRatio(),
    w = Math.max(1, Math.round(source.width * ratio)),
    h = Math.max(1, Math.round(source.height * ratio));
  $('export-note').textContent = motion.active
    ? 'Current-frame export uses the motion Longest side setting.'
    : `${w} × ${h} · ${format.startsWith('svg') ? 'actual vector paths' : 'output pixels'}${format === 'jpg' ? ' · white background for transparency' : ''}`;
  let problem = '';
  let signature = '';
  try {
    if (motion.active) {
      const info = motion.exportInfo();
      $('export-summary').textContent =
        `${info.width} × ${info.height} · ${info.duration.toFixed(2)} seconds · ${info.fps} FPS · ${info.frames} frames`;
      if (info.pendingVideo) throw new Error('Open the original video to relink before exporting.');
      if (info.duration > 30 || info.frames > 900)
        throw new Error('Trim to 30 seconds and at most 900 frames.');
      assertMotionBudget(
        info.width,
        info.height,
        { ...settings, scale: info.minimumScale },
        info.frames,
        info.fps,
      );
      if (info.format === 'mp4' || info.format === 'webm') {
        signature = JSON.stringify(info);
        if (signature !== codecSignature) {
          codecSignature = signature;
          codecProblem = '';
          codecPending = true;
          const revision = ++codecRevision;
          $('codec-status').textContent = 'Checking browser video support…';
          void import('mediabunny')
            .then(async (m) => {
              const supported = await m.canEncodeVideo(info.format === 'mp4' ? 'avc' : 'vp8', {
                width: info.width,
                height: info.height,
                frameRate: info.fps,
              });
              const audioProblem = supported ? await motion.audioExportProblem(info.format) : '';
              if (revision !== codecRevision) return;
              codecPending = false;
              codecProblem = supported
                ? audioProblem
                : `${info.format.toUpperCase()} is unavailable here. Choose WebM, GIF or PNG frames.`;
              $('codec-status').textContent =
                codecProblem || 'Video encoder available in this browser.';
              updateExportNote();
            })
            .catch(() => {
              if (revision !== codecRevision) return;
              codecPending = false;
              codecProblem = 'Could not check video support. Try GIF or PNG frames.';
              $('codec-status').textContent = codecProblem;
              updateExportNote();
            });
        }
      }
    } else {
      $('export-summary').textContent =
        `${format.toUpperCase()} · ${w} × ${h}${['jpg', 'webp'].includes(format) ? ` · ${$<HTMLInputElement>('export-quality').value}% quality` : ''}`;
      if (!Number.isFinite(ratio) || ratio <= 0 || w > 8192 || h > 8192 || w * h > 16_000_000)
        throw new Error('Choose dimensions up to 8192 px per side and 16 megapixels.');
      if (format.startsWith('svg') && w * h > 1_000_000)
        throw new Error('Choose a smaller size for SVG (1 megapixel limit).');
      assertProcessingSize(w, h, settings);
    }
  } catch (error) {
    problem = error instanceof Error ? error.message : 'Check output settings.';
  }
  if (!signature) {
    ++codecRevision;
    codecSignature = '';
    codecProblem = '';
    codecPending = false;
    $('codec-status').textContent = '';
  }
  $('export-validation').textContent = problem || codecProblem;
  $<HTMLButtonElement>('download-export').disabled =
    !!problem || !!codecProblem || codecPending || exportBusy || motion.busy;
  if (!exportBusy && !motion.busy)
    $('download-export').textContent = motion.active ? 'Download animation' : 'Download image';
}
async function getExportPixels(signal?: AbortSignal) {
  if (motion.active) return motion.currentFrame(signal);
  const ratio = exportRatio();
  const width = Math.max(1, Math.round(source.width * ratio)),
    height = Math.max(1, Math.round(source.height * ratio));
  if (
    !Number.isFinite(ratio) ||
    ratio <= 0 ||
    width > 8192 ||
    height > 8192 ||
    width * height > 16_000_000
  )
    throw new Error('Choose dimensions up to 8192 px per side and 16 megapixels.');
  assertProcessingSize(
    Math.max(1, Math.round(source.width * ratio)),
    Math.max(1, Math.round(source.height * ratio)),
    settings,
  );
  return runWorker(canvasPixels(sourceAtSize(8192, ratio)), cloneSettings(settings), signal);
}
function exportName(ext: string) {
  return `${sourceName.replace(/\.[^.]+$/, '').replace(/[^a-z0-9-_]/gi, '-') || 'image'}-dither4all.${ext}`;
}
async function exportImage(copy = false, frame = false) {
  if (motion.active && !copy && !frame) return motion.export();
  if (motion.busy) return;
  if (exportBusy) return;
  const format = copy ? 'png' : $<HTMLSelectElement>('format').value;
  const filename = exportName(format.startsWith('svg') ? 'svg' : format);
  const quality = Number($<HTMLInputElement>('export-quality').value) / 100;
  const ratio = exportRatio();
  if (
    !motion.active &&
    format.startsWith('svg') &&
    Math.round(source.width * ratio) * Math.round(source.height * ratio) > 1_000_000
  )
    throw new Error('Choose 50% or 25% output size for SVG (1 megapixel limit).');
  exportBusy = true;
  imageExportAbort = new AbortController();
  $('cancel-image-export').hidden = false;
  $<HTMLButtonElement>('export').disabled = true;
  $<HTMLButtonElement>('copy-image').disabled = true;
  $('download-export').textContent = 'Rendering image…';
  $<HTMLButtonElement>('download-export').disabled = true;
  $('image-export-status').textContent = 'Rendering at the selected output dimensions…';
  try {
    // ClipboardItem accepts a promise, preserving transient user activation on Safari.
    const blobPromise = getExportPixels(imageExportAbort.signal).then((p) =>
      format.startsWith('svg')
        ? new Blob([svgImage(p, format === 'svg-black')], { type: 'image/svg+xml' })
        : rasterBlob(p, format, quality),
    );
    if (copy) {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        await blobPromise;
        throw new Error('Image clipboard is unavailable here. Export a PNG instead.');
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);
      toast('Image copied to your clipboard.');
    } else {
      const blob = await blobPromise;
      imageExportAbort.signal.throwIfAborted();
      download(blob, filename);
      $('image-export-status').textContent =
        `Downloaded ${filename} · ${(blob.size / 1024).toFixed(0)} KB`;
      toast('Your pixels are ready.');
    }
  } catch (error) {
    $('image-export-status').textContent = imageExportAbort?.signal.aborted
      ? 'Export cancelled.'
      : error instanceof Error
        ? error.message
        : 'Export failed.';
    throw error;
  } finally {
    exportBusy = false;
    imageExportAbort = null;
    $('cancel-image-export').hidden = true;
    $<HTMLButtonElement>('export').disabled = false;
    $<HTMLButtonElement>('copy-image').disabled = false;
    $('export').innerHTML =
      `${motion.active ? 'Export animation' : 'Export image'} ${icon('download')}`;
    updateExportNote();
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
function openDialog(id: string) {
  $<HTMLDialogElement>(id).showModal();
}
const motion = new MotionEditor({
  changed: () => {
    persistHistory();
    if (documentReady) updateExportNote();
  },
  previewChanged: invalidateProof,
  settings: () => settings,
  source: () => source,
  setSource: (canvas, name) => {
    source = canvas;
    stylePicker.setSource(source);
    sourceName = name;
    $('image-name').textContent = name;
  },
  renderStill: scheduleRender,
  cancelStill: () => {
    $('cancel-preview').hidden = true;
    clearTimeout(renderTimer);
    ++renderVersion;
    previewAbort?.abort();
    previewAbort = null;
  },
  zoom: updateZoom,
  toast,
  error: fail,
});
bind('export-frame', () => exportImage(false, true));
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
$<HTMLInputElement>('style-search').oninput = () => renderAlgorithms();
for (const [id, key] of [
  ['working-space', 'workingSpace'],
  ['color-distance', 'colorDistance'],
  ['quantizer', 'quantizer'],
] as const) {
  $<HTMLSelectElement>(id).onchange = () =>
    change((s) => {
      (s as unknown as Record<string, unknown>)[key] = $<HTMLSelectElement>(id).value;
    });
}
$<HTMLSelectElement>('matrix-rotation').onchange = () =>
  change((s) => {
    s.matrixRotation = Number($<HTMLSelectElement>('matrix-rotation').value);
  });
$<HTMLInputElement>('serpentine').onchange = () =>
  change((s) => {
    s.serpentine = $<HTMLInputElement>('serpentine').checked;
  });
function selectAlgorithm(id: AlgorithmId) {
  if (id === settings.algorithm) return;
  change((s) => {
    s.algorithm = id;
    if (
      s.algorithm.startsWith('tile-') ||
      s.algorithm.startsWith('dbs-') ||
      s.algorithm.startsWith('grid-') ||
      s.algorithm === 'auto-threshold'
    )
      s.colorMode = 'palette';
  });
}
const workspace = setupWorkspace();
const exportPanel = setupExportPanel();
if (document.body.classList.contains('show-advanced'))
  document
    .querySelectorAll<HTMLDetailsElement>('#output-section details')
    .forEach((el) => (el.open = true));
const lookPicker = new LookPicker(workspace.looks, builtinPresets, applySettings);
const stylePicker = new StylePicker($('style-gallery'), selectAlgorithm);
stylePicker.setSource(source);
$<HTMLSelectElement>('algorithm-select').onchange = () =>
  selectAlgorithm($<HTMLSelectElement>('algorithm-select').value as AlgorithmId);
$<HTMLSelectElement>('builtin-preset').onchange = () => {
  const value = $<HTMLSelectElement>('builtin-preset').value;
  if (value !== 'custom') applySettings(builtinPresets[Number(value)].settings);
};
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
  if (settings.palette.length < 256) change((s) => s.palette.push('#b9ca6b'));
});
let paletteJob = 0;
bind('extract', async () => {
  const button = $<HTMLButtonElement>('extract'),
    snapshot = source,
    job = ++paletteJob;
  button.disabled = true;
  button.textContent = 'Extracting…';
  const pixels = canvasPixels(sourceAtSize(256)).data;
  const worker = new Worker(new URL('./palette-worker.ts', import.meta.url), { type: 'module' });
  try {
    const colors = await new Promise<string[]>((resolve, reject) => {
      worker.onmessage = ({ data }) =>
        data.error ? reject(new Error(data.error)) : resolve(data.colors);
      worker.onerror = () => reject(new Error('Palette extraction failed.'));
      worker.postMessage(
        {
          pixels,
          count: Number($<HTMLSelectElement>('extract-count').value),
          method: settings.quantizer,
        },
        [pixels.buffer],
      );
    });
    if (job === paletteJob && source === snapshot)
      change((s) => {
        s.palette = colors;
        s.colorMode = 'palette';
      });
  } finally {
    worker.terminate();
    button.disabled = false;
    button.textContent = 'Extract from image';
  }
});
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
bind('undo', () => travelHistory(-1));
bind('redo', () => travelHistory(1));
bind('upload', () => $('image-input').click());
$<HTMLInputElement>('image-input').onchange = (e) =>
  safely(async () => {
    const input = e.target as HTMLInputElement,
      file = input.files?.[0];
    if (file) await loadImage(file, file.name);
    input.value = '';
  });
$('canvas-frame').ondblclick = () => {
  $<HTMLSelectElement>('zoom').value = 'fit';
  updateZoom();
};
bind('sample', () => {
  motion.assertIdle();
  motion.reset();
  ++importVersion;
  source = makeSample();
  sourceName = 'Orbital study';
  newDocument();
  scheduleRender();
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
  if (!e.ctrlKey && !e.metaKey && ['+', '=', '-', '.'].includes(e.key)) {
    e.preventDefault();
    const zoom = $<HTMLSelectElement>('zoom');
    const current =
      zoom.value === 'fit'
        ? ($('canvas-frame').clientWidth / source.width) * 100
        : Number(zoom.value);
    const values = e.key === '-' ? [200, 100, 50] : [50, 100, 200];
    const next = values.find((v) => (e.key === '-' ? v < current - 0.01 : v > current + 0.01));
    zoom.value = e.key === '.' ? 'fit' : next === undefined ? zoom.value : String(next);
    updateZoom();
    return;
  }
  if (e.key.toLowerCase() === 'o' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    $('image-input').click();
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    $(e.shiftKey ? 'redo' : 'undo').click();
  }
});
bind('add-effect', () => {
  if (settings.effects.length >= 12) return;
  change((s) =>
    s.effects.push({
      id: crypto.randomUUID(),
      type: $<HTMLSelectElement>('effect-type').value as EffectId,
      amount: 40,
      enabled: true,
    }),
  );
  renderEffects();
});
bind('cancel-image-export', () => {
  imageExportAbort?.abort();
  toast('Export cancelled.');
});
bind('cancel-preview', () => {
  if (motion.active) {
    motion.cancelPreview();
    return;
  }
  clearTimeout(renderTimer);
  ++renderVersion;
  previewAbort?.abort();
  $('render-status').textContent = 'Preview cancelled. Change a setting to render again.';
  $('render-status').classList.remove('rendering');
  $('cancel-preview').hidden = true;
});
bind('export', () => {
  exportPanel.open();
  updateExportNote();
});
bind('download-export', () => exportImage());
bind('copy-image', () => exportImage(true));
const changeOutput = () => {
  invalidateProof();
  persistHistory();
  updateExportNote();
};
$('format').onchange = changeOutput;
$<HTMLInputElement>('motion-audio').onchange = changeOutput;
$('export-quality').onchange = () => {
  const input = $<HTMLInputElement>('export-quality');
  input.value = String(Math.max(1, Math.min(100, Number(input.value) || 94)));
  changeOutput();
};
$('export-size').onchange = () => {
  if ($<HTMLSelectElement>('export-size').value === 'custom') {
    $<HTMLInputElement>('export-width').value = String(source.width);
    $<HTMLInputElement>('export-height').value = String(source.height);
  }
  changeOutput();
};
for (const axis of ['width', 'height'] as const)
  $('export-' + axis).onchange = () => {
    const input = $<HTMLInputElement>('export-' + axis);
    const value = Math.round(Number(input.value));
    if (!Number.isFinite(value) || value < 1 || value > 8192) {
      input.value = String(source[axis]);
    }
    const ratio = Number(input.value) / source[axis];
    if (
      source.width * ratio > 8192 ||
      source.height * ratio > 8192 ||
      Math.round(source.width * ratio) * Math.round(source.height * ratio) > 16_000_000
    ) {
      applyOutput(history[historyIndex].output);
      toast('Choose dimensions up to 8192 px per side and 16 megapixels.', true);
      return;
    }
    const other = axis === 'width' ? 'height' : 'width';
    $<HTMLInputElement>('export-' + other).value = String(
      Math.max(1, Math.round(source[other] * ratio)),
    );
    changeOutput();
  };
bind('close-proof', invalidateProof);
bind('inspect-output', async () => {
  motion.assertIdle();
  invalidateProof();
  const controller = new AbortController();
  proofAbort = controller;
  $('output-proof').hidden = false;
  $('proof-status').textContent = 'Rendering selected output size…';
  $<HTMLButtonElement>('inspect-output').disabled = true;
  try {
    const pixels = await getExportPixels(controller.signal);
    if (proofAbort !== controller || controller.signal.aborted) return;
    const canvas = $<HTMLCanvasElement>('proof-canvas');
    canvas.width = pixels.width;
    canvas.height = pixels.height;
    canvas
      .getContext('2d')!
      .putImageData(
        new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height),
        0,
        0,
      );
    $('proof-status').textContent =
      `${pixels.width} × ${pixels.height} · one output pixel per CSS pixel. Scroll to inspect. Before file encoding.`;
  } catch (error) {
    if (!controller.signal.aborted)
      $('proof-status').textContent = error instanceof Error ? error.message : 'Inspection failed.';
  } finally {
    if (proofAbort === controller) {
      proofAbort = null;
      $<HTMLButtonElement>('inspect-output').disabled = false;
    }
  }
});
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
  $('name-dialog').hidden = false;
  $('preset-name').focus();
});
bind('name-close', () => ($('name-dialog').hidden = true));
$('name-form').onsubmit = (e) => {
  e.preventDefault();
  safely(() => {
    const name = $<HTMLInputElement>('preset-name').value.trim();
    if (!name) throw new Error('Give your preset a name.');
    storePresets([...savedPresets(), { name, settings: cloneSettings(settings) }]);
    $('name-dialog').hidden = true;
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
  const animation = motion.project();
  const outputSettings = readOutput(source.width, source.height);
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
      new Blob(
        [
          JSON.stringify({
            version: 1,
            name,
            settings: recipe,
            output: outputSettings,
            image: reader.result,
            ...(animation ? { motion: animation } : {}),
          }),
        ],
        {
          type: 'application/json',
        },
      ),
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
    motion.assertIdle();
    if (file.size > MAX_FILE_BYTES + 100000) throw new Error('Project files must be under 50 MB.');
    const project = readProject(await file.text()),
      version = ++importVersion;
    const encoded = project.image.split(',')[1],
      bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    const canvas = await decodeImage(
      new Blob([bytes], { type: project.image.slice(5, project.image.indexOf(';')) }),
    );
    if (version !== importVersion) return;
    motion.reset();
    source = canvas;
    sourceName = project.name;
    settings = project.settings;
    applyOutput(project.output);

    syncControls();
    renderAlgorithms();
    renderEffects();
    scheduleRender();
    input.value = '';
    if (project.motion) motion.restore(project.motion);
    else toast('Project opened.');
    newDocument();
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
      assertProcessingSize(canvas.width, canvas.height, recipe);
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
  }
} catch (error) {
  fail(error);
}
history = [snapshot()];
documentReady = true;
document.querySelectorAll<HTMLInputElement>('[data-setting]').forEach((slider) => {
  const label = document.querySelector<HTMLLabelElement>(`label[for="${slider.id}"]`)!;
  const value = document.createElement('input');
  value.type = 'number';
  value.className = 'slider-number';
  value.min = slider.min;
  value.max = slider.max;
  value.step = slider.step;
  value.setAttribute('aria-label', `${slider.getAttribute('aria-label')} value`);
  value.dataset.numberFor = slider.id;
  label.querySelector('output')!.hidden = true;
  const heading = document.createElement('div');
  heading.className = 'slider-label';
  label.classList.remove('slider-label');
  label.before(heading);
  heading.append(label, value);
  label.title = 'Double-click to reset this adjustment';
  value.onchange = () => {
    const n = value.valueAsNumber;
    if (!Number.isFinite(n) || !value.checkValidity()) {
      value.value = slider.value;
      return;
    }
    slider.value = String(n);
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
  };
  label.ondblclick = () => {
    slider.value = String(defaults[slider.dataset.setting as keyof Settings]);
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
  };
});
syncControls();
renderAlgorithms();
renderEffects();
renderSavedPresets();

bind('restore-draft', async () => {
  if (!pendingDraft) return;
  motion.assertIdle();
  const draft = pendingDraft,
    version = ++importVersion;
  const canvas = await decodeImage(draft.image, false);
  if (version !== importVersion || pendingDraft !== draft) return;
  restoringHistory = true;
  try {
    motion.reset();
    source = canvas;
    sourceName = draft.name;
    settings = cloneSettings(draft.settings);
    applyOutput(draft.output);
    motion.restoreState(draft.motion);
    syncControls();
    renderEffects();
    scheduleRender();
  } finally {
    restoringHistory = false;
  }
  newDocument();
  toast(
    draft.motion.project?.video
      ? 'Draft restored. Open the original video to relink.'
      : 'Draft restored.',
  );
});
bind('discard-draft', async () => {
  // Serialize deletion with writes so an earlier save cannot resurrect the draft.
  const revision = ++recoveryRevision;
  clearTimeout(recoveryTimer);
  pendingDraft = undefined;
  $('recovery-banner').hidden = true;
  recoveryQueue = recoveryQueue.catch(() => {}).then(() => deleteDraft());
  await recoveryQueue;
  savedRevision = revision;
  if (revision === recoveryRevision) $('draft-status').textContent = 'Draft discarded';
});
void readDraft()
  .then((draft) => {
    if (!draft || recoveryRevision || location.hash.startsWith('#recipe=')) return;
    pendingDraft = draft;
    $('recovery-message').textContent = `Continue “${draft.name}”? A local draft is available.`;
    $('recovery-banner').hidden = false;
    $('draft-status').textContent = 'Previous draft available';
  })
  .catch(() => {
    if (!recoveryRevision) {
      $('draft-status').textContent = 'Draft unavailable — save a project';
      $('recovery-message').textContent =
        'The previous draft could not be read. You can discard it or open a project backup.';
      $('restore-draft').hidden = true;
      $('recovery-banner').hidden = false;
    }
  });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && recoveryRevision !== savedRevision) saveRecovery();
});
window.addEventListener('beforeunload', (event) => {
  if (recoveryRevision !== savedRevision) {
    event.preventDefault();
    event.returnValue = '';
  }
});

scheduleRender();
