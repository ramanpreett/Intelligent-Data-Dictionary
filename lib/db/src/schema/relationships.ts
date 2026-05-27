import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const relationshipsTable = pgTable("relationships", {
  id: serial("id").primaryKey(),
  datasetId: integer("dataset_id").notNull(),
  fromColumn: text("from_column").notNull(),
  toColumn: text("to_column").notNull(),
  relationshipType: text("relationship_type").notNull().default("reference"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRelationshipSchema = createInsertSchema(relationshipsTable).omit({ id: true, createdAt: true });
export type InsertRelationship = z.infer<typeof insertRelationshipSchema>;
export type Relationship = typeof relationshipsTable.$inferSelect;
