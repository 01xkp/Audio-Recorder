import JSZip from 'jszip';

import { zipFileName } from './segment-plan';
import type { OutputSegment, SplitSettings } from './audio-splitter';

export function downloadSegment(segment: OutputSegment): void {
  downloadBlob(segment.blob, segment.fileName);
}

export async function downloadArchive({
  sourceName,
  settings,
  segments,
}: {
  sourceName: string;
  settings: SplitSettings;
  segments: OutputSegment[];
}): Promise<void> {
  const zip = new JSZip();
  for (const segment of segments) {
    zip.file(segment.fileName, segment.blob);
  }
  zip.file(
    'manifest.json',
    JSON.stringify(
      {
        sourceName,
        output: {
          codec: 'opus',
          container: 'ogg',
          inputSampleRateHz: 16000,
          bitrateBitsPerSecond: 16000,
          frameDurationMilliseconds: 20,
        },
        settings: {
          segmentDurationSeconds: settings.segmentDurationSeconds,
          overlapSeconds: settings.overlapSeconds,
          marker: settings.marker.trim() || null,
        },
        segments: segments.map((segment) => ({
          index: segment.index,
          fileName: segment.fileName,
          startSeconds: segment.startSeconds,
          endSeconds: segment.endSeconds,
          durationSeconds: segment.durationSeconds,
          previousOverlapSeconds: segment.previousOverlapSeconds,
          sizeBytes: segment.blob.size,
        })),
      },
      null,
      2,
    ),
  );
  const archive = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  downloadBlob(archive, zipFileName(sourceName, settings.marker));
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
