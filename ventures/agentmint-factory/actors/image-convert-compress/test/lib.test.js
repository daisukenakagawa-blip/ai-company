import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { validateOptions, processImage, outputKey } from '../src/lib.js';

const png = (w, h) => sharp({ create: { width: w, height: h, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 0.5 } } }).png().toBuffer();

test('options validation', () => {
    assert.equal(validateOptions({}).format, 'webp');
    assert.equal(validateOptions({ format: 'JPEG' }).format, 'jpeg');
    assert.throws(() => validateOptions({ format: 'gif' }));
    assert.throws(() => validateOptions({ quality: 0 }));
    assert.throws(() => validateOptions({ maxWidth: -5 }));
    assert.equal(validateOptions({ maxWidth: 0 }).maxWidth, null);
});
test('converts to each format', async () => {
    const src = await png(400, 300);
    for (const f of ['webp', 'avif', 'jpeg', 'png']) {
        const { buffer, info } = await processImage(src, validateOptions({ format: f }));
        const m = await sharp(buffer).metadata();
        assert.equal(m.format === 'heif' ? 'avif' : m.format, f);
        assert.equal(info.width, 400);
    }
});
test('resizes inside the box and never enlarges', async () => {
    const src = await png(1000, 500);
    let r = await processImage(src, validateOptions({ maxWidth: 200 }));
    assert.deepEqual([r.info.width, r.info.height], [200, 100]);
    r = await processImage(await png(100, 50), validateOptions({ maxWidth: 2000 }));
    assert.deepEqual([r.info.width, r.info.height], [100, 50]);
});
test('jpeg flattens transparency on white', async () => {
    const { buffer } = await processImage(await png(10, 10), validateOptions({ format: 'jpeg' }));
    const { data } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
    assert.ok(data[1] > 100, 'background mixed with white, not black');
});
test('rejects non-images', async () => {
    await assert.rejects(processImage(Buffer.from('<html>not an image</html>'), validateOptions({})));
});
test('output keys are safe and unique per index', () => {
    assert.equal(outputKey('https://x.com/a/My Photo (1).JPG?x=1', 0, 'webp'), '00001-My-Photo-(1).webp');
    assert.equal(outputKey('https://x.com/', 9, 'jpeg'), '00010-image.jpg');
    assert.match(outputKey('not a url', 2, 'png'), /^00003-image\.png$/);
});
