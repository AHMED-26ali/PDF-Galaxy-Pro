import type { Tool } from './types';

export const brandName = 'PDFix';
export const homeTitle = `${brandName} | تعديل ودمج وضغط وتحويل PDF أونلاين`;
export const homeDescription = 'أدوات PDF مجانية بالعربي. عدّل النصوص، ادمج واضغط الملفات، حوّل PDF إلى Word أو صور، واستخرج النصوص بالـOCR داخل المتصفح.';
export const siteUrl = 'https://pdf-galaxy-pro.vercel.app/';
export const brandIcon = '/pdfix-mark.svg';

export function updatePageMetadata(tool?: Tool) {
    const title = tool ? `${tool.title} | ${brandName}` : homeTitle;
    const description = tool?.description ?? homeDescription;
    const url = new URL(siteUrl);
    if (tool) url.searchParams.set('tool', tool.id);
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
