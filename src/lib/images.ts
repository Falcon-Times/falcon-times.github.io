import { sessionClient, unwrap } from './supabase';

const MAX_EDGE = 2400;

/** Downscale very large photos (keeps them high-res but web-friendly) and
 *  re-encode as WebP. GIFs and tiny images are uploaded untouched. */
export function checkImageFile(file: File) {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error('Please choose a JPG, PNG, WebP or GIF image.');
  if (file.size > 25 * 1024 * 1024) throw new Error('That image is over 25 MB. Please pick a smaller file.');
}

export async function prepareImage(file: File): Promise<{ blob: Blob; ext: string }> {
  checkImageFile(file);
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

/** Uploads to the public "media" bucket and returns its public URL. */
export async function uploadImage(file: File, userId: string): Promise<string> {
  const { blob, ext } = await prepareImage(file);
  return uploadBlob(blob, ext, userId);
}

/** Uploads an already-prepared image (e.g. a cropped portrait). */
export async function uploadBlob(blob: Blob, ext: string, userId: string): Promise<string> {
  if (blob.size > 8 * 1024 * 1024) throw new Error('That image is still over 8 MB after compression. Try a smaller one.');
  const db = sessionClient();
  const name = `${userId}/${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;
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
