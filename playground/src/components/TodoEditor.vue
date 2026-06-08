<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { TodoModel } from "../models/TodoModel";
import { useStore } from "../stores/application-store";

const { todos } = useStore();

const newTitle = ref("");
const errorMessage = ref<string | null>(null);

const list = computed(() => todos.records as TodoModel[]);

onMounted(async () => {
  await todos.findRecords();
});

async function toggle(todo: TodoModel): Promise<void> {
  errorMessage.value = null;
  const patch = new TodoModel({
    id: todo.id,
    title: todo.title,
    done: !todo.done,
  });
  try {
    await todos.optimisticUpdate(patch);
  } catch (err) {
    errorMessage.value = `Toggle failed: ${(err as Error).message}`;
  }
}

async function addTodo(): Promise<void> {
  const title = newTitle.value.trim();
  if (!title) return;
  newTitle.value = "";
  const draft = TodoModel.create({ title, done: false });
  await draft.save();
}

async function remove(todo: TodoModel): Promise<void> {
  try {
    await todos.optimisticDelete(todo);
  } catch (err) {
    errorMessage.value = `Delete failed: ${(err as Error).message}`;
  }
}
</script>

<template>
  <form class="new" @submit.prevent="addTodo">
    <input
      v-model="newTitle"
      type="text"
      placeholder="What needs doing?"
      aria-label="New todo title"
    />
    <button type="submit" :disabled="!newTitle.trim()">Add</button>
  </form>

  <ul class="list">
    <li v-for="todo in list" :key="todo.id">
      <label class="row" :class="{ done: todo.done }">
        <input
          type="checkbox"
          :checked="todo.done"
          @change="toggle(todo)"
        />
        <span class="title">{{ todo.title }}</span>
      </label>
      <button class="remove" aria-label="Delete" @click="remove(todo)">×</button>
    </li>
  </ul>

  <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
</template>

<style scoped>
.new {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.new input {
  flex: 1;
  font: inherit;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: inherit;
}

.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.25rem;
}

.list li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.row {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
}

.row.done .title {
  text-decoration: line-through;
  color: var(--muted);
}

.remove {
  width: 2rem;
  height: 2rem;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.error {
  margin-top: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: rgba(239, 68, 68, 0.12);
  border-left: 3px solid #ef4444;
  border-radius: 4px;
  font-size: 0.85rem;
}
</style>
