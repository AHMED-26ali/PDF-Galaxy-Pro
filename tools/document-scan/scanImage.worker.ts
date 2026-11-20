import { renderScan, type Corners, type ScanSettings } from './scanImage';

self.onmessage = ({ data }: MessageEvent<{ image: ImageData; corners: Corners; settings: ScanSettings; suggestedCrop: boolean }>) => {
    try {
        const image = renderScan(data.image, data.corners, data.settings, data.suggestedCrop);
        self.postMessage({ image }, { transfer: [image.data.buffer] });
    } catch {
        self.postMessage({ error: true });
    }
};
