import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { eq, and } from "drizzle-orm";
import { db, datasetsTable, columnsTable, relationshipsTable } from "@workspace/db";
import {
  createDataset,
  updateDataset,
  getDatasetById,
  listDatasets,
  deleteDatasetById,
  insertColumns,
  getColumnsByDatasetId,
  insertRelationships,
  getRelationshipsByDatasetId,
  updateColumnByDatasetIdAndName,
} from "@workspace/db";
import {
  GetDatasetParams,
  DeleteDatasetParams,
  AnalyzeDatasetParams,
  GetDatasetStatsParams,
  ExportDatasetParams,
} from "@workspace/api-zod";
import { analyzeDataset } from "../../lib/csvAnalyzer.js";
import { generateDataDictionaryAnalysis } from "../../lib/geminiService.js";
import { logger } from "../../lib/logger.js";

const router: IRouter = Router();

function requireDb(res: any): boolean {
  if (!db) {
    res.status(503).json({ error: "Database not configured. Set DATABASE_URL to enable persistence." });
    return false;
  }
  return true;
}

const upload = multer({
  dest: path.join(process.cwd(), "uploads"),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files are allowed"));
    }
  },
});

// POST /datasets/upload
router.post("/datasets/upload", upload.single("file"), async (req, res): Promise<void> => {
  // If using MongoDB adapter, create dataset via helper functions
  if ((db && (db as any).type === "mongodb")) {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const filePath = req.file.path;
    const fileName = req.file.originalname;
    const fileSize = req.file.size;

    const dataset = await createDataset({ name: fileName, fileSize, status: "analyzing" });

    req.log.info({ datasetId: dataset.id }, "Dataset upload started");

    (async () => {
      try {
        const csvText = await fs.readFile(filePath, "utf-8");

        await updateDataset(dataset.id, { rawData: csvText });

        const analysis = analyzeDataset(csvText);

        if (analysis.columns.length > 0) {
          await insertColumns(
            analysis.columns.map((col) => ({
              datasetId: dataset.id,
              name: col.name,
              dataType: col.dataType,
              nullable: col.nullable,
              nullCount: col.nullCount,
              nullPercent: col.nullPercent,
              uniqueCount: col.uniqueCount,
              uniquePercent: col.uniquePercent,
              sampleValues: JSON.stringify(col.sampleValues),
              minValue: col.minValue ?? null,
              maxValue: col.maxValue ?? null,
              isPrimaryKey: col.isPrimaryKey,
              isForeignKey: col.isForeignKey,
              foreignKeyRef: col.foreignKeyRef ?? null,
              semanticTags: JSON.stringify(col.semanticTags),
            }))
          );
        }

        if (analysis.relationships.length > 0) {
          await insertRelationships(
            analysis.relationships.map((rel) => ({
              datasetId: dataset.id,
              fromColumn: rel.fromColumn,
              toColumn: rel.toColumn,
              relationshipType: rel.relationshipType,
              description: rel.description,
            }))
          );
        }

        await updateDataset(dataset.id, {
          rowCount: analysis.rowCount,
          columnCount: analysis.columnCount,
          duplicateRows: analysis.duplicateRows,
          status: "ready",
        });

        await fs.unlink(filePath).catch(() => {});

        logger.info({ datasetId: dataset.id }, "Dataset analysis complete");
      } catch (err) {
        logger.error({ err, datasetId: dataset.id }, "Dataset analysis failed");
        await updateDataset(dataset.id, { status: "error" });
        await fs.unlink(filePath).catch(() => {});
      }
    })();

    res.status(201).json({
      id: dataset.id,
      name: dataset.name,
      rowCount: dataset.rowCount ?? 0,
      columnCount: dataset.columnCount ?? 0,
      fileSize: dataset.fileSize,
      status: dataset.status,
      aiSummary: dataset.aiSummary ?? null,
      createdAt: dataset.createdAt,
    });

    return;
  }

  if (!requireDb(res)) return;

  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  const filePath = req.file.path;
  const fileName = req.file.originalname;
  const fileSize = req.file.size;

  // Insert placeholder dataset first
  const [dataset] = await db
    .insert(datasetsTable)
    .values({
      name: fileName,
      fileSize,
      status: "analyzing",
    })
    .returning();

  req.log.info({ datasetId: dataset.id }, "Dataset upload started");

  // Run analysis async — don't wait for Gemini, do structural analysis immediately
  (async () => {
    try {
      const csvText = await fs.readFile(filePath, "utf-8");

      // Store raw CSV for later Gemini analysis
      await db
        .update(datasetsTable)
        .set({ rawData: csvText })
        .where(eq(datasetsTable.id, dataset.id));

      const analysis = analyzeDataset(csvText);

      // Insert columns
      if (analysis.columns.length > 0) {
        await db.insert(columnsTable).values(
          analysis.columns.map((col) => ({
            datasetId: dataset.id,
            name: col.name,
            dataType: col.dataType,
            nullable: col.nullable,
            nullCount: col.nullCount,
            nullPercent: col.nullPercent,
            uniqueCount: col.uniqueCount,
            uniquePercent: col.uniquePercent,
            sampleValues: JSON.stringify(col.sampleValues),
            minValue: col.minValue ?? null,
            maxValue: col.maxValue ?? null,
            isPrimaryKey: col.isPrimaryKey,
            isForeignKey: col.isForeignKey,
            foreignKeyRef: col.foreignKeyRef ?? null,
            semanticTags: JSON.stringify(col.semanticTags),
          }))
        );
      }

      // Insert relationships
      if (analysis.relationships.length > 0) {
        await db.insert(relationshipsTable).values(
          analysis.relationships.map((rel) => ({
            datasetId: dataset.id,
            fromColumn: rel.fromColumn,
            toColumn: rel.toColumn,
            relationshipType: rel.relationshipType,
            description: rel.description,
          }))
        );
      }

      // Update dataset with counts
      await db
        .update(datasetsTable)
        .set({
          rowCount: analysis.rowCount,
          columnCount: analysis.columnCount,
          duplicateRows: analysis.duplicateRows,
          status: "ready",
        })
        .where(eq(datasetsTable.id, dataset.id));

      // Clean up temp file
      await fs.unlink(filePath).catch(() => {});

      logger.info({ datasetId: dataset.id }, "Dataset analysis complete");
    } catch (err) {
      logger.error({ err, datasetId: dataset.id }, "Dataset analysis failed");
      await db
        .update(datasetsTable)
        .set({ status: "error" })
        .where(eq(datasetsTable.id, dataset.id));
      await fs.unlink(filePath).catch(() => {});
    }
  })();

  res.status(201).json({
    id: dataset.id,
    name: dataset.name,
    rowCount: dataset.rowCount,
    columnCount: dataset.columnCount,
    fileSize: dataset.fileSize,
    status: dataset.status,
    aiSummary: null,
    createdAt: dataset.createdAt,
  });
});

