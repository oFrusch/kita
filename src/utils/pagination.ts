/**
 * Metadata returned from paginated API responses.
 */
export interface PaginationMeta {
  page: number;
  totalPages: number;
  totalCount: number;
  hasMore: boolean;
}

/**
 * Result from a paginated fetch operation.
 */
export interface PaginatedResult<T> {
  records: T[];
  meta: PaginationMeta;
}

/**
 * Manages paginated data fetching with automatic page tracking.
 * Provides reactive state for loading, hasMore, and current page.
 */
export class PaginatedQuery<T> {
  private currentPage = 1;
  private _hasMore = true;
  private _isLoading = false;
  private _totalCount = 0;
  private _totalPages = 0;

  constructor(private fetcher: (page: number) => Promise<PaginatedResult<T>>) {}

  /** Whether more pages are available to load */
  get hasMore(): boolean {
    return this._hasMore;
  }

  /** Whether a fetch is currently in progress */
  get isLoading(): boolean {
    return this._isLoading;
  }

  /** Current page number (1-indexed) */
  get page(): number {
    return this.currentPage;
  }

  /** Total number of records across all pages (if known) */
  get totalCount(): number {
    return this._totalCount;
  }

  /** Total number of pages (if known) */
  get totalPages(): number {
    return this._totalPages;
  }

  /**
   * Load the next page of results.
   * Returns empty array if no more pages or already loading.
   */
  async loadMore(): Promise<T[]> {
    if (!this._hasMore || this._isLoading) return [];

    this._isLoading = true;
    try {
      const { records, meta } = await this.fetcher(this.currentPage);
      this._hasMore = meta.hasMore;
      this._totalCount = meta.totalCount;
      this._totalPages = meta.totalPages;
      this.currentPage++;
      return records;
    } finally {
      this._isLoading = false;
    }
  }

  /**
   * Reset pagination state to fetch from the beginning.
   */
  reset(): void {
    this.currentPage = 1;
    this._hasMore = true;
    this._isLoading = false;
    this._totalCount = 0;
    this._totalPages = 0;
  }
}
