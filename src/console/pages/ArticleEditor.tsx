import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { formatDateTime, fromLocalInput, readingMinutes, toLocalInput } from '@/lib/format';
import { uploadImage } from '@/lib/images';
import { renderMarkdown } from '@/lib/markdown';
import { href, navigate } from '@/lib/router';
import { safeStorage } from '@/lib/store';
import type { Article, ArticleComment } from '@/lib/types';
import { Icon } from '@/ui/Icon';
import { ErrorNote, Loading } from '@/ui/States';
import { toast, toastError } from '@/ui/Toast';
import { addComment, deleteArticle, getArticle, listComments, saveArticle, type ArticleInput } from '../api';
import { useMe } from '../auth';
import { Checkbox, ImageField, SelectField, TagsField, TextArea, TextField } from '../fields';
import { useRefs } from '../refs';
import { STATUS_BADGE, STATUS_LABEL } from './Articles';

const drafts = safeStorage('local');
type FormState = ArticleInput & { id: string | null; created_by: string | null };

const blank = (sectionId: string, bylines: string[]): FormState => ({
  id: null, created_by: null, slug: '', title: '', deck: '', body_md: '', section_id: sectionId, subsection: null,
  cover_image_url: null, image_alt: '', image_caption: '', photo_credit: '', byline_ids: bylines, tags: [],
  status: 'draft', featured: false, is_lead: false, published_at: null, update_note: '',
});

const fromArticle = (a: Article): FormState => ({
  id: a.id, created_by: a.created_by, slug: a.slug, title: a.title, deck: a.deck, body_md: a.body_md, section_id: a.section_id,
  subsection: a.subsection, cover_image_url: a.cover_image_url, image_alt: a.image_alt, image_caption: a.image_caption,
  photo_credit: a.photo_credit, byline_ids: a.byline_ids, tags: a.tags, status: a.status, featured: a.featured,
  is_lead: a.is_lead, published_at: a.published_at, update_note: a.update_note,
});

