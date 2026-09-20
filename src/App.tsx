import {
  Archive,
  AudioLines,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Download,
  FileAudio,
  FileDown,
  Info,
  LoaderCircle,
  Scissors,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Trash2,
  Upload,
  Waves,
  X,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from 'react';

import {
  LocalAudioSplitter,
  SplitCancelledError,
  type OutputSegment,
  type SplitSettings,
} from './lib/audio-splitter';
import { downloadArchive, downloadSegment } from './lib/downloads';
import {
  createSegmentPlan,
  formatByteSize,
  formatClock,
  outputFileName,
  type SegmentWindow,
} from './lib/segment-plan';

type SourceAudio = {
  file: File;
  durationSeconds: number;
};

type ProgressState = {
  completed: number;
  total: number;
  active: SegmentWindow | null;
};

const maxInputSize = 2 * 1024 * 1024 * 1024;
const acceptedExtensions = ['wav', 'mp3', 'm4a', 'ogg', 'opus', 'flac', 'aac'];

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const splitterRef = useRef<LocalAudioSplitter | null>(null);
  const selectionGenerationRef = useRef(0);
  const allSegmentsInputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<SourceAudio | null>(null);
  const [segmentDurationInput, setSegmentDurationInput] = useState('300');
  const [overlapInput, setOverlapInput] = useState('0');
  const [marker, setMarker] = useState('');
  const [segments, setSegments] = useState<OutputSegment[]>([]);
  const [selectedSegmentNames, setSelectedSegmentNames] = useState<Set<string>>(
    () => new Set(),
  );
  const [isResultsExpanded, setIsResultsExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [progress, setProgress] = useState<ProgressState>({
    completed: 0,
    total: 0,
    active: null,
  });
  const [message, setMessage] = useState('选择一条录音开始。');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => splitterRef.current?.cancel();
  }, []);

  const configuredSettings = useMemo(() => {
    const segmentDurationSeconds = Number(segmentDurationInput);
    const overlapSeconds = Number(overlapInput);
    if (!Number.isFinite(segmentDurationSeconds) || segmentDurationSeconds <= 0) {
      return { settings: null, error: '分片时长必须大于 0 秒。' };
    }
    if (!Number.isFinite(overlapSeconds) || overlapSeconds < 0) {
      return { settings: null, error: '重叠时长不能小于 0 秒。' };
    }
    if (overlapSeconds >= segmentDurationSeconds) {
      return { settings: null, error: '重叠时长必须小于分片时长。' };
    }
    return {
      settings: {
        segmentDurationSeconds,
        overlapSeconds,
        marker,
      },
      error: null,
    };
  }, [marker, overlapInput, segmentDurationInput]);

  const planPreview = useMemo(() => {
    if (!source || !configuredSettings.settings) {
      return [];
    }
    return createSegmentPlan({
      sourceDurationSeconds: source.durationSeconds,
      ...configuredSettings.settings,
    });
  }, [configuredSettings.settings, source]);

  const progressPercent =
    progress.total === 0 ? 0 : Math.round((progress.completed / progress.total) * 100);
  const totalOutputBytes = segments.reduce((total, segment) => total + segment.blob.size, 0);
  const selectedSegmentCount = segments.filter((segment) =>
    selectedSegmentNames.has(segment.fileName),
  ).length;
  const allSegmentsSelected =
    segments.length > 0 && selectedSegmentCount === segments.length;

  useEffect(() => {
    if (allSegmentsInputRef.current) {
      allSegmentsInputRef.current.indeterminate =
        selectedSegmentCount > 0 && !allSegmentsSelected;
    }
  }, [allSegmentsSelected, selectedSegmentCount]);

  async function selectFile(file: File): Promise<void> {
    if (isProcessing) {
      return;
    }
    const selectionGeneration = ++selectionGenerationRef.current;
    setError(null);
    setSegments([]);
    setSelectedSegmentNames(new Set());
    setIsResultsExpanded(false);
    setSource(null);
    if (file.size === 0) {
      setError('无法处理空文件。');
      return;
    }
    if (file.size > maxInputSize) {
      setError('录音超过 2 GB，浏览器本地编码器无法安全处理。');
      return;
    }
    if (!isSupportedAudioFile(file)) {
      setError('请选择 WAV、MP3、M4A、Ogg、Opus、FLAC 或 AAC 录音。');
      return;
    }

    setMessage('正在读取录音信息...');
    try {
      const durationSeconds = await readAudioDuration(file);
      if (selectionGeneration !== selectionGenerationRef.current) {
        return;
      }
      setSource({ file, durationSeconds });
      setMessage('录音已就绪。');
    } catch {
      if (selectionGeneration !== selectionGenerationRef.current) {
        return;
      }
      setError('浏览器无法读取该录音时长，请换用常见音频格式。');
      setMessage('请选择另一条录音。');
    }
  }

  async function handleSplit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!source) {
      setError('请先选择录音。');
      return;
    }
    if (!configuredSettings.settings) {
      setError(configuredSettings.error);
      return;
    }

    const settings: SplitSettings = {
      sourceDurationSeconds: source.durationSeconds,
      ...configuredSettings.settings,
    };
    const plan = createSegmentPlan(settings);
    const splitter = splitterRef.current ?? new LocalAudioSplitter();
    splitterRef.current = splitter;

    setError(null);
    setSegments([]);
    setSelectedSegmentNames(new Set());
    setIsResultsExpanded(false);
    setIsProcessing(true);
    setProgress({ completed: 0, total: plan.length, active: plan[0] ?? null });
    setMessage('正在加载本地音频编码器...');
    try {
      const output = await splitter.split(source.file, settings, (nextProgress) => {
        setProgress(nextProgress);
        setMessage(`正在生成第 ${nextProgress.completed}/${nextProgress.total} 片...`);
      });
      setSegments(output);
      setSelectedSegmentNames(new Set());
      setIsResultsExpanded(false);
      setProgress({ completed: output.length, total: output.length, active: null });
      setMessage(`已生成 ${output.length} 个可下载分片。`);
    } catch (splitError) {
      setSegments([]);
      if (splitError instanceof SplitCancelledError) {
        setMessage('已取消本次分割。');
      } else {
        setError(errorMessage(splitError));
        setMessage('分割未完成。');
      }
    } finally {
      setIsProcessing(false);
    }
  }

  function handleCancel(): void {
    setMessage('正在停止本地编码...');
    splitterRef.current?.cancel();
  }

  async function handleArchiveDownload(): Promise<void> {
    if (!source || !configuredSettings.settings || segments.length === 0) {
      return;
    }
    setIsArchiving(true);
    setError(null);
    try {
      await downloadArchive({
        sourceName: source.file.name,
        settings: {
          sourceDurationSeconds: source.durationSeconds,
          ...configuredSettings.settings,
        },
        segments,
      });
      setMessage('ZIP 下载已开始。');
    } catch (archiveError) {
      setError(errorMessage(archiveError));
    } finally {
      setIsArchiving(false);
    }
  }

  function resetSource(): void {
    if (isProcessing) {
      return;
    }
    selectionGenerationRef.current += 1;
    setSource(null);
    setSegments([]);
    setSelectedSegmentNames(new Set());
    setIsResultsExpanded(false);
    setError(null);
    setProgress({ completed: 0, total: 0, active: null });
    setMessage('选择一条录音开始。');
  }

  function updateSetting(
    setter: (value: string) => void,
    value: string,
  ): void {
    setter(value);
    setSegments([]);
    setSelectedSegmentNames(new Set());
    setIsResultsExpanded(false);
    setError(null);
  }

  function toggleSegmentSelection(fileName: string): void {
    setSelectedSegmentNames((current) => {
      const next = new Set(current);
      if (next.has(fileName)) {
        next.delete(fileName);
      } else {
        next.add(fileName);
      }
      return next;
    });
  }

  function toggleAllSegmentSelection(): void {
    setSelectedSegmentNames(
      allSegmentsSelected ? new Set() : new Set(segments.map((segment) => segment.fileName)),
    );
  }

  function removeSegments(fileNames: Iterable<string>): void {
    const namesToRemove = new Set(fileNames);
    const removedCount = segments.filter((segment) => namesToRemove.has(segment.fileName)).length;
    if (removedCount === 0) {
      return;
    }

    const remainingCount = segments.length - removedCount;
    setSegments((current) =>
      current.filter((segment) => !namesToRemove.has(segment.fileName)),
    );
    setSelectedSegmentNames((current) => {
      const next = new Set(current);
      namesToRemove.forEach((fileName) => next.delete(fileName));
      return next;
    });
    if (remainingCount === 0) {
      setIsResultsExpanded(false);
    }
    setError(null);
    setMessage(`已删除 ${removedCount} 个本地分片。`);
  }

  function removeSelectedSegments(): void {
    if (selectedSegmentCount === 0) {
      return;
    }
    if (!window.confirm(`删除已选的 ${selectedSegmentCount} 个本地分片？`)) {
      return;
    }
    removeSegments(selectedSegmentNames);
  }

  function removeAllSegments(): void {
    if (!window.confirm(`删除 ${segments.length} 个本地分片？`)) {
      return;
    }
    removeSegments(segments.map((segment) => segment.fileName));
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) {
      void selectFile(file);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) {
      void selectFile(file);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <AudioLines size={22} strokeWidth={2.2} />
          </div>
          <div>
            <h1>录音分割台</h1>
            <p>Ogg / Opus 16 kHz</p>
          </div>
        </div>
        <div className="local-status" title="录音仅在当前浏览器内处理，不会上传到服务器">
          <ShieldCheck size={16} aria-hidden="true" />
          <span>浏览器本地处理</span>
        </div>
      </header>

      <section className="workspace" aria-label="录音分割工作台">
        <section className="source-section" aria-labelledby="source-heading">
          <div className="section-heading">
            <span className="section-number">01</span>
            <div>
              <h2 id="source-heading">选择录音</h2>
              <p>支持拖放或从设备选择</p>
            </div>
          </div>

          {!source ? (
            <div
              className={`drop-target ${isDragging ? 'is-dragging' : ''}`}
              onClick={() => inputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <div className="drop-icon" aria-hidden="true">
                <Upload size={24} />
              </div>
              <strong>拖放录音到这里</strong>
              <span>或选择 WAV、MP3、M4A、Ogg、Opus、FLAC、AAC 文件</span>
              <button
                className="secondary-button compact-button"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  inputRef.current?.click();
                }}
              >
                <FileAudio size={17} aria-hidden="true" />
                选择录音
              </button>
            </div>
          ) : (
            <div className="source-summary">
              <div className="source-file-icon" aria-hidden="true">
                <FileAudio size={24} />
              </div>
              <div className="source-details">
                <strong title={source.file.name}>{source.file.name}</strong>
                <span>
                  {formatClock(source.durationSeconds)} <i /> {formatByteSize(source.file.size)}{' '}
                  <i /> {fileTypeLabel(source.file)}
                </span>
              </div>
              <button
                className="icon-button"
                type="button"
                title="移除当前录音"
                aria-label="移除当前录音"
                onClick={resetSource}
                disabled={isProcessing}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
          )}
          <input
            ref={inputRef}
            className="visually-hidden"
            type="file"
            accept="audio/*,.wav,.mp3,.m4a,.ogg,.opus,.flac,.aac"
            aria-hidden="true"
            tabIndex={-1}
            onChange={handleInputChange}
          />
        </section>

        <form className="settings-section" onSubmit={handleSplit}>
          <div className="section-heading">
            <span className="section-number">02</span>
            <div>
              <h2>分割设置</h2>
              <p>每个分片单独编码为可播放文件</p>
            </div>
          </div>

          <div className="settings-grid">
            <label className="field-group">
              <span>每片时长</span>
              <div className="number-field">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.1"
                  step="0.1"
                  value={segmentDurationInput}
                  onChange={(event) =>
                    updateSetting(setSegmentDurationInput, event.target.value)
                  }
                  disabled={isProcessing}
                />
                <em>秒</em>
              </div>
            </label>

            <label className="field-group">
              <span>前片重叠</span>
              <div className="number-field">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  value={overlapInput}
                  onChange={(event) => updateSetting(setOverlapInput, event.target.value)}
                  disabled={isProcessing}
                />
                <em>秒</em>
              </div>
            </label>

            <label className="field-group marker-field">
              <span>文件名标识</span>
              <input
                type="text"
                maxLength={100}
                placeholder="可选，例如 188"
                value={marker}
                onChange={(event) => updateSetting(setMarker, event.target.value)}
                disabled={isProcessing}
              />
            </label>

            <div className="format-group" aria-label="固定输出格式">
              <span>输出格式</span>
              <div>
                <b>Ogg / Opus</b>
                <small>16 kHz · 16 kb/s · 20 ms</small>
              </div>
            </div>
          </div>

          <div className="setting-footer">
            <div className="plan-preview" aria-live="polite">
              <SlidersHorizontal size={17} aria-hidden="true" />
              {source && configuredSettings.settings ? (
                <span>
                  预计 {planPreview.length} 片，步进{' '}
                  {formatClock(
                    configuredSettings.settings.segmentDurationSeconds -
                      configuredSettings.settings.overlapSeconds,
                  )}
                  ，首个文件 {outputFileName(source.file.name, 1, marker)}
                </span>
              ) : (
                <span>选择录音后显示分片计划</span>
              )}
            </div>
            <div className="command-group">
              {isProcessing ? (
                <button className="danger-button" type="button" onClick={handleCancel}>
                  <Square size={16} fill="currentColor" aria-hidden="true" />
                  停止处理
                </button>
              ) : (
                <button
                  className="primary-button"
                  type="submit"
                  disabled={!source || !configuredSettings.settings}
                >
                  <Scissors size={17} aria-hidden="true" />
                  开始分割
                </button>
              )}
            </div>
          </div>
          {configuredSettings.error && source ? (
            <p className="field-error" role="alert">
              <Info size={15} aria-hidden="true" />
              {configuredSettings.error}
            </p>
          ) : null}
        </form>

        <section className="status-section" aria-live="polite">
          <div className="status-line">
            {isProcessing ? (
              <LoaderCircle className="spin" size={18} aria-hidden="true" />
            ) : error ? (
              <Info size={18} aria-hidden="true" />
            ) : segments.length > 0 ? (
              <CheckCircle2 size={18} aria-hidden="true" />
            ) : (
              <Clock3 size={18} aria-hidden="true" />
            )}
            <span>{error ?? message}</span>
          </div>
          {isProcessing ? (
            <div
              className="progress-track"
              role="progressbar"
              aria-label="处理进度"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent}
              aria-valuetext={`${progressPercent}%`}
            >
              <span style={{ width: `${progressPercent}%` }} />
            </div>
          ) : null}
          {isProcessing && progress.active ? (
            <small>
              当前窗口 {formatClock(progress.active.startSeconds)} -{' '}
              {formatClock(progress.active.endSeconds)}
            </small>
          ) : null}
        </section>

        <section className="results-section" aria-labelledby="results-heading">
          <div className="results-header">
            <div className="section-heading">
              <span className="section-number">03</span>
              <div>
                <h2 id="results-heading">分片结果</h2>
                <p>
                  {segments.length > 0
                    ? `${segments.length} 个文件 · ${formatByteSize(totalOutputBytes)}`
                    : '完成分割后显示下载项'}
                </p>
              </div>
            </div>
            {segments.length > 0 ? (
              <div className="result-actions">
                <button
                  className="danger-button"
                  type="button"
                  onClick={removeSelectedSegments}
                  disabled={selectedSegmentCount === 0 || isArchiving}
                >
                  <Trash2 size={17} aria-hidden="true" />
                  删除已选{selectedSegmentCount > 0 ? ` (${selectedSegmentCount})` : ''}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void handleArchiveDownload()}
                  disabled={isArchiving}
                >
                  {isArchiving ? (
                    <LoaderCircle className="spin" size={17} aria-hidden="true" />
                  ) : (
                    <Archive size={17} aria-hidden="true" />
                  )}
                  下载全部 ZIP
                </button>
              </div>
            ) : null}
          </div>

          {segments.length === 0 ? (
            <div className="empty-results">
              <FileDown size={25} aria-hidden="true" />
              <span>尚无可下载分片</span>
            </div>
          ) : (
            <div className="result-group">
              <div className={`result-parent-row ${isResultsExpanded ? 'is-expanded' : ''}`}>
                <button
                  className="result-parent-toggle"
                  type="button"
                  aria-expanded={isResultsExpanded}
                  aria-controls="segment-children"
                  onClick={() => setIsResultsExpanded((current) => !current)}
                >
                  {isResultsExpanded ? (
                    <ChevronDown size={18} aria-hidden="true" />
                  ) : (
                    <ChevronRight size={18} aria-hidden="true" />
                  )}
                  <FileAudio size={19} aria-hidden="true" />
                  <span className="result-parent-details">
                    <strong title={source?.file.name}>{source?.file.name}</strong>
                    <small>
                      {segments.length} 个分片 · {formatByteSize(totalOutputBytes)}
                    </small>
                  </span>
                </button>
                <label className="select-all-control">
                  <input
                    ref={allSegmentsInputRef}
                    type="checkbox"
                    aria-label="全选当前录音的分片"
                    checked={allSegmentsSelected}
                    onChange={toggleAllSegmentSelection}
                    disabled={isArchiving}
                  />
                  <span>全选</span>
                </label>
                <button
                  className="icon-button delete-button"
                  type="button"
                  title="删除当前录音的全部本地分片"
                  aria-label="删除当前录音的全部本地分片"
                  onClick={removeAllSegments}
                  disabled={isArchiving}
                >
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </div>

              {isResultsExpanded ? (
                <div
                  className="result-table"
                  id="segment-children"
                  role="table"
                  aria-label={`${source?.file.name} 的分片下载列表`}
                >
                  <div className="result-head" role="row">
                    <span role="columnheader" className="select-cell">选择</span>
                    <span role="columnheader">序号</span>
                    <span role="columnheader">时间范围</span>
                    <span role="columnheader">时长</span>
                    <span role="columnheader">重叠</span>
                    <span role="columnheader">文件</span>
                    <span role="columnheader">操作</span>
                  </div>
                  {segments.map((segment) => (
                    <div className="result-row" role="row" key={segment.fileName}>
                      <span role="cell" className="select-cell">
                        <input
                          type="checkbox"
                          aria-label={`选择 ${segment.fileName}`}
                          checked={selectedSegmentNames.has(segment.fileName)}
                          onChange={() => toggleSegmentSelection(segment.fileName)}
                          disabled={isArchiving}
                        />
                      </span>
                      <span role="cell" className="part-index">
                        {String(segment.index).padStart(2, '0')}
                      </span>
                      <span role="cell" className="range-cell">
                        {formatClock(segment.startSeconds)} - {formatClock(segment.endSeconds)}
                      </span>
                      <span role="cell">{formatClock(segment.durationSeconds)}</span>
                      <span role="cell">
                        {segment.previousOverlapSeconds > 0
                          ? `${formatClock(segment.previousOverlapSeconds)}`
                          : '-'}
                      </span>
                      <span role="cell" className="file-cell" title={segment.fileName}>
                        <Waves size={15} aria-hidden="true" />
                        <span className="file-name">{segment.fileName}</span>
                        <small>{formatByteSize(segment.blob.size)}</small>
                      </span>
                      <span role="cell" className="download-cell">
                        <button
                          className="icon-button delete-button"
                          type="button"
                          title={`删除 ${segment.fileName}`}
                          aria-label={`删除 ${segment.fileName}`}
                          onClick={() => removeSegments([segment.fileName])}
                          disabled={isArchiving}
                        >
                          <Trash2 size={18} aria-hidden="true" />
                        </button>
                        <button
                          className="icon-button"
                          type="button"
                          title={`下载 ${segment.fileName}`}
                          aria-label={`下载 ${segment.fileName}`}
                          onClick={() => downloadSegment(segment)}
                          disabled={isArchiving}
                        >
                          <Download size={18} aria-hidden="true" />
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function isSupportedAudioFile(file: File): boolean {
  if (file.type.startsWith('audio/')) {
    return true;
  }
  const extension = file.name.split('.').pop()?.toLowerCase();
  return extension !== undefined && acceptedExtensions.includes(extension);
}

function fileTypeLabel(file: File): string {
  const extension = file.name.split('.').pop()?.toUpperCase();
  return extension || file.type.replace('audio/', '').toUpperCase() || 'AUDIO';
}

function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    const cleanUp = () => {
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(url);
    };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      cleanUp();
      if (Number.isFinite(duration) && duration > 0) {
        resolve(duration);
      } else {
        reject(new Error('无法读取录音时长。'));
      }
    };
    audio.onerror = () => {
      cleanUp();
      reject(new Error('无法读取录音信息。'));
    };
    audio.src = url;
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  return '本地编码器发生未知错误。';
}
