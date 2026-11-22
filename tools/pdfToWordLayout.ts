import {
    Document, HorizontalPositionRelativeFrom, ImageRun, Packer, PageOrientation,
    Paragraph, SectionType, TextWrappingType, VerticalPositionRelativeFrom, type ISectionOptions, type ParagraphChild,
} from 'docx';
import { canvasToBlob, clearCanvas, renderPdfPage, withPdf } from './pdfRuntime';

export function wordImageSection(viewport: { width: number; height: number }, pageNumber: number, data: Uint8Array, type: 'jpg' | 'png', text: ParagraphChild[] = []): ISectionOptions {
    // Word supports page sizes up to 22 inches. Keep the aspect ratio for oversized PDFs.
    const fit = Math.min(1, 1584 / Math.max(viewport.width, viewport.height));
    const width = Math.max(1, Math.round(viewport.width * fit * 20));
    const height = Math.max(1, Math.round(viewport.height * fit * 20));
    const landscape = width > height;
    return {
        properties: {
            type: SectionType.NEXT_PAGE,
            page: {
                size: {
                    width: landscape ? height : width,
                    height: landscape ? width : height,
                    orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
                },
                margin: { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0 },
            },
        },
        children: [
            new Paragraph({
                spacing: { before: 0, after: 0 },
                children: [new ImageRun({
                    type,
                    data,
                    transformation: { width: width / 15, height: height / 15 },
                    altText: { name: `Page ${pageNumber}`, title: `صفحة ${pageNumber}`, description: '' },
                    floating: {
                        horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
                        verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
                        wrap: { type: TextWrappingType.NONE },
                        behindDocument: text.length > 0,
                    },
                }), ...text],
            }),
        ],
    };
}

export async function convertPdfLayoutToWord(file: File, onProgress: (page: number, count: number) => void) {
    return withPdf(file, async pdf => {
        const sections: ISectionOptions[] = [];
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
            onProgress(pageNumber, pdf.numPages);
            const page = await pdf.getPage(pageNumber);
            const viewport = page.getViewport({ scale: 1 });
            const canvas = await renderPdfPage(page, 3, 3600);
            try {
                const png = await canvasToBlob(canvas);
                sections.push(wordImageSection(viewport, pageNumber, new Uint8Array(await png.arrayBuffer()), 'png'));
            } finally {
                clearCanvas(canvas);
                page.cleanup();
            }
        }
        return Packer.toBlob(new Document({ sections }));
    });
}
