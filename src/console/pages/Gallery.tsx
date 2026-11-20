import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { formatDateTime } from '@/lib/format';
import { uploadImage } from '@/lib/images';
import type { GalleryImage } from '@/lib/types';
import { Icon } from '@/ui/Icon';
import { Modal } from '@/ui/Modal';
import { Empty, ErrorNote, Loading } from '@/ui/States';
import { toast, toastError } from '@/ui/Toast';
import { addGalleryImages, deleteGalleryImage, listGallery, updateGalleryImage } from '../api';
import { useMe, type Me } from '../auth';
import { TagsField, TextArea, TextField } from '../fields';
import { GalleryGrid, matchesGallery } from '../GalleryPicker';
import { useRefs } from '../refs';

/** Photographers, admins and the Photography + Video section leader add and manage photos. */
export const canManageGallery = (me: Me) => me.isPhotographer || me.isAdmin || (me.isEditor && me.profile.sections.includes('photo-video'));
/** …but a photographer only changes their own (the others may change any). */
const canEditPhoto = (me: Me, g: GalleryImage) => canManageGallery(me) && (g.uploaded_by === me.userId || me.isAdmin || !me.isPhotographer);

const fileTitle = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);

export function Gallery() {
  const me = useMe();
  const { personName } = useRefs();
  const [images, setImages] = useState<GalleryImage[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [q, setQ] = useState('');
  const [by, setBy] = useState('');
  const [open, setOpen] = useState<GalleryImage | null>(null);
  const [uploading, setUploading] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => { listGallery().then(setImages).catch(setError); }, [tick]);

  const people = useMemo(() => [...new Set((images ?? []).map((g) => g.uploaded_by).filter(Boolean) as string[])], [images]);
  const shown = useMemo(() => (images ?? []).filter((g) => (!by || g.uploaded_by === by) && matchesGallery(g, q)), [images, q, by]);
  const manage = canManageGallery(me);
  const reload = () => setTick((t) => t + 1);

  return (
    <div class="stack" style={{ '--stack': '18px' }}>
      <div class="spread">
        <div>
          <h1 class="page-title">Photo gallery</h1>
          <p class="muted">Photos from the photography team. Writers can pick any of them for a story’s cover or body.</p>
        </div>
        {manage && <button class="btn btn-primary" onClick={() => setUploading(true)}><Icon name="upload" size={16} /> Upload photos</button>}
      </div>
      <div class="toolbar">
        <input class="input select-sm" type="search" placeholder="Search photos…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} aria-label="Search photos" />
        <select class="select select-sm" value={by} onChange={(e) => setBy((e.target as HTMLSelectElement).value)} aria-label="Filter by photographer">
          <option value="">All photographers</option>
          {people.map((id) => <option key={id} value={id}>{personName(id)}</option>)}
        </select>
      </div>
      {error ? <ErrorNote error={error} /> : !images ? <Loading label="Loading photos…" /> : shown.length === 0 ? (
        <Empty icon="camera" title={images.length === 0 ? 'No photos yet' : 'No photos match'}>
          {images.length === 0 ? (manage ? 'Upload the first ones with “Upload photos”.' : 'The photography team hasn’t added any yet.') : 'Try a different word, or clear the photographer filter.'}
        </Empty>
      ) : <GalleryGrid images={shown} onOpen={setOpen} label="Photos" personName={personName} />}
      {open && <PhotoModal image={open} editable={canEditPhoto(me, open)} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); reload(); }} />}
      {uploading && <UploadModal onClose={() => setUploading(false)} onDone={() => { setUploading(false); reload(); }} />}
    </div>
  );
}

function PhotoModal({ image, editable, onClose, onChanged }: { image: GalleryImage; editable: boolean; onClose: () => void; onChanged: () => void }) {
  const { personName } = useRefs();
  const [title, setTitle] = useState(image.title);
  const [alt, setAlt] = useState(image.alt_text);
  const [caption, setCaption] = useState(image.caption);
  const [credit, setCredit] = useState(image.credit);
  const [tags, setTags] = useState(image.tags);
  const [busy, setBusy] = useState(false);

  async function save(e: Event) {
    e.preventDefault();
    setBusy(true);
    try {
      await updateGalleryImage(image.id, { title: title.trim(), alt_text: alt.trim(), caption: caption.trim(), credit: credit.trim(), tags });
      toast('Photo saved', 'ok'); onChanged();
    } catch (err) { toastError(err); setBusy(false); }
  }
  async function remove() {
    if (!confirm('Remove this photo from the gallery? Its file is deleted too, unless a story still uses it (stories keep their own copy).')) return;
    setBusy(true);
    try {
      const outcome = await deleteGalleryImage(image.id);
      toast(outcome === 'kept-in-use' ? 'Removed from the gallery. A story still uses the file, so it was kept.'
        : outcome === 'kept-other' ? 'Removed from the gallery. The file couldn’t be deleted, so it was kept.' : 'Photo and file removed', 'ok');
      onChanged();
    } catch (err) { toastError(err); setBusy(false); }
  }

  return (
    <Modal title={image.title || 'Photo'} onClose={onClose} width={900}
      footer={editable
        ? <><button class="btn btn-danger" style={{ marginRight: 'auto' }} disabled={busy} onClick={remove}><Icon name="trash" size={15} /> Remove</button>
            <button class="btn" onClick={onClose}>Cancel</button>
            <button form="photo-form" class="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save details'}</button></>
        : <button class="btn" onClick={onClose}>Close</button>}>
      <div class="gallery-detail">
        <img src={image.url} alt={image.alt_text} />
        {editable ? (
          <form id="photo-form" class="stack" style={{ '--stack': '12px' }} onSubmit={save}>
            <TextField label="Title" value={title} onChange={setTitle} max={200} hint="Just for finding it again in the gallery." />
            <TextArea label="Description (alt text)" value={alt} onChange={setAlt} rows={2} max={300} hint="Describe the photo for readers who can’t see it. Stories start with this text." />
            <TextField label="Caption" value={caption} onChange={setCaption} max={500} />
            <TextField label="Photo credit" value={credit} onChange={setCredit} max={200} placeholder="Photographer’s name" />
            <TagsField label="Tags" value={tags} onChange={setTags} placeholder="homecoming, football" hint="Separate with commas. Makes photos easier to find." />
          </form>
        ) : (
          <dl class="stack" style={{ '--stack': '10px' }}>
            {([['Description', image.alt_text], ['Caption', image.caption], ['Credit', image.credit], ['Tags', image.tags.join(', ')]] as const).map(([k, v]) => (
              <div key={k}><dt class="small muted">{k}</dt><dd style={{ margin: 0 }}>{v || '—'}</dd></div>
            ))}
            <p class="small muted">To use it, choose “Choose from gallery” when you add a cover photo to a story.</p>
          </dl>
        )}
      </div>
      <p class="small muted" style={{ marginTop: '12px' }}>Uploaded by {personName(image.uploaded_by)} · {formatDateTime(image.created_at)}</p>
    </Modal>
  );
}

