import { parse } from "csv-parse/sync";

export type DetectedType =
  | "integer"
  | "float"
  | "boolean"
  | "date"
  | "email"
  | "currency"
  | "percentage"
  | "category"
  | "string";

export interface ColumnAnalysis {
  name: string;
  dataType: DetectedType;
  nullable: boolean;
  nullCount: number;
  nullPercent: number;
  uniqueCount: number;
  uniquePercent: number;
  sampleValues: string[];
  minValue: string | null;
  maxValue: string | null;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  foreignKeyRef: string | null;
  semanticTags: string[];
}

export interface RelationshipAnalysis {
  fromColumn: string;
  toColumn: string;
  relationshipType: "primary_key" | "foreign_key" | "categorical" | "reference";
  description: string;
}

export interface DatasetAnalysis {
  rowCount: number;
  columnCount: number;
  duplicateRows: number;
  columns: ColumnAnalysis[];
  relationships: RelationshipAnalysis[];
}

function detectType(values: string[]): DetectedType {
  const nonEmpty = values.filter((v) => v !== "" && v !== null && v !== undefined);
  if (nonEmpty.length === 0) return "string";

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const dateRegex = /^\d{4}[-/]\d{2}[-/]\d{2}|^\d{2}[-/]\d{2}[-/]\d{4}/;
  const currencyRegex = /^[$€£¥][\d,]+(\.\d{2})?$|^[\d,]+(\.\d{2})?[$€£¥]$/;
  const percentRegex = /^\d+(\.\d+)?%$/;
  const intRegex = /^-?\d+$/;
  const floatRegex = /^-?\d+\.\d+$/;
  const boolRegex = /^(true|false|yes|no|1|0|t|f|y|n)$/i;

  let emailCount = 0,
    dateCount = 0,
    currencyCount = 0,
    percentCount = 0,
    intCount = 0,
    floatCount = 0,
    boolCount = 0;

  for (const v of nonEmpty) {
    if (emailRegex.test(v)) emailCount++;
    else if (currencyRegex.test(v)) currencyCount++;
    else if (percentRegex.test(v)) percentCount++;
    else if (dateRegex.test(v)) dateCount++;
    else if (boolRegex.test(v)) boolCount++;
    else if (intRegex.test(v)) intCount++;
    else if (floatRegex.test(v)) floatCount++;
  }

  const total = nonEmpty.length;
  const threshold = 0.8;

  if (emailCount / total >= threshold) return "email";
  if (currencyCount / total >= threshold) return "currency";
  if (percentCount / total >= threshold) return "percentage";
  if (dateCount / total >= threshold) return "date";
  if (boolCount / total >= threshold) return "boolean";
  if (intCount / total >= threshold) return "integer";
  if (floatCount / total >= threshold) return "float";

  // Category: low cardinality string
  const unique = new Set(nonEmpty).size;
  if (unique <= 20 && unique / total < 0.3 && total > 10) return "category";

  return "string";
}

function inferSemanticTags(name: string, type: DetectedType): string[] {
  const tags: string[] = [type];
  const lower = name.toLowerCase();
  if (lower.includes("id") || lower.endsWith("_id") || lower === "id") tags.push("identifier");
  if (lower.includes("name") || lower.includes("title")) tags.push("label");
  if (lower.includes("date") || lower.includes("time") || lower.includes("at")) tags.push("temporal");
  if (lower.includes("email")) tags.push("contact");
  if (lower.includes("phone") || lower.includes("mobile")) tags.push("contact");
  if (lower.includes("price") || lower.includes("cost") || lower.includes("amount") || lower.includes("revenue")) tags.push("financial");
  if (lower.includes("status") || lower.includes("state") || lower.includes("type") || lower.includes("category")) tags.push("classification");
  if (lower.includes("count") || lower.includes("total") || lower.includes("sum") || lower.includes("qty")) tags.push("metric");
  return [...new Set(tags)];
}

function detectPrimaryKey(name: string, values: string[], rowCount: number): boolean {
  const lower = name.toLowerCase();
  const uniqueCount = new Set(values.filter((v) => v !== "")).size;
  const isIdColumn = lower === "id" || lower.endsWith("_id") || lower.endsWith("id");
  return isIdColumn && uniqueCount === rowCount;
}