// GET /datasets
router.get("/datasets", async (_req, res): Promise<void> => {
  if ((db && (db as any).type === "mongodb")) {
    const datasets = await listDatasets();
    res.json(datasets.map((d: any) => ({
      id: d.id,
      name: d.name,
      rowCount: d.rowCount ?? 0,
      columnCount: d.columnCount ?? 0,
      fileSize: d.fileSize ?? 0,
      status: d.status,
      aiSummary: d.aiSummary ?? null,
      createdAt: d.createdAt,
    })));
    return;
  }

  if (!requireDb(res)) return;

  const datasets = await db
    .select({
      id: datasetsTable.id,
      name: datasetsTable.name,
      rowCount: datasetsTable.rowCount,
      columnCount: datasetsTable.columnCount,
      fileSize: datasetsTable.fileSize,
      status: datasetsTable.status,
      aiSummary: datasetsTable.aiSummary,
      createdAt: datasetsTable.createdAt,
    })
    .from(datasetsTable)
    .orderBy(datasetsTable.createdAt);
  res.json(datasets);
});

// GET /datasets/:id
router.get("/datasets/:id", async (req, res): Promise<void> => {
  const params = GetDatasetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if ((db && (db as any).type === "mongodb")) {
    const dataset = await getDatasetById(params.data.id);
    if (!dataset) {
      res.status(404).json({ error: "Dataset not found" });
      return;
    }
    const columns = await getColumnsByDatasetId(dataset.id);
    const relationships = await getRelationshipsByDatasetId(dataset.id);

    res.json({
      id: dataset.id,
      name: dataset.name,
      rowCount: dataset.rowCount,
      columnCount: dataset.columnCount,
      fileSize: dataset.fileSize,
      status: dataset.status,
      aiSummary: dataset.aiSummary,
      businessGlossary: dataset.businessGlossary,
      dataQualityScore: dataset.dataQualityScore,
      duplicateRows: dataset.duplicateRows,
      createdAt: dataset.createdAt,
      columns: columns.map((col) => ({
        id: col.id,
        datasetId: col.datasetId,
        name: col.name,
        dataType: col.dataType,
        nullable: col.nullable,
        nullCount: col.nullCount,
        nullPercent: col.nullPercent,
        uniqueCount: col.uniqueCount,
        uniquePercent: col.uniquePercent,
        sampleValues: safeParseJson(col.sampleValues, []),
        minValue: col.minValue,
        maxValue: col.maxValue,
        isPrimaryKey: col.isPrimaryKey,
        isForeignKey: col.isForeignKey,
        foreignKeyRef: col.foreignKeyRef,
        aiDescription: col.aiDescription,
        businessMeaning: col.businessMeaning,
        suggestedUsage: col.suggestedUsage,
        dataQualityNotes: col.dataQualityNotes,
        semanticTags: safeParseJson(col.semanticTags, []),
      })),
      relationships: relationships.map((rel) => ({
        id: rel.id,
        datasetId: rel.datasetId,
        fromColumn: rel.fromColumn,
        toColumn: rel.toColumn,
        relationshipType: rel.relationshipType,
        description: rel.description,
      })),
    });
    return;
  }

  if (!requireDb(res)) return;
});

