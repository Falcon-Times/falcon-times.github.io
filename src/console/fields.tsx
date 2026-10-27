import { useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { uploadImage } from '@/lib/images';
import type { Section } from '@/lib/types';
import { Icon } from '@/ui/Icon';
import { toastError } from '@/ui/Toast';
import { useMe } from './auth';

type Change<T> = (v: T) => void;
export const newOption = () => ({ id: `o${crypto.randomUUID().slice(0, 8)}`, label: '' });
const val = (e: Event) => (e.target as HTMLInputElement).value;

export function Field({ label, hint, children, class: cls }: { label: string; hint?: string; children: ComponentChildren; class?: string }) {
  return (
    <label class={`field ${cls ?? ''}`}>
      <span class="label">{label}</span>
      {children}
      {hint && <span class="hint">{hint}</span>}
    </label>
  );
}

export function TextField({ label, value, onChange, hint, required, placeholder, type = 'text', max, class: cls, disabled }: {
  label: string; value: string; onChange: Change<string>; hint?: string; required?: boolean; placeholder?: string;
  type?: string; max?: number; class?: string; disabled?: boolean;
}) {
  return (
    <Field label={label} hint={hint} class={cls}>
      <input class="input" type={type} value={value} required={required} placeholder={placeholder} maxLength={max} disabled={disabled} onInput={(e) => onChange(val(e))} />
    </Field>
  );
}

export function NumberField({ label, value, onChange, hint, class: cls }: { label: string; value: number | null; onChange: Change<number | null>; hint?: string; class?: string }) {
  return (
    <Field label={label} hint={hint} class={cls}>
      <input class="input" type="number" step="any" inputMode="decimal" value={value ?? ''} onInput={(e) => { const v = val(e); onChange(v === '' ? null : Number(v)); }} />
    </Field>
  );
}

export function TextArea({ label, value, onChange, hint, rows = 4, max, required, class: cls }: {
  label: string; value: string; onChange: Change<string>; hint?: string; rows?: number; max?: number; required?: boolean; class?: string;
}) {
  return (
    <Field label={label} hint={hint ?? (max ? `${value.length}/${max}` : undefined)} class={cls}>
      <textarea class="textarea" rows={rows} maxLength={max} required={required} value={value} onInput={(e) => onChange(val(e))} />
    </Field>
  );
}

export function SelectField({ label, value, onChange, options, hint, class: cls, disabled }: {
  label: string; value: string; onChange: Change<string>; options: { value: string; label: string }[]; hint?: string; class?: string; disabled?: boolean;
}) {
  return (
    <Field label={label} hint={hint} class={cls}>
      <select class="select" value={value} disabled={disabled} onChange={(e) => onChange(val(e))}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

export function Checkbox({ label, checked, onChange, hint, disabled }: { label: string; checked: boolean; onChange: Change<boolean>; hint?: string; disabled?: boolean }) {
  return (
    <div>
      <label class="check"><input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} /> {label}</label>
      {hint && <div class="hint small muted" style={{ marginLeft: '26px' }}>{hint}</div>}
    </div>
  );
}

export function TagsField({ label, value, onChange, hint, placeholder, class: cls }: {
  label: string; value: string[]; onChange: Change<string[]>; hint?: string; placeholder?: string; class?: string;
}) {
  const [text, setText] = useState(value.join(', '));
  return (
    <Field label={label} hint={hint ?? 'Separate with commas'} class={cls}>
      <input class="input" value={text} placeholder={placeholder}
        onInput={(e) => { setText(val(e)); onChange(val(e).split(',').map((t) => t.trim()).filter(Boolean)); }} />
    </Field>
  );
}

/** Checkbox group for choosing sections. */
export function SectionPicker({ label, value, onChange, sections, hint, class: cls }: {
  label: string; value: string[]; onChange: Change<string[]>; sections: Section[]; hint?: string; class?: string;
}) {
  return (
    <div class={`field ${cls ?? ''}`}>
      <span class="label">{label}</span>
      <div class="checks">
        {sections.map((s) => (
          <label key={s.id} class="check">
            <input type="checkbox" checked={value.includes(s.id)}
              onChange={(e) => onChange((e.target as HTMLInputElement).checked ? [...value, s.id] : value.filter((v) => v !== s.id))} />
            {s.name}
          </label>
        ))}
      </div>
      {hint && <span class="hint">{hint}</span>}
    </div>
  );
}

/** Upload-or-paste image control; stores a public URL. */
export function ImageField({ label, value, onChange, hint, class: cls }: { label: string; value: string | null; onChange: Change<string | null>; hint?: string; class?: string }) {
  const { userId } = useMe();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function pick(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    setBusy(true);
    try { onChange(await uploadImage(file, userId)); } catch (err) { toastError(err); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  return (
    <div class={`field ${cls ?? ''}`}>
      <span class="label">{label}</span>
      <div class="image-field">
        {value ? <img src={value} alt="" /> : <div class="image-empty"><Icon name="image" size={28} strokeWidth={1.5} /></div>}
        <div class="stack" style={{ '--stack': '6px' }}>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={pick} />
          <button type="button" class="btn btn-sm" disabled={busy} onClick={() => input.current?.click()}>
            <Icon name={busy ? 'loader' : 'upload'} class={busy ? 'spinner' : ''} size={14} /> {busy ? 'Uploading…' : value ? 'Replace' : 'Upload'}
          </button>
          {value && <button type="button" class="btn btn-sm btn-ghost" onClick={() => onChange(null)}><Icon name="x" size={14} /> Remove</button>}
        </div>
      </div>
      {hint && <span class="hint">{hint}</span>}
    </div>
  );
}

/** Editable list of {id,label} options (polls). */
export function OptionsField({ label, value, onChange, hint, class: cls }: {
  label: string; value: { id: string; label: string }[]; onChange: Change<{ id: string; label: string }[]>; hint?: string; class?: string;
}) {
  const set = (i: number, text: string) => {
    const next = value.slice();
    next[i] = { ...next[i], label: text };
    onChange(next);
  };
  return (
    <div class={`field ${cls ?? ''}`}>
      <span class="label">{label}</span>
      <div class="stack" style={{ '--stack': '8px' }}>
        {value.map((o, i) => (
          <div class="row" style={{ '--gap': '6px', 'flex-wrap': 'nowrap' }} key={o.id || i}>
            <input class="input" value={o.label} placeholder={`Option ${i + 1}`} maxLength={120} onInput={(e) => set(i, val(e))} />
            <button type="button" class="btn btn-icon btn-sm btn-ghost" aria-label="Remove option" disabled={value.length <= 2} onClick={() => onChange(value.filter((_, j) => j !== i))}><Icon name="trash" size={14} /></button>
          </div>
        ))}
        {value.length < 8 && <button type="button" class="btn btn-sm" onClick={() => onChange([...value, newOption()])}><Icon name="plus" size={14} /> Add option</button>}
      </div>
      {hint && <span class="hint">{hint}</span>}
    </div>
  );
}
