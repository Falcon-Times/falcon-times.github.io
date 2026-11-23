import { useEffect, useMemo, useState } from 'preact/hooks';
import type { GalleryImage } from '@/lib/types';
import { href } from '@/lib/router';
import { Modal } from '@/ui/Modal';
import { Portal } from '@/ui/Portal';
import { Empty, ErrorNote, Loading } from '@/ui/States';
import { listGallery } from './api';
import { useRefs } from './refs';

/** Does this photo match what the person typed? (title, description, caption, credit, tags). */
export const matchesGallery = (g: GalleryImage, q: string) => {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [g.title, g.alt_text, g.caption, g.credit, ...g.tags].some((t) => t.toLowerCase().includes(needle));
};

/** A grid of gallery photos to click. Used by the picker dialog and the gallery page. */
export function GalleryGrid({ images, onOpen, label, personName }: {
  images: GalleryImage[]; onOpen: (g: GalleryImage) => void; label: string; personName: (id: string | null) => string;
}) {
  // (No context here: the picker renders through a portal, outside the app's providers.)
  return (
    <ul class="gallery-grid" aria-label={label}>
      {images.map((g) => (
        <li key={g.id}>
          <button type="button" class="gallery-card" onClick={() => onOpen(g)} aria-label={`${g.title || 'Untitled photo'}${g.credit ? `, photo by ${g.credit}` : ''}`}>
            <span class="gallery-thumb"><img src={g.url} alt={g.alt_text} loading="lazy" decoding="async" /></span>
            <span class="gallery-meta">
              <strong>{g.title || 'Untitled photo'}</strong>
              <span class="small muted">{g.credit || personName(g.uploaded_by)}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Dialog for choosing a photo from the shared gallery. */
export function GalleryPicker({ onPick, onClose }: { onPick: (g: GalleryImage) => void; onClose: () => void }) {
  const { personName } = useRefs();
  const [images, setImages] = useState<GalleryImage[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [q, setQ] = useState('');
  useEffect(() => { listGallery().then(setImages).catch(setError); }, []);
  const shown = useMemo(() => (images ?? []).filter((g) => matchesGallery(g, q)), [images, q]);
  return (
    <Portal>
      <Modal title="Choose a photo from the gallery" onClose={onClose} width={880}>
        <div class="stack" style={{ '--stack': '14px' }}>
          <input class="input" type="search" placeholder="Search by title, description, credit or tag…" value={q}
            onInput={(e) => setQ((e.target as HTMLInputElement).value)} aria-label="Search the gallery" />
          {error ? <ErrorNote error={error} /> : !images ? <Loading label="Loading photos…" /> : shown.length === 0 ? (
            <Empty icon="camera" title={images.length === 0 ? 'The gallery is empty' : 'No photos match'}>
              {images.length === 0
                ? <>Photographers add photos in the <a href={href('/gallery')}>Photo gallery</a>.</>
                : 'Try a different word.'}
            </Empty>
          ) : <GalleryGrid images={shown} onOpen={onPick} label="Gallery photos" personName={personName} />}
        </div>
      </Modal>
    </Portal>
  );
}
