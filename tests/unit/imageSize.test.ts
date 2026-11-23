import { describe, expect, it } from 'vitest';
import { MIN_PHOTO, sizeRule, tooSmall, tooSmallMessage } from '@/lib/images';

describe('minimum image size', () => {
  it('rejects the two example images that should never be uploaded', () => {
    expect(tooSmall(816, 591)).toBe(true);    // the photo of people at a table (screenshot-sized)
    expect(tooSmall(584, 882)).toBe(true);    // the movie-poster collage
  });
  it('accepts ordinary camera, phone and screen-sized photos, in either orientation', () => {
    expect(tooSmall(4032, 3024)).toBe(false);  // phone, landscape
    expect(tooSmall(3024, 4032)).toBe(false);  // phone, portrait
    expect(tooSmall(1920, 1080)).toBe(false);
    expect(tooSmall(1080, 1920)).toBe(false);
    expect(tooSmall(1200, 800)).toBe(false);   // exactly the minimum
    expect(tooSmall(800, 1200)).toBe(false);
    expect(tooSmall(1200, 1200)).toBe(false);
  });
  it('needs both sides to be big enough', () => {
    expect(tooSmall(1199, 800)).toBe(true);
    expect(tooSmall(1200, 799)).toBe(true);
    expect(tooSmall(3000, 400)).toBe(true);    // a long thin strip is still low resolution
    expect(tooSmall(MIN_PHOTO.long - 1, MIN_PHOTO.short)).toBe(true);
  });
  it('has a lower bar for staff portraits, which are shown as small circles', () => {
    expect(tooSmall(584, 882, 'portrait')).toBe(false);
    expect(tooSmall(300, 300, 'portrait')).toBe(false);
    expect(tooSmall(299, 2000, 'portrait')).toBe(true);
    expect(tooSmall(200, 200, 'portrait')).toBe(true);
  });
  it('explains what to do', () => {
    const m = tooSmallMessage('movies.jpg', 584, 882);
    expect(m).toContain('movies.jpg');
    expect(m).toContain('584 × 882');
    expect(m).toContain(sizeRule());
    expect(m).toMatch(/original/i);
    expect(sizeRule()).toContain('1200');
    expect(sizeRule()).toContain('800');
  });
});
