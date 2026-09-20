export type SegmentWindow = {
  index: number;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  previousOverlapSeconds: number;
};

export type SegmentPlanOptions = {
  sourceDurationSeconds: number;
  segmentDurationSeconds: number;
  overlapSeconds: number;
};

const epsilon = 0.000001;

export function createSegmentPlan({
  sourceDurationSeconds,
  segmentDurationSeconds,
  overlapSeconds,
}: SegmentPlanOptions): SegmentWindow[] {
  if (!Number.isFinite(sourceDurationSeconds) || sourceDurationSeconds <= 0) {
    throw new Error('录音时长无效。');
  }
  if (!Number.isFinite(segmentDurationSeconds) || segmentDurationSeconds <= 0) {
    throw new Error('分片时长必须大于 0 秒。');
  }
  if (!Number.isFinite(overlapSeconds) || overlapSeconds < 0) {
    throw new Error('重叠时长不能小于 0 秒。');
  }
  if (overlapSeconds >= segmentDurationSeconds) {
    throw new Error('重叠时长必须小于分片时长。');
  }

  const strideSeconds = segmentDurationSeconds - overlapSeconds;
  const windows: SegmentWindow[] = [];

  for (
    let startSeconds = 0;
    startSeconds < sourceDurationSeconds - epsilon;
    startSeconds += strideSeconds
  ) {
    const durationSeconds = Math.min(
      segmentDurationSeconds,
      sourceDurationSeconds - startSeconds,
    );
    windows.push({
      index: windows.length + 1,
      startSeconds: roundSeconds(startSeconds),
      endSeconds: roundSeconds(startSeconds + durationSeconds),
      durationSeconds: roundSeconds(durationSeconds),
      previousOverlapSeconds: windows.length === 0 ? 0 : overlapSeconds,
    });
  }

  return windows;
}

export function outputFileName(
  sourceName: string,
  index: number,
  marker: string,
): string {
  const stem = safeName(removeExtension(sourceName)) || 'recording';
  const safeMarker = safeName(marker.trim());
  const markerPart = safeMarker ? `_${safeMarker}` : '';
  return `${stem}${markerPart}_${index}.ogg`;
}

export function zipFileName(sourceName: string, marker: string): string {
  const stem = safeName(removeExtension(sourceName)) || 'recording';
  const safeMarker = safeName(marker.trim());
  return `${stem}${safeMarker ? `_${safeMarker}` : ''}_segments.zip`;
}

export function toFfmpegSeconds(value: number): string {
  return roundSeconds(value).toFixed(6);
}

export function formatClock(seconds: number): string {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainder = totalSeconds % 60;
  const paddedMinutes = String(minutes).padStart(2, '0');
  const paddedSeconds = String(remainder).padStart(2, '0');
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${paddedMinutes}:${paddedSeconds}`
    : `${paddedMinutes}:${paddedSeconds}`;
}

export function formatByteSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = size / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function removeExtension(name: string): string {
  const dotIndex = name.lastIndexOf('.');
  return dotIndex > 0 ? name.slice(0, dotIndex) : name;
}

function safeName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

function roundSeconds(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