export function ArticleEditor({ id }: { id: string | null }) {
  const me = useMe();
  const { sections, staff } = useRefs();
  const mySections = me.isAdmin ? sections.filter((s) => s.active) : sections.filter((s) => s.active && me.profile.sections.includes(s.id));
  const [form, setForm] = useState<FormState | null>(null);
  const [original, setOriginal] = useState<Article | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [restore, setRestore] = useState<FormState | null>(null);
  const draftKey = `falcon-draft:${id ?? 'new'}`;

  // Load
  useEffect(() => {
    setForm(null); setError(null); setDirty(false);
    const myStaff = me.profile.staff_member_id ? [me.profile.staff_member_id] : [];
    if (!id) {
      setForm(blank(mySections[0]?.id ?? '', myStaff));
      const saved = drafts.get<FormState | null>(draftKey, null);
      if (saved && (saved.title || saved.body_md)) setRestore(saved);
      return;
    }
    getArticle(id).then((a) => {
      if (!a) return setError(new Error('That story doesn’t exist, or you don’t have access to it.'));
      setOriginal(a); setForm(fromArticle(a));
      const saved = drafts.get<FormState | null>(draftKey, null);
      if (saved && JSON.stringify(saved) !== JSON.stringify(fromArticle(a))) setRestore(saved);
    }).catch(setError);
  }, [id]);

  // Local autosave + leave warning
  useEffect(() => {
    if (!form || !dirty) return;
    const t = setTimeout(() => drafts.set(draftKey, form), 700);
    return () => clearTimeout(t);
  }, [form, dirty]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (error) return <div class="stack"><a href={href('/articles')} class="back"><Icon name="arrow-left" size={14} /> All stories</a><ErrorNote error={error} /></div>;
  if (!form) return <Loading label="Opening story…" />;

  const isNew = !form.id;
  const editorial = me.isAdmin || (me.isEditor && me.profile.sections.includes(form.section_id));
  const locked = !isNew && (form.status === 'published' || form.status === 'archived') && !editorial;
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => { setForm((f) => (f ? { ...f, [k]: v } : f)); setDirty(true); };
  const section = sections.find((s) => s.id === form.section_id);
  const sectionOptions = (editorial || isNew ? mySections : sections.filter((s) => s.id === form.section_id)).map((s) => ({ value: s.id, label: s.name }));
  if (!sectionOptions.some((o) => o.value === form.section_id) && form.section_id) {
    const cur = sections.find((s) => s.id === form.section_id);
    if (cur) sectionOptions.unshift({ value: cur.id, label: cur.name });
  }

  async function persist(status: FormState['status'], label: string) {
    if (!form) return;
    if (!form.title.trim()) return toast('Add a headline first.', 'bad');
    if (!form.section_id) return toast('Choose a section. (Ask an admin to assign you one if the list is empty.)', 'bad');
    if (status === 'published') {
      if (!form.body_md.trim()) return toast('A story needs some text before it can be published.', 'bad');
      const changed = original && original.status === 'published' && (original.body_md !== form.body_md || original.title !== form.title);
      if (changed && form.update_note === original!.update_note &&
        !confirm('You changed a published story but didn’t add an update notice, so readers won’t be told it changed. Save anyway?')) return;
    }
    setBusy(true);
    try {
      const payload: ArticleInput = {
        slug: form.slug, title: form.title.trim(), deck: form.deck.trim(), body_md: form.body_md, section_id: form.section_id,
        subsection: form.subsection || null, cover_image_url: form.cover_image_url, image_alt: form.image_alt.trim(),
        image_caption: form.image_caption.trim(), photo_credit: form.photo_credit.trim(), byline_ids: form.byline_ids,
        tags: form.tags, status, featured: form.featured, is_lead: status === 'published' && form.is_lead,
        published_at: status === 'published' ? form.published_at : form.published_at, update_note: form.update_note.trim(),
      };
      const saved = await saveArticle(form.id, payload, me.userId);
      drafts.remove(draftKey);
      setDirty(false); setRestore(null);
      toast(label, 'ok');
      if (isNew) navigate(`/articles/${saved.id}`);
      else { setOriginal(saved); setForm(fromArticle(saved)); }
    } catch (e) { toastError(e); } finally { setBusy(false); }
  }

  async function remove() {
    if (!form?.id || !confirm('Delete this story permanently?')) return;
    try { await deleteArticle(form.id); drafts.remove(draftKey); setDirty(false); toast('Story deleted', 'ok'); navigate('/articles'); } catch (e) { toastError(e); }
  }

  const people = staff.filter((s) => s.active || form.byline_ids.includes(s.id));
  const checklist = [
    { ok: form.title.trim().length > 0, text: 'Headline' },
    { ok: form.deck.trim().length > 0, text: 'Summary line (deck)' },
    { ok: form.body_md.trim().length > 80, text: 'Story text' },
    { ok: form.byline_ids.length > 0, text: 'At least one byline' },
    { ok: Boolean(form.cover_image_url), text: 'Cover photo' },
    { ok: !form.cover_image_url || form.image_alt.trim().length > 0, text: 'Photo description (alt text)' },
    { ok: !form.cover_image_url || form.photo_credit.trim().length > 0, text: 'Photo credit' },
  ];

  return (
    <div class="editor">
      <div class="spread editor-top">
        <div class="row">
          <a href={href('/articles')} class="back"><Icon name="arrow-left" size={14} /> All stories</a>
          <span class={`badge ${STATUS_BADGE[form.status]}`}>{isNew ? 'New' : STATUS_LABEL[form.status]}</span>
          {dirty && <span class="badge badge-warn">Unsaved changes</span>}
        </div>
        <div class="row">
          {!isNew && form.status === 'published' && <a class="btn btn-sm" href={`/#/article/${form.slug}`} target="_blank" rel="noopener"><Icon name="external" size={14} /> View live</a>}
          {!isNew && (me.isAdmin || form.status !== 'published') && <button class="btn btn-sm btn-danger" onClick={remove}><Icon name="trash" size={14} /> Delete</button>}
        </div>
      </div>

      {restore && (
        <div class="notice notice-warn"><Icon name="history" />
          <div class="grow">We found unsaved changes from an earlier session on this device.</div>
          <button class="btn btn-sm" onClick={() => { setForm(restore); setDirty(true); setRestore(null); }}>Restore</button>
          <button class="btn btn-sm btn-ghost" onClick={() => { drafts.remove(draftKey); setRestore(null); }}>Discard</button>
        </div>
      )}
      {locked && <div class="notice notice-warn"><Icon name="lock" />This story has been published, so only your section leader can change it. Ask them to make edits, or leave a note below.</div>}

      <div class="editor-grid">
        <div class="stack" style={{ '--stack': '16px' }}>
          <textarea class="title-input" placeholder="Headline" value={form.title} maxLength={200} disabled={locked} rows={1}
            ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } }}
            onInput={(e) => set('title', (e.target as HTMLTextAreaElement).value.replace(/\n/g, ' '))} aria-label="Headline" />
          <TextArea label="Summary line (deck)" value={form.deck} onChange={(v) => set('deck', v)} rows={2} max={400} hint="One or two sentences that make someone want to read on." />
          <div class="md-box">
            <div class="md-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === 'write'} class={`pill ${tab === 'write' ? 'on' : ''}`} onClick={() => setTab('write')}>Write</button>
              <button type="button" role="tab" aria-selected={tab === 'preview'} class={`pill ${tab === 'preview' ? 'on' : ''}`} onClick={() => setTab('preview')}>Preview</button>
              <span class="grow" />
              <span class="small muted">{form.body_md.trim().split(/\s+/).filter(Boolean).length} words · {readingMinutes(form.body_md)} min read</span>
            </div>
            {tab === 'write'
              ? <MarkdownEditor value={form.body_md} onChange={(v) => set('body_md', v)} disabled={locked} userId={me.userId} />
              : <Preview form={form} />}
          </div>
          {!isNew && form.id && <Feedback articleId={form.id} />}
        </div>

        <aside class="stack editor-side" style={{ '--stack': '14px' }}>
          <section class="side-box stack" style={{ '--stack': '10px' }}>
            <h2 class="side-h">Publish</h2>
            {form.published_at && form.status === 'published' && <p class="small muted">Published {formatDateTime(form.published_at)}</p>}
            {!locked && (
              <div class="stack" style={{ '--stack': '8px' }}>
                {editorial ? (
                  <>
                    <button class="btn btn-gold btn-block" disabled={busy} onClick={() => persist('published', form.status === 'published' ? 'Update published' : 'Story published')}>
                      <Icon name="send" size={15} /> {form.status === 'published' ? 'Save & update live story' : form.published_at && new Date(form.published_at) > new Date() ? 'Schedule' : 'Publish now'}
                    </button>
                    <button class="btn btn-block" disabled={busy} onClick={() => persist(form.status === 'published' || form.status === 'archived' ? 'draft' : form.status, form.status === 'published' ? 'Moved back to draft' : 'Saved')}>
                      <Icon name="save" size={15} /> {form.status === 'published' ? 'Unpublish (to draft)' : form.status === 'archived' ? 'Restore to draft' : 'Save'}
                    </button>
                    {!isNew && form.status !== 'archived' && <button class="btn btn-sm btn-ghost btn-block" disabled={busy} onClick={() => persist('archived', 'Story archived')}>Archive</button>}
                  </>
                ) : (
                  <>
                    <button class="btn btn-block" disabled={busy} onClick={() => persist(form.status === 'submitted' ? 'submitted' : 'draft', 'Saved')}><Icon name="save" size={15} /> Save</button>
                    {form.status !== 'submitted'
                      ? <button class="btn btn-primary btn-block" disabled={busy} onClick={() => persist('submitted', 'Submitted to your section leader')}><Icon name="send" size={15} /> Submit for review</button>
                      : <button class="btn btn-sm btn-ghost btn-block" disabled={busy} onClick={() => persist('draft', 'Moved back to draft')}>Withdraw to draft</button>}
                  </>
                )}
              </div>
            )}
            {editorial && (
              <div class="stack" style={{ '--stack': '10px' }}>
                <TextField label={form.status === 'published' ? 'Publish date & time' : 'Schedule for (optional)'} type="datetime-local"
                  value={toLocalInput(form.published_at)} onChange={(v) => set('published_at', fromLocalInput(v))}
                  hint="Leave blank to publish immediately. A future time schedules the story." />
                {form.status === 'published' && (
                  <TextField label="Update notice" value={form.update_note} max={300} onChange={(v) => set('update_note', v)}
                    placeholder="e.g. Corrected the final score." hint="Shown publicly with an “Updated” time stamp. Clear it to remove the stamp." />
                )}
                <Checkbox label="Pin to trending carousel" checked={form.featured} onChange={(v) => set('featured', v)} />
                <Checkbox label="Make this the lead story" checked={form.is_lead} onChange={(v) => set('is_lead', v)} hint="Replaces the current lead on the front page." />
              </div>
            )}
          </section>

          <section class="side-box stack" style={{ '--stack': '10px' }}>
            <h2 class="side-h">Section</h2>
            <SelectField label="Section" value={form.section_id} options={sectionOptions} onChange={(v) => { set('section_id', v); set('subsection', null); }} disabled={locked} />
            {section && section.subsections.length > 0 && (
              <SelectField label="Sub-section" value={form.subsection ?? ''} onChange={(v) => set('subsection', v || null)}
                options={[{ value: '', label: '— none —' }, ...section.subsections.map((s) => ({ value: s, label: s }))]} />
            )}
            <TagsField label="Tags" value={form.tags} onChange={(v) => set('tags', v)} placeholder="homecoming, fall play" />
          </section>

          <section class="side-box stack" style={{ '--stack': '10px' }}>
            <h2 class="side-h">Bylines</h2>
            <div class="checks column">
              {people.map((p) => (
                <label key={p.id} class="check">
                  <input type="checkbox" checked={form.byline_ids.includes(p.id)}
                    onChange={(e) => set('byline_ids', (e.target as HTMLInputElement).checked ? [...form.byline_ids, p.id] : form.byline_ids.filter((x) => x !== p.id))} />
                  {p.name}
                </label>
              ))}
            </div>
            <p class="small muted">Check everyone who contributed. Missing someone? Ask an admin to add them to the staff list.</p>
          </section>

          <section class="side-box stack" style={{ '--stack': '10px' }}>
            <h2 class="side-h">Cover photo</h2>
            <ImageField label="Photo" value={form.cover_image_url} onChange={(v) => set('cover_image_url', v)} hint="Use original, high-resolution photos (we resize big ones automatically)." />
            <TextField label="Description (alt text)" value={form.image_alt} max={300} onChange={(v) => set('image_alt', v)} hint="Describe the photo for readers who can’t see it." />
            <TextField label="Caption" value={form.image_caption} max={500} onChange={(v) => set('image_caption', v)} />
            <TextField label="Photo credit" value={form.photo_credit} max={200} onChange={(v) => set('photo_credit', v)} placeholder="Photographer’s name" />
          </section>

          <section class="side-box stack" style={{ '--stack': '8px' }}>
            <h2 class="side-h">Checklist</h2>
            <ul class="checklist">{checklist.map((c) => <li key={c.text} class={c.ok ? 'ok' : ''}><Icon name={c.ok ? 'circle-check' : 'clock'} size={15} /> {c.text}</li>)}</ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ markdown
