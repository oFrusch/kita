import { beforeEach, describe, expect, it } from "vitest";
import registry from "../src/model-store-registry";
import { AsyncModel, Model } from "../src/models";
import type { AsyncStore, Store } from "../src/stores";
import { resetRegistry } from "./helpers";

describe("ModelStoreRegistry", () => {
  beforeEach(() => {
    resetRegistry();
  });

  describe("stores", () => {
    it("registers and retrieves a store by id", () => {
      const store = {} as Store<Model>;
      registry.registerStore("users", store);
      expect(registry.getStore("users")).toBe(store);
    });

    it("returns undefined for an unknown store id", () => {
      expect(registry.getStore("missing")).toBeUndefined();
    });

    it("overwrites a previously registered store with the same id", () => {
      const a = {} as Store<Model>;
      const b = {} as Store<Model>;
      registry.registerStore("users", a);
      registry.registerStore("users", b);
      expect(registry.getStore("users")).toBe(b);
    });

    it("allStores returns every registered store", () => {
      const a = {} as Store<Model>;
      const b = {} as AsyncStore<AsyncModel>;
      registry.registerStore("users", a);
      registry.registerStore("posts", b);
      expect(registry.allStores()).toEqual({ users: a, posts: b });
    });
  });

  describe("models", () => {
    it("registers and retrieves a model by id", () => {
      class TestModel extends Model {
        static readonly id = "test";
      }
      registry.registerModel(TestModel);
      expect(registry.getModel("test")).toBe(TestModel);
    });

    it("returns undefined for an unknown model id", () => {
      expect(registry.getModel("missing")).toBeUndefined();
    });
  });
});
