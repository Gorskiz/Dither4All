import { cloneSettings, type Settings } from './engine/catalog';
import { FrameProcessor } from './motion/processor';

const byId = (id: string) => document.getElementById(id)!;
export function disclosure(title: string, nodes: Element[], id?: string) {
  const details = document.createElement('details');
  details.className = 'tool-details';
  if (id) details.id = id;
  const summary = document.createElement('summary');
  summary.textContent = title;
  nodes[0].before(details);
  details.append(summary, ...nodes);
  return details;
}
function range(first: Element, last: Element) {
  const nodes: Element[] = [];
  let node: Element | null = first;
  while (node) {
    nodes.push(node);
    if (node === last) break;
    node = node.nextElementSibling;
  }
  return nodes;
}
export function setupWorkspace() {
  const inspector = document.querySelector('.inspector-body')!;
  const fileMenu = document.querySelector<HTMLElement>('.document-actions')!;
  fileMenu.id = 'document-menu';
  const fileButton = document.createElement('button');
  fileButton.type = 'button';
  fileButton.className = 'file-menu-toggle';
  fileButton.textContent = 'File';
  fileButton.setAttribute('aria-controls', 'document-menu');
  fileButton.setAttribute('aria-expanded', 'false');
  fileMenu.before(fileButton);
  const closeMenu = () => {
    fileMenu.classList.remove('menu-open');
    fileButton.setAttribute('aria-expanded', 'false');
  };
  fileButton.onclick = () => {
    const open = fileMenu.classList.toggle('menu-open');
    fileButton.setAttribute('aria-expanded', String(open));
  };
  fileMenu.addEventListener('click', closeMenu);
  document.addEventListener('click', (event) => {
    if (!fileMenu.contains(event.target as Node) && event.target !== fileButton) closeMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && fileMenu.classList.contains('menu-open')) {
      closeMenu();
      fileButton.focus();
    }
  });
  const looks = document.createElement('section');
  looks.className = 'panel-section looks-section';
  looks.id = 'looks-section';
  looks.setAttribute('aria-labelledby', 'looks-heading');
  looks.innerHTML =
    '<div class="section-title"><h2 id="looks-heading">Start with a look</h2><span class="count">5 looks</span></div><p class="hint">Choose a starting point, then make it yours.</p><div id="image-looks" class="image-looks" role="group" aria-label="Image looks"></div>';
  inspector.prepend(looks);
  const nav = document.createElement('nav');
  nav.className = 'section-nav';
  nav.setAttribute('aria-label', 'Editor sections');
  for (const [label, heading] of [
    ['Looks', 'looks-heading'],
    ['Color', 'palette-heading'],
    ['Adjust', 'tone-heading'],
    ['Effects', 'effects-heading'],
    ['Motion', 'motion-heading'],
  ] as const) {
    const button = document.createElement('button');
    button.textContent = label;
    button.onclick = () => {
      if (heading === 'motion-heading' && byId('motion-section').hidden)
        byId('animate-image').click();
      requestAnimationFrame(() => {
        const section = byId(heading).closest<HTMLElement>('.panel-section')!;
        inspector.scrollTo({ top: section.offsetTop, behavior: 'instant' });
        byId(heading).tabIndex = -1;
        byId(heading).focus({ preventScroll: true });
      });
    };
    nav.append(button);
  }
  inspector.before(nav);
  const advancedButton = document.createElement('button');
  advancedButton.id = 'advanced-toggle';
  advancedButton.className = 'advanced-toggle';
  advancedButton.type = 'button';
  nav.after(advancedButton);
  disclosure(
    'Browse all 126 styles',
    range(document.querySelector('.style-search')!, document.querySelector('.style-preview-note')!),
    'style-browser',
  );
  const presetRow = byId('builtin-preset').closest('.field-row')!;
  const presetDetails = disclosure('Choose by name or randomize', [presetRow]);
  looks.append(presetDetails);
  const dither = byId('dither-heading').closest('.panel-section')!;
  dither.insertBefore(byId('style-browser'), dither.lastElementChild!.nextSibling);
  const advancedDither = document.createElement('div');
  advancedDither.className = 'control-section';
  const controls = byId('scale').parentElement!;
  controls.after(advancedDither);
  for (const id of ['threshold', 'jitter'])
    advancedDither.append(document.querySelector(`label[for="${id}"]`)!, byId(id));
  const ditheringDetails = disclosure('Advanced texture controls', [
    advancedDither,
    byId('serpentine-row'),
    byId('matrix-rotation-row'),
    byId('matrix-step-controls'),
    byId('history-controls'),
  ]);
  // The palette is the first color decision. Matching and extraction algorithms are optional.
  const paletteSection = byId('palette-heading').closest('.panel-section')!;
  const colorDetails = disclosure('Color science', [
    byId('working-space').closest('.field-row')!,
    byId('color-distance').closest('.field-row')!,
  ]);
  paletteSection.append(colorDetails);
  const palette = byId('palette-controls');
  const extractDetails = disclosure('Extract or import a palette', [
    byId('quantizer').closest('.field-row')!,
    document.querySelector('.palette-actions')!,
  ]);
  palette.append(extractDetails);
  const motionLooks = document.querySelector('.motion-looks')!;
  byId('motion-preview-source-note').after(motionLooks);
  motionLooks.after(byId('motion-looks-help'));
  disclosure(
    'Advanced animation look controls',
    range(
      byId('motion-preset-phase').previousElementSibling!,
      byId('motion-preset-controls-status'),
    ),
  );
  disclosure(
    'Your animation preset library',
    range(byId('motion-preset-save').parentElement!, byId('motion-preset-status')),
  );
  disclosure(
    'Motion layers and keyframes',
    range(byId('motion-effect').parentElement!, byId('key-list').nextElementSibling!),
    'motion-advanced',
  );
  disclosure('Trim and frame rate', [document.querySelector('.motion-trim')!]);
  const savedSection = byId('presets-heading').closest('.panel-section')!;
  disclosure('Saved image presets and sharing', Array.from(savedSection.children).slice(1));
  const noiseSection = byId('noise-heading').closest('.panel-section')!;
  disclosure('Noise and reproducibility', Array.from(noiseSection.children).slice(1));
  for (const id of ['motion-preset-lock-strength', 'motion-preset-lock-speed'])
    byId(id).classList.add('advanced-only');
  let advanced = false;
  try {
    advanced = localStorage.getItem('dither4all-advanced') === 'true';
  } catch {
    /* Optional preference. */
  }
  const setAdvanced = (value: boolean) => {
    advanced = value;
    document
      .querySelectorAll<HTMLDetailsElement>('.tool-details')
      .forEach((el) => (el.open = value));
    document.body.classList.toggle('show-advanced', value);
    advancedButton.textContent = value ? 'Collapse advanced controls' : 'Show advanced controls';
    advancedButton.setAttribute('aria-expanded', String(value));
  };
  setAdvanced(advanced);
  advancedButton.onclick = () => {
    setAdvanced(!advanced);
    try {
      localStorage.setItem('dither4all-advanced', String(advanced));
    } catch {
      /* Editing still works. */
    }
  };
  return { looks: byId('image-looks'), ditheringDetails };
}

