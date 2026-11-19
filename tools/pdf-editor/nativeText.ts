import {
    PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, StandardFonts, type PDFFont, type PDFPage, type PDFRef,
} from 'pdf-lib';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { openPdf, type PDFPageProxy } from '../pdfRuntime';
import { pageContent, removeObsoleteStreams, rewritePageStreams, type TextDraw } from './contentStream';

const markerBase = 1_405_000_000;

export type FontFamily = 'auto' | 'sans' | 'serif' | 'mono';
export type TextStyle = { family: FontFamily; size: number; color: string | null; bold: boolean; italic: boolean };
export type TextRun = {
    id: number;
    text: string;
    left: number;
    top: number;
    width: number;
    height: number;
    angle: number;
    canColor: boolean;
    style: TextStyle;
    leading: number;
    inkEnd: number;
    advance: number;
    rtl: boolean;
};
export type TextChange = { run: TextRun; text: string; style: TextStyle };
type Glyph = number | { width: number; unicode?: string; isSpace?: boolean };

function pdfNumber(value: number) {
    return PDFNumber.of(Math.round(value * 100_000_000) / 100_000_000).toString();
}

function nativeFont(page: PDFPage, key: string) {
    return page.node.Resources()?.lookupMaybe(PDFName.Font, PDFDict)?.lookupMaybe(PDFName.of(key.slice(1)), PDFDict);
}

function fontName(page: PDFPage, key: string) {
    return nativeFont(page, key)?.lookupMaybe(PDFName.of('BaseFont'), PDFName)?.decodeText().replace(/^[A-Z]{6}\+/, '') ?? '';
}

export async function instrumentEditorDocument(bytes: Uint8Array) {
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    const targets: TextDraw[][] = [];
    const obsolete = new Set<PDFRef>();
    for (const [index, page] of pdf.getPages().entries()) {
        try {
            const { streams, targets: draws } = pageContent(pdf, page);
            const supported = draws.filter(draw => {
                const font = nativeFont(page, draw.font);
                return Boolean(font && font.get(PDFName.of('Subtype')) !== PDFName.of('Type3'));
            });
            targets[index] = supported;
            if (!supported.length) continue;
            const changes = new Map<number, { start: number; end: number; value: string }[]>();
            for (const draw of supported) {
                const marker = markerBase + draw.id;
                const original = streams.sources[draw.stream].slice(draw.start, draw.end);
                const content = `q ${marker} w Q\n/GalaxyText << /MCID ${marker} >> BDC\n${original}\nEMC\nq ${markerBase - 1} w Q\n`;
                const streamChanges = changes.get(draw.stream) ?? [];
                streamChanges.push({ start: draw.start, end: draw.end, value: content });
                changes.set(draw.stream, streamChanges);
            }
            rewritePageStreams(pdf, page, streams, changes, obsolete);
        } catch {
            targets[index] = [];
        }
    }
    removeObsoleteStreams(pdf, obsolete);
    return { diagnostic: await pdf.save(), targets };
}

export async function prepareEditor(bytes: Uint8Array) {
    const { diagnostic, targets } = await instrumentEditorDocument(bytes);
    return { reader: await openPdf(diagnostic), targets };
}

