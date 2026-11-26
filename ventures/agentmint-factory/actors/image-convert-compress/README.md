# Image Converter & Compressor

Convert and compress **thousands of images** in one run: WebP, AVIF, JPEG (mozjpeg) or PNG, resize to fit a box, auto-rotate from EXIF and strip metadata. Feed it a list of URLs, or point it at a **scraper's dataset** and the field that holds the image URLs.

**You pay only for images that were converted successfully.** Broken links, non-image files and timeouts are listed with the reason and are free.

## Features

- Output formats: **WebP**, **AVIF**, **JPEG** (mozjpeg), **PNG** (palette-optimized)
- Quality 1–100, optional lossless mode
- Resize to a maximum width and/or height — keeps the aspect ratio and **never enlarges**
- Auto-rotates photos using EXIF orientation
- Removes metadata (EXIF, GPS location) by default — smaller files and better privacy; can be kept
- Transparent images converted to JPEG get a white background (not black)
- Optionally keeps the original when re-encoding would make it bigger
- Reads URLs from any dataset field, including nested fields and arrays (`media.images`)
- Duplicate URLs are processed once; failed downloads are retried (5xx, 429, timeouts)

## Input example

```json
{
  "imageUrls": ["https://example.com/photo1.jpg", "https://example.com/photo2.png"],
  "format": "webp",
  "quality": 80,
  "maxWidth": 1600
}
```

From a scraper's results:

```json
{ "datasetId": "<dataset ID>", "urlField": "images", "format": "avif", "quality": 60 }
```

## Output

Each converted image is saved to the run's **key-value store**. The dataset has one row per URL:

```json
{
  "sourceUrl": "https://example.com/photo1.jpg",
  "status": "ok",
  "outputKey": "00001-photo1.webp",
  "outputUrl": "https://api.apify.com/v2/key-value-stores/<id>/records/00001-photo1.webp",
  "format": "webp", "width": 1600, "height": 1200,
  "inputFormat": "jpeg", "inputWidth": 4000, "inputHeight": 3000,
  "bytesBefore": 2483201, "bytesAfter": 182334, "savedPercent": 92.7
}
```

Failed URLs: `{ "sourceUrl": "...", "status": "error", "error": "HTTP 404" }`. A run summary is in the `OUTPUT` record.

Depending on your account's storage access settings, opening `outputUrl` may require your API token.

## Use through the API

```bash
curl -X POST "https://api.apify.com/v2/acts/<username>~image-convert-compress/run-sync-get-dataset-items?token=<YOUR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"imageUrls":["https://example.com/a.jpg"],"format":"webp","maxWidth":1200}'
```

## Pricing

Pay per event: one charge per **successfully processed image**. Failed images are free. If you set a maximum cost per run, the Actor stops before starting an image it could not pay for and says so in the status message.

## Limits

- Up to 30 MB per source image; animated images use the first frame
- Only images you link to are downloaded; the Actor does not crawl pages
- Make sure you have the right to process the images you submit
