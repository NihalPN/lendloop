/**
 * Returns current UTC date formatted as YYYY-MM-DD.
 * Based on new Date() so tests can control time via vi.setSystemTime.
 */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
