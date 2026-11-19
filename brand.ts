import type { Tool } from './types';
import { toolSearchPages } from './toolSearch';

export const brandName = 'PDFix';
export const homeTitle = `${brandName} | تعديل ودمج وضغط وتحويل PDF أونلاين`;
export const homeDescription = 'أدوات PDF مجانية بالعربي. عدّل النصوص، ادمج واضغط الملفات، حوّل PDF إلى Word أو صور، واستخرج النصوص بالـOCR داخل المتصفح.';
export const siteUrl = 'https://pdfix-tools.vercel.app/';
export const brandIcon = '/pdfix-mark.svg';

export function toolPath(id: string): string {
    return `/tools/${encodeURIComponent(id)}`;
}

export function updatePageMetadata(tool?: Tool) {
    const searchPage = tool ? toolSearchPages[tool.id] : undefined;
    const title = tool ? `${searchPage?.title ?? tool.title} | ${brandName}` : homeTitle;
    const description = searchPage?.description ?? tool?.description ?? homeDescription;
    const url = new URL(tool ? toolPath(tool.id) : '/', siteUrl);
    document.title = title;
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', url.href);
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    for (const property of ['og:title', 'twitter:title']) {
        document.querySelector(`meta[property="${property}"], meta[name="${property}"]`)?.setAttribute('content', title);
    }
    for (const property of ['og:description', 'twitter:description']) {
        document.querySelector(`meta[property="${property}"], meta[name="${property}"]`)?.setAttribute('content', description);
    }
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', url.href);
}
