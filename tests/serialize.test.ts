import { describe, expect, it } from "vitest";
import { sortedSerialize } from "../src/utils/serialize";

describe("sortedSerialize", () => {
  describe("key ordering", () => {
    it("is stable under top-level key reordering", () => {
      expect(sortedSerialize({ page: 1, limit: 50 })).toBe(sortedSerialize({ limit: 50, page: 1 }));
    });

    it("is stable under nested key reordering", () => {
      const a = { page: 1, filter: { active: true, role: "admin" } };
      const b = { filter: { role: "admin", active: true }, page: 1 };

      expect(sortedSerialize(a)).toBe(sortedSerialize(b));
    });

    it("is stable under key reordering inside array elements", () => {
      const a = [{ active: true, role: "admin" }];
      const b = [{ role: "admin", active: true }];

      expect(sortedSerialize(a)).toBe(sortedSerialize(b));
    });

    it("still distinguishes different values", () => {
      expect(sortedSerialize({ page: 1 })).not.toBe(sortedSerialize({ page: 2 }));
    });

    // A collating comparator ranks these two distinct keys equal, and a stable sort
    // would then leak insertion order into the key. Sorting by code unit is total.
    it("is stable under reordering of keys that collate equal", () => {
      const precomposed = "café";
      const decomposed = "café";

      expect(precomposed).not.toBe(decomposed);
      expect(sortedSerialize({ [precomposed]: 1, [decomposed]: 2 })).toBe(
        sortedSerialize({ [decomposed]: 2, [precomposed]: 1 }),
      );
    });
  });

  describe("arrays", () => {
    it("treats element order as significant", () => {
      expect(sortedSerialize([1, 2])).not.toBe(sortedSerialize([2, 1]));
    });

    it("distinguishes an array from an object with the same indices", () => {
      expect(sortedSerialize(["a"])).not.toBe(sortedSerialize({ 0: "a" }));
    });
  });

  describe("toJSON objects", () => {
    it("does not collapse every Date onto the same key", () => {
      const early = new Date("2020-01-01T00:00:00.000Z");
      const late = new Date("2024-06-15T12:30:00.000Z");

      expect(sortedSerialize({ since: early })).not.toBe(sortedSerialize({ since: late }));
    });

    it("keys equal Dates identically", () => {
      const a = new Date("2020-01-01T00:00:00.000Z");
      const b = new Date("2020-01-01T00:00:00.000Z");

      expect(sortedSerialize({ since: a })).toBe(sortedSerialize({ since: b }));
    });

    it("delegates to a custom toJSON", () => {
      const value = {
        secret: "hidden",
        toJSON() {
          return { public: "shown" };
        },
      };

      expect(sortedSerialize(value)).toBe('{"public":"shown"}');
    });

    it("sorts the keys of an object returned by toJSON", () => {
      const a = {
        toJSON() {
          return { role: "admin", active: true };
        },
      };
      const b = {
        toJSON() {
          return { active: true, role: "admin" };
        },
      };

      expect(sortedSerialize({ filter: a })).toBe(sortedSerialize({ filter: b }));
    });

    it("throws a TypeError on a toJSON that returns itself", () => {
      const cyclic = {
        toJSON(): unknown {
          return cyclic;
        },
      };

      expect(() => sortedSerialize(cyclic)).toThrow(TypeError);
    });
  });

  describe("undefined", () => {
    it("keys an undefined-valued param the same as an absent one", () => {
      expect(sortedSerialize({ page: 1, q: undefined })).toBe(sortedSerialize({ page: 1 }));
    });

    it("still distinguishes undefined from null and from the string", () => {
      const asUndefined = sortedSerialize({ q: undefined });

      expect(asUndefined).not.toBe(sortedSerialize({ q: null }));
      expect(asUndefined).not.toBe(sortedSerialize({ q: "undefined" }));
    });

    it("keeps an undefined element in an array, where position is significant", () => {
      expect(sortedSerialize([1, undefined, 2])).not.toBe(sortedSerialize([1, 2]));
      expect(sortedSerialize([undefined])).not.toBe(sortedSerialize([null]));
    });

    it("pins the representation so a refactor cannot silently change keys", () => {
      expect(sortedSerialize({ q: undefined })).toBe("{}");
      expect(sortedSerialize([undefined])).toBe("[undefined]");
      expect(sortedSerialize(undefined)).toBe("undefined");
    });
  });

  describe("unsupported values", () => {
    it("throws a TypeError on a circular object rather than blowing the stack", () => {
      const cyclic: Record<string, unknown> = { name: "root" };
      cyclic.self = cyclic;

      expect(() => sortedSerialize(cyclic)).toThrow(TypeError);
    });

    it("throws a TypeError on a cycle through an array", () => {
      const cyclic: unknown[] = [1];
      cyclic.push(cyclic);

      expect(() => sortedSerialize(cyclic)).toThrow(TypeError);
    });

    it("allows the same object to appear twice as a sibling", () => {
      const shared = { nested: { role: "admin" } };

      expect(() => sortedSerialize({ a: shared, b: shared })).not.toThrow();
      expect(sortedSerialize({ a: shared, b: shared })).toBe(
        '{"a":{"nested":{"role":"admin"}},"b":{"nested":{"role":"admin"}}}',
      );
    });

    it("allows the same object to appear twice in an array", () => {
      const shared = { nested: { role: "admin" } };

      expect(() => sortedSerialize({ list: [shared, shared] })).not.toThrow();
      expect(sortedSerialize({ list: [shared, shared] })).toBe(
        '{"list":[{"nested":{"role":"admin"}},{"nested":{"role":"admin"}}]}',
      );
    });

    it("throws a TypeError on a function rather than keying it as undefined", () => {
      expect(() => sortedSerialize({ callback: () => "a" })).toThrow(TypeError);
    });

    it("throws a TypeError on a symbol rather than keying it as undefined", () => {
      expect(() => sortedSerialize({ token: Symbol("token") })).toThrow(TypeError);
    });

    it("does not collide two distinct functions onto one key", () => {
      expect(() => sortedSerialize({ callback: () => "a" })).toThrow(TypeError);
      expect(() => sortedSerialize({ callback: () => "b" })).toThrow(TypeError);
    });
  });

  describe("primitives", () => {
    it("serializes leaves the way JSON does", () => {
      expect(sortedSerialize("hello")).toBe('"hello"');
      expect(sortedSerialize(42)).toBe("42");
      expect(sortedSerialize(true)).toBe("true");
      expect(sortedSerialize(null)).toBe("null");
    });

    it("distinguishes a number from its string form", () => {
      expect(sortedSerialize({ page: 1 })).not.toBe(sortedSerialize({ page: "1" }));
    });
  });
});
