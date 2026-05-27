import { pgTable, text, serial, timestamp, integer, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const columnsTable = pgTable("columns", {
  id: serial("id").primaryKey(),
  datasetId: integer("dataset_id").notNull(),
  name: text("name").notNull(),
  dataType: text("data_type").notNull().default("string"),
  nullable: boolean("nullable").notNull().default(true),
  nullCount: integer("null_count").notNull().default(0),
  nullPercent: real("null_percent").notNull().default(0),
  uniqueCount: integer("unique_count").notNull().default(0),
  uniquePercent: real("unique_percent").notNull().default(0),
  sampleValues: text("sample_values").notNull().default("[]"),
  minValue: text("min_value"),
  maxValue: text("max_value"),
  isPrimaryKey: boolean("is_primary_key").notNull().default(false),
  isForeignKey: boolean("is_foreign_key").notNull().default(false),
  foreignKeyRef: text("foreign_key_ref"),
  aiDescription: text("ai_description"),
  businessMeaning: text("business_meaning"),
  suggestedUsage: text("suggested_usage"),
  dataQualityNotes: text("data_quality_notes"),
  semanticTags: text("semantic_tags").notNull().default("[]"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertColumnSchema = createInsertSchema(columnsTable).omit({ id: true, createdAt: true });
export type InsertColumn = z.infer<typeof insertColumnSchema>;
export type Column = typeof columnsTable.$inferSelect;
