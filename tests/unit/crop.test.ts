import { describe, expect, it } from 'vitest';
import { baseScale, clampCrop, initialCrop, MAX_ZOOM, pan, previewRect, visibleRegion, zoomTo } from '@/lib/crop';

const wide = { w: 600, h: 300 };   // landscape photo, square frame
const tall = { w: 300, h: 600 };
const F = 280;

describe('photo cropper geometry', () => {
  it('starts centred, showing the largest square the photo allows', () => {
    const r = visibleRegion(wide, F, F, initialCrop(wide));
    expect(r.w).toBeCloseTo(300); expect(r.h).toBeCloseTo(300);
    expect(r.x).toBeCloseTo(150); expect(r.y).toBeCloseTo(0);
    const t = visibleRegion(tall, F, F, initialCrop(tall));
    expect(t.x).toBeCloseTo(0); expect(t.y).toBeCloseTo(150);
  });

  it('zooming in shows a smaller area and keeps the centre', () => {
    const s = zoomTo(wide, F, F, initialCrop(wide), 2);
    const r = visibleRegion(wide, F, F, s);
    expect(r.w).toBeCloseTo(150);
    expect(r.x + r.w / 2).toBeCloseTo(300);
  });

  it('zoom is limited, and zooming out never shows beyond the photo', () => {
    expect(zoomTo(wide, F, F, initialCrop(wide), 99).zoom).toBe(MAX_ZOOM);
    expect(zoomTo(wide, F, F, initialCrop(wide), 0.2).zoom).toBe(1);
  });

  it('dragging moves the photo with the pointer and stops at the edges', () => {
    const start = initialCrop(wide);
    const right = pan(wide, F, F, start, 40, 0);              // photo follows the pointer: we see more of the left
    expect(right.cx).toBeLessThan(start.cx);
    const farRight = pan(wide, F, F, start, 100000, 0);
    expect(visibleRegion(wide, F, F, farRight).x).toBeCloseTo(0);
    const farLeft = pan(wide, F, F, start, -100000, 0);
    const r = visibleRegion(wide, F, F, farLeft);
    expect(r.x + r.w).toBeCloseTo(600);
    // the short side has no room to move at zoom 1
    expect(pan(wide, F, F, start, 0, 500).cy).toBeCloseTo(150);
  });

  it('clamps a centre that is out of bounds', () => {
    const c = clampCrop(wide, F, F, { cx: -50, cy: 9999, zoom: 3 });
    const r = visibleRegion(wide, F, F, c);
    expect(r.x).toBeGreaterThanOrEqual(-1e-9);
    expect(r.y + r.h).toBeLessThanOrEqual(300 + 1e-9);
  });

  it('previews draw the same region at any size', () => {
    const r = visibleRegion(wide, F, F, initialCrop(wide));
    const big = previewRect(wide, r, 112);
    const small = previewRect(wide, r, 56);
    expect(big.width / small.width).toBeCloseTo(2);
    // the region's top-left lands exactly at the preview's top-left
    expect(big.left + r.x * (112 / r.w)).toBeCloseTo(0);
    expect(baseScale(wide, F, F)).toBeCloseTo(F / 300);
  });
});
