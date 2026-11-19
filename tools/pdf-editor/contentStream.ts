import { PDFArray, PDFDict, PDFName, PDFRawStream, PDFRef, PDFStream, decodePDFRawStream, type PDFDocument, type PDFObject, type PDFPage } from 'pdf-lib';

type Token = { text: string; start: number; end: number };
type ContentPosition = { stream: number; start: number; end: number };

export type TextDraw = ContentPosition & {
    id: number;
    actualText: ContentPosition[];
    font: string;
    size: number;
    characterSpace: number;
    wordSpace: number;
    horizontalScale: number;
    renderingMode: number;
    lineAdvance: string;
    fill: string | null;
};

type TextState = {
    font: string;
    size: number;
    characterSpace: number;
    wordSpace: number;
    horizontalScale: number;
    renderingMode: number;
    fill: string | null;
};
type PageStreams = { original: PDFObject | undefined; parts: PDFObject[]; sources: string[] };

function isSpace(character: string) {
    return character !== '' && '\0\t\n\f\r '.includes(character);
}

function isDelimiter(character: string) {
    return !character || isSpace(character) || '()<>[]{}/%'.includes(character);
}

function ignoreSpace(source: string, index: number) {
    while (index < source.length) {
        if (isSpace(source[index])) index++;
        else if (source[index] === '%') {
            while (index < source.length && source[index] !== '\n' && source[index] !== '\r') index++;
        } else break;
    }
    return index;
}

function tokenEnd(source: string, start: number, depth = 0): number {
    if (depth > 40) throw new Error('PDF content objects are nested too deeply');
    const first = source[start];
    let end = start + 1;
    if (first === '(') {
        let open = 1;
        while (end < source.length && open) {
            const current = source[end++];
            if (current === '\\') end++;
            else if (current === '(') open++;
            else if (current === ')') open--;
        }
        if (open) throw new Error('Unterminated PDF string');
    } else if (first === '[' || (first === '<' && source[end] === '<')) {
        const closing = first === '[' ? ']' : '>>';
        if (first === '<') end++;
        while (end < source.length) {
            end = ignoreSpace(source, end);
            if (source.startsWith(closing, end)) return end + closing.length;
            if (end >= source.length) break;
            end = tokenEnd(source, end, depth + 1);
        }
        throw new Error('Unterminated PDF object');
    } else if (first === '<') {
        const closing = source.indexOf('>', end);
        if (closing < 0) throw new Error('Unterminated PDF hex string');
        end = closing + 1;
    } else {
        while (!isDelimiter(source[end])) end++;
    }
    return end;
}

function actualTextEntry(source: string, dictionary: Token | undefined, stream: number): ContentPosition | null {
    if (!dictionary?.text.startsWith('<<')) return null;
    let position = dictionary.start + 2;
    while ((position = ignoreSpace(source, position)) < dictionary.end - 2) {
        const start = position;
        const keyEnd = tokenEnd(source, position);
        const key = source.slice(position, keyEnd);
        const valueStart = ignoreSpace(source, keyEnd);
        if (!key.startsWith('/') || valueStart >= dictionary.end - 2) return null;
        position = tokenEnd(source, valueStart);
        // Skip the remaining tokens of an indirect dictionary value, if present.
        const referenceTail = source.slice(position, dictionary.end - 2).match(/^\s+\d+\s+R(?=[\s/>])/);
        if (/^\d+$/.test(source.slice(valueStart, position)) && referenceTail) position += referenceTail[0].length;
        if (PDFName.of(key.slice(1)) === PDFName.of('ActualText')) return { stream, start, end: position };
    }
    return null;
}

