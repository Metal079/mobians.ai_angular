import { environment } from 'src/environments/environment';

export function resolveLoraImageUrl(imageUrl: string): string {
  return imageUrl.startsWith('/lora-image/') ? `${environment.apiBaseUrl}${imageUrl}` : imageUrl;
}

/** Use the existing image service/CDN to avoid downloading full previews for small rows. */
export function loraThumbnailUrl(imageUrl: string | null | undefined, width: number): string {
  if (!imageUrl) return '';
  const resolved = resolveLoraImageUrl(imageUrl);
  if (resolved.includes('/lora-image/')) {
    const url = new URL(resolved);
    url.searchParams.set('w', String(width));
    return url.toString();
  }
  if (resolved.includes('image.civitai.com')) {
    const widthPattern = /(\/)(original=\w+|width=\d+)(\/)/;
    if (widthPattern.test(resolved)) return resolved.replace(widthPattern, `$1width=${width}$3`);
    try {
      const url = new URL(resolved);
      if (url.searchParams.has('width') || url.searchParams.has('w')) {
        url.searchParams.set('width', String(width));
        url.searchParams.delete('w');
        return url.toString();
      }
    } catch { /* Keep unknown URL formats unchanged. */ }
  }
  return resolved;
}