function MarkdownEditor({ value, onChange, disabled, userId }: { value: string; onChange: (v: string) => void; disabled: boolean; userId: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  function edit(fn: (sel: string, before: string, after: string) => { text: string; selStart?: number; selEnd?: number }) {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const out = fn(value.slice(a, b), value.slice(0, a), value.slice(b));
    onChange(out.text);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(out.selStart ?? a, out.selEnd ?? out.selStart ?? b); });
  }
  const wrap = (l: string, r = l, ph = 'text') => () => edit((sel, before, after) => {
    const inner = sel || ph;
    return { text: before + l + inner + r + after, selStart: before.length + l.length, selEnd: before.length + l.length + inner.length };
  });
  const linePrefix = (prefix: string) => () => edit((sel, before, after) => {
    const start = before.lastIndexOf('\n') + 1;
    const head = before.slice(0, start), cur = before.slice(start) + sel;
    const lines = (cur || 'text').split('\n').map((l, i) => (prefix === '1. ' ? `${i + 1}. ` : prefix) + l).join('\n');
    return { text: head + lines + after, selStart: head.length, selEnd: head.length + lines.length };
  });
  const link = () => {
    const url = prompt('Link address (https://…)');
    if (!url) return;
    wrap('[', `](${url})`, 'link text')();
  };
  const video = () => {
    const url = prompt('YouTube link');
    if (!url) return;
    edit((_s, before, after) => ({ text: `${before}${before && !before.endsWith('\n\n') ? '\n\n' : ''}${url.trim()}\n\n${after}` }));
  };
  async function onFile(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const url = await uploadImage(f, userId);
      const alt = prompt('Describe this photo for readers who can’t see it (alt text):', '') ?? '';
      edit((_s, before, after) => ({ text: `${before}${before && !before.endsWith('\n') ? '\n\n' : ''}![${alt}](${url})\n\n${after}` }));
    } catch (err) { toastError(err); } finally { setUploading(false); if (file.current) file.current.value = ''; }
  }
  async function onPaste(e: ClipboardEvent) {
    const img = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
    if (img) { e.preventDefault(); const dt = new DataTransfer(); dt.items.add(img); if (file.current) { file.current.files = dt.files; file.current.dispatchEvent(new Event('change')); } }
  }

  return (
    <div>
      <div class="md-toolbar" role="toolbar" aria-label="Formatting">
        <button type="button" class="btn btn-sm btn-ghost" title="Bold" onClick={wrap('**')} disabled={disabled}><Icon name="bold" size={15} /></button>
        <button type="button" class="btn btn-sm btn-ghost" title="Italic" onClick={wrap('*')} disabled={disabled}><Icon name="italic" size={15} /></button>
        <button type="button" class="btn btn-sm btn-ghost" title="Heading" onClick={linePrefix('## ')} disabled={disabled}><Icon name="heading" size={15} /></button>
        <button type="button" class="btn btn-sm btn-ghost" title="Quote" onClick={linePrefix('> ')} disabled={disabled}><Icon name="quote" size={15} /></button>
        <button type="button" class="btn btn-sm btn-ghost" title="Bulleted list" onClick={linePrefix('- ')} disabled={disabled}><Icon name="list" size={15} /></button>
        <button type="button" class="btn btn-sm btn-ghost" title="Numbered list" onClick={linePrefix('1. ')} disabled={disabled}><Icon name="list-ordered" size={15} /></button>
        <button type="button" class="btn btn-sm btn-ghost" title="Link" onClick={link} disabled={disabled}><Icon name="link" size={15} /></button>
        <button type="button" class="btn btn-sm btn-ghost" title="Insert photo" onClick={() => file.current?.click()} disabled={disabled || uploading}><Icon name={uploading ? 'loader' : 'image-plus'} class={uploading ? 'spinner' : ''} size={15} /></button>
        <button type="button" class="btn btn-sm btn-ghost" title="Embed YouTube video" onClick={video} disabled={disabled}><Icon name="video" size={15} /></button>
        <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={onFile} />
      </div>
      <textarea ref={ref} class="md-input" value={value} disabled={disabled} spellcheck rows={22} onPaste={onPaste}
        placeholder={'Start writing…\n\nTip: use ## for subheadings, **bold**, and paste a YouTube link on its own line to embed a video.'}
        onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)} aria-label="Story text" />
    </div>
  );
}