export function listTextDraws(sources: string[], hasGraphicsStateFont: (name: string) => boolean): TextDraw[] {
    const targets: TextDraw[] = [];
    let state: TextState = { font: '', size: 0, characterSpace: 0, wordSpace: 0, horizontalScale: 100, renderingMode: 0, fill: '0 g' };
    const stack: TextState[] = [];
    const markedText: (ContentPosition | null)[] = [];
    let withinText = false;
    for (const [stream, source] of sources.entries()) {
        let index = 0;
        let operands: Token[] = [];
        while ((index = ignoreSpace(source, index)) < source.length) {
            const end = tokenEnd(source, index);
            const text = source.slice(index, end);
            const start = index;
            index = end;
            if (/^[\/\[(<]/.test(text) || /^[-+]?\d*\.?\d+$/.test(text) || ['true', 'false', 'null'].includes(text)) {
                operands.push({ text, start, end });
                continue;
            }

            const args = operands;
            operands = [];
            const number = (i: number) => Number(args[i]?.text);
            if (text === 'BI') throw new Error('Inline images prevent reliable stream indexing');
            if (text === 'q') stack.push({ ...state });
            else if (text === 'Q') state = stack.pop() ?? state;
            else if (text === 'BDC') markedText.push(actualTextEntry(source, args[1], stream));
            else if (text === 'BMC') markedText.push(null);
            else if (text === 'EMC') markedText.pop();
            else if (text === 'BT') withinText = true;
            else if (text === 'ET') withinText = false;
            else if (text === 'Tf') {
                state.font = args[0]?.text ?? '';
                state.size = number(1);
            } else if (text === 'gs' && hasGraphicsStateFont(args[0]?.text ?? '')) state.font = '';
            else if (text === 'Tc') state.characterSpace = number(0);
            else if (text === 'Tw') state.wordSpace = number(0);
            else if (text === 'Tz') state.horizontalScale = number(0);
            else if (text === 'Tr') state.renderingMode = number(0);
            else if (['g', 'rg', 'k'].includes(text)) state.fill = args.map(arg => arg.text).join(' ') + ' ' + text;
            else if (['cs', 'sc', 'scn'].includes(text)) state.fill = null;
            else if (['Tj', 'TJ', "'", '"'].includes(text)) {
                if (text === '"') {
                    state.wordSpace = number(0);
                    state.characterSpace = number(1);
                }
                const textOperand = args.at(-1)?.text ?? '';
                if (!withinText || !state.font.startsWith('/') || state.size <= 0 || state.horizontalScale <= 0
                    || ![0, 1, 2].includes(state.renderingMode) || !/^[\[(<]/.test(textOperand)
                    || ![state.size, state.horizontalScale, state.characterSpace, state.wordSpace].every(Number.isFinite)) continue;
                const lineAdvance = text === '"' ? `${state.wordSpace} Tw ${state.characterSpace} Tc T*\n` : text === "'" ? 'T*\n' : '';
                targets.push({ id: targets.length, stream, start: args[0].start, end, lineAdvance, actualText: markedText.filter(entry => entry !== null), ...state });
            }
        }
    }
    return targets;
}

function latinString(bytes: Uint8Array) {
    let text = '';
    for (let index = 0; index < bytes.length; index += 8192) {
        text += String.fromCharCode(...bytes.subarray(index, index + 8192));
    }
    return text;
}

export function getPageStreams(pdf: PDFDocument, page: PDFPage): PageStreams {
    const original = page.node.get(PDFName.Contents);
    const object = pdf.context.lookup(original);
    let parts: PDFObject[] = [];
    if (object instanceof PDFArray) {
        parts = Array.from({ length: object.size() }, (_, index) => object.get(index));
    } else if (original) parts = [original];
    const sources = parts.map(part => {
        const stream = pdf.context.lookup(part);
        if (!(stream instanceof PDFRawStream)) throw new Error('Unsupported PDF page stream');
        return latinString(decodePDFRawStream(stream).decode());
    });
    return { original, parts, sources };
}

export function rewritePageStreams(
    pdf: PDFDocument, page: PDFPage, streams: PageStreams,
    replacements: Map<number, { start: number; end: number; value: string }[]>,
    obsolete: Set<PDFRef>,
) {
    const parts = streams.parts.map((part, index) => {
        const changes = replacements.get(index);
        if (!changes?.length) return part;
        let source = streams.sources[index];
        for (const change of [...changes].sort((a, b) => b.start - a.start)) {
            source = source.slice(0, change.start) + change.value + source.slice(change.end);
        }
        if (part instanceof PDFRef) obsolete.add(part);
        return pdf.context.register(pdf.context.flateStream(Uint8Array.from(source, char => char.charCodeAt(0))));
    });
    if (streams.original instanceof PDFRef && pdf.context.lookup(streams.original) instanceof PDFArray) obsolete.add(streams.original);
    page.node.set(PDFName.Contents, pdf.context.obj(parts));
}

export function pageContent(pdf: PDFDocument, page: PDFPage) {
    const streams = getPageStreams(pdf, page);
    const states = page.node.Resources()?.lookupMaybe(PDFName.ExtGState, PDFDict);
    const targets = listTextDraws(streams.sources, name => {
        const state = states?.lookupMaybe(PDFName.of(name.slice(1)), PDFDict);
        return Boolean(state?.get(PDFName.Font));
    });
    return { streams, targets };
}

export function removeObsoleteStreams(pdf: PDFDocument, obsolete: Set<PDFRef>) {
    if (!obsolete.size) return;
    const referenced = new Set<PDFRef>();
    const seen = new WeakSet<PDFObject>();
    function visit(object: PDFObject) {
        if (object instanceof PDFRef) {
            if (obsolete.has(object) && !referenced.has(object)) {
                referenced.add(object);
                const target = pdf.context.lookup(object);
                if (target) visit(target);
            }
            return;
        }
        if (seen.has(object)) return;
        seen.add(object);
        if (object instanceof PDFArray) {
            for (let index = 0; index < object.size(); index++) visit(object.get(index));
        } else if (object instanceof PDFDict || object instanceof PDFStream) {
            const dictionary = object instanceof PDFStream ? object.dict : object;
            for (const [, value] of dictionary.entries()) visit(value);
        }
    }
    for (const [reference, object] of pdf.context.enumerateIndirectObjects()) {
        if (!obsolete.has(reference)) visit(object);
    }
    for (const reference of obsolete) {
        if (!referenced.has(reference)) pdf.context.delete(reference);
    }
}
