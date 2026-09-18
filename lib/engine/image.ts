// Down-scale a photo so its long side is at most `maxLongSide` px before it is
// sent to a vision model, and auto-orient it from EXIF. Uses sharp, imported
// dynamically so the engine still loads where sharp is unavailable (the
// original image is returned unchanged on any failure).

export async function resizeForVision(
  base64: string,
  mimeType: string,
  maxLongSide = 2048
): Promise<{ base64: string; mimeType: string }> {
  try {
    const sharp = (await import('sharp')).default;
    const input = Buffer.from(base64, 'base64');
    const fmt = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpeg';

    const out = await sharp(input, { failOn: 'none' })
      .rotate() // honour EXIF orientation
      .resize(maxLongSide, maxLongSide, { fit: 'inside', withoutEnlargement: true })
      .toFormat(fmt, fmt === 'jpeg' ? { quality: 90 } : undefined)
      .toBuffer();

    return { base64: out.toString('base64'), mimeType: `image/${fmt}` };
  } catch {
    return { base64, mimeType };
  }
}
