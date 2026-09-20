import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg';

import {
  createSegmentPlan,
  outputFileName,
  toFfmpegSeconds,
  type SegmentWindow,
} from './segment-plan';

export type SplitSettings = {
  sourceDurationSeconds: number;
  segmentDurationSeconds: number;
  overlapSeconds: number;
  marker: string;
};

export type OutputSegment = SegmentWindow & {
  fileName: string;
  blob: Blob;
};

export type SplitProgress = {
  completed: number;
  total: number;
  active: SegmentWindow;
};

export class SplitCancelledError extends Error {
  constructor() {
    super('已取消分割。');
    this.name = 'SplitCancelledError';
  }
}

export class LocalAudioSplitter {
  private ffmpeg: FFmpeg | null = null;
  private loading: Promise<FFmpeg> | null = null;
  private generation = 0;

  async split(
    file: File,
    settings: SplitSettings,
    onProgress: (progress: SplitProgress) => void,
  ): Promise<OutputSegment[]> {
    const generation = this.generation;
    let ffmpeg: FFmpeg | null = null;
    let inputDirectory: string | null = null;

    try {
      ffmpeg = await this.getFfmpeg(generation);
      this.throwIfCancelled(generation);

      const plan = createSegmentPlan(settings);
      const jobId = crypto.randomUUID().replaceAll('-', '');
      inputDirectory = `/input-${jobId}`;
      const inputName = `source${fileExtension(file.name)}`;
      const inputPath = `${inputDirectory}/${inputName}`;
      const results: OutputSegment[] = [];

      await ffmpeg.createDir(inputDirectory);
      await ffmpeg.mount(
        FFFSType.WORKERFS,
        { blobs: [{ name: inputName, data: file }] },
        inputDirectory,
      );

      for (const window of plan) {
        this.throwIfCancelled(generation);
        const outputPath = `/segment-${jobId}-${window.index}.ogg`;
        const exitCode = await ffmpeg.exec([
          '-ss',
          toFfmpegSeconds(window.startSeconds),
          '-i',
          inputPath,
          '-t',
          toFfmpegSeconds(window.durationSeconds),
          '-map',
          '0:a:0',
          '-vn',
          '-sn',
          '-dn',
          '-ar',
          '16000',
          '-c:a',
          'libopus',
          '-application',
          'voip',
          '-b:a',
          '16k',
          '-vbr',
          'off',
          '-frame_duration',
          '20',
          '-map_metadata',
          '-1',
          '-bitexact',
          '-fflags',
          '+bitexact',
          '-f',
          'ogg',
          outputPath,
        ]);
        this.throwIfCancelled(generation);
        if (exitCode !== 0) {
          throw new Error(`第 ${window.index} 片编码失败（FFmpeg ${exitCode}）。`);
        }

        const data = await ffmpeg.readFile(outputPath);
        if (!(data instanceof Uint8Array)) {
          throw new Error(`第 ${window.index} 片读取失败。`);
        }
        const outputBuffer = new ArrayBuffer(data.byteLength);
        new Uint8Array(outputBuffer).set(data);
        results.push({
          ...window,
          fileName: outputFileName(file.name, window.index, settings.marker),
          blob: new Blob([outputBuffer], { type: 'audio/ogg' }),
        });
        await ffmpeg.deleteFile(outputPath);
        onProgress({
          completed: results.length,
          total: plan.length,
          active: window,
        });
      }
      return results;
    } catch (error) {
      if (error instanceof SplitCancelledError || this.isCancelled(generation)) {
        throw new SplitCancelledError();
      }
      throw error;
    } finally {
      if (ffmpeg && inputDirectory) {
        await this.cleanUpInput(ffmpeg, inputDirectory);
      }
    }
  }

  cancel(): void {
    this.generation += 1;
    const ffmpeg = this.ffmpeg;
    this.ffmpeg = null;
    this.loading = null;
    ffmpeg?.terminate();
  }

  private async getFfmpeg(generation: number): Promise<FFmpeg> {
    if (this.ffmpeg?.loaded) {
      this.throwIfCancelled(generation);
      return this.ffmpeg;
    }
    if (this.loading) {
      return this.loading;
    }

    const ffmpeg = new FFmpeg();
    this.ffmpeg = ffmpeg;
    const coreBaseUrl = new URL(
      `${import.meta.env.BASE_URL}ffmpeg/`,
      window.location.origin,
    ).toString();
    const loading = (async () => {
      this.throwIfCancelled(generation);
      await ffmpeg.load({
        coreURL: `${coreBaseUrl}ffmpeg-core.js`,
        wasmURL: `${coreBaseUrl}ffmpeg-core.wasm`,
      });
      this.throwIfCancelled(generation);
      if (this.ffmpeg !== ffmpeg) {
        ffmpeg.terminate();
        throw new SplitCancelledError();
      }
      return ffmpeg;
    })();
    this.loading = loading;

    try {
      return await loading;
    } catch (error) {
      if (this.ffmpeg === ffmpeg) {
        this.ffmpeg = null;
      }
      if (this.isCancelled(generation)) {
        ffmpeg.terminate();
        throw new SplitCancelledError();
      }
      throw error;
    } finally {
      if (this.loading === loading) {
        this.loading = null;
      }
    }
  }

  private isCancelled(generation: number): boolean {
    return generation !== this.generation;
  }

  private throwIfCancelled(generation: number): void {
    if (this.isCancelled(generation)) {
      throw new SplitCancelledError();
    }
  }

  private async cleanUpInput(
    ffmpeg: FFmpeg,
    inputDirectory: string,
  ): Promise<void> {
    try {
      await ffmpeg.unmount(inputDirectory);
      await ffmpeg.deleteDir(inputDirectory);
    } catch {
      // Cancellation terminates the worker before its virtual file system can unmount.
    }
  }
}

function fileExtension(fileName: string): string {
  const extension = fileName.match(/(\.[a-z0-9]{1,10})$/i)?.[1];
  return extension?.toLowerCase() ?? '.audio';
}