function detectForeignKey(name: string, allColumns: string[]): { isFk: boolean; ref: string | null } {
  const lower = name.toLowerCase();
  if (!lower.endsWith("_id") && !lower.endsWith("id") || lower === "id") {
    return { isFk: false, ref: null };
  }
  // e.g. customer_id → looks for "customer" entity in column names
  const base = lower.replace(/_id$/, "").replace(/id$/, "");
  if (!base) return { isFk: false, ref: null };

  const matchedEntity = allColumns.find((col) => {
    const colLower = col.toLowerCase();
    return colLower === base || colLower === `${base}_name` || colLower.startsWith(base);
  });

  if (matchedEntity || base.length > 2) {
    return { isFk: true, ref: base ? `${base.charAt(0).toUpperCase()}${base.slice(1)} entity` : null };
  }
  return { isFk: false, ref: null };
}

export function analyzeDataset(csvText: string): DatasetAnalysis {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
  }) as Record<string, string>[];

  if (records.length === 0) {
    return { rowCount: 0, columnCount: 0, duplicateRows: 0, columns: [], relationships: [] };
  }

  const columnNames = Object.keys(records[0]);
  const rowCount = records.length;

  // Count duplicates
  const rowHashes = records.map((r) => JSON.stringify(r));
  const duplicateRows = rowCount - new Set(rowHashes).size;

  const columnAnalyses: ColumnAnalysis[] = columnNames.map((colName) => {
    const allValues = records.map((r) => r[colName] ?? "");
    const nonEmpty = allValues.filter((v) => v !== "" && v !== null);
    const nullCount = allValues.length - nonEmpty.length;
    const nullPercent = rowCount > 0 ? (nullCount / rowCount) * 100 : 0;
    const uniqueValues = [...new Set(nonEmpty)];
    const uniqueCount = uniqueValues.length;
    const uniquePercent = nonEmpty.length > 0 ? (uniqueCount / nonEmpty.length) * 100 : 0;

    const dataType = detectType(nonEmpty);
    const isPrimaryKey = detectPrimaryKey(colName, allValues, rowCount);
    const { isFk, ref } = detectForeignKey(colName, columnNames);

    // Min/max for numeric/date types
    let minValue: string | null = null;
    let maxValue: string | null = null;
    if (["integer", "float", "date"].includes(dataType) && nonEmpty.length > 0) {
      if (dataType === "integer" || dataType === "float") {
        const nums = nonEmpty.map(Number).filter((n) => !isNaN(n));
        if (nums.length > 0) {
          minValue = String(Math.min(...nums));
          maxValue = String(Math.max(...nums));
        }
      } else {
        const sorted = [...nonEmpty].sort();
        minValue = sorted[0];
        maxValue = sorted[sorted.length - 1];
      }
    }

    const sampleValues = uniqueValues.slice(0, 5);

    return {
      name: colName,
      dataType,
      nullable: nullCount > 0,
      nullCount,
      nullPercent: Math.round(nullPercent * 100) / 100,
      uniqueCount,
      uniquePercent: Math.round(uniquePercent * 100) / 100,
      sampleValues,
      minValue,
      maxValue,
      isPrimaryKey,
      isForeignKey: !isPrimaryKey && isFk,
      foreignKeyRef: ref,
      semanticTags: inferSemanticTags(colName, dataType),
    };
  });

  // Detect relationships
  const relationships: RelationshipAnalysis[] = [];

  for (const col of columnAnalyses) {
    if (col.isPrimaryKey) {
      relationships.push({
        fromColumn: col.name,
        toColumn: col.name,
        relationshipType: "primary_key",
        description: `${col.name} is the primary key for this dataset`,
      });
    } else if (col.isForeignKey && col.foreignKeyRef) {
      relationships.push({
        fromColumn: col.name,
        toColumn: col.foreignKeyRef,
        relationshipType: "foreign_key",
        description: `${col.name} references ${col.foreignKeyRef}`,
      });
    } else if (col.dataType === "category") {
      relationships.push({
        fromColumn: col.name,
        toColumn: `${col.name} values`,
        relationshipType: "categorical",
        description: `${col.name} groups records into ${col.uniqueCount} categories`,
      });
    }
  }

  return { rowCount, columnCount: columnNames.length, duplicateRows, columns: columnAnalyses, relationships };
}
