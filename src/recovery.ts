import { validateOutput, type OutputSettings } from './output-settings';
import { validateSettings, type Settings } from './engine/catalog';
import { validateTimeline } from './motion/model';
import type { MotionState } from './motion/editor';

export interface Draft {
  version: 1;
  name: string;
  image: Blob;
  settings: Settings;
  motion: MotionState;
  output?: OutputSettings;
  savedAt: number;
}
const database = 'dither4all-recovery';
async function connect(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close older Dither4All tabs to enable recovery.'));
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await connect();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction('drafts', mode);
      const request = action(tx.objectStore('drafts'));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error ?? request.error);
      tx.onabort = () => reject(tx.error ?? new Error('Draft storage was interrupted.'));
    });
  } finally {
    db.close();
  }
}
export async function readDraft(): Promise<Draft | undefined> {
  const stored = (await transaction('readonly', (store) => store.get('current'))) as
    (Omit<Draft, 'image'> & { image: Blob | ArrayBuffer }) | undefined;
  if (!stored) return;
  // WebKit may reject Blob-backed URLs in ephemeral stores. Binary PNG bytes are portable.
  const draft: Draft = {
    ...stored,
    image:
      stored.image instanceof ArrayBuffer
        ? new Blob([stored.image], { type: 'image/png' })
        : stored.image,
  };
  if (
    draft.version !== 1 ||
    !(draft.image instanceof Blob) ||
    typeof draft.name !== 'string' ||
    !Number.isFinite(draft.savedAt)
  )
    throw new Error('The saved draft could not be read. Open a project backup instead.');
  draft.settings = validateSettings(draft.settings);
  draft.output = validateOutput(draft.output);
  if (!draft.motion || typeof draft.motion.active !== 'boolean')
    throw new Error('Invalid draft animation.');
  if (draft.motion.project) {
    const p = draft.motion.project;
    p.timeline = validateTimeline(p.timeline, p.duration);
    if (p.video && (typeof p.video.name !== 'string' || !Number.isFinite(p.video.size)))
      throw new Error('Invalid draft video reference.');
  }
  return draft;
}
export async function writeDraft(draft: Draft) {
  const image = await draft.image.arrayBuffer();
  await transaction('readwrite', (store) => store.put({ ...draft, image }, 'current'));
}
export async function deleteDraft() {
  await transaction('readwrite', (store) => store.delete('current'));
}
