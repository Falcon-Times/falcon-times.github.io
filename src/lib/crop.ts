// Geometry for the photo cropper. Everything is in the photo's own pixels except the
// "box" arguments, which are the size of the on-screen frame being previewed.

export interface CropState {
  /** Centre of the visible area, in photo pixels. */
  cx: number;
  cy: number;
  /** 1 = the photo just covers the frame; larger zooms in. */
  zoom: number;
}
export interface Photo { w: number; h: number }
export interface Region { x: number; y: number; w: number; h: number }

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

/** Scale at which the photo exactly covers a box (zoom 1). */
export const baseScale = (p: Photo, boxW: number, boxH: number) => Math.max(boxW / p.w, boxH / p.h);

export const initialCrop = (p: Photo): CropState => ({ cx: p.w / 2, cy: p.h / 2, zoom: 1 });

/** Keep the zoom in range and the visible area inside the photo. */
export function clampCrop(p: Photo, boxW: number, boxH: number, s: CropState): CropState {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s.zoom));
  const scale = baseScale(p, boxW, boxH) * zoom;
  const halfW = boxW / scale / 2;
  const halfH = boxH / scale / 2;
  return {
    zoom,
    cx: Math.min(p.w - halfW, Math.max(halfW, s.cx)),
    cy: Math.min(p.h - halfH, Math.max(halfH, s.cy)),
  };
}

/** The part of the photo that is visible in the frame. */
export function visibleRegion(p: Photo, boxW: number, boxH: number, s: CropState): Region {
  const c = clampCrop(p, boxW, boxH, s);
  const scale = baseScale(p, boxW, boxH) * c.zoom;
  const w = boxW / scale;
  const h = boxH / scale;
  return { x: c.cx - w / 2, y: c.cy - h / 2, w, h };
}

/** Move the photo by a drag of (dx, dy) screen pixels: the photo follows the pointer. */
export function pan(p: Photo, boxW: number, boxH: number, s: CropState, dx: number, dy: number): CropState {
  const scale = baseScale(p, boxW, boxH) * s.zoom;
  return clampCrop(p, boxW, boxH, { ...s, cx: s.cx - dx / scale, cy: s.cy - dy / scale });
}

/** Change zoom around the current centre. */
export const zoomTo = (p: Photo, boxW: number, boxH: number, s: CropState, zoom: number) =>
  clampCrop(p, boxW, boxH, { ...s, zoom });

/** CSS box (px) that draws the whole photo so that `region` fills a preview of size pw x ph. */
export function previewRect(p: Photo, region: Region, pw: number) {
  const k = pw / region.w;
  return { width: p.w * k, height: p.h * k, left: -region.x * k, top: -region.y * k };
}
