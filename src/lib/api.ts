import { useAuthStore } from '@/store/auth';

const baseHeaders = {
  Accept: 'application/json',
};

type RequestOptions = {
  method?: 'GET' | 'POST';
  body?: BodyInit | null;
  isFormData?: boolean;
};

async function request<T>(path: string, options: RequestOptions = {}) {
  const token = useAuthStore.getState().session?.accessToken;
  const headers = new Headers(baseHeaders);

  if (!options.isFormData) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(path, {
    method: options.method || 'GET',
    headers,
    body: options.body || null,
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    let message = 'Falha na comunicação com a API.';

    if (typeof payload === 'string') {
      message = payload || message;
    } else if (typeof payload === 'object' && payload) {
      const candidates = [
        (payload as { error?: unknown }).error,
        (payload as { error?: { message?: string } }).error &&
          (payload as { error: { message?: string } }).error.message,
        (payload as { error?: { code?: string } }).error &&
          (payload as { error: { code?: string } }).error.code,
        (payload as { message?: unknown }).message,
        (payload as { statusText?: string }).statusText,
      ].filter((v): v is string => typeof v === 'string' && v.length > 0);

      if (candidates.length) {
        message = candidates[0];
      }
    }

    throw new Error(message);
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),
  postForm: <T>(path: string, body: FormData) =>
    request<T>(path, {
      method: 'POST',
      body,
      isFormData: true,
    }),
};
