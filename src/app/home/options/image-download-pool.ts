export interface DownloadConnection {
  saveData?: boolean;
  effectiveType?: string;
}

export function imageDownloadConcurrency(connection?: DownloadConnection): number {
  return connection?.saveData || ['slow-2g', '2g', '3g'].includes(connection?.effectiveType ?? '') ? 1 : 2;
}

export async function runImageDownloadPool(count: number, concurrency: number,
  download: (index: number) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < count) {
      const index = next++;
      await download(index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(count, Math.max(1, concurrency)) }, worker));
}
