# PDF Text Extractor

Turn PDF links into clean text: **page-by-page text and metadata** (title, author, creation date, page count) for one PDF or thousands. Give it a list of URLs, or point it at a **scraper's dataset** and the field that holds the PDF links.

**You pay only for PDFs where text was extracted.** Broken links, non-PDF files, and scanned PDFs without a text layer are listed with the reason and are free.

## Features

- Text per page **and** as one full text, with line breaks rebuilt from the page layout
- Metadata: title, author, subject, keywords, creator, producer, creation and modification dates, page count, word and character counts
- Page selection (`"1-3,7,10-"`) and a per-document page cap
- Password-protected PDFs (with the password you provide)
- Reads URLs from any dataset field, including nested fields and arrays
- Duplicate URLs are processed once; failed downloads are retried (5xx, 429, timeouts)
- Pure JavaScript PDF engine (pdf.js) — no external services, your documents are not sent anywhere else

## Input example

```json
{ "pdfUrls": ["https://example.com/report.pdf"], "pages": "1-5" }
```

From a scraper's results:

```json
{ "datasetId": "<dataset ID>", "urlField": "documents.pdf", "includePages": false }
```

## Output

```json
{
  "url": "https://example.com/report.pdf",
  "status": "ok",
  "pageCount": 12, "pagesExtracted": 5, "truncated": false,
  "title": "Annual report", "author": "ACME", "creationDate": "D:20260115093000Z",
  "textFound": true, "charCount": 18234, "wordCount": 2931,
  "text": "Annual report 2025\n...",
  "pages": [{ "page": 1, "text": "Annual report 2025\n..." }]
}
```

Other statuses: `no-text` (no text layer, e.g. a scan — OCR is not included; not charged) and `error` (with the reason; not charged). A run summary is in the `OUTPUT` record.

## Use through the API

```bash
curl -X POST "https://api.apify.com/v2/acts/<username>~pdf-text-extract/run-sync-get-dataset-items?token=<YOUR_TOKEN>" \
  -H "Content-Type: application/json" -d '{"pdfUrls":["https://example.com/a.pdf"]}'
```

## Pricing

Pay per event: one charge per **PDF with extracted text**. If you set a maximum cost per run, the Actor stops before starting a PDF it could not pay for and says so in the status message.

## Limits

- Up to 50 MB per PDF and 500 pages by default (adjustable)
- No OCR: scanned images inside PDFs are not read
- Only PDFs you link to are downloaded; the Actor does not crawl pages. Make sure you may process the documents you submit