/** Five small previews use the complete look recipe, including its palette and effects. */
export class LookPicker {
  private source?: HTMLCanvasElement;
  private revision = 0;
  private processor = new FrameProcessor();
  private buttons: HTMLButtonElement[];
  constructor(
    root: HTMLElement,
    private presets: { name: string; tag: string; settings: Settings }[],
    apply: (settings: Settings) => void,
  ) {
    this.buttons = presets.map((preset) => {
      const button = document.createElement('button');
      button.className = 'image-look';
      button.type = 'button';
      button.setAttribute('aria-pressed', 'false');
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 96;
      canvas.setAttribute('aria-hidden', 'true');
      const name = document.createElement('strong');
      name.textContent = preset.name;
      const tag = document.createElement('span');
      tag.textContent = preset.tag.toLowerCase();
      button.append(canvas, name, tag);
      button.onclick = () => apply(preset.settings);
      root.append(button);
      return button;
    });
  }
  sync(index: number) {
    this.buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(index === i)));
  }
  setSource(source: HTMLCanvasElement) {
    if (source === this.source) return;
    this.source = source;
    const revision = ++this.revision;
    this.processor.dispose();
    void this.render(source, revision);
  }
  private async render(source: HTMLCanvasElement, revision: number) {
    const canvas = document.createElement('canvas');
    const ratio = Math.min(128 / source.width, 96 / source.height);
    canvas.width = Math.max(1, Math.round(source.width * ratio));
    canvas.height = Math.max(1, Math.round(source.height * ratio));
    const context = canvas.getContext('2d')!;
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (const [index, preset] of this.presets.entries()) {
      if (revision !== this.revision) return;
      try {
        const settings = cloneSettings(preset.settings);
        settings.scale = 1;
        const result = await this.processor.process(
          { width: canvas.width, height: canvas.height, data: pixels.data.slice() },
          settings,
          'preview',
        );
        if (revision !== this.revision) return;
        const target = this.buttons[index].querySelector('canvas')!;
        target.width = result.width;
        target.height = result.height;
        target
          .getContext('2d')!
          .putImageData(
            new ImageData(new Uint8ClampedArray(result.data), result.width, result.height),
            0,
            0,
          );
      } catch {
        /* Looks remain selectable if a thumbnail cannot render. */
      }
    }
  }
}
