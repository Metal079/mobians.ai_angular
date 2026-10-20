export function supportsLocalHistory(): boolean {
  try { return !!window.indexedDB; } catch { return false; }
}

export function unsupportedHistoryError(): DOMException {
  return new DOMException('This browser does not support local image history.', 'NotSupportedError');
}
