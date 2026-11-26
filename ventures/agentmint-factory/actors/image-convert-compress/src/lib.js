// Image processing core (no Apify dependency) so it can be unit-tested.
import sharp from 'sharp';

export const FORMATS = { webp: 'image/webp', avif: 'image/avif', jpeg: 'image/jpeg', png: 'image/png' };
const EXT = { webp: 'webp', avif: 'avif', jpeg: 'jpg', png: 'png' };

export function validateOptions(o) {
    const format = (o.format || 'webp').toLowerCase();
    if (!FORMATS[format]) throw new Error(`"format" must be one of: ${Object.keys(FORMATS).join(', ')}`);
    const quality = o.quality ?? 80;
    if (!Number.isInteger(quality) || quality < 1 || quality > 100) throw new Error('"quality" must be an integer 1-100');
    for (const k of ['maxWidth', 'maxHeight']) {
        if (o[k] != null && o[k] !== 0 && (!Number.isInteger(o[k]) || o[k] < 1 || o[k] > 16384)) throw new Error(`"${k}" must be 1-16384 (or 0 for no limit)`);
    }
    return { format, quality, maxWidth: o.maxWidth || null, maxHeight: o.maxHeight || null, keepMetadata: !!o.keepMetadata,
        lossless: !!o.lossless, skipIfLarger: o.skipIfLarger !== false };
}

// Returns { buffer, info } or throws. Never enlarges, auto-rotates by EXIF, strips metadata unless keepMetadata.
export async function processImage(input, opt) {
    const img = sharp(input, { failOn: 'error', limitInputPixels: 268402689, animated: false });
    const meta = await img.metadata();
    let p = img.rotate();
    if (opt.maxWidth || opt.maxHeight) p = p.resize({ width: opt.maxWidth || undefined, height: opt.maxHeight || undefined, fit: 'inside', withoutEnlargement: true });
    if (opt.keepMetadata) p = p.keepMetadata();
    if (opt.format === 'webp') p = p.webp({ quality: opt.quality, lossless: opt.lossless, effort: 4 });
    else if (opt.format === 'avif') p = p.avif({ quality: opt.quality, lossless: opt.lossless, effort: 4 });
    else if (opt.format === 'jpeg') p = p.flatten({ background: '#ffffff' }).jpeg({ quality: opt.quality, mozjpeg: true });
    else if (opt.format === 'png') p = p.png({ compressionLevel: 9, palette: !opt.lossless, quality: opt.quality });
    const { data, info } = await p.toBuffer({ resolveWithObject: true });
    return { buffer: data, info: { ...info, inputFormat: meta.format, inputWidth: meta.width, inputHeight: meta.height } };
}

export function outputKey(url, index, format) {
    let base = 'image';
    try { base = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'image'); } catch { /* keep default */ }
    base = base.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[^a-zA-Z0-9!\-_.'()]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'image';
    return `${String(index + 1).padStart(5, '0')}-${base}.${EXT[format]}`;
}
