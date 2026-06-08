import { ref, type Ref } from "vue";

/**
 * Use to define a reactive property on an object. Creates a getter and setter on the target
 * object that maintain a Vue ref under the hood.
 *
 * Example usage (Stage 3 decorators):
 *   @reactive()
 *   accessor reactiveArray: string[] = [];
 *
 * Note: The decorator argument is optional and ignored for backwards compatibility.
 * The initial value comes from the class field initializer.
 */
export default function reactive(_defaultValue?: unknown) {
  // WeakMap to store per-instance refs
  const instanceRefs = new WeakMap<object, Ref<unknown>>();

  return function <This extends object, T>(
    _target: ClassAccessorDecoratorTarget<This, T>,
    _context: ClassAccessorDecoratorContext<This, T>,
  ): ClassAccessorDecoratorResult<This, T> {
    return {
      get(this: This): T {
        const localRef = instanceRefs.get(this);
        if (!localRef) {
          // This shouldn't happen if init() was called
          return undefined as T;
        }
        return localRef.value as T;
      },
      set(this: This, value: T): void {
        let localRef = instanceRefs.get(this);
        if (!localRef) {
          localRef = ref(value);
          instanceRefs.set(this, localRef);
        } else {
          localRef.value = value;
        }
      },
      init(this: This, value: T): T {
        // Initialize the ref with the provided initial value from the class field
        const localRef = ref(value);
        instanceRefs.set(this, localRef);
        return value;
      },
    };
  };
}
