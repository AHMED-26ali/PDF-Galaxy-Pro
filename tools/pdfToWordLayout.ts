import {
    Document, HorizontalPositionRelativeFrom, ImageRun, Packer, PageOrientation,
    Paragraph, SectionType, TextWrappingType, VerticalPositionRelativeFrom, type ISectionOptions,
} from 'docx';
import { canvasToBlob, clearCanvas, renderPdfPage, withPdf } from './pdfRuntime';

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
                // Word supports page sizes up to 22 inches. Keep the aspect ratio for oversized PDFs.
                const fit = Math.min(1, 1584 / Math.max(viewport.width, viewport.height));
                const width = Math.max(1, Math.round(viewport.width * fit * 20));
                const height = Math.max(1, Math.round(viewport.height * fit * 20));
                const landscape = width > height;
                sections.push({
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
                                type: 'png',
                                data: new Uint8Array(await png.arrayBuffer()),
                                transformation: { width: width / 15, height: height / 15 },
                                altText: { name: `Page ${pageNumber}`, title: `صفحة ${pageNumber}`, description: '' },
                                floating: {
                                    horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
                                    verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
                                    wrap: { type: TextWrappingType.NONE },
                                },
                            })],
                        }),
                    ],
                });
            } finally {
                clearCanvas(canvas);
                page.cleanup();
            }
        }
        return Packer.toBlob(new Document({ sections }));
    });
}
