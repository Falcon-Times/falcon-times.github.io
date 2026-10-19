import { useEffect, useState } from 'preact/hooks';
import { loadSite } from '@/lib/api';
import type { SiteSettings } from '@/lib/types';
import { Loading } from '@/ui/States';
import { toast, toastError } from '@/ui/Toast';
import { saveSetting } from '../api';
import { Checkbox, NumberField, TextArea, TextField } from '../fields';

function Card({ title, intro, onSave, children }: { title: string; intro?: string; onSave: () => Promise<void>; children: preact.ComponentChildren }) {
  const [busy, setBusy] = useState(false);
  return (
    <form class="card-box stack" style={{ '--stack': '14px' }} onSubmit={async (e) => {
      e.preventDefault(); setBusy(true);
      try { await onSave(); toast(`${title} saved`, 'ok'); } catch (err) { toastError(err); } finally { setBusy(false); }
    }}>
      <div><h2 class="h3">{title}</h2>{intro && <p class="muted small">{intro}</p>}</div>
      <div class="form-grid">{children}</div>
      <div><button class="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
    </form>
  );
}

export function Settings() {
  const [s, setS] = useState<SiteSettings | null>(null);
  useEffect(() => { loadSite().then((d) => setS(d.settings)).catch(toastError); }, []);
  if (!s) return <Loading />;
  const patch = <K extends keyof SiteSettings>(k: K, v: Partial<SiteSettings[K]>) => setS({ ...s, [k]: { ...s[k], ...v } });

  return (
    <div class="stack" style={{ '--stack': '20px', maxWidth: '820px' }}>
      <div><h1 class="page-title">Site settings</h1><p class="muted">Changes go live on the public site immediately.</p></div>

      <Card title="Masthead" intro="Name, tagline and school details shown on every page." onSave={() => saveSetting('site', s.site)}>
        <TextField label="Newspaper name" value={s.site.name} onChange={(v) => patch('site', { name: v })} required max={60} />
        <TextField label="Tagline" value={s.site.tagline} onChange={(v) => patch('site', { tagline: v })} max={120} />
        <TextField label="School" value={s.site.school} onChange={(v) => patch('site', { school: v })} max={80} />
        <TextField label="Address" value={s.site.address} onChange={(v) => patch('site', { address: v })} max={160} />
        <TextField label="Weather town" value={s.site.place} onChange={(v) => patch('site', { place: v })} max={60} hint="Label for the live weather in the top bar." />
        <NumberField label="Latitude" value={s.site.latitude} onChange={(v) => patch('site', { latitude: v ?? 0 })} />
        <NumberField label="Longitude" value={s.site.longitude} onChange={(v) => patch('site', { longitude: v ?? 0 })} />
      </Card>

      <Card title="Contact & social" intro="Leave blank to hide. These appear in the footer and About page." onSave={async () => { await saveSetting('contact', s.contact); await saveSetting('social', s.social); }}>
        <TextField class="full" label="Public contact email" type="email" value={s.contact.email} onChange={(v) => patch('contact', { email: v })} hint="Shown publicly — consider a shared club address rather than a personal one." />
        <TextField label="Instagram URL" value={s.social.instagram} onChange={(v) => patch('social', { instagram: v })} placeholder="https://instagram.com/…" />
        <TextField label="TikTok URL" value={s.social.tiktok} onChange={(v) => patch('social', { tiktok: v })} />
        <TextField label="YouTube URL" value={s.social.youtube} onChange={(v) => patch('social', { youtube: v })} />
        <TextField label="X / Twitter URL" value={s.social.x} onChange={(v) => patch('social', { x: v })} />
      </Card>

      <Card title="Tip line" onSave={() => saveSetting('hotline', s.hotline)}>
        <div class="full"><Checkbox label="Accept tips from the public" checked={s.hotline.enabled} onChange={(v) => patch('hotline', { enabled: v })} hint="Turn off to hide every “Submit a tip” button." /></div>
        <TextArea class="full" label="Intro text above the form" value={s.hotline.intro} onChange={(v) => patch('hotline', { intro: v })} max={400} rows={3} />
      </Card>

      <Card title="Editorial standards" intro="One promise per line — shown on the front page and About page." onSave={() => saveSetting('standards', s.standards)}>
        <TextArea class="full" label="Standards" rows={7} value={s.standards.points.join('\n')} onChange={(v) => patch('standards', { points: v.split('\n').map((l) => l.trim()).filter(Boolean) })} />
      </Card>
    </div>
  );
}
