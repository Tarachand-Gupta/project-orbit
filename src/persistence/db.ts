/**
 * Per-user world persistence via IndexedDB (browser-local, no server — see Tech Doc §9;
 * the project deliberately uses a file/browser-based store instead of Postgres/Turso).
 *
 * A world snapshot is the list of spawned objects (spec + transform + config overrides),
 * replayed by the builder on load.
 */

import { openDB, type IDBPDatabase } from "idb";
import type { SpawnedObject } from "@/state/store";

const DB_NAME = "project-orbit";
const DB_VERSION = 1;
const STORE = "worlds";
const DEFAULT_WORLD_ID = "default";
// Bump when the object/spec format changes so stale objects (e.g. old un-grounded vehicle models
// that float or spawn tilted) are dropped on load instead of rehydrated.
const SCHEMA_VERSION = 2;

interface WorldSnapshot {
  id: string;
  objects: SpawnedObject[];
  updatedAt: number;
  schema?: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) {
          database.createObjectStore(STORE, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

/** Returns true when IndexedDB is available (it isn't in some headless/SSR contexts). */
export function hasPersistence(): boolean {
  return typeof indexedDB !== "undefined";
}

export async function saveWorld(objects: SpawnedObject[], id = DEFAULT_WORLD_ID): Promise<void> {
  if (!hasPersistence()) return;
  try {
    const conn = await db();
    const snapshot: WorldSnapshot = { id, objects, updatedAt: Date.now(), schema: SCHEMA_VERSION };
    await conn.put(STORE, snapshot);
  } catch {
    // Persistence is best-effort; never let it break the game.
  }
}

export async function loadWorld(id = DEFAULT_WORLD_ID): Promise<SpawnedObject[]> {
  if (!hasPersistence()) return [];
  try {
    const conn = await db();
    const snapshot = (await conn.get(STORE, id)) as WorldSnapshot | undefined;
    // Drop snapshots from an older object format so stale/broken objects aren't rehydrated.
    if (!snapshot || snapshot.schema !== SCHEMA_VERSION) return [];
    return snapshot.objects ?? [];
  } catch {
    return [];
  }
}

export async function clearWorld(id = DEFAULT_WORLD_ID): Promise<void> {
  if (!hasPersistence()) return;
  try {
    const conn = await db();
    await conn.delete(STORE, id);
  } catch {
    /* ignore */
  }
}
