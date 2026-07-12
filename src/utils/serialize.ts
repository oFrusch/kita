interface Jsonable {
  toJSON: () => unknown;
}

function isContainer(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isJsonable(value: Record<string, unknown>): value is Record<string, unknown> & Jsonable {
  return typeof value.toJSON === "function";
}

function serializeLeaf(value: unknown): string {
  const type = typeof value;

  if (type === "function" || type === "symbol") {
    throw new TypeError(`Converting a ${type} to a stable key is not supported`);
  }

  if (value === undefined) return "undefined";

  return JSON.stringify(value);
}

/**
 * The ancestor set exists only to catch cycles, so it is allocated lazily: a
 * container whose children are all leaves never descends and never pays for it.
 */
function childPath(
  container: object,
  hasContainerChild: boolean,
  ancestors: Set<object> | null,
): Set<object> | null {
  if (!hasContainerChild) return null;

  const path = ancestors ?? new Set<object>();
  path.add(container);

  return path;
}

function serializeArray(value: unknown[], ancestors: Set<object> | null): string {
  const path = childPath(value, value.some(isContainer), ancestors);
  const body = value.map((item) => serializeValue(item, path)).join(",");

  path?.delete(value);

  return `[${body}]`;
}

/**
 * An `undefined`-valued key is dropped, not tokenized: HTTP clients omit it from
 * the query string, so `{ page }` and `{ page, filter: undefined }` issue a
 * byte-identical request and must land on one key. Sorting is by code unit
 * (`localeCompare` returns 0 for distinct-but-collation-equal keys, e.g. NFC vs
 * NFD, and a stable sort would then leak insertion order into the key).
 */
function serializeObject(value: Record<string, unknown>, ancestors: Set<object> | null): string {
  const keys = Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort();

  const path = childPath(
    value,
    keys.some((key) => isContainer(value[key])),
    ancestors,
  );

  const body = keys
    .map((key) => {
      return `${JSON.stringify(key)}:${serializeValue(value[key], path)}`;
    })
    .join(",");

  path?.delete(value);

  return `{${body}}`;
}

/**
 * Date and friends carry their identity in `toJSON`, not in their own enumerable
 * keys — walking those would collapse every instance onto `{}`. The payload is
 * serialized by value rather than handed to `JSON.stringify`, so an object it
 * returns gets its keys sorted like any other subtree.
 */
function serializeJsonable(value: Jsonable, ancestors: Set<object> | null): string {
  const payload = value.toJSON();
  const path = childPath(value, isContainer(payload), ancestors);
  const body = serializeValue(payload, path);

  path?.delete(value);

  return body;
}

function serializeValue(value: unknown, ancestors: Set<object> | null): string {
  if (!isContainer(value)) return serializeLeaf(value);

  if (ancestors?.has(value)) {
    throw new TypeError("Converting a circular structure to a stable key is not supported");
  }

  if (isJsonable(value)) return serializeJsonable(value, ancestors);

  if (Array.isArray(value)) return serializeArray(value, ancestors);

  return serializeObject(value, ancestors);
}

/**
 * Serialize a value to a string that is stable under object key reordering, so
 * that equivalent query params always produce the same cache key.
 *
 * Object keys are sorted at every level of nesting; array order is preserved,
 * since it is semantically significant. `Date` (and any other object exposing a
 * `toJSON` method) is serialized through it, and the result is sorted too.
 *
 * An object key whose value is `undefined` is omitted, matching what an HTTP
 * client puts on the wire: `{ page }` and `{ page, filter: undefined }` issue the
 * same request, so they must produce the same key. Inside an array, where
 * position is significant, `undefined` keeps its slot and stays distinct from
 * `null`.
 *
 * Values that cannot be keyed stably fail loudly rather than silently colliding:
 * functions, symbols, and circular structures all throw a `TypeError`.
 *
 * @param value - The value to serialize
 * @returns A stable string representation of `value`
 * @throws {TypeError} If `value` contains a function, a symbol, or a cycle
 *
 * @example
 * ```ts
 * const a = sortedSerialize({ page: 1, filter: { active: true, role: "admin" } });
 * const b = sortedSerialize({ filter: { role: "admin", active: true }, page: 1 });
 *
 * a === b; // true — same key, so the same cache entry and the same in-flight request
 * ```
 */
export function sortedSerialize(value: unknown): string {
  return serializeValue(value, null);
}
