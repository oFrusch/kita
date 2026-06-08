<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from "vue";
import type { PaginatedQuery } from "@ofrusch/kita";
import { UserModel } from "../models/UserModel";
import { useStore } from "../stores/application-store";

const { users } = useStore();

const query = shallowRef<PaginatedQuery<UserModel>>(users.createPaginatedQuery());
const loaded = ref<UserModel[]>([]);
const selectedId = ref<string | null>(null);

const selected = computed(() =>
  selectedId.value ? users.peekRecord(selectedId.value) : null,
);

async function loadMore(): Promise<void> {
  const next = await query.value.loadMore();
  loaded.value = [...loaded.value, ...next];
}

async function select(id: string): Promise<void> {
  selectedId.value = id;
  // Fetches once — subsequent selects come straight from the cache.
  await users.findRecord(id);
}

function reset(): void {
  query.value = users.createPaginatedQuery();
  loaded.value = [];
  selectedId.value = null;
  void loadMore();
}

onMounted(loadMore);
</script>

<template>
  <ul class="list">
    <li v-for="u in loaded" :key="u.id">
      <button class="row" :class="{ active: selectedId === u.id }" @click="select(u.id)">
        <strong>{{ u.name }}</strong>
        <span class="email">{{ u.email }}</span>
      </button>
    </li>
  </ul>

  <div class="controls">
    <button v-if="query.hasMore" :disabled="query.isLoading" @click="loadMore">
      {{ query.isLoading ? "Loading…" : `Load more (page ${query.page})` }}
    </button>
    <span v-else class="status">
      All {{ query.totalCount }} users loaded.
    </span>
    <button @click="reset">Reset</button>
  </div>

  <div v-if="selected" class="detail">
    <strong>Selected:</strong> {{ selected.name }} — {{ selected.email }}
    <p class="micro">
      Click the same user again: no network call (cache hit). Pick a different one: one network call, then cached.
    </p>
  </div>
</template>

<style scoped>
.list {
  list-style: none;
  padding: 0;
  margin: 0 0 1rem;
  display: grid;
  gap: 0.25rem;
}

.row {
  width: 100%;
  text-align: left;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 0.5rem 0.75rem;
}

.row.active {
  border-color: #facc15;
  background: rgba(250, 204, 21, 0.08);
}

.email {
  color: var(--muted);
  font-size: 0.85rem;
}

.controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.status {
  color: var(--muted);
  font-size: 0.9rem;
}

.detail {
  margin-top: 1rem;
  padding: 0.6rem 0.9rem;
  background: rgba(127, 127, 127, 0.08);
  border-radius: 6px;
  font-size: 0.9rem;
}

.micro {
  margin: 0.35rem 0 0;
  color: var(--muted);
  font-size: 0.8rem;
}
</style>
