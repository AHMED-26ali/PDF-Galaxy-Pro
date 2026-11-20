import { renderScan, resolveProfile, type Corners, type ScanSettings } from './scanImage';

type ScanRequest = {
    image: ImageData;
    corners: Corners;
    settings: ScanSettings;
    suggested?: Corners;
};

self.onmessage = ({ data }: MessageEvent<ScanRequest>) => {
    try {
        const profile = resolveProfile(data.image, data.settings.profile);
        const crop = profile === 'document' && data.settings.straighten ? data.suggested : undefined;
        const image = renderScan(data.image, crop ?? data.corners, { ...data.settings, profile }, !!crop);
        self.postMessage({ image, profile }, { transfer: [image.data.buffer] });
    } catch {
        self.postMessage({ error: true });
    }
};
