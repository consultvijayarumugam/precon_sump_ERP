/** Every API route lives under this path. */
export const API_PATH = '/api/v1';

/**
 * Turns what someone typed into a full API base URL, or null if it can't be one:
 *   "192.168.31.50:4000"             -> "http://192.168.31.50:4000/api/v1"
 *   "https://crm.example.com/"       -> "https://crm.example.com/api/v1"
 *   "http://10.0.2.2:4000/api/v1/"   -> "http://10.0.2.2:4000/api/v1"
 */
export function normalizeApiUrl(input: string): string | null {
  const typed = input.trim().replace(/\/+$/, '');
  if (!typed) return null;
  const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(typed) ? typed : `http://${typed}`;
  if (!/^https?:\/\/[^\s/:]+(:\d{1,5})?(\/\S*)?$/i.test(url)) return null;
  return url.endsWith(API_PATH) ? url : `${url}${API_PATH}`;
}
