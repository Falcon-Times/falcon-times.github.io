import { sessionClient } from '@/lib/supabase';

// Supabase insists every authenticator on an account has a unique *internal* name and
// offers no way to rename one, so the friendly names people see ("Bitwarden") live in
// the account's own metadata instead, keyed by factor id. They are cosmetic only.
const KEY = 'mfa_labels';
export const DEFAULT_LABEL = 'Authenticator app';

export async function getLabels(): Promise<Record<string, string>> {
  const { data } = await sessionClient().auth.getUser();
  return (data.user?.user_metadata?.[KEY] as Record<string, string> | undefined) ?? {};
}

export async function setLabel(factorId: string, label: string): Promise<void> {
  const labels = await getLabels();
  labels[factorId] = label.trim().slice(0, 40) || DEFAULT_LABEL;
  const { error } = await sessionClient().auth.updateUser({ data: { [KEY]: labels } });
  if (error) throw new Error(error.message);
}
