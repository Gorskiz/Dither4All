import { disclosure } from './workspace-ui';
const el = (id: string) => document.getElementById(id)!;
export function setupExportPanel() {
  const output = el('export-heading').closest<HTMLElement>('.panel-section')!;
  output.id = 'output-section';
  const image = document.createElement('div');
  image.id = 'image-output-controls';
  const children = Array.from(output.children);
  image.append(...children.slice(1));
  output.append(image);
  el('export-heading').textContent = 'Export';
  const panel = disclosure('Export settings', Array.from(output.children), 'export-panel');
  output.append(panel);
  // Keep the panel near the top of the inspector; Export opens it directly.
  document.getElementById('looks-section')!.after(output);
  const animation = document.createElement('div');
  animation.id = 'animation-output-controls';
  animation.hidden = true;
  const first = el('motion-format').closest('.field-row')!;
  const start = first.previousElementSibling!;
  const nodes: Element[] = [];
  let node: Element | null = start;
  while (node) {
    nodes.push(node);
    node = node.nextElementSibling;
  }
  animation.append(...nodes);
  image.before(animation);
  image.insertAdjacentHTML(
    'beforeend',
    '<div id="custom-size" class="custom-size" hidden><label>Width (px)<input id="export-width" type="number" min="1" max="8192" step="1"></label><label>Height (px)<input id="export-height" type="number" min="1" max="8192" step="1"></label><p class="hint">Aspect ratio stays locked.</p></div><div id="quality-row" class="field-row" hidden><label for="export-quality">Quality</label><input id="export-quality" type="number" min="1" max="100" value="94"><span>%</span></div>',
  );
  (el('export-size') as HTMLSelectElement).add(new Option('Custom dimensions', 'custom'));
  const frame = document.createElement('details');
  frame.id = 'frame-output-options';
  frame.className = 'tool-details';
  frame.hidden = true;
  frame.innerHTML = '<summary>Current frame export</summary>';
  image.before(frame);
  panel.insertAdjacentHTML(
    'beforeend',
    '<p id="export-summary" class="hint"></p><p id="export-validation" class="export-validation" role="status"></p><p id="codec-status" class="hint" role="status"></p><div class="export-panel-actions"><button id="download-export" class="export-button">Download image</button><button id="inspect-output" class="outline-button">Inspect output pixels</button></div><p id="image-export-status" role="status"></p><div id="output-proof" hidden><div class="section-title"><strong>Output pixels · 100%</strong><button id="close-proof">Close inspection</button></div><p id="proof-status" class="hint" role="status"></p><div class="proof-viewport" tabindex="0" role="region" aria-label="Full-resolution output pixels"><canvas id="proof-canvas" aria-label="Processed output at actual pixel size"></canvas></div></div>',
  );
  panel.append(el('cancel-image-export'));
  const open = () => {
    panel.open = true;
    document
      .querySelector('.inspector-body')!
      .scrollTo({ top: output.offsetTop, behavior: 'instant' });
    panel.querySelector('summary')!.focus({ preventScroll: true });
  };
  return {
    open,
    sync(active: boolean) {
      animation.hidden = !active;
      frame.hidden = !active;
      if (active && image.parentElement !== frame) {
        frame.append(image, el('export-frame'), el('copy-image'));
      } else if (!active && image.parentElement !== panel) {
        animation.after(image);
        el('export-heading').parentElement!.append(el('copy-image'));
      }
      el('download-export').textContent = active ? 'Download animation' : 'Download image';
    },
  };
}
