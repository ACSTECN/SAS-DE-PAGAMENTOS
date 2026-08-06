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
    const message =
      typeof payload === 'object' && payload && 'error' in payload
        ? String(payload.error)
        : 'Falha na comunicação com a API.';

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
