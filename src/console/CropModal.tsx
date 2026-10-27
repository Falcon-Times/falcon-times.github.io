import { useEffect, useRef, useState } from 'preact/hooks';
import { initialCrop, MAX_ZOOM, MIN_ZOOM, pan, previewRect, visibleRegion, zoomTo, type CropState, type Photo } from '@/lib/crop';
import { cropToBlob } from '@/lib/images';
import { Icon } from '@/ui/Icon';
import { Modal } from '@/ui/Modal';
import { Portal } from '@/ui/Portal';
import { toastError } from '@/ui/Toast';

const FRAME = 280;          // on-screen size of the square being cropped
const OUTPUT = 800;         // longest edge of the saved portrait (never upscaled)
// The sizes portraits really appear at on the site (CSS px): profile page, staff list, bylines.
const PREVIEWS = [
  { size: 112, label: 'Profile page' },
  { size: 52, label: 'Staff list' },
  { size: 48, label: 'Under a story' },
];
const SHARP_ENOUGH = 224;   // the largest portrait is 112 px, shown on 2x screens

/** Position and zoom a portrait inside a round frame, with previews at the sizes it will be shown. */
export function CropModal({ file, onCancel, onDone }: {
  file: File; onCancel: () => void; onDone: (r: { blob: Blob; ext: string }) => void | Promise<void>;
}) {
  const [url, setUrl] = useState('');
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [crop, setCrop] = useState<CropState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const region = photo && crop ? visibleRegion(photo, FRAME, FRAME, crop) : null;

  function loaded() {
    const el = img.current!;
    const p = { w: el.naturalWidth, h: el.naturalHeight };
    setPhoto(p);
    setCrop(initialCrop(p));
  }
  const move = (dx: number, dy: number) => photo && setCrop((c) => c && pan(photo, FRAME, FRAME, c, dx, dy));

  async function confirm() {
    if (!region) return;
    setBusy(true);
    try { await onDone(await cropToBlob(img.current!, region, OUTPUT)); }
    catch (e) { toastError(e); setBusy(false); }
  }

  const arrows: Record<string, [number, number]> = { ArrowLeft: [12, 0], ArrowRight: [-12, 0], ArrowUp: [0, 12], ArrowDown: [0, -12] };

  return (
    <Portal>
      <Modal title="Position your photo" onClose={onCancel} width={640}
        footer={<><button type="button" class="btn" onClick={onCancel}>Cancel</button>
          <button type="button" class="btn btn-primary" disabled={busy || !region} onClick={confirm}>{busy ? 'Saving…' : 'Use this photo'}</button></>}>
        {failed ? (
          <div class="notice notice-bad"><Icon name="warning" />We couldn’t read that image. Try a JPG or PNG.</div>
        ) : (
          <div class="crop-layout">
            <div class="stack" style={{ '--stack': '10px' }}>
              <div class="crop-frame" tabIndex={0} role="group" aria-label="Photo position. Drag the photo, or use the arrow keys, to choose what shows in the circle."
                style={{ width: `${FRAME}px`, height: `${FRAME}px` }}
                onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY }; }}
                onPointerMove={(e) => { if (!drag.current) return; move(e.clientX - drag.current.x, e.clientY - drag.current.y); drag.current = { x: e.clientX, y: e.clientY }; }}
                onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
                onKeyDown={(e) => { const a = arrows[e.key]; if (a) { e.preventDefault(); move(a[0], a[1]); } }}>
                {url && <img ref={img} src={url} alt="" draggable={false} onLoad={loaded} onError={() => setFailed(true)}
                  style={photo && region ? rectStyle(previewRect(photo, region, FRAME)) : { visibility: 'hidden' }} />}
                <div class="crop-mask" aria-hidden="true" />
              </div>
              <label class="field"><span class="label">Zoom</span>
                <input type="range" min={MIN_ZOOM} max={MAX_ZOOM} step="0.01" value={crop?.zoom ?? 1} disabled={!photo}
                  onInput={(e) => photo && setCrop((c) => c && zoomTo(photo, FRAME, FRAME, c, Number((e.target as HTMLInputElement).value)))} />
                <span class="hint">Drag the photo to move it.</span></label>
            </div>
            <div class="stack" style={{ '--stack': '12px' }}>
              <h3 class="side-h">How it will look</h3>
              <div class="crop-previews">
                {PREVIEWS.map((p) => (
                  <figure key={p.size}>
                    <div class="crop-preview" style={{ width: `${p.size}px`, height: `${p.size}px` }} data-testid={`crop-preview-${p.size}`}>
                      {url && photo && region && <img src={url} alt="" style={rectStyle(previewRect(photo, region, p.size))} />}
                    </div>
                    <figcaption class="small muted">{p.label}</figcaption>
                  </figure>
                ))}
              </div>
              {region && region.w < SHARP_ENOUGH && (
                <div class="notice notice-warn"><Icon name="warning" />This area is small, so it may look soft on sharp screens. Zoom out or choose a larger photo for a crisper result.</div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </Portal>
  );
}

const rectStyle = (r: { width: number; height: number; left: number; top: number }) =>
  ({ width: `${r.width}px`, height: `${r.height}px`, left: `${r.left}px`, top: `${r.top}px` });
