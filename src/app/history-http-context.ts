// Attach safe transport facts without changing HttpErrorResponse or retaining bodies.
const errorContexts = new WeakMap<object, Record<string, unknown>>();
export function rememberHistoryHttpContext(error: unknown, context: Record<string, unknown>): void {
  if (error && typeof error === 'object') errorContexts.set(error, context);
}
export function historyHttpContext(error: unknown): Record<string, unknown> {
  return error && typeof error === 'object' ? errorContexts.get(error) || {} : {};
}
