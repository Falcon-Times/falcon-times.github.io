import { describe, expect, it } from 'vitest';
import { match } from '@/lib/router';

describe('match', () => {
  it('extracts params', () => {
    expect(match('/article/:slug', '/article/hello-world')).toEqual({ slug: 'hello-world' });
    expect(match('/section/:id/:sub', '/section/sports/Athlete%20Spotlights')).toEqual({ id: 'sports', sub: 'Athlete Spotlights' });
  });
  it('rejects other shapes', () => {
    expect(match('/article/:slug', '/article')).toBeNull();
    expect(match('/staff', '/about')).toBeNull();
    expect(match('/', '/')).toEqual({});
  });
});
