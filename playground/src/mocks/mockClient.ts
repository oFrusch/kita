import type { HttpClient, HttpRequestConfig, HttpResponse } from "@ofrusch/kita";

const LATENCY_MS = 200;

interface User {
  id: string;
  name: string;
  email: string;
}

interface Todo {
  id: string;
  title: string;
  done: boolean;
}

const USERS: User[] = [
  { id: "1", name: "Alice", email: "alice@example.com" },
  { id: "2", name: "Bob", email: "bob@example.com" },
  { id: "3", name: "Carol", email: "carol@example.com" },
  { id: "4", name: "Dave", email: "dave@example.com" },
  { id: "5", name: "Eve", email: "eve@example.com" },
  { id: "6", name: "Frank", email: "frank@example.com" },
  { id: "7", name: "Grace", email: "grace@example.com" },
  { id: "8", name: "Heidi", email: "heidi@example.com" },
  { id: "9", name: "Ivan", email: "ivan@example.com" },
  { id: "10", name: "Judy", email: "judy@example.com" },
  { id: "11", name: "Kara", email: "kara@example.com" },
  { id: "12", name: "Leo", email: "leo@example.com" },
];

const TODOS: Todo[] = [
  { id: "t1", title: "Read kita docs", done: true },
  { id: "t2", title: "Wire up first AsyncStore", done: true },
  { id: "t3", title: "Try optimistic update", done: false },
  { id: "t4", title: "Open Vue DevTools to inspect records", done: false },
  { id: "t5", title: "Ship a side project", done: false },
];

let nextId = 1000;

async function latency(): Promise<void> {
  await new Promise((r) => setTimeout(r, LATENCY_MS));
}

function notFound(url: string): never {
  throw new Error(`Mock 404: ${url}`);
}

function parseBody(body: unknown): Record<string, unknown> {
  return typeof body === "string" ? JSON.parse(body) : (body as Record<string, unknown>);
}

/**
 * In-memory HttpClient. Satisfies the kita HttpClient interface with artificial
 * latency so loading states are observable.
 *
 * Note: each method takes a decorative `<T>` and casts its concrete return shape
 * to `HttpResponse<T>` — this is the standard pattern for implementing the
 * generic HttpClient contract (axios's own type defs do the same).
 */
export const mockClient: HttpClient = {
  async get<T = unknown>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    await latency();

    // /users/ — paginated list
    if (url === "/users/") {
      const page = Number(config?.params?.page ?? 1);
      const perPage = 5;
      const start = (page - 1) * perPage;
      const slice = USERS.slice(start, start + perPage);
      const totalPages = Math.ceil(USERS.length / perPage);
      return {
        data: {
          data: slice,
          meta: {
            page,
            totalPages,
            totalCount: USERS.length,
            hasMore: page < totalPages,
          },
        },
      } as HttpResponse<T>;
    }

    // /users/:id/
    const userMatch = url.match(/^\/users\/(.+)\/$/);
    if (userMatch) {
      const user = USERS.find((u) => u.id === userMatch[1]);
      if (!user) notFound(url);
      return { data: user } as HttpResponse<T>;
    }

    // /todos/ — flat list (no pagination)
    if (url === "/todos/") {
      return { data: [...TODOS] } as HttpResponse<T>;
    }

    // /todos/:id/
    const todoMatch = url.match(/^\/todos\/(.+)\/$/);
    if (todoMatch) {
      const todo = TODOS.find((t) => t.id === todoMatch[1]);
      if (!todo) notFound(url);
      return { data: todo } as HttpResponse<T>;
    }

    notFound(url);
  },

  async post<T = unknown>(url: string, body?: unknown): Promise<HttpResponse<T>> {
    await latency();

    if (url === "/users/") {
      const data = parseBody(body);
      const newUser: User = { name: "", email: "", ...data, id: String(nextId++) } as User;
      USERS.push(newUser);
      return { data: newUser } as HttpResponse<T>;
    }

    if (url === "/todos/") {
      const data = parseBody(body);
      const newTodo: Todo = {
        title: "",
        done: false,
        ...data,
        id: String(nextId++),
      } as Todo;
      TODOS.push(newTodo);
      return { data: newTodo } as HttpResponse<T>;
    }

    notFound(url);
  },

  async put<T = unknown>(url: string, body?: unknown): Promise<HttpResponse<T>> {
    await latency();

    const userMatch = url.match(/^\/users\/(.+)\/$/);
    if (userMatch) {
      const idx = USERS.findIndex((u) => u.id === userMatch[1]);
      if (idx < 0) notFound(url);
      const patch = parseBody(body) as Partial<User>;
      USERS[idx] = { ...USERS[idx], ...patch };
      return { data: USERS[idx] } as HttpResponse<T>;
    }

    const todoMatch = url.match(/^\/todos\/(.+)\/$/);
    if (todoMatch) {
      const idx = TODOS.findIndex((t) => t.id === todoMatch[1]);
      if (idx < 0) notFound(url);
      const patch = parseBody(body) as Partial<Todo>;
      TODOS[idx] = { ...TODOS[idx], ...patch };
      return { data: TODOS[idx] } as HttpResponse<T>;
    }

    notFound(url);
  },

  async delete<T = unknown>(url: string): Promise<HttpResponse<T>> {
    await latency();

    const userMatch = url.match(/^\/users\/(.+)\/$/);
    if (userMatch) {
      const idx = USERS.findIndex((u) => u.id === userMatch[1]);
      if (idx < 0) notFound(url);
      USERS.splice(idx, 1);
      return { data: {} } as HttpResponse<T>;
    }

    const todoMatch = url.match(/^\/todos\/(.+)\/$/);
    if (todoMatch) {
      const idx = TODOS.findIndex((t) => t.id === todoMatch[1]);
      if (idx < 0) notFound(url);
      TODOS.splice(idx, 1);
      return { data: {} } as HttpResponse<T>;
    }

    notFound(url);
  },
};
