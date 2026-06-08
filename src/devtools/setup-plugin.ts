import { capitalize } from "vue";
import type { ApplicationStore } from "../application-store";
import { AsyncModel } from "../models";
import { Store } from "../stores";

const INSPECTOR_ID = "data-store";

const SKIPPED_KEYS = new Set(["store", "stores"]);

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
  allRecords: AsyncModel[],
  dataStore: ApplicationStore,
): AsyncModel | undefined {
  const fromAll = allRecords.find((record: AsyncModel) => record.id === nodeId);
  if (fromAll) return fromAll;

  for (const store of Object.values(dataStore)) {
    if (store.records && Array.isArray(store.records)) {
      const found = store.records.find((record: AsyncModel) => record.id === nodeId);
      if (found) return found;
    }
  }
  return undefined;
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

      // @ts-expect-error
      delete dataStore["client"];

      let allRecords = Object.values(dataStore).reduce((acc, s) => {
        try {
          return [...acc, ...s.records];
        } catch (e) {
          console.error(e);
          return acc;
        }
      }, []);

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

        payload.rootNodes = Object.entries(dataStore)
          .map(([storeName, storeInstance]) => {
            try {
              return createStoreTree({
                storeName,
                storeInstance,
                filter: payload.filter,
                filterState,
              });
            } catch (e) {
              console.error(`Failure attempting to create store tree for ${storeName}`, e);
              return null;
            }
          })
          .filter((x) => !!x);
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
        allRecords = Object.values(dataStore).reduce((acc, s) => {
          try {
            return [...acc, ...s.records];
          } catch (e) {
            console.error(e);
            return acc;
          }
        }, []);
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
  storeInstance: Store<any>;
  filter: string;
  filterState: { showNew: boolean; showPersisted: boolean };
}) {
  const searchFilterFn = filter
    ? (record: AsyncModel) => record.toString().toLowerCase().includes(filter.toLowerCase())
    : () => true;

  const booleanFilterFn = (record: AsyncModel) => {
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
          label: record.toString(),
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
