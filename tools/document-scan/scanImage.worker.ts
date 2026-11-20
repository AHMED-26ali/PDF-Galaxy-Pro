import { renderScan, type Corners, type ScanMode } from './scanImage';

self.onmessage = ({ data }: MessageEvent<{ image: ImageData; corners: Corners; mode: ScanMode; straighten: boolean }>) => {
    try {
        const image = renderScan(data.image, data.corners, data.mode, data.straighten);
        self.postMessage({ image }, { transfer: [image.data.buffer] });
    } catch {
        self.postMessage({ error: true });
    }
};
