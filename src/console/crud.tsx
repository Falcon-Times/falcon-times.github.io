import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { fromLocalInput, slugify, toLocalInput } from '@/lib/format';
import { Icon } from '@/ui/Icon';
import { Modal } from '@/ui/Modal';
import { Empty, ErrorNote, Loading } from '@/ui/States';
import { toast, toastError } from '@/ui/Toast';
import { deleteRow, listRows, upsertRow } from './api';
import {
  Checkbox, ImageField, NumberField, OptionsField, SectionPicker, SelectField, TagsField, TextArea, TextField,
} from './fields';
import { useRefs } from './refs';

export type FieldType =
  | 'text' | 'textarea' | 'number' | 'bool' | 'select' | 'tags' | 'datetime' | 'url' | 'sections' | 'options' | 'image' | 'slug';

export interface FieldDef<T> {
  key: keyof T & string;
  label: string;
  type: FieldType;
  required?: boolean;
  hint?: string;
  full?: boolean;
  max?: number;
  placeholder?: string;
  options?: { value: string; label: string }[];
  showIf?: (row: Record<string, unknown>) => boolean;
  /** Only editable while creating (e.g. a URL slug). */
  createOnly?: boolean;
  /** Which sections to offer (defaults to the public ones). */
  includeHidden?: boolean;
}

export interface Column<T> { label: string; render: (row: T) => ComponentChildren; class?: string }

export interface CrudConfig<T extends { id?: string }> {
  title: string;
  intro?: ComponentChildren;
  singular: string;
  table: string;
  key?: string;                       // primary key column, default "id"
  orderBy: string;
  ascending?: boolean;
  columns: (ctx: { rows: T[] }) => Column<T>[];
  fields: FieldDef<T>[];
  defaults: () => Partial<T>;
  canEdit: boolean;
  canDelete?: boolean;
  /** Last-chance transform/validation before saving. Throw to abort. */
  prepare?: (values: Record<string, unknown>, isNew: boolean) => Record<string, unknown>;
  empty?: string;
  extraActions?: (row: T, reload: () => void) => ComponentChildren;
  filter?: (row: T) => boolean;
}

