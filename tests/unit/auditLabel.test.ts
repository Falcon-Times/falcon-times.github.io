import { describe, expect, it } from 'vitest';
import { auditLabel } from '@/console/auditLabel';

describe('auditLabel', () => {
  it('describes row changes in words', () => {
    expect(auditLabel('INSERT', 'articles')).toBe('created story');
    expect(auditLabel('UPDATE', 'site_settings')).toBe('changed setting');
    expect(auditLabel('DELETE', 'staff_members')).toBe('deleted staff member');
  });
  it('says what an account action was, from its summary', () => {
    const a = (summary: string) => auditLabel('ACCOUNT', 'profiles', summary);
    expect(a('created admin account kkraner@avon.k12.ct.us')).toBe('created account');
    expect(a('created writer account pat@example.test')).toBe('created account');
    expect(a('created super_admin account x@example.test')).toBe('created account');
    expect(a('reset password for kkraner@avon.k12.ct.us')).toBe('reset password');
    expect(a('temporary password expired for pat@example.test')).toBe('temp password expired');
    expect(a('reset two-factor devices')).toBe('reset two-factor');
    expect(a('enabled account')).toBe('enabled account');
    expect(a('disabled account')).toBe('disabled account');
    expect(a('deleted account pat@example.test')).toBe('deleted account');
    expect(a('created a 2FA bypass code for lost.phone@example.test (valid 60 min)')).toBe('created bypass code');
    expect(a('revoked the 2FA bypass code for lost.phone@example.test')).toBe('revoked bypass code');
    expect(a('signed in with a 2FA bypass code')).toBe('used bypass code');
    expect(a('2FA bypass code locked after 5 wrong guesses')).toBe('locked bypass code');
  });
  it('never shows a raw upper-case operation', () => {
    expect(auditLabel('ACCOUNT', 'profiles', 'something new')).toBe('account change');
    expect(auditLabel('ACCOUNT', 'profiles')).toBe('account change');
    expect(auditLabel('ARCHIVE', 'widgets')).toBe('archive widgets');
  });
});
