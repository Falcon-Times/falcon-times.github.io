import { describe, expect, it } from 'vitest';
import { formatBypassCode } from '@/console/bypassCode';

describe('bypass code formatting', () => {
  it('groups digits 3-3-4 and ignores anything else', () => {
    expect(formatBypassCode('1234567890')).toBe('123-456-7890');
    expect(formatBypassCode('123 456 7890')).toBe('123-456-7890');
    expect(formatBypassCode('12')).toBe('12');
    expect(formatBypassCode('1234')).toBe('123-4');
    expect(formatBypassCode('abc12345678901234')).toBe('123-456-7890');
    expect(formatBypassCode('')).toBe('');
  });
});
