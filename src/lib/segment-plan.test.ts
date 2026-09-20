import { describe, expect, it } from 'vitest';

import {
  createSegmentPlan,
  outputFileName,
  zipFileName,
} from './segment-plan';

describe('createSegmentPlan', () => {
  it('creates independent five-minute windows with an optional 30-second overlap', () => {
    const plan = createSegmentPlan({
      sourceDurationSeconds: 901,
      segmentDurationSeconds: 300,
      overlapSeconds: 30,
    });

    expect(plan).toEqual([
      {
        index: 1,
        startSeconds: 0,
        endSeconds: 300,
        durationSeconds: 300,
        previousOverlapSeconds: 0,
      },
      {
        index: 2,
        startSeconds: 270,
        endSeconds: 570,
        durationSeconds: 300,
        previousOverlapSeconds: 30,
      },
      {
        index: 3,
        startSeconds: 540,
        endSeconds: 840,
        durationSeconds: 300,
        previousOverlapSeconds: 30,
      },
      {
        index: 4,
        startSeconds: 810,
        endSeconds: 901,
        durationSeconds: 91,
        previousOverlapSeconds: 30,
      },
    ]);
  });

  it('does not overlap unless the user chooses an overlap', () => {
    const plan = createSegmentPlan({
      sourceDurationSeconds: 610,
      segmentDurationSeconds: 300,
      overlapSeconds: 0,
    });

    expect(plan.map((part) => part.startSeconds)).toEqual([0, 300, 600]);
    expect(plan.map((part) => part.durationSeconds)).toEqual([300, 300, 10]);
  });

  it('rejects an overlap equal to the requested segment duration', () => {
    expect(() =>
      createSegmentPlan({
        sourceDurationSeconds: 60,
        segmentDurationSeconds: 30,
        overlapSeconds: 30,
      }),
    ).toThrow('重叠时长必须小于分片时长。');
  });
});

describe('output naming', () => {
  it('only includes the optional marker when it is provided', () => {
    expect(outputFileName('20260903_105141.WAV', 1, '')).toBe(
      '20260903_105141_1.ogg',
    );
    expect(outputFileName('20260903_105141.WAV', 1, '188')).toBe(
      '20260903_105141_188_1.ogg',
    );
    expect(zipFileName('20260903_105141.WAV', '')).toBe(
      '20260903_105141_segments.zip',
    );
  });
});
