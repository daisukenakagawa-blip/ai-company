import { PDFDocument, StandardFonts } from 'pdf-lib';
export async function makePdf(pages, { title = 'Test Doc', author = 'QA' } = {}) {
    const doc = await PDFDocument.create();
    doc.setTitle(title); doc.setAuthor(author);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (const lines of pages) {
        const p = doc.addPage([595, 842]);
        lines.forEach((l, i) => p.drawText(l, { x: 50, y: 780 - i * 20, size: 12, font }));
    }
    return Buffer.from(await doc.save());
}
