import { sessionClient, unwrap } from './supabase';

const MAX_EDGE = 2400;

/**
 * How big an uploaded image must be (in pixels) to look sharp on the site, which shows photos up to
 * ~760 CSS pixels wide on screens that are often 2x. Screenshots, thumbnails and images saved from the web
 * are usually smaller than this; originals from a camera or phone are far larger.
 */
export const MIN_PHOTO = { long: 1200, short: 800 } as const;
/** Portraits are cropped to a small circle (at most 112 CSS px), so the bar is lower. */
export const MIN_PORTRAIT_SHORT = 300;
export type ImageKind = 'photo' | 'portrait';

/** True when an image of this size is too small for what it is for. */
export function tooSmall(width: number, height: number, kind: ImageKind = 'photo'): boolean {
  const long = Math.max(width, height), short = Math.min(width, height);
  return kind === 'portrait' ? short < MIN_PORTRAIT_SHORT : long < MIN_PHOTO.long || short < MIN_PHOTO.short;
}

/** The rule in words, for messages. */
export const sizeRule = (kind: ImageKind = 'photo') =>
  kind === 'portrait' ? `at least ${MIN_PORTRAIT_SHORT} pixels on the shorter side` : `at least ${MIN_PHOTO.long} pixels on the longer side and ${MIN_PHOTO.short} on the shorter`;

export const tooSmallMessage = (name: string, width: number, height: number, kind: ImageKind = 'photo') =>
  `“${name}” is too small (${width} × ${height} pixels). ${kind === 'portrait' ? 'Portraits' : 'Photos'} need to be ${sizeRule(kind)} to look sharp on the site. ` +
  'Use the original from the camera or phone, not a screenshot, a thumbnail or a copy saved from the web.';

/** The image's real size, as it will be shown (a phone photo's rotation is applied). */
export async function readImageSize(file: Blob): Promise<{ width: number; height: number }> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const size = { width: bmp.width, height: bmp.height };
    bmp.close();
    return size;
  } catch {
    throw new Error('We couldn’t read that file as an image. Please choose a JPG, PNG, WebP or GIF.');
  }
}

/** Throws a friendly error when the image is too small. */
export async function checkImageSize(file: File, kind: ImageKind = 'photo'): Promise<void> {
  const { width, height } = await readImageSize(file);
  if (tooSmall(width, height, kind)) throw new Error(tooSmallMessage(file.name, width, height, kind));
}

/** Downscale very large photos (keeps them high-res but web-friendly) and
 *  re-encode as WebP. GIFs and tiny images are uploaded untouched. */
export function checkImageFile(file: File) {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error('Please choose a JPG, PNG, WebP or GIF image.');
  if (file.size > 25 * 1024 * 1024) throw new Error('That image is over 25 MB. Please pick a smaller file.');
}

export async function prepareImage(file: File, kind: ImageKind = 'photo'): Promise<{ blob: Blob; ext: string }> {
  checkImageFile(file);
  await checkImageSize(file, kind);
  const fallbackExt = file.type === 'image/png' ? 'png' : file.type === 'image/gif' ? 'gif' : file.type === 'image/webp' ? 'webp' : 'jpg';
  if (file.type === 'image/gif') return { blob: file, ext: 'gif' };
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) { bmp.close(); return { blob: file, ext: fallbackExt }; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', 0.88));
    if (blob && blob.size < file.size) return { blob, ext: 'webp' };
  } catch { /* fall through to original */ }
  return { blob: file, ext: fallbackExt };
}

/**
 * Uploads a photo to the public "media" bucket and returns its public URL. Only the photo gallery
 * uploads photos: the database lets only photographers, admins and the Photography + Video leader do it.
 */
export async function uploadImage(file: File, userId: string): Promise<string> {
  const { blob, ext } = await prepareImage(file, 'photo');
  return uploadBlob(blob, ext, userId);
}

/**
 * Uploads an already-prepared image: a gallery photo, or (folder "portraits") a cropped staff portrait,
 * which every staff member may upload for their own profile.
 */
export async function uploadBlob(blob: Blob, ext: string, userId: string, folder?: 'portraits'): Promise<string> {
  if (blob.size > 8 * 1024 * 1024) throw new Error('That image is still over 8 MB after compression. Try a smaller one.');
  const db = sessionClient();
  const name = `${folder ? `${folder}/` : ''}${userId}/${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;
  unwrap({ data: true, error: (await db.storage.from('media').upload(name, blob, { contentType: blob.type || `image/${ext}`, cacheControl: '31536000' })).error });
  return db.storage.from('media').getPublicUrl(name).data.publicUrl;
}

/** Draws the chosen region of a photo into a square-ish canvas and encodes it (WebP, else JPEG). */
export async function cropToBlob(img: CanvasImageSource, region: { x: number; y: number; w: number; h: number }, maxWidth: number): Promise<{ blob: Blob; ext: string }> {
  const outW = Math.max(1, Math.round(Math.min(maxWidth, region.w))); // never upscale
  const outH = Math.max(1, Math.round(outW * (region.h / region.w)));
  const canvas = document.createElement('canvas');
  canvas.width = outW; canvas.height = outH;
  canvas.getContext('2d')!.drawImage(img, region.x, region.y, region.w, region.h, 0, 0, outW, outH);
  const encode = (type: string, q: number) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, q));
  const webp = await encode('image/webp', 0.9);
  if (webp && webp.type === 'image/webp') return { blob: webp, ext: 'webp' };
  const jpeg = await encode('image/jpeg', 0.9);
  if (!jpeg) throw new Error('Could not prepare that image. Please try a different one.');
  return { blob: jpeg, ext: 'jpg' };
}
