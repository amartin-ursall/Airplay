import { ApiResponse } from "../../shared/types"

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public response?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const storedUser = localStorage.getItem('aetherlink-user');
  const userId = storedUser ? JSON.parse(storedUser).id : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>)
  };

  if (userId) {
    headers['X-User-Id'] = userId;
  }

  const res = await fetch(path, {
    ...init,
    headers
  })
  const json = (await res.json()) as ApiResponse<T>

  if (!res.ok || !json.success || json.data === undefined) {
    throw new ApiError(
      json.error || 'Request failed',
      res.status,
      json
    );
  }

  return json.data
}