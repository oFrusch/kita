<script setup lang="ts">
import DevtoolsHint from "./components/DevtoolsHint.vue";
import TodoEditor from "./components/TodoEditor.vue";
import UserList from "./components/UserList.vue";
</script>

<template>
  <main>
    <header>
      <h1>kita playground</h1>
      <p class="lede">
        Edit <code>kita/src/</code> — HMR rebuilds instantly. No publish needed.
      </p>
    </header>

    <DevtoolsHint />

    <section>
      <h2>AsyncStore — pagination + query cache</h2>
      <p class="hint">
        Loads users 5 per page. Each "Load more" hits the mock API once; clicking a user a second time is served from cache.
      </p>
      <UserList />
    </section>

    <section>
      <h2>AsyncStoreSWR — optimistic update</h2>
      <p class="hint">
        Toggle and rename happen instantly. Watch the network tab — the PUT lands 200&nbsp;ms after the UI updates. Errors auto-rollback.
      </p>
      <TodoEditor />
    </section>
  </main>
</template>

<style>
:root {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  color-scheme: light dark;
  --border: rgba(127, 127, 127, 0.3);
  --muted: rgba(127, 127, 127, 0.8);
}

body {
  margin: 0;
  padding: 2rem 1rem;
}

main {
  max-width: 720px;
  margin: 0 auto;
}

header h1 {
  margin-bottom: 0.25rem;
  font-size: 1.75rem;
}

.lede {
  margin-top: 0;
  color: var(--muted);
}

.lede code {
  background: rgba(127, 127, 127, 0.15);
  padding: 0.05rem 0.35rem;
  border-radius: 4px;
  font-size: 0.85em;
}

section {
  margin-top: 2rem;
  padding: 1rem 1.25rem;
  border: 1px solid var(--border);
  border-radius: 10px;
}

section h2 {
  margin: 0 0 0.25rem;
  font-size: 1.1rem;
}

.hint {
  margin-top: 0;
  margin-bottom: 1rem;
  color: var(--muted);
  font-size: 0.9rem;
}

button {
  font: inherit;
  padding: 0.4rem 0.8rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
}

button:hover:not(:disabled) {
  background: rgba(127, 127, 127, 0.1);
}

button:disabled {
  cursor: wait;
  opacity: 0.6;
}
</style>
