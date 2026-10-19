import { useState } from 'preact/hooks';
import { submitTip } from '@/lib/api';
import { createStore } from '@/lib/store';
import { TIP_CATEGORIES, type TipCategory } from '@/lib/types';
import { Icon } from '@/ui/Icon';
import { Modal } from '@/ui/Modal';
import { useNews } from '../data';

const open = createStore(false);
export const openTipLine = () => open.set(true);

export function TipForm({ onDone }: { onDone?: () => void }) {
  const { sections, site } = useNews();
  const [category, setCategory] = useState<TipCategory>('story');
  const [section, setSection] = useState('');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [trap, setTrap] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  async function onSubmit(e: Event) {
    e.preventDefault();
    setError('');
    if (trap) { setState('sent'); return; } // bots fill the hidden field; pretend it worked
    if (message.trim().length < 10) { setError('Please give us a little more detail (at least 10 characters).'); return; }
    setState('sending');
    try {
      await submitTip({ category, section_id: section || null, message: message.trim(), contact: contact.trim() || null });
      setState('sent');
      setMessage(''); setContact('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setState('idle');
    }
  }

  if (state === 'sent') {
    return (
      <div class="tip-thanks" role="status">
        <Icon name="circle-check" size={40} />
        <h3>Thank you!</h3>
        <p>Your message is with our editors. If you left contact details, we may follow up.</p>
        <button type="button" class="btn" onClick={() => { setState('idle'); onDone?.(); }}>Done</button>
      </div>
    );
  }

  return (
    <form class="stack" style={{ '--stack': '14px' }} onSubmit={onSubmit} noValidate>
      <p class="muted small">{site.settings.hotline.intro}</p>
      <label class="field">
        <span class="label">What is this about?</span>
        <select class="select" value={category} onChange={(e) => setCategory((e.target as HTMLSelectElement).value as TipCategory)}>
          {TIP_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </label>
      <label class="field">
        <span class="label">Which section? <span class="muted">(optional)</span></span>
        <select class="select" value={section} onChange={(e) => setSection((e.target as HTMLSelectElement).value)}>
          <option value="">Not sure / general</option>
          {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label class="field">
        <span class="label">Your message</span>
        <textarea class="textarea" rows={5} required maxLength={4000} value={message}
          placeholder="Who, what, where, when — whatever you know helps."
          onInput={(e) => setMessage((e.target as HTMLTextAreaElement).value)} />
      </label>
      <label class="field">
        <span class="label">Contact <span class="muted">(optional — leave blank to stay anonymous)</span></span>
        <input class="input" type="text" maxLength={200} value={contact} autocomplete="off"
          placeholder="Name or email, only if you want a reply"
          onInput={(e) => setContact((e.target as HTMLInputElement).value)} />
      </label>
      <div class="honeypot" aria-hidden="true">
        <label>Website <input type="text" tabIndex={-1} autocomplete="off" value={trap} onInput={(e) => setTrap((e.target as HTMLInputElement).value)} /></label>
      </div>
      {error && <div class="notice notice-bad" role="alert"><Icon name="warning" />{error}</div>}
      <button class="btn btn-primary btn-block" type="submit" disabled={state === 'sending'}>
        <Icon name={state === 'sending' ? 'loader' : 'send'} class={state === 'sending' ? 'spinner' : ''} size={16} />
        {state === 'sending' ? 'Sending…' : 'Send to the editors'}
      </button>
    </form>
  );
}

export function TipModal() {
  const isOpen = open.use();
  if (!isOpen) return null;
  return (
    <Modal title="Tip &amp; Feedback Line" onClose={() => open.set(false)}>
      <TipForm onDone={() => open.set(false)} />
    </Modal>
  );
}

export function TipCard() {
  return (
    <section class="panel tip-card">
      <div class="row" style={{ '--gap': '12px', 'align-items': 'flex-start' }}>
        <span class="tip-icon"><Icon name="megaphone" size={22} /></span>
        <div>
          <span class="eyebrow">Confidential &amp; moderated</span>
          <h2>Anonymous tip line</h2>
        </div>
      </div>
      <p class="small">
        Have a lead, a correction, a shout-out or a letter to the editor? Send it straight to our student editors — you never have to give your name.
      </p>
      <button class="btn btn-primary btn-block" onClick={openTipLine}><Icon name="send" size={16} /> Send us a tip</button>
    </section>
  );
}
