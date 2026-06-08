import { ref } from "vue";

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
 *
 * State is backed by Vue `ref`s so the getters are reactive: read `hasMore` /
 * `isLoading` / `page` in a template or `computed` and they update as pages
 * load, even when the query instance is held in a `shallowRef`.
 */
export class PaginatedQuery<T> {
  private _currentPage = ref(1);
  private _hasMore = ref(true);
  private _isLoading = ref(false);
  private _totalCount = ref(0);
  private _totalPages = ref(0);

  constructor(private fetcher: (page: number) => Promise<PaginatedResult<T>>) {}

  /** Whether more pages are available to load */
  get hasMore(): boolean {
    return this._hasMore.value;
  }

  /** Whether a fetch is currently in progress */
  get isLoading(): boolean {
    return this._isLoading.value;
  }

  /** Current page number (1-indexed) */
  get page(): number {
    return this._currentPage.value;
  }

  /** Total number of records across all pages (if known) */
  get totalCount(): number {
    return this._totalCount.value;
  }

  /** Total number of pages (if known) */
  get totalPages(): number {
    return this._totalPages.value;
  }

  /**
   * Load the next page of results.
   * Returns empty array if no more pages or already loading.
   */
  async loadMore(): Promise<T[]> {
    if (!this._hasMore.value || this._isLoading.value) return [];

    this._isLoading.value = true;
    try {
      const { records, meta } = await this.fetcher(this._currentPage.value);
      this._hasMore.value = meta.hasMore;
      this._totalCount.value = meta.totalCount;
      this._totalPages.value = meta.totalPages;
      this._currentPage.value++;
      return records;
    } finally {
      this._isLoading.value = false;
    }
  }

  /**
   * Reset pagination state to fetch from the beginning.
   */
  reset(): void {
    this._currentPage.value = 1;
    this._hasMore.value = true;
    this._isLoading.value = false;
    this._totalCount.value = 0;
    this._totalPages.value = 0;
  }
}