// DELETE /datasets/:id
router.delete("/datasets/:id", async (req, res): Promise<void> => {
  const params = DeleteDatasetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if ((db && (db as any).type === "mongodb")) {
    const dataset = await getDatasetById(params.data.id);
    if (!dataset) {
      res.status(404).json({ error: "Dataset not found" });
      return;
    }
    await deleteDatasetById(params.data.id);
    res.sendStatus(204);
    return;
  }

  if (!requireDb(res)) return;

  const [dataset] = await db
    .select()
    .from(datasetsTable)
    .where(eq(datasetsTable.id, params.data.id));

  if (!dataset) {
    res.status(404).json({ error: "Dataset not found" });
    return;
  }

  await db.delete(columnsTable).where(eq(columnsTable.datasetId, params.data.id));
  await db.delete(relationshipsTable).where(eq(relationshipsTable.datasetId, params.data.id));
  await db.delete(datasetsTable).where(eq(datasetsTable.id, params.data.id));

  res.sendStatus(204);
});

// POST /datasets/:id/analyze
router.post("/datasets/:id/analyze", async (req, res): Promise<void> => {
  const params = AnalyzeDatasetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if ((db && (db as any).type === "mongodb")) {
    const dataset = await getDatasetById(params.data.id);
    if (!dataset) {
      res.status(404).json({ error: "Dataset not found" });
      return;
    }
    const columns = await getColumnsByDatasetId(dataset.id);
    if (columns.length === 0) {
      res.status(400).json({ error: "Dataset has no columns to analyze" });
      return;
    }

    // Re-parse raw data for sample rows
    let sampleRows: Record<string, string>[] = [];
    if (dataset.rawData) {
      try {
        const { parse } = await import("csv-parse/sync");
        const records = parse(dataset.rawData, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          relax_quotes: true,
        }) as Record<string, string>[];
        sampleRows = records.slice(0, 5);
      } catch {
        // ignore
      }
    }

    const colAnalyses = columns.map((col) => ({
      name: col.name,
      dataType: col.dataType as import("../../lib/csvAnalyzer.js").DetectedType,
      nullable: col.nullable,
      nullCount: col.nullCount,
      nullPercent: col.nullPercent,
      uniqueCount: col.uniqueCount,
      uniquePercent: col.uniquePercent,
      sampleValues: safeParseJson(col.sampleValues, []),
      minValue: col.minValue,
      maxValue: col.maxValue,
      isPrimaryKey: col.isPrimaryKey,
      isForeignKey: col.isForeignKey,
      foreignKeyRef: col.foreignKeyRef,
      semanticTags: safeParseJson(col.semanticTags, []),
    }));

    try {
      req.log.info({ datasetId: dataset.id }, "Starting Gemini analysis");

      const aiResult = await generateDataDictionaryAnalysis(
        dataset.name,
        colAnalyses,
        dataset.rowCount,
        sampleRows
      );

      // Update dataset with AI results
      await updateDataset(dataset.id, {
        aiSummary: aiResult.datasetSummary,
        businessGlossary: aiResult.businessGlossary,
        dataQualityScore: aiResult.dataQualityScore,
        status: "ready",
      });

      // Update columns with AI descriptions
      for (const desc of aiResult.columnDescriptions) {
        await updateColumnByDatasetIdAndName(dataset.id, desc.name, {
          aiDescription: desc.description,
          businessMeaning: desc.businessMeaning,
          suggestedUsage: desc.suggestedUsage,
          dataQualityNotes: desc.dataQualityNotes,
        });
      }

      res.json({
        datasetId: dataset.id,
        status: "ready",
        aiSummary: aiResult.datasetSummary,
        businessGlossary: aiResult.businessGlossary,
        dataQualityScore: aiResult.dataQualityScore,
      });
    } catch (err) {
      req.log.error({ err, datasetId: dataset.id }, "Gemini analysis failed");
      res.status(500).json({ error: "AI analysis failed. Please check your GEMINI_API_KEY and try again." });
    }

    return;
  }

  if (!requireDb(res)) return;

  const [dataset] = await db
    .select()
    .from(datasetsTable)
    .where(eq(datasetsTable.id, params.data.id));

  if (!dataset) {
    res.status(404).json({ error: "Dataset not found" });
    return;
  }

  const columns = await db
    .select()
    .from(columnsTable)
    .where(eq(columnsTable.datasetId, dataset.id));

  // Re-parse raw data for sample rows
  let sampleRows: Record<string, string>[] = [];
  if (dataset.rawData) {
    try {
      const { parse } = await import("csv-parse/sync");
      const records = parse(dataset.rawData, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_quotes: true,
      }) as Record<string, string>[];
      sampleRows = records.slice(0, 5);
    } catch {
      // ignore
    }
  }

  const colAnalyses = columns.map((col) => ({
    name: col.name,
    dataType: col.dataType as import("../../lib/csvAnalyzer.js").DetectedType,
    nullable: col.nullable,
    nullCount: col.nullCount,
    nullPercent: col.nullPercent,
    uniqueCount: col.uniqueCount,
    uniquePercent: col.uniquePercent,
    sampleValues: safeParseJson(col.sampleValues, []),
    minValue: col.minValue,
    maxValue: col.maxValue,
    isPrimaryKey: col.isPrimaryKey,
    isForeignKey: col.isForeignKey,
    foreignKeyRef: col.foreignKeyRef,
    semanticTags: safeParseJson(col.semanticTags, []),
  }));

  try {
    req.log.info({ datasetId: dataset.id }, "Starting Gemini analysis");

    const aiResult = await generateDataDictionaryAnalysis(
      dataset.name,
      colAnalyses,
      dataset.rowCount,
      sampleRows
    );

    // Update dataset with AI results
    await db
      .update(datasetsTable)
      .set({
        aiSummary: aiResult.datasetSummary,
        businessGlossary: aiResult.businessGlossary,
        dataQualityScore: aiResult.dataQualityScore,
        status: "ready",
      })
      .where(eq(datasetsTable.id, dataset.id));

    // Update columns with AI descriptions
    for (const desc of aiResult.columnDescriptions) {
      await db
        .update(columnsTable)
        .set({
          aiDescription: desc.description,
          businessMeaning: desc.businessMeaning,
          suggestedUsage: desc.suggestedUsage,
          dataQualityNotes: desc.dataQualityNotes,
        })
        .where(and(eq(columnsTable.datasetId, dataset.id), eq(columnsTable.name, desc.name)));
    }

    res.json({
      datasetId: dataset.id,
      status: "ready",
      aiSummary: aiResult.datasetSummary,
      businessGlossary: aiResult.businessGlossary,
      dataQualityScore: aiResult.dataQualityScore,
    });
  } catch (err) {
    req.log.error({ err, datasetId: dataset.id }, "Gemini analysis failed");
    res.status(500).json({ error: "AI analysis failed. Please check your GEMINI_API_KEY and try again." });
  }
});

