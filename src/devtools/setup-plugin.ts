import { capitalize } from "vue";
import type { ApplicationStore } from "../application-store";
import type { AbstractModel } from "../models";

const INSPECTOR_ID = "data-store";

const SKIPPED_KEYS = new Set(["store", "stores"]);

/**
 * Matched structurally rather than by class: `Store` and `AsyncStore` share no
 * concrete base, and DevTools only ever reads `records`.
 */
type StoreLike = { records: AbstractModel[] };

/** Stores registered on the ApplicationStore, skipping non-store members such as `client`. */
function getStoreEntries(dataStore: ApplicationStore): Array<[string, StoreLike]> {
  return Object.entries(dataStore).filter((entry): entry is [string, StoreLike] => {
    const [, value] = entry;

    return value !== null && typeof value === "object" && Array.isArray(value.records);
  });
}

/**
 * `AbstractModel.toString()` returns the id, which is `undefined` on a record that
 * has never been persisted — so it is not the `string` its signature promises.
 */
function recordLabel(record: AbstractModel): string {
  return record.toString() || "";
}

/** Create a flat structure with dot notation to show nesting in DevTools */
function createFlatState(obj: any, prefix = ""): any[] {
  const result: any[] = [];

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (SKIPPED_KEYS.has(key) || typeof value === "function") {
      result.push({ key: fullKey, value: "[Skipped]", editable: false });
      continue;
    }

    if (typeof value !== "object" || value === null) {
      result.push({ key: fullKey, value, editable: false });
      continue;
    }

    if (Array.isArray(value)) {
      result.push({ key: fullKey, value: `[${value.length} items]`, editable: false });
      flattenArrayItems(result, value, fullKey);
    } else {
      result.push({
        key: fullKey,
        value: `{${Object.keys(value).length} properties}`,
        editable: false,
      });
      result.push(...createFlatState(value, fullKey));
    }
  }

  return result;
}

function flattenArrayItems(result: any[], items: any[], parentKey: string): void {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (typeof item === "object" && item !== null) {
      result.push(...createFlatState(item, `${parentKey}[${i}]`));
    } else {
      result.push({ key: `${parentKey}[${i}]`, value: item, editable: false });
    }
  }
}

/** Search all stores for a record by ID */
function findRecordInStores(
  nodeId: string,
  allRecords: AbstractModel[],
  dataStore: ApplicationStore,
): AbstractModel | undefined {
  const fromAll = allRecords.find((record) => record.id === nodeId);
  if (fromAll) return fromAll;

  return getStoreEntries(dataStore)
    .flatMap(([, store]) => store.records)
    .find((record) => record.id === nodeId);
}

const debounce = (callback: () => void, delay = 300) => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return (...args: []) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => callback.apply(this, args), delay);
  };
};

export default async function setupDevtools(app: any) {
  // Lazy-import so `@vue/devtools-api` lands in a separate chunk and never
  // ships in production bundles (the call site is guarded out for prod).
  const { setupDevtoolsPlugin } = await import("@vue/devtools-api");

  setupDevtoolsPlugin(
    {
      id: "kita-data-store",
      label: "Kita Data Store",
      app,
    },
    (api) => {
      const dataStore = app.config.globalProperties.store as ApplicationStore;

      let allRecords = getStoreEntries(dataStore).flatMap(([, store]) => store.records);

      const filterState = {
        showNew: true,
        showPersisted: true,
      };

      // Add to Vue Devtools Panel
      api.addInspector({
        id: INSPECTOR_ID,
        label: "Data Store",
        icon: "storage",
        treeFilterPlaceholder: "Search records",
        actions: [
          {
            icon: "fiber_new",
            tooltip: "Toggle Show/Hide New Records",
            action: debounce(() => {
              filterState.showNew = !filterState.showNew;
              api.sendInspectorTree(INSPECTOR_ID);
            }, 50),
          },
          {
            icon: "save",
            tooltip: "Toggle Show/Hide Persisted Records",
            action: debounce(() => {
              filterState.showPersisted = !filterState.showPersisted;
              api.sendInspectorTree(INSPECTOR_ID);
            }, 50),
          },
        ],
      });

      // Build UI
      api.on.getInspectorTree((payload /** context */) => {
        if (payload.inspectorId !== INSPECTOR_ID) return;

        payload.rootNodes = getStoreEntries(dataStore)
          .map(([storeName, storeInstance]) => {
            // A model may override `toString()`, so building one store's node can throw on
            // user code. Isolate it: one bad store must not blank the whole inspector.
            try {
              return createStoreTree({
                storeName,
                storeInstance,
                filter: payload.filter,
                filterState,
              });
            } catch (error: unknown) {
              console.error(`Failure attempting to create store tree for ${storeName}`, error);
              return null;
            }
          })
          .filter((node) => !!node);
      });

      // Show the selected record
      api.on.getInspectorState((payload) => {
        if (payload.inspectorId !== INSPECTOR_ID) return;

        const selectedRecord = findRecordInStores(payload.nodeId, allRecords, dataStore);

        if (!selectedRecord) {
          payload.state = {
            Error: [
              { key: "message", value: "Record not found", editable: false },
              { key: "nodeId", value: payload.nodeId, editable: false },
              { key: "availableRecords", value: allRecords.length, editable: false },
            ],
          };
          return;
        }

        try {
          payload.state = { Record: createFlatState(selectedRecord) };
        } catch (error: unknown) {
          payload.state = {
            Error: [
              {
                key: "message",
                value: `Error formatting record: ${error instanceof Error ? error.message : String(error)}`,
                editable: false,
              },
            ],
          };
        }
      });

      // refresh the UI every 2 seconds
      setInterval(() => {
        api.sendInspectorTree(INSPECTOR_ID);
        allRecords = getStoreEntries(dataStore).flatMap(([, store]) => store.records);
      }, 2000);
    },
  );
}

function createStoreTree({
  storeName,
  storeInstance,
  filter,
  filterState,
}: {
  storeName: string;
  storeInstance: StoreLike;
  filter: string;
  filterState: { showNew: boolean; showPersisted: boolean };
}) {
  const searchFilterFn = filter
    ? (record: AbstractModel) => recordLabel(record).toLowerCase().includes(filter.toLowerCase())
    : () => true;

  const booleanFilterFn = (record: AbstractModel) => {
    if (filterState.showNew && record.isNew) return true;
    if (filterState.showPersisted && !record.isNew) return true;

    return false;
  };

  return {
    id: storeName,
    label: `${capitalize(storeName)} (${storeInstance.records.length})`,
    children: storeInstance.records
      .filter(booleanFilterFn)
      .filter(searchFilterFn)
      .map((record) => {
        return {
          id: record.id,
          label: recordLabel(record),
          tags: [
            {
              label: record.isNew ? "New" : "Persisted",
              textColor: 0xffffff,
              backgroundColor: record.isNew ? 0x4caf50 : 0x2196f3,
            },
          ],
        };
      }),
  };
}
