import { vi } from "vitest";
import type { HttpClient, HttpResponse } from "../src/http";
import registry from "../src/model-store-registry";

/**
 * Reset the global ModelStoreRegistry singleton between tests.
 * Required because the registry is a module-level singleton.
 */
export function resetRegistry(): void {
  (registry as any).stores = {};
  (registry as any).models = {};
}

export type MockHttpClient = HttpClient & {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

export function createMockClient(): MockHttpClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
}

export function mockResponse<T>(data: T): HttpResponse<T> {
  return { data };
}
