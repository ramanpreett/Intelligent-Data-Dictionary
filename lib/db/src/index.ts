import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// Expose both Postgres (drizzle) and MongoDB adapters. When DATABASE_URL is
// a MongoDB connection string the helper functions below will use MongoDB.
export let pool: any = undefined;
export let db: any = undefined;

// MongoDB client and collections (initialized on demand)
let mongoClient: any = undefined;
let mongoDb: any = undefined;
let datasetsCol: any = undefined;
let columnsCol: any = undefined;
let relationshipsCol: any = undefined;
// In-memory fallback for development when Mongo isn't available
let memoryStore: {
  datasets: any[];
  columns: any[];
  relationships: any[];
} | null = null;
let mongoConnected = false;

function normalizeId(value: unknown): string | number {
  if (typeof value === "number") return value;
  const text = String(value);
  const numeric = Number(text);
  return Number.isFinite(numeric) && text.trim() === String(numeric) ? numeric : text;
}

async function getNextNumericId(collection: any): Promise<number> {
  const latest = await collection.findOne({}, { sort: { id: -1 }, projection: { id: 1 } });
  const current = typeof latest?.id === "number" ? latest.id : Number(latest?.id);
  return Number.isFinite(current) && current > 0 ? current + 1 : 1;
}

async function buildIdFilter(value: string | number) {
  return buildFieldFilter("id", value);
}

async function buildFieldFilter(fieldName: string, value: string | number) {
  const { ObjectId } = await import("mongodb");
  const normalized = normalizeId(value);
  const stringValue = String(value);
  const clauses: Array<Record<string, unknown>> = [];
  if (typeof normalized === "number") {
    clauses.push({ [fieldName]: normalized }, { [fieldName]: stringValue });
    if (fieldName === "id") clauses.push({ _id: stringValue });
    return { $or: clauses };
  }
  clauses.push({ [fieldName]: normalized });
  if (fieldName === "id") {
    clauses.push({ _id: normalized });
    if (/^[a-f\d]{24}$/i.test(stringValue)) {
      clauses.push({ _id: new ObjectId(stringValue) });
    }
  }
  return { $or: clauses };
}

function idsEqual(left: unknown, right: unknown) {
  return String(normalizeId(left)) === String(normalizeId(right));
}

async function ensureMongoConnected() {
  if (mongoClient) return;
  const { MongoClient } = await import("mongodb");
  mongoClient = new MongoClient(process.env.DATABASE_URL!);
  try {
    await mongoClient.connect();
    mongoDb = mongoClient.db(process.env.MONGO_DB_NAME || "ai_builder");
    datasetsCol = mongoDb.collection("datasets");
    columnsCol = mongoDb.collection("columns");
    relationshipsCol = mongoDb.collection("relationships");
    mongoConnected = true;
    memoryStore = null;
  } catch (err) {
    // If Mongo isn't available, fall back to an in-memory store for dev.
    // This keeps the app usable without an external DB.
    const error = err as Error;
    console.warn("Could not connect to MongoDB, using in-memory store for development.", error?.message || err);
    mongoClient = undefined;
    mongoDb = undefined;
    datasetsCol = undefined;
    columnsCol = undefined;
    relationshipsCol = undefined;
    mongoConnected = false;
    if (!memoryStore) {
      memoryStore = { datasets: [], columns: [], relationships: [] };
    }
  }
}

function ensureMemoryStore() {
  if (!memoryStore) {
    memoryStore = { datasets: [], columns: [], relationships: [] };
  }
}

// If DATABASE_URL looks like a MongoDB URI, create a Mongo adapter; otherwise
// try Postgres via drizzle.
if (!process.env.DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.warn(
    "DATABASE_URL not set — database disabled. Database calls will throw if used.",
  );
  pool = undefined;
  db = undefined;
} else if (process.env.DATABASE_URL.startsWith("mongodb://") || process.env.DATABASE_URL.startsWith("mongodb+srv://")) {
  // Export a minimal Mongo-compatible helper surface via exported functions
  // (see helpers below). Keep `db` truthy so code paths can detect availability.
  db = { type: "mongodb" };
} else {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle(pool, { schema });
}

// --- Mongo helper functions used by the API server routes ---
// These provide a minimal set of operations the app expects (create, read,
// update, delete for datasets, columns, relationships) when using MongoDB.
export async function createDataset(doc: any) {
  await ensureMongoConnected();
  const now = new Date();
  const toInsert = { ...doc, createdAt: now, updatedAt: now };
  if (mongoConnected && datasetsCol) {
    const id = await getNextNumericId(datasetsCol);
    const record = { id, ...toInsert };
    await datasetsCol.insertOne(record);
    return record;
  }
  // memory fallback
  // memory fallback
  ensureMemoryStore();
  const id = memoryStore.datasets.reduce((max, item) => Math.max(max, typeof item.id === "number" ? item.id : Number(item.id) || 0), 0) + 1;
  const record = { id, ...toInsert };
  memoryStore.datasets.push(record);
  return record;
}

export async function updateDataset(id: string | number, updates: any) {
  await ensureMongoConnected();
  updates.updatedAt = new Date();
  if (mongoConnected && datasetsCol) {
    await datasetsCol.updateOne(await buildIdFilter(id), { $set: updates });
    return await getDatasetById(id);
  }
  // memory fallback
  ensureMemoryStore();
  const idx = memoryStore.datasets.findIndex((d) => idsEqual(d.id, id));
  if (idx === -1) return null;
  memoryStore.datasets[idx] = { ...memoryStore.datasets[idx], ...updates };
  return memoryStore.datasets[idx];
}