export async function readNativeRuns(page: PDFPageProxy, source: PDFPage, draws: TextDraw[]) {
    if (!draws.length) return [];
    const [{ OPS, Util }, content, list] = await Promise.all([
        import('pdfjs-dist/legacy/build/pdf.mjs'),
        page.getTextContent({ includeMarkedContent: true }),
        page.getOperatorList({ annotationMode: 0 }),
    ]);
    const glyphs = new Map<number, Glyph[]>();
    let current: number | null = null;
    for (let index = 0; index < list.fnArray.length; index++) {
        const operator = list.fnArray[index];
        const args = list.argsArray[index];
        if (operator === OPS.setLineWidth) {
            const marker = args?.[0];
            if (marker === markerBase - 1) current = null;
            else if (Number.isInteger(marker) && marker >= markerBase) current = marker - markerBase;
        } else if (current !== null && operator === OPS.showText && Array.isArray(args?.[0])) {
            glyphs.set(current, args[0] as Glyph[]);
            current = null;
        }
    }

    const items = new Map<number, TextItem[]>();
    const marked: (number | null)[] = [];
    for (const item of content.items) {
        if ('str' in item) {
            const id = marked.at(-1);
            if (id !== undefined && id !== null) {
                const runItems = items.get(id) ?? [];
                runItems.push(item);
                items.set(id, runItems);
            }
        } else if (item.type === 'endMarkedContent') {
            marked.pop();
        } else {
            const marker = Number(item.id?.match(/_mc(\d+)$/)?.[1]);
            marked.push(marker >= markerBase ? marker - markerBase : null);
        }
    }

    const viewport = page.getViewport({ scale: 1 });
    const runs: TextRun[] = [];
    for (const draw of draws) {
        const sequence = glyphs.get(draw.id);
        const fragments = items.get(draw.id)?.filter(item => item.str);
        const first = fragments?.[0];
        if (!sequence || !first || !fragments || first.dir === 'ttb' || content.styles[first.fontName]?.vertical) continue;
        const [a, b, c, d, x, y] = Util.transform(viewport.transform, first.transform);
        const height = Math.hypot(c, d);
        const angle = Math.atan2(b, a);
        const baseline = [Math.cos(angle), Math.sin(angle)];
        if (!height || ![x, y, angle].every(Number.isFinite)) continue;
        let width = Math.max(1, first.width);
        let singleLine = true;
        for (const fragment of fragments) {
            const [, , , , fx, fy] = Util.transform(viewport.transform, fragment.transform);
            const dx = fx - x;
            const dy = fy - y;
            if (Math.abs(dx * baseline[1] - dy * baseline[0]) > height * 0.5) singleLine = false;
            width = Math.max(width, dx * baseline[0] + dy * baseline[1] + fragment.width);
        }
        const text = fragments
            .map((item, index) => item.str.replace(/[\u0000-\u001f\u007f-\u009f]/g, '') + (index < fragments.length - 1 && item.hasEOL ? ' ' : ''))
            .join('').trim();
        if (!singleLine || !text || text.includes('\ufffd') || !Number.isFinite(width)) continue;
        let leading = 0;
        let advance = 0;
        let inkEnd = 0;
        let started = false;
        for (const glyph of sequence) {
            if (typeof glyph === 'number') {
                advance -= glyph * draw.size / 1000;
                continue;
            }
            const glyphWidth = glyph.width * draw.size / 1000;
            const visible = !glyph.isSpace && (glyph.unicode === undefined || Boolean(glyph.unicode.trim()));
            if (visible) {
                if (!started) leading = advance;
                started = true;
                inkEnd = advance + glyphWidth;
            }
            advance += glyphWidth + draw.characterSpace + (glyph.isSpace ? draw.wordSpace : 0);
        }
        if (!started || !Number.isFinite(advance) || !Number.isFinite(inkEnd) || inkEnd <= leading) continue;
        const ascent = (content.styles[first.fontName]?.ascent ?? 0.8) * height;
        const originalName = fontName(source, draw.font);
        runs.push({
            id: draw.id, text, rtl: first.dir === 'rtl',
            left: x + Math.sin(angle) * ascent,
            top: y - Math.cos(angle) * ascent,
            width, height, angle, advance, leading, inkEnd,
            canColor: draw.fill !== null && draw.renderingMode === 0,
            style: { family: 'auto', size: draw.size, color: null, bold: /bold|black|semibold|heavy/i.test(originalName), italic: /italic|oblique/i.test(originalName) },
        });
    }
    return runs;
}

function standardFont(family: FontFamily, style: TextStyle, original: string) {
    const selected = family !== 'auto' ? family : /courier|mono/i.test(original) ? 'mono'
        : /times|serif|roman|georgia|garamond/i.test(original) ? 'serif' : 'sans';
    if (selected === 'serif') {
        return style.bold ? (style.italic ? StandardFonts.TimesRomanBoldItalic : StandardFonts.TimesRomanBold)
            : style.italic ? StandardFonts.TimesRomanItalic : StandardFonts.TimesRoman;
    }
    if (selected === 'mono') {
        return style.bold ? (style.italic ? StandardFonts.CourierBoldOblique : StandardFonts.CourierBold)
            : style.italic ? StandardFonts.CourierOblique : StandardFonts.Courier;
    }
    return style.bold ? (style.italic ? StandardFonts.HelveticaBoldOblique : StandardFonts.HelveticaBold)
        : style.italic ? StandardFonts.HelveticaOblique : StandardFonts.Helvetica;
}

