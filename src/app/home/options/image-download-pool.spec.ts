import { imageDownloadConcurrency, runImageDownloadPool } from './image-download-pool';

describe('completed image downloads', () => {
  it('keeps one download on slow or data-saving connections', () => {
    expect(imageDownloadConcurrency({ saveData: true, effectiveType: '4g' })).toBe(1);
    for (const effectiveType of ['slow-2g', '2g', '3g']) {
      expect(imageDownloadConcurrency({ effectiveType })).toBe(1);
    }
    expect(imageDownloadConcurrency({ effectiveType: '4g' })).toBe(2);
    expect(imageDownloadConcurrency()).toBe(2);
  });

  it('publishes results as they arrive without exceeding the concurrency bound', async () => {
    const releases: (() => void)[] = [];
    const started: number[] = [];
    const finished: number[] = [];
    const pending = runImageDownloadPool(4, 2, async index => {
      started.push(index);
      await new Promise<void>(resolve => { releases[index] = resolve; });
      finished.push(index);
    });
    expect(started).toEqual([0, 1]);
    releases[1](); await Promise.resolve(); await Promise.resolve();
    expect(finished).toEqual([1]);
    expect(started).toEqual([0, 1, 2]);
    releases[0](); await Promise.resolve(); await Promise.resolve();
    expect(started).toEqual([0, 1, 2, 3]);
    releases[2](); releases[3](); await pending;
    expect(finished.length).toBe(4);
  });
});
