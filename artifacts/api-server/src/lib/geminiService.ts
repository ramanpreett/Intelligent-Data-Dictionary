import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ColumnAnalysis } from "./csvAnalyzer.js";

const apiKey = process.env.GEMINI_API_KEY;

function getClient(): GoogleGenerativeAI {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }
  return new GoogleGenerativeAI(apiKey);
}

export interface ColumnDescription {
  name: string;
  description: string;
  businessMeaning: string;
  suggestedUsage: string;
  dataQualityNotes: string;
}

export interface AIAnalysisResult {
  datasetSummary: string;
  businessGlossary: string;
  dataQualityScore: number;
  columnDescriptions: ColumnDescription[];
  relationshipExplanations: string[];
}

export async function generateDataDictionaryAnalysis(
  datasetName: string,
  columns: ColumnAnalysis[],
  rowCount: number,
  sampleRows: Record<string, string>[]
): Promise<AIAnalysisResult> {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const schemaDescription = columns.map((col) => ({
    name: col.name,
    type: col.dataType,
    nullable: col.nullable,
    nullPercent: col.nullPercent,
    uniquePercent: col.uniquePercent,
    sampleValues: col.sampleValues.slice(0, 3),
    isPrimaryKey: col.isPrimaryKey,
    isForeignKey: col.isForeignKey,
    foreignKeyRef: col.foreignKeyRef,
  }));

  const prompt = `You are a professional senior data analyst. Analyze the following dataset schema and generate a comprehensive data dictionary.

Dataset Name: ${datasetName}
Row Count: ${rowCount}
Columns: ${JSON.stringify(schemaDescription, null, 2)}

Sample Data (first 3 rows): ${JSON.stringify(sampleRows.slice(0, 3), null, 2)}

Generate a JSON response with EXACTLY this structure:
{
  "datasetSummary": "A 2-3 sentence human-readable summary of what this dataset contains and its likely business purpose",
  "businessGlossary": "A concise business glossary explaining key terms and concepts in this dataset (2-4 sentences)",
  "dataQualityScore": <number 0-100 representing overall data quality based on null percentages, data consistency, and completeness>,
  "columnDescriptions": [
    {
      "name": "<column name>",
      "description": "<clear, concise description of what this column stores>",
      "businessMeaning": "<business context and significance>",
      "suggestedUsage": "<how this field is typically used in analysis or operations>",
      "dataQualityNotes": "<any data quality concerns, anomalies, or recommendations>"
    }
  ],
  "relationshipExplanations": [
    "<explanation of key relationships between columns or to external entities>"
  ]
}

Return ONLY valid JSON, no markdown, no code blocks, no extra text.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  // Strip markdown code blocks if present
  const cleaned = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

  const parsed: AIAnalysisResult = JSON.parse(cleaned);

  // Ensure all columns have descriptions (fill missing ones)
  const descMap = new Map(parsed.columnDescriptions.map((d) => [d.name, d]));
  parsed.columnDescriptions = columns.map((col) => {
    return descMap.get(col.name) ?? {
      name: col.name,
      description: `${col.dataType} field storing ${col.name.replace(/_/g, " ")}`,
      businessMeaning: `Represents ${col.name.replace(/_/g, " ")} in the business context`,
      suggestedUsage: `Use for filtering and analysis by ${col.name.replace(/_/g, " ")}`,
      dataQualityNotes: col.nullPercent > 20 ? `High null rate (${col.nullPercent.toFixed(1)}%) — may need attention` : "No major quality issues detected",
    };
  });

  return parsed;
}