interface Pending { file: File; preview: string; title: string; alt: string }

function UploadModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const me = useMe();
  const { staff } = useRefs();
  const [rows, setRows] = useState<Pending[]>([]);
  const [credit, setCredit] = useState(staff.find((s) => s.id === me.profile.staff_member_id)?.name ?? me.profile.display_name);
  const [tags, setTags] = useState<string[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => rows.forEach((r) => URL.revokeObjectURL(r.preview)), []);

  function choose(e: Event) {
    const files = [...((e.target as HTMLInputElement).files ?? [])].filter((f) => f.type.startsWith('image/'));
    setRows((r) => [...r, ...files.map((file) => ({ file, preview: URL.createObjectURL(file), title: fileTitle(file.name), alt: '' }))]);
    if (input.current) input.current.value = '';
  }
  const edit = (i: number, patch: Partial<Pending>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const drop = (i: number) => setRows((r) => { URL.revokeObjectURL(r[i].preview); return r.filter((_, j) => j !== i); });

  async function submit(e: Event) {
    e.preventDefault();
    if (!rows.length) return;
    const done: { url: string; title: string; alt_text: string; caption: string; credit: string; tags: string[] }[] = [];
    const failed: string[] = [];
    for (const [i, r] of rows.entries()) {
      setProgress(`Uploading ${i + 1} of ${rows.length}…`);
      try { done.push({ url: await uploadImage(r.file, me.userId), title: r.title.trim(), alt_text: r.alt.trim(), caption: '', credit: credit.trim(), tags }); }
      catch (err) { failed.push(`${r.file.name}: ${err instanceof Error ? err.message : 'failed'}`); }
    }
    try {
      if (done.length) await addGalleryImages(done);
    } catch (err) { toastError(err); setProgress(null); return; }
    if (failed.length) toast(`${done.length} added. Couldn’t upload: ${failed.join('; ')}`, 'bad');
    else toast(done.length === 1 ? 'Photo added' : `${done.length} photos added`, 'ok');
    onDone();
  }

  const busy = progress !== null;
  return (
    <Modal title="Upload photos" onClose={busy ? () => undefined : onClose} width={720}
      footer={<><button class="btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button form="upload-form" class="btn btn-primary" disabled={busy || rows.length === 0}>{progress ?? `Upload ${rows.length || ''} photo${rows.length === 1 ? '' : 's'}`}</button></>}>
      <form id="upload-form" class="stack" style={{ '--stack': '14px' }} onSubmit={submit}>
        <div>
          <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={choose} aria-label="Choose photos" />
          <button type="button" class="btn" onClick={() => input.current?.click()} disabled={busy}><Icon name="image-plus" size={16} /> Choose photos</button>
          <span class="small muted" style={{ marginLeft: '10px' }}>JPG, PNG, WebP or GIF. Big photos are resized for the web.</span>
        </div>
        <div class="form-grid">
          <TextField label="Photo credit (all photos)" value={credit} onChange={setCredit} max={200} placeholder="Photographer’s name" />
          <TagsField label="Tags (all photos)" value={tags} onChange={setTags} placeholder="homecoming, football" hint="E.g. the event. Separate with commas." />
        </div>
        {rows.length > 0 && (
          <div class="upload-rows">
            {rows.map((r, i) => (
              <div class="upload-row" key={r.preview}>
                <img src={r.preview} alt="" />
                <div class="stack" style={{ '--stack': '8px' }}>
                  <TextField label="Title" value={r.title} onChange={(v) => edit(i, { title: v })} max={200} />
                  <TextField label="Description (alt text)" value={r.alt} onChange={(v) => edit(i, { alt: v })} max={300} hint="For readers who can’t see the photo. You can add it later." />
                  <div><button type="button" class="btn btn-sm btn-ghost" disabled={busy} onClick={() => drop(i)}><Icon name="x" size={13} /> Remove</button></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </form>
    </Modal>
  );
}