export async function getDatasetById(id: string | number) {
  await ensureMongoConnected();
  if (mongoConnected && datasetsCol) {
    const doc = await datasetsCol.findOne(await buildIdFilter(id));
    if (!doc) return null;
    return { ...doc, id: normalizeId(doc.id ?? doc._id) };
  }
  // memory fallback
  ensureMemoryStore();
  const doc = memoryStore.datasets.find((d) => idsEqual(d.id, id));
  return doc || null;
}

export async function listDatasets() {
  await ensureMongoConnected();
  if (mongoConnected && datasetsCol) {
    const docs = await datasetsCol.find().sort({ createdAt: 1 }).toArray();
    return docs.map((d: any) => ({ ...d, id: normalizeId(d.id ?? d._id) }));
  }
  // memory fallback
  ensureMemoryStore();
  return memoryStore.datasets.map((d: any) => ({ ...d, id: normalizeId(d.id) }));
}

export async function deleteDatasetById(id: string | number) {
  await ensureMongoConnected();
  if (mongoConnected && columnsCol && relationshipsCol && datasetsCol) {
    const filter = await buildIdFilter(id);
    await columnsCol.deleteMany(await buildFieldFilter("datasetId", id));
    await relationshipsCol.deleteMany(await buildFieldFilter("datasetId", id));
    await datasetsCol.deleteOne(filter);
    return;
  }
  // memory fallback
  ensureMemoryStore();
  memoryStore.columns = memoryStore.columns.filter((c) => !idsEqual(c.datasetId, id));
  memoryStore.relationships = memoryStore.relationships.filter((r) => !idsEqual(r.datasetId, id));
  memoryStore.datasets = memoryStore.datasets.filter((d) => !idsEqual(d.id, id));
}

export async function insertColumns(cols: any[]) {
  await ensureMongoConnected();
  if (cols.length === 0) return [];
  if (mongoConnected && columnsCol) {
    const startId = await getNextNumericId(columnsCol);
    const records = cols.map((c, index) => ({ id: startId + index, ...c }));
    await columnsCol.insertMany(records);
    return records;
  }
  // memory fallback
  ensureMemoryStore();
  const out: any[] = [];
  for (const c of cols) {
    const id = memoryStore.columns.reduce((max, item) => Math.max(max, typeof item.id === "number" ? item.id : Number(item.id) || 0), 0) + 1;
    const rec = { id, ...c };
    memoryStore.columns.push(rec);
    out.push(rec);
  }
  return out;
}

export async function getColumnsByDatasetId(datasetId: string | number) {
  await ensureMongoConnected();
  if (mongoConnected && columnsCol) {
    const docs = await columnsCol.find(await buildFieldFilter("datasetId", datasetId)).toArray();
    return docs.map((d: any) => ({ ...d, id: normalizeId(d.id ?? d._id), datasetId: normalizeId(d.datasetId) }));
  }
  // memory fallback
  ensureMemoryStore();
  return memoryStore.columns.filter((c) => idsEqual(c.datasetId, datasetId)).map((d: any) => ({ ...d, id: normalizeId(d.id), datasetId: normalizeId(d.datasetId) }));
}

export async function insertRelationships(rels: any[]) {
  await ensureMongoConnected();
  if (rels.length === 0) return [];
  if (mongoConnected && relationshipsCol) {
    const startId = await getNextNumericId(relationshipsCol);
    const records = rels.map((r, index) => ({ id: startId + index, ...r }));
    await relationshipsCol.insertMany(records);
    return records;
  }
  // memory fallback
  ensureMemoryStore();
  const out: any[] = [];
  for (const r of rels) {
    const id = memoryStore.relationships.reduce((max, item) => Math.max(max, typeof item.id === "number" ? item.id : Number(item.id) || 0), 0) + 1;
    const rec = { id, ...r };
    memoryStore.relationships.push(rec);
    out.push(rec);
  }
  return out;
}

export async function getRelationshipsByDatasetId(datasetId: string | number) {
  await ensureMongoConnected();
  if (mongoConnected && relationshipsCol) {
    const docs = await relationshipsCol.find(await buildFieldFilter("datasetId", datasetId)).toArray();
    return docs.map((d: any) => ({ ...d, id: normalizeId(d.id ?? d._id), datasetId: normalizeId(d.datasetId) }));
  }
  // memory fallback
  ensureMemoryStore();
  return memoryStore.relationships.filter((r) => idsEqual(r.datasetId, datasetId)).map((d: any) => ({ ...d, id: normalizeId(d.id), datasetId: normalizeId(d.datasetId) }));
}

export async function updateColumnByDatasetIdAndName(datasetId: string | number, name: string, updates: any) {
  await ensureMongoConnected();
  if (mongoConnected && columnsCol) {
    await columnsCol.updateOne({ ...(await buildFieldFilter("datasetId", datasetId)), name }, { $set: updates });
    return;
  }
  // memory fallback
  ensureMemoryStore();
  const idx = memoryStore.columns.findIndex((c) => idsEqual(c.datasetId, datasetId) && c.name === name);
  if (idx !== -1) {
    memoryStore.columns[idx] = { ...memoryStore.columns[idx], ...updates };
  }
}

export * from "./schema";
