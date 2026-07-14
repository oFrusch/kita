import { describe, expect, it } from "vitest";
import { effect, watch } from "vue";

import reactive from "../src/decorators/reactive";

describe("@reactive decorator", () => {
  it("initializes from the field initializer", () => {
    class Foo {
      @reactive() accessor x: number = 42;
    }
    const foo = new Foo();
    expect(foo.x).toBe(42);
  });

  it("allows updates via the setter", () => {
    class Foo {
      @reactive() accessor x: number = 1;
    }
    const foo = new Foo();
    foo.x = 2;
    expect(foo.x).toBe(2);
  });

  it("isolates state per instance", () => {
    class Foo {
      @reactive() accessor x: number = 0;
    }
    const a = new Foo();
    const b = new Foo();
    a.x = 1;
    b.x = 2;
    expect(a.x).toBe(1);
    expect(b.x).toBe(2);
  });

  it("triggers Vue effect on update", () => {
    class Foo {
      @reactive() accessor x: number = 0;
    }
    const foo = new Foo();
    let seen = -1;
    effect(() => {
      seen = foo.x;
    });
    expect(seen).toBe(0);
    foo.x = 99;
    expect(seen).toBe(99);
  });

  it("triggers Vue watch on update", () => {
    class Foo {
      @reactive() accessor label: string = "a";
    }
    const foo = new Foo();
    const seen: string[] = [];
    watch(
      () => foo.label,
      (v) => seen.push(v),
      { flush: "sync" },
    );
    foo.label = "b";
    foo.label = "c";
    expect(seen).toEqual(["b", "c"]);
  });

  it("supports multiple decorated properties on the same class", () => {
    class Foo {
      @reactive() accessor a: number = 1;
      @reactive() accessor b: string = "hello";
      @reactive() accessor c: string[] = [];
    }
    const foo = new Foo();
    expect(foo.a).toBe(1);
    expect(foo.b).toBe("hello");
    expect(foo.c).toEqual([]);
    foo.a = 2;
    foo.b = "world";
    foo.c = ["x"];
    expect(foo.a).toBe(2);
    expect(foo.b).toBe("world");
    expect(foo.c).toEqual(["x"]);
  });

  it("supports object initial values", () => {
    class Foo {
      @reactive() accessor obj: { count: number } = { count: 5 };
    }
    const foo = new Foo();
    expect(foo.obj.count).toBe(5);
    foo.obj = { count: 10 };
    expect(foo.obj.count).toBe(10);
  });

  it("ignores the decorator's optional argument", () => {
    // The legacy signature accepted an initial value as the decorator argument.
    // The Stage 3 version ignores it; the field initializer is the source of truth.
    class Foo {
      @reactive("legacy-ignored-default") accessor x: string = "from-field";
    }
    const foo = new Foo();
    expect(foo.x).toBe("from-field");
  });
});
