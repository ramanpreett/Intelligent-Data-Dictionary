import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ColumnAnalysis } from "./csvAnalyzer.js";
import { logger } from "./logger.js";

const apiKey = process.env.GEMINI_API_KEY;

function getClient(apiVersion = "v1beta"): GoogleGenerativeAI {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }
  // GoogleGenerativeAI accepts an optional RequestOptions second arg at runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new (GoogleGenerativeAI as any)(apiKey, { apiVersion });
}

// Preferred model names ordered by preference (matches what v1beta lists)
const PREFERRED_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-001",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash-lite-001",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-pro-latest",
];

// Cache discovered models for 10 minutes
let discoveredModels: string[] | null = null;
let discoveryTs = 0;
const DISCOVERY_TTL_MS = 10 * 60 * 1000;

async function listSupportedModels(): Promise<string[]> {
  const now = Date.now();
  if (discoveredModels && now - discoveryTs < DISCOVERY_TTL_MS) {
    return discoveredModels;
  }

  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`
  );

  if (!res.ok) {
    logger.warn({ status: res.status }, "Failed to list Gemini models, using defaults");
    return PREFERRED_MODELS;
  }

  const data = await res.json() as {
    models?: Array<{ name: string; supportedGenerationMethods?: string[] }>;
  };

  const available = (data.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace("models/", ""));

  logger.info({ count: available.length, models: available }, "Discovered available Gemini models");

  // Sort by preferred order, then append remaining ones
  const sorted = [
    ...PREFERRED_MODELS.filter((p) => available.includes(p)),
    ...available.filter((a) => !PREFERRED_MODELS.includes(a)),
  ];

  discoveredModels = sorted.length > 0 ? sorted : PREFERRED_MODELS;
  discoveryTs = now;
  return discoveredModels;
}

async function tryGenerateWithFallback(prompt: string): Promise<string> {
  const models = await listSupportedModels();
  let lastError: unknown;

  // Try v1beta first, then v1 for 404s
  for (const modelName of models) {
    for (const apiVersion of ["v1beta", "v1"]) {
      try {
        logger.info({ model: modelName, apiVersion }, "Attempting Gemini model");
        const genAI = getClient(apiVersion);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();
        logger.info({ model: modelName, apiVersion }, "Gemini model succeeded");
        return text;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const is404 = message.includes("404") || message.includes("Not Found");
        const is429 = message.includes("429") || message.includes("Too Many Requests");
        logger.warn({ model: modelName, apiVersion, is404, is429 }, "Gemini model attempt failed");
        lastError = err;
        // Only try v1 if we got a 404 in v1beta; otherwise break inner loop
        if (!is404) break;
      }
    }
  }

  throw new Error(
    `All Gemini models failed. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
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

  const text = await tryGenerateWithFallback(prompt);

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
