import { algorithms, cloneSettings, defaults, type AlgorithmId } from './engine/catalog';
import { FrameProcessor } from './motion/processor';

/** Compare styles on a tiny copy of the current source, with one bounded worker queue. */
export class StylePicker {
  private processor = new FrameProcessor();
  private visible = new Set<HTMLButtonElement>();
  private observer: IntersectionObserver;
  private running = false;
  private disposed = false;
  private image: ImageData | undefined;
  private source: HTMLCanvasElement | undefined;
  private revision = 0;
  private cards: HTMLButtonElement[];

  constructor(
    private root: HTMLElement,
    onSelect: (id: AlgorithmId) => void,
  ) {
    this.cards = algorithms.map(([id, name, group, description]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'style-card';
      button.dataset.algorithm = id;
      button.title = `${name} · ${group}\n${description}`;
      button.setAttribute('aria-pressed', 'false');
      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 72;
      canvas.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.textContent = name;
      button.append(canvas, label);
      button.onclick = () => onSelect(id);
      root.append(button);
      return button;
    });
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const card = entry.target as HTMLButtonElement;
          if (entry.isIntersecting && !card.hidden) this.visible.add(card);
          else this.visible.delete(card);
        }
        void this.pump();
      },
      { threshold: 0 },
    );
    this.cards.forEach((card) => this.observer.observe(card));
    window.addEventListener('pagehide', (event) => {
      if (!event.persisted) this.dispose();
    });
  }

  setSource(source: HTMLCanvasElement) {
    if (this.disposed || source === this.source) return;
    this.source = source;
    ++this.revision;
    const ratio = Math.min(96 / source.width, 72 / source.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(source.width * ratio));
    canvas.height = Math.max(1, Math.round(source.height * ratio));
    const context = canvas.getContext('2d')!;
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    this.image = context.getImageData(0, 0, canvas.width, canvas.height);
    for (const card of this.cards) {
      delete card.dataset.preview;
      card.querySelector('.style-preview-error')?.remove();
      const preview = card.querySelector('canvas')!;
      preview.width = canvas.width;
      preview.height = canvas.height;
    }
    this.processor.dispose();
    void this.pump();
  }

  sync(selected: AlgorithmId, query: string) {
    let count = 0;
    for (const card of this.cards) {
      const match = card.textContent!.toLowerCase().includes(query);
      card.hidden = !match;
      card.setAttribute('aria-pressed', String(card.dataset.algorithm === selected));
      if (!match) this.visible.delete(card);
      else count++;
    }
    document.getElementById('style-results')!.textContent =
      `${count} ${count === 1 ? 'style' : 'styles'}`;
    document.getElementById('style-empty')!.hidden = count !== 0;
  }

  private async pump() {
    if (this.running || this.disposed || !this.image) return;
    this.running = true;
    try {
      for (;;) {
        const card = [...this.visible].find((item) => !item.hidden && !item.dataset.preview);
        if (!card || this.disposed) break;
        // A single tiny job at a time; expensive searches also get a hard deadline.
        card.dataset.preview = 'pending';
        const revision = this.revision;
        const abort = new AbortController();
        const deadline = setTimeout(() => abort.abort(), 1500);
        try {
          const settings = cloneSettings(defaults);
          settings.algorithm = card.dataset.algorithm as AlgorithmId;
          settings.scale = 1;
          settings.dbsPasses = 1;
          const result = await this.processor.process(
            {
              width: this.image.width,
              height: this.image.height,
              data: new Uint8ClampedArray(this.image.data),
            },
            settings,
            'preview',
            abort.signal,
          );
          if (this.disposed || revision !== this.revision) continue;
          card
            .querySelector('canvas')!
            .getContext('2d')!
            .putImageData(
              new ImageData(new Uint8ClampedArray(result.data), result.width, result.height),
              0,
              0,
            );
          card.dataset.preview = 'ready';
        } catch {
          if (this.disposed || revision !== this.revision) continue;
          // Keep the style usable even when a browser cannot render its preview.
          card.dataset.preview = 'unavailable';
          const fallback = document.createElement('small');
          fallback.className = 'style-preview-error';
          fallback.textContent = 'Preview unavailable';
          card.prepend(fallback);
        } finally {
          clearTimeout(deadline);
        }
      }
    } finally {
      this.running = false;
    }
  }

  dispose() {
    this.disposed = true;
    this.observer.disconnect();
    this.processor.dispose();
    this.visible.clear();
    this.image = undefined;
    this.source = undefined;
  }
}