export function CrudPage<T extends { id?: string }>({ config }: { config: CrudConfig<T> }) {
  const key = config.key ?? 'id';
  const [rows, setRows] = useState<T[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState<{ values: Record<string, unknown>; isNew: boolean } | null>(null);
  const [tick, setTick] = useState(0);
  const reload = () => setTick((t) => t + 1);

  useEffect(() => {
    listRows<T>(config.table, config.orderBy, config.ascending ?? true).then(setRows).catch(setError);
  }, [tick, config.table]);

  const visible = useMemo(() => (rows ?? []).filter(config.filter ?? (() => true)), [rows, config.filter]);
  const columns = config.columns({ rows: rows ?? [] });

  async function remove(row: T) {
    if (!confirm(`Delete this ${config.singular}? This can’t be undone.`)) return;
    try { await deleteRow(config.table, key, (row as Record<string, unknown>)[key] as string); toast(`${config.singular} deleted`, 'ok'); reload(); }
    catch (e) { toastError(e); }
  }

  return (
    <div class="stack" style={{ '--stack': '18px' }}>
      <div class="spread">
        <div><h1 class="page-title">{config.title}</h1>{config.intro && <p class="muted">{config.intro}</p>}</div>
        {config.canEdit && (
          <button class="btn btn-primary" onClick={() => setEditing({ values: { ...config.defaults() } as Record<string, unknown>, isNew: true })}>
            <Icon name="plus" size={16} /> New {config.singular}
          </button>
        )}
      </div>
      {error ? <ErrorNote error={error} /> : !rows ? <Loading /> : visible.length === 0 ? (
        <Empty title={config.empty ?? `No ${config.singular}s yet`} />
      ) : (
        <div class="table-wrap">
          <table class="table">
            <thead><tr>{columns.map((c) => <th key={c.label}>{c.label}</th>)}<th class="col-actions"><span class="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {visible.map((row) => (
                <tr key={(row as Record<string, unknown>)[key] as string}>
                  {columns.map((c) => <td key={c.label} class={c.class}>{c.render(row)}</td>)}
                  <td class="col-actions">
                    <div class="row" style={{ '--gap': '4px', 'justify-content': 'flex-end', 'flex-wrap': 'nowrap' }}>
                      {config.extraActions?.(row, reload)}
                      {config.canEdit && <button class="btn btn-sm" onClick={() => setEditing({ values: { ...(row as object) } as Record<string, unknown>, isNew: false })}><Icon name="pencil" size={13} /> Edit</button>}
                      {config.canEdit && config.canDelete !== false && <button class="btn btn-sm btn-ghost" aria-label={`Delete ${config.singular}`} onClick={() => remove(row)}><Icon name="trash" size={14} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <RecordModal config={config} state={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      )}
    </div>
  );
}

function RecordModal<T extends { id?: string }>({ config, state, onClose, onSaved }: {
  config: CrudConfig<T>; state: { values: Record<string, unknown>; isNew: boolean }; onClose: () => void; onSaved: () => void;
}) {
  const { sections } = useRefs();
  const [values, setValues] = useState(state.values);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: unknown) => setValues((cur) => ({ ...cur, [k]: v }));
  const key = config.key ?? 'id';

  async function save(e: Event) {
    e.preventDefault();
    setBusy(true);
    try {
      let out = { ...values };
      // Remove server-managed/unknown columns we don't edit.
      for (const f of config.fields) {
        if (f.type === 'datetime') out[f.key] = typeof out[f.key] === 'string' && (out[f.key] as string).length === 16 ? fromLocalInput(out[f.key] as string) : out[f.key] || null;
        if (f.type === 'number') out[f.key] = out[f.key] === '' ? null : out[f.key];
        if ((f.type === 'text' || f.type === 'url') && !f.required && out[f.key] === '') out[f.key] = f.type === 'url' ? null : out[f.key];
      }
      if (config.prepare) out = config.prepare(out, state.isNew);
      await upsertRow(config.table, key, out, state.isNew);
      toast(`${config.singular} saved`, 'ok');
      onSaved();
    } catch (err) { toastError(err); setBusy(false); }
  }

  const dt = (k: string) => (typeof values[k] === 'string' && (values[k] as string).length === 16 ? (values[k] as string) : toLocalInput(values[k] as string | null));
  const pubSections = sections.filter((s) => s.active);

  return (
    <Modal title={`${state.isNew ? 'New' : 'Edit'} ${config.singular}`} onClose={onClose} width={680}
      footer={<><button type="button" class="btn" onClick={onClose}>Cancel</button><button form="crud-form" class="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <form id="crud-form" class="form-grid" onSubmit={save}>
        {config.fields.filter((f) => !f.showIf || f.showIf(values)).map((f) => {
          const cls = f.full || f.type === 'textarea' || f.type === 'sections' || f.type === 'options' || f.type === 'image' ? 'full' : undefined;
          const v = values[f.key];
          switch (f.type) {
            case 'text': case 'url':
              return <TextField key={f.key} class={cls} label={f.label} value={(v as string) ?? ''} required={f.required} hint={f.hint} max={f.max} placeholder={f.placeholder} type={f.type === 'url' ? 'text' : 'text'} onChange={(x) => set(f.key, x)} />;
            case 'slug':
              return <TextField key={f.key} label={f.label} value={(v as string) ?? ''} required={f.required} hint={f.hint ?? 'Lowercase letters, numbers and dashes.'} disabled={f.createOnly && !state.isNew} onChange={(x) => set(f.key, slugify(x, 60))} />;
            case 'textarea':
              return <TextArea key={f.key} class={cls} label={f.label} value={(v as string) ?? ''} max={f.max} required={f.required} hint={f.hint} onChange={(x) => set(f.key, x)} />;
            case 'number':
              return <NumberField key={f.key} label={f.label} value={(v as number | null) ?? null} hint={f.hint} onChange={(x) => set(f.key, x)} />;
            case 'bool':
              return <div key={f.key} class="field-check"><Checkbox label={f.label} checked={Boolean(v)} hint={f.hint} onChange={(x) => set(f.key, x)} /></div>;
            case 'select':
              return <SelectField key={f.key} label={f.label} value={(v as string) ?? ''} options={f.options ?? []} hint={f.hint} onChange={(x) => set(f.key, x)} />;
            case 'tags':
              return <TagsField key={f.key} class={cls} label={f.label} value={(v as string[]) ?? []} hint={f.hint} placeholder={f.placeholder} onChange={(x) => set(f.key, x)} />;
            case 'datetime':
              return <TextField key={f.key} label={f.label} type="datetime-local" value={dt(f.key)} hint={f.hint ?? 'Newsroom time (Eastern)'} required={f.required} onChange={(x) => set(f.key, x)} />;
            case 'sections':
              return <SectionPicker key={f.key} class={cls} label={f.label} value={(v as string[]) ?? []} hint={f.hint} sections={f.includeHidden ? sections : pubSections} onChange={(x) => set(f.key, x)} />;
            case 'options':
              return <OptionsField key={f.key} class={cls} label={f.label} value={(v as { id: string; label: string }[]) ?? []} hint={f.hint} onChange={(x) => set(f.key, x)} />;
            case 'image':
              return <ImageField key={f.key} class={cls} label={f.label} value={(v as string | null) ?? null} hint={f.hint} onChange={(x) => set(f.key, x)} />;
          }
        })}
      </form>
    </Modal>
  );
}
