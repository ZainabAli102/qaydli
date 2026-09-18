// Client-side image compression before upload: downscale so the long side is
// at most `maxSide` px and re-encode as JPEG. Runs in the browser only.

export interface CompressedImage {
  base64: string;
  dataUrl: string;
  mimeType: string;
}

export async function compressImage(
  file: Blob,
  maxSide = 2048,
  quality = 0.8
): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Compression failed'))),
      'image/jpeg',
      quality
    );
  });

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

  return { base64: dataUrl.split(',')[1] ?? '', dataUrl, mimeType: 'image/jpeg' };
}
