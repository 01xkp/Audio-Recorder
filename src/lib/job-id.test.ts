import { describe, expect, it } from 'vitest';

import { createJobId } from './job-id';

describe('createJobId', () => {
  it('uses randomUUID when the secure-context API is available', () => {
    expect(
      createJobId({
        randomUUID: () => '8ad97b29-4429-43ac-9d91-80d2c3e552dc',
      }),
    ).toBe('8ad97b29442943ac9d9180d2c3e552dc');
  });

  it('uses getRandomValues when randomUUID is unavailable', () => {
    expect(
      createJobId({
        getRandomValues: (values) => {
          values.set([0, 1, 15, 16, 127, 128, 254, 255]);
          return values;
        },
      }),
    ).toBe('00010f107f80feff0000000000000000');
  });

  it('creates separate usable IDs without Web Crypto, such as over HTTP', () => {
    const first = createJobId({});
    const second = createJobId({});

    expect(first).toMatch(/^[a-z0-9]+$/);
    expect(second).toMatch(/^[a-z0-9]+$/);
    expect(second).not.toBe(first);
  });
});