// GET /datasets/:id/stats
router.get("/datasets/:id/stats", async (req, res): Promise<void> => {
  const params = GetDatasetStatsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Ensure variables are available in both Mongo and SQL branches
  let dataset: any = null;
  let columns: any[] = [];
  let relationships: any[] = [];

  if ((db && (db as any).type === "mongodb")) {
    dataset = await getDatasetById(params.data.id);
    if (!dataset) {
      res.status(404).json({ error: "Dataset not found" });
      return;
    }
    columns = await getColumnsByDatasetId(dataset.id);
    relationships = await getRelationshipsByDatasetId(dataset.id);
  } else {
    if (!requireDb(res)) return;

    const [ds] = await db
      .select()
      .from(datasetsTable)
      .where(eq(datasetsTable.id, params.data.id));

    if (!ds) {
      res.status(404).json({ error: "Dataset not found" });
      return;
    }

    dataset = ds;

    columns = await db
      .select()
      .from(columnsTable)
      .where(eq(columnsTable.datasetId, dataset.id));

    relationships = await db
      .select()
      .from(relationshipsTable)
      .where(eq(relationshipsTable.datasetId, dataset.id));
  }

  const numericTypes = new Set(["integer", "float", "currency", "percentage"]);
  const categoricalTypes = new Set(["category", "boolean"]);
  const dateTypes = new Set(["date"]);

  const numericFields = columns.filter((c) => numericTypes.has(c.dataType)).length;
  const categoricalFields = columns.filter((c) => categoricalTypes.has(c.dataType)).length;
  const dateFields = columns.filter((c) => dateTypes.has(c.dataType)).length;
  const stringFields = columns.filter((c) => !numericTypes.has(c.dataType) && !categoricalTypes.has(c.dataType) && !dateTypes.has(c.dataType)).length;
  const missingValueCount = columns.reduce((sum, c) => sum + c.nullCount, 0);
  const nullableColumns = columns.filter((c) => c.nullable).length;
  const primaryKeyCandidates = columns.filter((c) => c.isPrimaryKey).length;

  // Type breakdown for pie chart
  const typeCounts: Record<string, number> = {};
  for (const col of columns) {
    typeCounts[col.dataType] = (typeCounts[col.dataType] || 0) + 1;
  }
  const columnTypeBreakdown = Object.entries(typeCounts).map(([type, count]) => ({ type, count }));

  // Top nullable columns for bar chart
  const nullDistribution = columns
    .filter((c) => c.nullPercent > 0)
    .sort((a, b) => b.nullPercent - a.nullPercent)
    .slice(0, 10)
    .map((c) => ({ column: c.name, nullPercent: c.nullPercent }));

  res.json({
    totalColumns: columns.length,
    numericFields,
    categoricalFields,
    dateFields,
    stringFields,
    missingValueCount,
    duplicateRows: dataset.duplicateRows,
    relationshipCount: relationships.length,
    dataQualityScore: dataset.dataQualityScore ?? 0,
    nullableColumns,
    primaryKeyCandidates,
    columnTypeBreakdown,
    nullDistribution,
  });
});

