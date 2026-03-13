import { apiJson } from './client';

export type MppRow = Record<string, unknown>;

export interface MppResponse {
  data: MppRow[];
}

export async function getMpp(): Promise<MppResponse> {
  return apiJson<MppResponse>('/api/mpp');
}