function Preview({ form }: { form: FormState }) {
  const { staff, sections } = useRefs();
  const html = useMemo(() => renderMarkdown(form.body_md || '*Nothing to preview yet.*'), [form.body_md]);
  const names = form.byline_ids.map((id) => staff.find((s) => s.id === id)?.name).filter(Boolean);
  const cap = [form.image_caption, form.photo_credit && `Photo: ${form.photo_credit}`].filter(Boolean).join(' · ');
  return (
    <div class="preview">
      <p class="tag-line"><span class="muted">{sections.find((s) => s.id === form.section_id)?.name}{form.subsection ? ` · ${form.subsection}` : ''}</span></p>
      <h1 class="preview-title">{form.title || 'Untitled story'}</h1>
      {form.deck && <p class="article-deck">{form.deck}</p>}
      <p class="byline">{names.length ? `By ${names.join(' & ')}` : 'The Falcon Times Staff'}</p>
      {form.cover_image_url && <figure class="article-figure"><img src={form.cover_image_url} alt={form.image_alt} />{cap && <figcaption>{cap}</figcaption>}</figure>}
      <div class="prose" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

function Feedback({ articleId }: { articleId: string }) {
  const me = useMe();
  const { personName } = useRefs();
  const [items, setItems] = useState<ArticleComment[] | null>(null);
  const [text, setText] = useState('');
  const load = () => listComments(articleId).then(setItems).catch(() => setItems([]));
  useEffect(() => { load(); }, [articleId]);
  async function post(e: Event) {
    e.preventDefault();
    if (!text.trim()) return;
    try { await addComment(articleId, me.userId, text.trim()); setText(''); load(); } catch (err) { toastError(err); }
  }
  return (
    <section class="side-box stack" style={{ '--stack': '10px' }}>
      <h2 class="side-h"><Icon name="message" size={15} /> Editor notes <span class="muted small">(private to the newsroom)</span></h2>
      {items === null ? <Loading /> : items.length === 0 ? <p class="small muted">No notes yet. Use this thread to ask questions or give feedback.</p> : (
        <ul class="notes">
          {items.map((c) => (
            <li key={c.id} class={c.author_id === me.userId ? 'mine' : ''}>
              <div class="small"><strong>{personName(c.author_id)}</strong> <span class="muted">· {formatDateTime(c.created_at)}</span></div>
              <p>{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      <form class="row" style={{ '--gap': '8px', 'flex-wrap': 'nowrap' }} onSubmit={post}>
        <input class="input" placeholder="Add a note…" value={text} maxLength={2000} onInput={(e) => setText((e.target as HTMLInputElement).value)} aria-label="Add a note" />
        <button class="btn btn-primary">Post</button>
      </form>
    </section>
  );
}
