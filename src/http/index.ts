/**
 * Minimal HTTP client interface that kita's AsyncStore depends on.
 *
 * This is intentionally axios-shaped so an AxiosInstance can be passed
 * directly without any adapter. Any client matching this duck-type works:
 * axios, ky, redaxios, or a custom fetch wrapper.
 *
 * See `axiosAdapter` if you want explicit typing, or implement this
 * interface against your client of choice.
 */
export interface HttpResponse<T = unknown> {
  data: T;
}

export interface HttpRequestConfig {
  /** Query parameters appended to the URL. Loosely typed to mirror axios's `params: any`. */
  params?: any;
  /** AbortSignal for request cancellation. */
  signal?: AbortSignal;
  /** Per-request headers. */
  headers?: Record<string, string>;
}

export interface HttpClient {
  get<T = unknown>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>>;
  post<T = unknown>(
    url: string,
    data?: unknown,
    config?: HttpRequestConfig,
  ): Promise<HttpResponse<T>>;
  put<T = unknown>(
    url: string,
    data?: unknown,
    config?: HttpRequestConfig,
  ): Promise<HttpResponse<T>>;
  delete<T = unknown>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>>;
}
