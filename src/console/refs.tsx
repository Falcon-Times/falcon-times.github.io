import { createContext } from 'preact';
import { useContext, useEffect, useMemo, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { Section, StaffMember } from '@/lib/types';
import { Loading, ErrorNote } from '@/ui/States';
import { loadRefs, type DirectoryEntry } from './api';

export interface Refs {
  sections: Section[];
  staff: StaffMember[];
  directory: DirectoryEntry[];
  sectionName: (id: string | null | undefined) => string;
  personName: (userId: string | null | undefined) => string;
  reload: () => void;
}
const Ctx = createContext<Refs | null>(null);
export const useRefs = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRefs outside provider');
  return v;
};

export function RefsProvider({ children }: { children: ComponentChildren }) {
  const [tick, setTick] = useState(0);
  const [data, setData] = useState<Awaited<ReturnType<typeof loadRefs>> | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => { loadRefs().then(setData).catch(setError); }, [tick]);
  const value = useMemo<Refs | null>(() => data && ({
    ...data,
    sectionName: (id) => data.sections.find((s) => s.id === id)?.name ?? (id ?? '—'),
    personName: (uid) => data.directory.find((d) => d.id === uid)?.display_name ?? (uid ? 'Former staff' : '—'),
    reload: () => setTick((t) => t + 1),
  }), [data]);
  if (error) return <ErrorNote error={error} />;
  if (!value) return <Loading label="Loading newsroom…" />;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