export function createEditorFontLoader(pdf: PDFDocument) {
    const fonts = new Map<string, { font: PDFFont; standard: boolean; charset: Set<number> }>();
    return async (text: string, style: TextStyle, original = '') => {
        const standard = standardFont(style.family, style, original);
        if (!fonts.has(standard)) {
            const font = await pdf.embedFont(standard);
            fonts.set(standard, { font, standard: true, charset: new Set(font.getCharacterSet()) });
        }
        const candidate = fonts.get(standard)!;
        const characters = [...text].map(character => character.codePointAt(0)!);
        if (characters.every(character => candidate.charset.has(character))) return candidate;
        const key = style.bold ? 'arabic-bold' : 'arabic';
        if (!fonts.has(key)) {
            const [{ default: fontkit }, { default: url }] = await Promise.all([
                import('@pdf-lib/fontkit'),
                style.bold
                    ? import('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf?url')
                    : import('dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url'),
            ]);
            pdf.registerFontkit(fontkit);
            const response = await fetch(url);
            if (!response.ok) throw new Error('تعذّر تحميل الخط العربي.');
            const font = await pdf.embedFont(await response.arrayBuffer(), { subset: true });
            fonts.set(key, { font, standard: false, charset: new Set(font.getCharacterSet()) });
        }
        const fallback = fonts.get(key)!;
        if (characters.some(character => !fallback.charset.has(character))) {
            throw new Error('بعض الأحرف في النص الجديد غير مدعومة بالخطوط المتاحة.');
        }
        return fallback;
    };
}

type FontLoader = ReturnType<typeof createEditorFontLoader>;

export async function rewriteNativeText(
    pdf: PDFDocument, page: PDFPage, changes: TextChange[], loadFont: FontLoader, obsolete: Set<PDFRef>,
) {
    if (!changes.length) return;
    const { streams, targets } = pageContent(pdf, page);
    const patches = new Map<number, { start: number; end: number; value: string }[]>();
    const resources = page.node.Resources()?.clone(pdf.context) ?? pdf.context.obj({});
    const fonts = resources.lookupMaybe(PDFName.Font, PDFDict)?.clone(pdf.context) ?? pdf.context.obj({});
    resources.set(PDFName.Font, fonts);
    page.node.set(PDFName.Resources, resources);
    const assigned = new Map<PDFFont, PDFName>();
    const removedDescriptions = new Set<string>();

    for (const change of changes) {
        const draw = targets[change.run.id];
        if (!draw || !Number.isFinite(change.run.advance)) throw new Error('تعذّر تحديد موضع النص الأصلي.');
        for (const entry of draw.actualText) {
            const id = `${entry.stream}:${entry.start}`;
            if (removedDescriptions.has(id)) continue;
            removedDescriptions.add(id);
            const descriptions = patches.get(entry.stream) ?? [];
            descriptions.push({ start: entry.start, end: entry.end, value: '' });
            patches.set(entry.stream, descriptions);
        }
        const content = [draw.lineAdvance.trimEnd()];
        const distance = (advance: number, size: number) => `[${pdfNumber(-advance * 1000 / size)}] TJ`;
        let moved = 0;
        const replacement = change.text.replace(/[\r\n\t]/g, ' ').replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
        if (replacement) {
            const { font, standard } = await loadFont(replacement, change.style, fontName(page, draw.font));
            let name = assigned.get(font);
            if (!name) {
                name = fonts.uniqueKey('GalaxyEdit');
                fonts.set(name, font.ref);
                assigned.set(font, name);
            }
            const size = change.style.size;
            const width = standard ? [...replacement].reduce((sum, character) => sum + font.widthOfTextAtSize(character, size), 0)
                : font.widthOfTextAtSize(replacement, size);
            const available = change.run.inkEnd - change.run.leading;
            const fit = width > 0 ? Math.min(1, available / width) : 1;
            const shift = change.run.leading + (change.run.rtl ? available - width * fit : 0);
            if (shift) content.push(distance(shift, draw.size));
            const color = change.style.color && change.run.canColor && draw.fill ? change.style.color : null;
            if (color) content.push(color.match(/[0-9a-f]{2}/gi)!.map(channel => pdfNumber(parseInt(channel, 16) / 255)).join(' ') + ' rg');
            content.push(
                `${name.asString()} ${pdfNumber(size)} Tf 0 Tc 0 Tw ${pdfNumber(draw.horizontalScale * fit)} Tz`,
                `/Span << /ActualText ${PDFHexString.fromText(replacement)} >> BDC`,
                `${font.encodeText(replacement).toString()} Tj`,
                'EMC',
                `${draw.font} ${pdfNumber(draw.size)} Tf ${pdfNumber(draw.characterSpace)} Tc ${pdfNumber(draw.wordSpace)} Tw ${pdfNumber(draw.horizontalScale)} Tz`,
            );
            if (color) content.push(draw.fill!);
            moved = shift + width * fit;
        }
        if (Math.abs(change.run.advance - moved) > 0.000_001) content.push(distance(change.run.advance - moved, draw.size));
        const stream = patches.get(draw.stream) ?? [];
        stream.push({ start: draw.start, end: draw.end, value: content.filter(Boolean).join('\n') + '\n' });
        patches.set(draw.stream, stream);
    }
    rewritePageStreams(pdf, page, streams, patches, obsolete);
}
