import { pgTable, text, serial, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const datasetsTable = pgTable("datasets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  rowCount: integer("row_count").notNull().default(0),
  columnCount: integer("column_count").notNull().default(0),
  fileSize: integer("file_size").notNull().default(0),
  status: text("status").notNull().default("uploading"),
  aiSummary: text("ai_summary"),
  businessGlossary: text("business_glossary"),
  dataQualityScore: real("data_quality_score"),
  duplicateRows: integer("duplicate_rows").notNull().default(0),
  rawData: text("raw_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDatasetSchema = createInsertSchema(datasetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDataset = z.infer<typeof insertDatasetSchema>;
export type Dataset = typeof datasetsTable.$inferSelect;