// GET /datasets/:id/export
router.get("/datasets/:id/export", async (req, res): Promise<void> => {
  const params = ExportDatasetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Ensure variables are available in both Mongo and SQL branches
  let dataset: any = null;
  let columns: any[] = [];

  if ((db && (db as any).type === "mongodb")) {
    dataset = await getDatasetById(params.data.id);
    if (!dataset) {
      res.status(404).json({ error: "Dataset not found" });
      return;
    }
    columns = await getColumnsByDatasetId(dataset.id);
  } else {
    if (!requireDb(res)) return;

    const [ds] = await db
      .select()
      .from(datasetsTable)
      .where(eq(datasetsTable.id, params.data.id));

    if (!ds) {
      res.status(404).json({ error: "Dataset not found" });
      return;
    }

    dataset = ds;

    columns = await db
      .select()
      .from(columnsTable)
      .where(eq(columnsTable.datasetId, dataset.id));
  }

  const headers = [
    "Field Name",
    "Data Type",
    "Description",
    "Business Meaning",
    "Null %",
    "Unique %",
    "Sample Values",
    "Primary Key",
    "Foreign Key",
    "Foreign Key Ref",
    "Suggested Usage",
    "Data Quality Notes",
  ];

  const rows = columns.map((col) => {
    const samples = safeParseJson<string[]>(col.sampleValues, []);
    return [
      col.name,
      col.dataType,
      col.aiDescription ?? "",
      col.businessMeaning ?? "",
      `${col.nullPercent.toFixed(1)}%`,
      `${col.uniquePercent.toFixed(1)}%`,
      samples.slice(0, 3).join("; "),
      col.isPrimaryKey ? "Yes" : "No",
      col.isForeignKey ? "Yes" : "No",
      col.foreignKeyRef ?? "",
      col.suggestedUsage ?? "",
      col.dataQualityNotes ?? "",
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
  });

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${dataset.name.replace(".csv", "")}_dictionary.csv"`);
  res.send(csv);
});

function safeParseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export default router;
