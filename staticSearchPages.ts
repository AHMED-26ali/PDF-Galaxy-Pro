import type { Plugin } from 'vite';
import { brandName, homeDescription, siteUrl, toolPath } from './brand';
import { toolSearchPages } from './toolSearch';

function escapeHtml(value: string): string {
    const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
    return value.replace(/[&<>"]/g, character => entities[character]);
}

function fallbackPage(title: string, description: string, links: string): string {
    return `<main class="mx-auto max-w-5xl space-y-4 px-4 py-8" dir="rtl">
        <h1 class="text-2xl font-bold">${escapeHtml(title)}</h1>
        <p>${escapeHtml(description)}</p>
        ${links}
    </main>`;
}

function withFallback(html: string, content: string): string {
    const root = '<div id="root"></div>';
    if (!html.includes(root)) throw new Error('The PDFix root placeholder is missing.');
    return html.replace(root, () => `<div id="root">${content}</div>`);
}

function updateToolHead(html: string, id: string, title: string, description: string): string {
    const canonical = new URL(toolPath(id), siteUrl).href;
    const escapedTitle = escapeHtml(`${title} | ${brandName}`);
    const escapedDescription = escapeHtml(description);
    const escapedCanonical = escapeHtml(canonical);

    return html
        .replace(/<title>[^<]*<\/title>/, () => `<title>${escapedTitle}</title>`)
        .replace(/(<link rel="canonical" href=")[^"]+/, (_, prefix: string) => prefix + escapedCanonical)
        .replace(/(<meta (?:property|name)="(?:og|twitter):title" content=")[^"]+/g, (_, prefix: string) => prefix + escapedTitle)
        .replace(/(<meta (?:property|name)="(?:(?:og|twitter):)?description" content=")[^"]+/g, (_, prefix: string) => prefix + escapedDescription)
        .replace(/(<meta property="og:url" content=")[^"]+/, (_, prefix: string) => prefix + escapedCanonical)
        // The WebSite and site-wide WebApplication descriptions belong to the homepage.
        .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
}

export function staticSearchPages(): Plugin {
    return {
        name: 'pdfix-static-search-pages',
        generateBundle: {
            order: 'post',
            handler(_options, bundle) {
                const index = bundle['index.html'];
                if (index?.type !== 'asset' || typeof index.source !== 'string') {
                    throw new Error('The built PDFix homepage was not found.');
                }
                const html = index.source;
                const tools = Object.entries(toolSearchPages);
                const catalog = tools.map(([id, page]) =>
                    `<li><a class="text-blue-800 underline" href="${toolPath(id)}">${escapeHtml(page.title)}</a></li>`,
                ).join('\n');

                index.source = withFallback(html, fallbackPage('أدوات PDF أونلاين بالعربي', homeDescription, `<ul class="grid list-disc gap-2 ps-5 sm:grid-cols-2">${catalog}</ul>
                    <p><a class="underline" href="/guides">دليل استخدام الأدوات</a> · <a class="underline" href="/privacy">سياسة الخصوصية</a></p>`));

                for (const [id, { title, description }] of tools) {
                    const article = fallbackPage(title, description, `<p><a class="text-blue-800 underline" href="/guides#${id}">دليل الاستخدام والمثال العملي</a></p>
                        <p><a class="underline" href="/">جميع الأدوات</a> · <a class="underline" href="/privacy">سياسة الخصوصية</a></p>`);
                    this.emitFile({
                        type: 'asset',
                        fileName: `tools/${id}.html`,
                        source: withFallback(updateToolHead(html, id, title, description), article),
                    });
                }
            },
        },
    };
}
