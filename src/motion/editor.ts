import { methodLimits } from '../engine/limits';
import { cloneSettings, type Settings } from '../engine/catalog';
import { canvasPixels, download } from '../files';
import { FrameProcessor } from './processor';
import { VideoAsset, drawMotion, exportMotion } from './media';
import {
  animateNoise,
  motionAt,
  sampleTime,
  channels,
  outputDimensions,
  settingsAt,
  timelineDefaults,
  validateTimeline,
  type Channel,
  type Timeline,
} from './model';
import {
  MAX_MOTION_EFFECTS,
  motionEffects,
  newMotionEffect,
  type MotionEffectType,
} from './catalog';
import type { CanvasSink } from 'mediabunny';

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const number = (id: string) => Number(el<HTMLInputElement>(id).value);
const timecode = (n: number) =>
  `${Math.floor(n / 60)
    .toString()
    .padStart(2, '0')}:${(n % 60).toFixed(2).padStart(5, '0')}`;
export interface MotionProject {
  timeline: Timeline;
  duration: number;
  video?: { name: string; size: number; lastModified: number };
}
interface Host {
  settings: () => Settings;
  source: () => HTMLCanvasElement;
  setSource: (canvas: HTMLCanvasElement, name: string) => void;
  renderStill: () => void;
  cancelStill: () => void;
  zoom: () => void;
  toast: (message: string) => void;
  error: (error: unknown) => void;
}
export class MotionEditor {
  private previewStopped = false;
  private previewSignature = '';
  active = false;
  busy = false;
  video: VideoAsset | null = null;
  private t = timelineDefaults();
  private duration = 4;
  private time = 0;
  private playing = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private origin = 0;
  private processor: FrameProcessor | null = null;
  private sink: CanvasSink | null = null;
  private revision = 0;
  private rendering = false;
  private exportAbort: AbortController | null = null;
  private pendingVideo: MotionProject['video'];
  private name = 'animation';
  private openVersion = 0;
  constructor(private host: Host) {
    document.querySelector('.canvas-bottom')!.insertAdjacentHTML(
      'beforebegin',
      `
      <section id="timeline" class="timeline" aria-label="Animation timeline" hidden>
        <div class="transport"><button id="previous-frame" aria-label="Previous frame">⏮</button><button id="motion-play" aria-label="Play animation">▶</button><button id="next-frame" aria-label="Next frame">⏭</button><output id="motion-time">00:00.00 / 00:04.00</output><label class="loop-label"><input id="motion-loop" type="checkbox" checked> Loop</label><button id="motion-close" class="small-link">Still image</button></div>
        <label class="sr-only" for="motion-scrub">Playhead</label><input id="motion-scrub" type="range" min="0" max="4" step="0.001" value="0">
        <div id="timeline-markers" class="timeline-markers" role="group" aria-label="Keyframes"></div>
      </section>`,
    );
    document.querySelector('.inspector-body')!.insertAdjacentHTML(
      'afterbegin',
      `
      <section class="panel-section" id="motion-section" hidden aria-labelledby="motion-heading">
        <div class="section-title"><h2 id="motion-heading">Motion</h2><span class="count" id="motion-kind">ANIMATION</span></div>
        <p id="relink-note" class="hint" hidden>Choose the original video to relink this project.</p>
        <div class="field-row" id="duration-row"><label for="motion-duration">Duration (s)</label><input id="motion-duration" type="number" min="0.1" max="30" step="0.1" value="4"></div>
        <div class="motion-trim"><label>In (s)<input id="motion-in" type="number" min="0" step="0.01" value="0"></label><label>Out (s)<input id="motion-out" type="number" min="0.01" step="0.01" value="4"></label><label>FPS<select id="motion-fps" aria-label="FPS"><option>6</option><option selected>12</option><option>24</option><option>30</option></select></label></div>
        <p class="hint">Export a selection up to 30 seconds. Preview adapts to your device.</p>
        <div class="field-row"><label for="motion-effect">Source motion</label><select id="motion-effect"><option value="none">None · source movement</option><option value="boil">Noise boil</option><option value="pulse">Brightness pulse</option><option value="zoom">Looping zoom</option><option value="pan">Horizontal drift</option></select></div>
        <div class="field-row"><label for="motion-amount">Amount</label><input id="motion-amount" type="range" min="0" max="100" value="35"></div>
        <div class="field-row"><label for="motion-cycles">Cycles</label><input id="motion-cycles" type="number" min="1" max="8" value="1"></div>
        <div class="section-title motion-subheading"><h3>Motion stack</h3><span id="motion-stack-count" class="count">0 / 8</span></div>
        <p class="hint">Applied top to bottom after dithering. Combine up to eight effects.</p>
        <div class="motion-add"><label class="sr-only" for="motion-add-type">New motion effect</label><select id="motion-add-type">${Object.entries(
          motionEffects,
        )
          .map(([type, info]) => `<option value="${type}">${info.name}</option>`)
          .join(
            '',
          )}</select><button id="motion-add" class="outline-button">Add effect</button></div>
        <div id="motion-stack" class="motion-stack" role="group" aria-label="Motion effect stack"></div>
        <p id="motion-stack-status" class="hint" role="status"></p>
        <div class="section-title motion-subheading"><h3>Keyframes</h3><span id="key-count" class="count">0 / 200</span></div>
        <div class="field-row"><label for="key-channel">Property</label><select id="key-channel">${Object.keys(
          channels,
        )
          .map((c) => `<option value="${c}">${c[0].toUpperCase() + c.slice(1)}</option>`)
          .join('')}</select></div>
        <div class="field-row"><label for="key-value">Value</label><input id="key-value" type="number" value="0" min="-100" max="100" step="1"><button id="key-add" class="outline-button">Set key</button></div>
        <div class="field-row"><label for="key-easing">Interpolation</label><select id="key-easing"><option value="smooth">Smooth</option><option value="linear">Linear</option><option value="hold">Hold</option></select></div>
        <div id="key-list" class="key-list"></div><p class="hint">Move the playhead, choose a value, then Set key. Keys override the matching adjustment. Style presets contain image settings; projects also keep the timeline.</p>
        <div class="section-title motion-subheading"><h3>Animation output</h3><button id="export-frame" class="small-link">Export current frame</button></div>
        <div class="field-row"><label for="motion-format">Motion format</label><select id="motion-format"><option value="mp4">MP4 · H.264</option><option value="webm">WebM · VP8</option><option value="gif">Animated GIF</option><option value="frames">PNG frames · ZIP</option></select></div>
        <div class="field-row"><label for="motion-size">Longest side</label><select id="motion-size"><option>128</option><option>256</option><option>480</option><option selected>720</option><option>1280</option></select></div>
        <label class="toggle-row" id="audio-row" hidden><input id="motion-audio" type="checkbox" checked> Include audio in video export</label>
        <p class="hint">MP4/WebM depend on browser codec support. GIF is capped at 640 px. Video and GIF use a black transparency matte. Preview is silent; source audio is preserved on export.</p>
        <progress id="motion-progress" max="1" value="0" hidden aria-label="Animation export progress"></progress><p id="motion-export-status" role="status"></p><button id="motion-cancel" class="outline-button" hidden>Cancel export</button>
      </section>`,
    );
    el('sample').insertAdjacentHTML(
      'afterend',
      '<button id="animate-image" class="small-link">Animate image</button>',
    );
    const bind = (id: string, fn: () => unknown) =>
      (el(id).onclick = () => {
        Promise.resolve().then(fn).catch(host.error);
      });
    bind('animate-image', () => this.animate());
    bind('motion-close', () => {
      this.assertIdle();
      this.reset();
      host.renderStill();
    });
    bind('motion-play', () => (this.playing ? this.pause() : this.play()));
    bind('previous-frame', () => this.seek(this.time - 1 / this.t.fps));
    bind('next-frame', () => this.seek(this.time + 1 / this.t.fps));
    el<HTMLInputElement>('motion-scrub').oninput = () => this.seek(number('motion-scrub'));
    el<HTMLInputElement>('motion-loop').onchange = () => {
      this.t.loop = el<HTMLInputElement>('motion-loop').checked;
    };
    for (const id of [
      'motion-duration',
      'motion-in',
      'motion-out',
      'motion-fps',
      'motion-effect',
      'motion-amount',
      'motion-cycles',
      'key-easing',
    ]) {
      el(id).onchange = () => {
        try {
          this.readControls();
        } catch (e) {
          this.sync();
          host.error(e);
        }
      };
    }
    el('motion-size').onchange = () => this.refresh();
    el('motion-format').onchange = () => this.refresh();
    el('key-channel').onchange = () => this.keyValue();
    bind('key-add', () => {
      const channel = el<HTMLSelectElement>('key-channel').value as Channel,
        value = number('key-value');
      const key = { time: Math.round(this.time * 1000) / 1000, channel, value };
      const next = {
        ...this.t,
        keys: [
          ...this.t.keys.filter(
            (k) => !(k.channel === channel && Math.abs(k.time - key.time) < 0.001),
          ),
          key,
        ],
      };
      this.t = validateTimeline(next, this.duration);
      this.keys();
      this.refresh();
    });
    bind('motion-add', () => {
      this.assertIdle();
      this.pause();
      const type = el<HTMLSelectElement>('motion-add-type').value as MotionEffectType;
      this.t = validateTimeline(
        { ...this.t, effects: [...this.t.effects, newMotionEffect(type)] },
        this.duration,
      );
      this.stack();
      this.refresh();
      el('motion-stack-status').textContent = `${motionEffects[type].name} added.`;
      el('motion-stack').lastElementChild?.querySelector<HTMLInputElement>('input')?.focus();
    });
    bind('motion-cancel', () => this.exportAbort?.abort());
    document.addEventListener('keydown', (e) => {
      if (
        e.code === 'Space' &&
        this.active &&
        !(e.target as HTMLElement).closest('input,select,textarea,button,[contenteditable]') &&
        !document.querySelector('dialog[open]')
      ) {
        e.preventDefault();
        this.playing ? this.pause() : this.play();
      }
    });
    window.addEventListener('pagehide', () => {
      this.exportAbort?.abort();
      this.reset();
    });
  }
  assertIdle() {
    if (this.busy)
      throw new Error('Cancel or finish the animation export before opening another source.');
  }
  reset() {
    this.pause();
    ++this.openVersion;
    this.active = false;
    this.pendingVideo = undefined;
    ++this.revision;
    this.processor?.dispose();
    this.processor = null;
    this.sink = null;
    this.video?.dispose();
    this.video = null;
    this.visible();
  }
  private visible() {
    if (this.active) this.host.cancelStill();
    el('timeline').hidden = !this.active;
    el('motion-section').hidden = !this.active;
    el('animate-image').hidden = this.active;
    el('export').textContent = this.active ? 'Export animation' : 'Export image';
    document.querySelector('.document-kind')!.textContent = this.active
      ? this.video || this.pendingVideo
        ? 'VIDEO'
        : 'ANIMATION'
      : 'IMAGE';
    el('export-size').closest<HTMLElement>('.field-row')!.hidden = this.active;
    if (this.active)
      el('export-note').textContent = 'Current-frame export uses the motion Longest side setting.';
    this.host.zoom();
  }
  animate() {
    this.assertIdle();
    if (this.active) return;
    this.reset();
    this.active = true;
    this.duration = 4;
    this.time = 0;
    this.t = timelineDefaults();
    this.t.effect = 'boil';
    this.name = 'animation';
    this.sync();
    this.visible();
    this.refresh();
  }
  async open(file: File) {
    this.assertIdle();
    const version = ++this.openVersion;
    const candidate = await VideoAsset.open(file);
    if (version !== this.openVersion) {
      candidate.dispose();
      return;
    }
    try {
      const sink = await candidate.sink(720),
        frame = await sink.getCanvas(candidate.first);
      if (!frame) throw new Error('Video has no readable first frame.');
      if (version !== this.openVersion) {
        candidate.dispose();
        return;
      }
      const restore =
        this.pendingVideo &&
        file.name === this.pendingVideo.name &&
        file.size === this.pendingVideo.size;
      if (this.pendingVideo && !restore)
        throw new Error(`Relink the original file: ${this.pendingVideo.name}`);
      this.assertIdle();
      const saved = restore ? structuredClone(this.t) : null;
      this.reset();
      this.video = candidate;
      this.sink = sink;
      this.active = true;
      this.duration = candidate.duration;
      this.t = saved
        ? validateTimeline(saved, this.duration)
        : timelineDefaults(candidate.duration);
      this.time = this.t.start;
      this.name = file.name;
      const poster = drawMotion(
        frame.canvas,
        frame.canvas.width,
        frame.canvas.height,
        timelineDefaults(),
        0,
      );
      this.host.setSource(poster, file.name);
      this.sync();
      this.visible();
      this.refresh();
      this.host.toast(
        `Video opened · ${candidate.duration.toFixed(2)} s. Set trim points and press play.`,
      );
    } catch (e) {
      if (this.video !== candidate) candidate.dispose();
      throw e;
    }
  }
  private sync() {
    const values: Record<string, number | string> = {
      'motion-duration': this.duration,
      'motion-in': this.t.start,
      'motion-out': this.t.end,
      'motion-fps': this.t.fps,
      'motion-effect': this.t.effect,
      'motion-amount': this.t.amount,
      'motion-cycles': this.t.cycles,
      'key-easing': this.t.easing,
    };
    for (const [id, value] of Object.entries(values))
      el<HTMLInputElement>(id).value = String(value);
    el<HTMLInputElement>('motion-loop').checked = this.t.loop;
    el('duration-row').hidden = !!this.video || !!this.pendingVideo;
    el('audio-row').hidden = !this.video?.hasAudio;
    el('relink-note').hidden = !this.pendingVideo;
    el('motion-kind').textContent = this.video
      ? `${this.video.width} × ${this.video.height}`
      : 'ANIMATION';
    this.updateTime();
    this.stack();
    this.keys();
    this.keyValue();
  }
  private stack() {
    const container = el('motion-stack');
    container.replaceChildren();
    el('motion-stack-count').textContent = `${this.t.effects.length} / ${MAX_MOTION_EFFECTS}`;
    el<HTMLButtonElement>('motion-add').disabled = this.t.effects.length >= MAX_MOTION_EFFECTS;
    if (!this.t.effects.length) {
      const empty = document.createElement('p');
      empty.className = 'hint motion-empty';
      empty.textContent = 'Add an effect to bring your pixels to life.';
      container.append(empty);
    }
    this.t.effects.forEach((effect, index) => {
      const name = motionEffects[effect.type].name;
      const card = document.createElement('fieldset');
      card.className = 'motion-effect-card';
      const legend = document.createElement('legend');
      legend.textContent = `${index + 1}. ${name}`;
      card.append(legend);
      const toolbar = document.createElement('div');
      toolbar.className = 'motion-effect-toolbar';
      const toggleLabel = document.createElement('label');
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = effect.enabled;
      toggle.setAttribute('aria-label', `Enable ${name} ${index + 1}`);
      toggleLabel.append(toggle, 'Enabled');
      toggle.onchange = () => {
        if (this.busy) return;
        this.pause();
        effect.enabled = toggle.checked;
        this.refresh();
      };
      toolbar.append(toggleLabel);
      const action = (label: string, text: string, fn: () => void, disabled = false) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = text;
        button.setAttribute('aria-label', `${label} ${name} ${index + 1}`);
        button.disabled = disabled;
        button.onclick = () => {
          if (this.busy) return;
          this.pause();
          fn();
          this.stack();
          this.refresh();
          el('motion-stack-status').textContent = `${name}: ${label.toLowerCase()}.`;
          // Rebuilding a reordered stack must not strand keyboard focus on the document.
          container
            .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
            [Math.min(index, this.t.effects.length - 1)]?.focus();
          if (!this.t.effects.length) el('motion-add').focus();
        };
        toolbar.append(button);
      };
      const move = (offset: number) => {
        const effects = this.t.effects;
        [effects[index], effects[index + offset]] = [effects[index + offset], effects[index]];
      };
      action('Move up', '↑', () => move(-1), index === 0);
      action('Move down', '↓', () => move(1), index === this.t.effects.length - 1);
      action('Remove', '×', () => this.t.effects.splice(index, 1));
      card.append(toolbar);
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = motionEffects[effect.type].hint;
      card.append(hint);
      for (const [property, label, min, max] of [
        ['amount', 'Amount', 0, 100],
        ['cycles', 'Cycles', 1, 8],
        ['phase', 'Phase (°)', 0, 360],
      ] as const) {
        const row = document.createElement('div');
        row.className = 'field-row';
        const caption = document.createElement('label');
        const input = document.createElement('input');
        input.id = `motion-stack-${index}-${property}`;
        caption.htmlFor = input.id;
        caption.textContent = label;
        input.type = 'number';
        input.min = String(min);
        input.max = String(max);
        input.step = '1';
        input.value = String(effect[property]);
        input.setAttribute('aria-label', `${name} ${index + 1} ${label}`);
        input.onchange = () => {
          if (this.busy) return;
          try {
            const next = { ...effect, [property]: input.valueAsNumber };
            validateTimeline(
              { ...this.t, effects: this.t.effects.map((e, i) => (i === index ? next : e)) },
              this.duration,
            );
            this.pause();
            effect[property] = next[property];
            this.refresh();
          } catch (error) {
            input.value = String(effect[property]);
            this.host.error(error);
          }
        };
        row.append(caption, input);
        card.append(row);
      }
      container.append(card);
    });
  }
  private readControls() {
    this.assertIdle();
    this.pause();
    const duration =
      this.video?.duration ?? (this.pendingVideo ? this.duration : number('motion-duration'));
    const next = {
      ...this.t,
      start: number('motion-in'),
      end: number('motion-out'),
      fps: number('motion-fps'),
      effect: el<HTMLSelectElement>('motion-effect').value as Timeline['effect'],
      amount: number('motion-amount'),
      cycles: number('motion-cycles'),
      easing: el<HTMLSelectElement>('key-easing').value as Timeline['easing'],
    };
    if (duration !== this.duration) {
      next.end = duration;
      next.start = 0;
      next.keys = next.keys.filter((k) => k.time <= duration);
    }
    this.t = validateTimeline(next, duration);
    this.duration = duration;
    this.time = Math.max(next.start, Math.min(next.end, this.time));
    this.sync();
    this.refresh();
  }
  private updateTime() {
    const scrub = el<HTMLInputElement>('motion-scrub');
    scrub.min = String(this.t.start);
    scrub.max = String(this.t.end);
    scrub.value = String(this.time);
    el('motion-time').textContent = `${timecode(this.time)} / ${timecode(this.t.end)}`;
    el('motion-play').textContent = this.playing ? 'Ⅱ' : '▶';
    el('motion-play').setAttribute(
      'aria-label',
      this.playing ? 'Pause animation' : 'Play animation',
    );
  }
  private keyValue() {
    const channel = el<HTMLSelectElement>('key-channel').value as Channel,
      input = el<HTMLInputElement>('key-value');
    input.min = String(channels[channel][0]);
    input.max = String(channels[channel][1]);
    input.step = channel === 'gamma' ? '0.05' : '1';
    input.value = String(
      Number(settingsAt(this.host.settings(), this.t, this.time)[channel].toFixed(2)),
    );
  }
  private keys() {
    el('key-count').textContent = `${this.t.keys.length} / 200`;
    el('key-list').replaceChildren();
    el('timeline-markers').replaceChildren();
    this.t.keys.forEach((key, i) => {
      const row = document.createElement('div');
      row.className = 'key-row';
      const seek = document.createElement('button');
      seek.textContent = `${timecode(key.time)} · ${key.channel} ${key.value}`;
      seek.onclick = () => this.seek(key.time);
      const remove = document.createElement('button');
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove ${key.channel} key at ${timecode(key.time)}`);
      remove.onclick = () => {
        if (this.busy) return;
        this.t.keys.splice(i, 1);
        this.keys();
        this.refresh();
      };
      row.append(seek, remove);
      el('key-list').append(row);
      if (key.time >= this.t.start && key.time <= this.t.end) {
        const marker = document.createElement('button');
        marker.className = 'key-marker';
        marker.style.left = `${((key.time - this.t.start) / (this.t.end - this.t.start)) * 100}%`;
        marker.textContent = '◆';
        marker.setAttribute('aria-label', `Seek ${key.channel} key at ${timecode(key.time)}`);
        marker.onclick = () => this.seek(key.time);
        el('timeline-markers').append(marker);
      }
    });
  }
  seek(time: number) {
    if (this.busy) return;
    this.pause();
    this.time = Math.max(this.t.start, Math.min(this.t.end, time));
    this.updateTime();
    this.keyValue();
    this.refresh();
  }
  pause() {
    this.playing = false;
    clearTimeout(this.timer);
    this.updateTime();
  }
  private play() {
    if (this.busy || this.pendingVideo) return;
    if (this.time >= this.t.end - 1 / this.t.fps) this.time = this.t.start;
    this.playing = true;
    this.origin = performance.now() - (this.time - this.t.start) * 1000;
    this.updateTime();
    const tick = () => {
      if (!this.playing) return;
      const elapsed = (performance.now() - this.origin) / 1000,
        duration = this.t.end - this.t.start;
      if (elapsed >= duration && !this.t.loop) {
        this.time = this.t.end;
        this.pause();
        this.refresh();
        return;
      }
      this.time = this.t.start + (elapsed % duration);
      this.updateTime();
      this.refresh();
      this.timer = setTimeout(tick, 1000 / Math.min(12, this.t.fps));
    };
    tick();
  }
  cancelPreview() {
    this.previewStopped = true;
    this.pause();
    ++this.revision;
    this.processor?.dispose();
    this.processor = null;
    el('cancel-preview').hidden = true;
    el('render-status').textContent = 'Preview cancelled. Change a setting to render again.';
  }
  refresh() {
    const signature = JSON.stringify(this.host.settings()) + JSON.stringify(this.t);
    if (this.rendering && signature !== this.previewSignature) {
      this.processor?.dispose();
      this.processor = null;
    }
    this.previewSignature = signature;
    this.previewStopped = false;
    if (!this.active) return;
    ++this.revision;
    if (this.rendering) return;
    void this.render().catch(this.host.error);
  }
  private async render() {
    this.rendering = true;
    let requested = this.revision;
    try {
      while (this.active && !this.previewStopped) {
        const version = this.revision,
          time = sampleTime(this.t, this.time),
          video = this.video;
        requested = version;
        const selectedSide =
          el<HTMLSelectElement>('motion-format').value === 'gif'
            ? Math.min(640, number('motion-size'))
            : number('motion-size');
        const base = this.host.source(),
          dims = outputDimensions(
            video?.width ?? base.width,
            video?.height ?? base.height,
            Math.min(
              methodLimits(this.host.settings().algorithm)?.previewSide ?? 640,
              selectedSide,
            ),
          );
        el('cancel-preview').hidden =
          !methodLimits(this.host.settings().algorithm) &&
          !this.t.effects.some((e) => e.enabled && e.amount > 0);
        const frame = this.sink
          ? await this.sink.getCanvas(video!.first + Math.min(time, video!.duration - 0.00001))
          : null;
        if (version !== this.revision && !this.playing) continue;
        const raw = drawMotion(frame?.canvas ?? base, dims.width, dims.height, this.t, time);
        const s = settingsAt(this.host.settings(), this.t, time);
        // Texture sizes use output-space pixels; preview approximates the selected motion export size.
        const exportDims = outputDimensions(
          video?.width ?? base.width,
          video?.height ?? base.height,
          selectedSide,
        );
        s.scale = Math.max(1, Math.round((s.scale * dims.width) / exportDims.width));
        this.processor ??= new FrameProcessor();
        const result = await this.processor.process(
          animateNoise(canvasPixels(raw), this.t, time, s.seed),
          s,
          'preview',
          undefined,
          motionAt(this.t, time),
        );
        if (version !== this.revision && !this.playing) continue;
        const original = el<HTMLCanvasElement>('original-canvas'),
          out = el<HTMLCanvasElement>('output-canvas');
        original.width = out.width = dims.width;
        original.height = out.height = dims.height;
        original.getContext('2d')!.drawImage(raw, 0, 0);
        out
          .getContext('2d')!
          .putImageData(
            new ImageData(new Uint8ClampedArray(result.data), dims.width, dims.height),
            0,
            0,
          );
        el('canvas-frame').style.aspectRatio = String(dims.width / dims.height);
        el('dimensions').textContent = video
          ? `${video.width} × ${video.height} · ${this.duration.toFixed(2)} s`
          : `${base.width} × ${base.height} · ${this.duration.toFixed(2)} s`;
        el('render-status').textContent = this.pendingVideo
          ? 'Relink the original video to preview or export.'
          : `Motion preview · ${dims.width} × ${dims.height} · ${this.t.fps} fps target${result.notice ? ` · ${result.notice}` : ''}`;
        el('render-status').classList.remove('rendering');
        el('cancel-preview').hidden = true;
        this.host.zoom();
        break;
      }
    } catch (e) {
      if (
        this.active &&
        !this.previewStopped &&
        !(e instanceof DOMException && e.name === 'AbortError')
      ) {
        this.pause();
        this.previewStopped = true;
        requested = this.revision;
        el('cancel-preview').hidden = true;
        el('render-status').textContent = e instanceof Error ? e.message : 'Motion preview failed.';
        throw e;
      }
    } finally {
      this.rendering = false;
      if (this.active && !this.previewStopped && this.revision !== requested) this.refresh();
    }
  }
  project(): MotionProject | undefined {
    return this.active
      ? {
          timeline: structuredClone(this.t),
          duration: this.duration,
          ...(this.video
            ? {
                video: {
                  name: this.video.file.name,
                  size: this.video.file.size,
                  lastModified: this.video.file.lastModified,
                },
              }
            : this.pendingVideo
              ? { video: this.pendingVideo }
              : {}),
        }
      : undefined;
  }
  restore(project: MotionProject) {
    this.reset();
    this.t = validateTimeline(project.timeline, project.duration);
    this.duration = project.duration;
    this.time = this.t.start;
    this.pendingVideo = project.video;
    this.active = true;
    this.sync();
    this.visible();
    this.refresh();
    if (this.pendingVideo)
      this.host.toast(
        `Project opened. Open the original video “${this.pendingVideo.name}” to relink.`,
      );
  }
  async currentFrame(signal?: AbortSignal) {
    this.pause();
    if (this.pendingVideo) throw new Error('Relink the video first.');
    const time = sampleTime(this.t, this.time);
    const base = this.host.source(),
      dims = outputDimensions(
        this.video?.width ?? base.width,
        this.video?.height ?? base.height,
        number('motion-size'),
      );
    const frame = this.sink
      ? await this.sink.getCanvas(
          this.video!.first + Math.min(time, this.video!.duration - 0.00001),
        )
      : null;
    const s = settingsAt(this.host.settings(), this.t, time),
      processor = new FrameProcessor();
    try {
      return await processor.process(
        animateNoise(
          canvasPixels(drawMotion(frame?.canvas ?? base, dims.width, dims.height, this.t, time)),
          this.t,
          time,
          s.seed,
        ),
        s,
        'export',
        signal,
        motionAt(this.t, time),
      );
    } finally {
      processor.dispose();
    }
  }
  async export() {
    if (this.busy) return;
    if (this.pendingVideo) throw new Error('Open the original video to relink before exporting.');
    this.pause();
    this.busy = true;
    this.exportAbort = new AbortController();
    const format = el<HTMLSelectElement>('motion-format').value as
      'mp4' | 'webm' | 'gif' | 'frames';
    const controls = [
      ...document.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>(
        '#motion-section input,#motion-section select,#motion-section button,#timeline button,#timeline input',
      ),
    ];
    controls.forEach((c) => (c.disabled = true));
    el<HTMLButtonElement>('motion-cancel').disabled = false;
    el('motion-cancel').hidden = false;
    el('motion-progress').hidden = false;
    el<HTMLButtonElement>('export').disabled = true;
    const status = el('motion-export-status');
    status.textContent = 'Checking local codecs…';
    try {
      const blob = await exportMotion({
        video: this.video,
        still: this.host.source(),
        timeline: structuredClone(this.t),
        settings: cloneSettings(this.host.settings()),
        format,
        size: number('motion-size'),
        audio: el<HTMLInputElement>('motion-audio').checked,
        signal: this.exportAbort.signal,
        progress: (done, total) => {
          el<HTMLProgressElement>('motion-progress').value = done / total;
          status.textContent = `Rendering ${done} / ${total} frames…`;
        },
      });
      download(
        blob,
        `${this.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9-_]/gi, '-')}-dither4all.${format === 'frames' ? 'zip' : format}`,
      );
      status.textContent = `Export ready · ${(blob.size / 1_000_000).toFixed(1)} MB`;
      this.host.toast('Animation exported. Every frame stayed on your device.');
    } catch (e) {
      if (this.exportAbort.signal.aborted) status.textContent = 'Export cancelled.';
      else {
        status.textContent = 'Export failed.';
        throw e;
      }
    } finally {
      this.busy = false;
      this.exportAbort = null;
      controls.forEach((c) => (c.disabled = false));
      this.stack();
      el('motion-cancel').hidden = true;
      el('motion-progress').hidden = true;
      el<HTMLButtonElement>('export').disabled = false;
    }
  }
}
