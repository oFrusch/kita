# Pagination

`AsyncStore` ships a page-tracking helper for "load more" / infinite-scroll UIs: [`PaginatedQuery`](/api/utilities#paginatedquery). It tracks the current page, loading state, and whether more pages remain.

## Server contract

`findRecords` detects a paginated response by the presence of a `meta` key:

```jsonc
// GET /posts/?page=1
{
  "data": [ /* records */ ],
  "meta": { "page": 1, "totalPages": 5, "totalCount": 97, "hasMore": true }
}
```

A bare array (no `meta`) is treated as a non-paginated result. See [`PaginationMeta`](/api/types#paginationmeta).

## Quick start

`createPaginatedQuery` wires a [`PaginatedQuery`](/api/utilities#paginatedquery) to the store's `findRecords`, injecting `page` automatically:

```ts
const feed = postStore.createPaginatedQuery({ sort: "-createdAt" });

const firstPage = await feed.loadMore(); // GET /posts/?sort=-createdAt&page=1
const nextPage = await feed.loadMore();  // GET /posts/?sort=-createdAt&page=2

feed.hasMore;    // false once the last page is reached
feed.isLoading;  // true while a fetch is in flight
feed.page;       // next page to load
feed.totalCount; // from meta, if the server sends it
```

`loadMore()` is a no-op (returns `[]`) when `hasMore` is false or a fetch is already running, so it's safe to call from a scroll handler that may fire rapidly.

## In a component

```vue
<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useStore } from "../stores/application-store";

const { posts } = useStore();
const feed = posts.createPaginatedQuery({ sort: "-createdAt" });
const items = ref([]);

async function more() {
  const page = await feed.loadMore();
  items.value.push(...page);
}

onMounted(more);
</script>

<template>
  <article v-for="post in items" :key="post.id">{{ post.title }}</article>
  <button v-if="feed.hasMore" :disabled="feed.isLoading" @click="more">
    {{ feed.isLoading ? "Loading…" : "Load more" }}
  </button>
</template>
```

## Resetting

Call `reset()` to go back to page 1 — e.g. when the sort or filter changes. Create a fresh query if the base params change:

```ts
function changeSort(sort: string) {
  feed = posts.createPaginatedQuery({ sort });
  items.value = [];
  more();
}
```

## Lower-level use

You can drive [`PaginatedQuery`](/api/utilities#paginatedquery) directly against any fetcher, not just a store — it only needs a function returning `{ records, meta }`:

```ts
import { PaginatedQuery } from "@ofrusch/kita";

const query = new PaginatedQuery(async (page) => {
  const { data } = await client.get(`/search?q=vue&page=${page}`);
  return { records: data.results, meta: data.meta };
});
```

## See also

- [`AsyncStore.createPaginatedQuery`](/api/stores#createpaginatedquery) · [`AsyncStore.findRecords`](/api/stores#findrecords)
- [`PaginatedQuery`](/api/utilities#paginatedquery) · [`PaginationMeta`](/api/types#paginationmeta) · [`PaginatedResult`](/api/types#paginatedresult)
