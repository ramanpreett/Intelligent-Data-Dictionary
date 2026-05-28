import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import {
  Loader2, Brain, Download, Trash2, Search, ArrowUpDown, AlertCircle,
  Key, Link2, Tag, CheckCircle, ChevronDown, ChevronUp, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  useGetDataset, useGetDatasetStats, useAnalyzeDataset, useDeleteDataset,
  getGetDatasetQueryKey, getGetDatasetStatsQueryKey, getListDatasetsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatBytes, formatDate } from "@/lib/format";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer
} from "recharts";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const TYPE_COLORS: Record<string, string> = {
  integer: "#6ccff6",
  float: "#98ce00",
  string: "#757780",
  category: "#4aa8cc",
  date: "#b8e066",
  email: "#5bc4e0",
  currency: "#7de89a",
  percentage: "#c8d860",
  boolean: "#90e0ef",
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="glass-card rounded-xl p-4 flex flex-col gap-1">
      <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">{label}</span>
      <span className="text-2xl font-bold text-foreground" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
        {value}
      </span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

function SchemaGraph({ columns, relationships }: {
  columns: Array<{ name: string; dataType: string; isPrimaryKey: boolean; isForeignKey: boolean }>;
  relationships: Array<{ fromColumn: string; toColumn: string; relationshipType: string }>;
}) {
  const cols = columns.slice(0, 20);
  const itemH = 32;
  const colW = 220;
  const svgH = Math.max(200, cols.length * itemH + 40);

  return (
    <svg width="100%" viewBox={`0 0 ${colW + 40} ${svgH}`} className="rounded-lg">
      <rect x="20" y="10" width={colW} height={svgH - 20} rx="6"
        fill="rgba(0,16,17,0.8)" stroke="rgba(108,207,246,0.4)" strokeWidth="1" />
      {cols.map((col, i) => {
        const y = 26 + i * itemH;
        const color = TYPE_COLORS[col.dataType] ?? "#757780";
        return (
          <g key={col.name}>
            <rect x="28" y={y - 10} width={colW - 16} height={itemH - 4} rx="3"
              fill={col.isPrimaryKey ? "rgba(108,207,246,0.12)" : col.isForeignKey ? "rgba(152,206,0,0.08)" : "transparent"}
              stroke={col.isPrimaryKey ? "rgba(108,207,246,0.3)" : col.isForeignKey ? "rgba(152,206,0,0.2)" : "transparent"}
              strokeWidth="1" />
            <circle cx="42" cy={y + 5} r="4" fill={color} />
            <text x="52" y={y + 9} fontSize="11" fill="#fffffc" fontFamily="monospace" fontWeight={col.isPrimaryKey ? "700" : "400"}>
              {col.name.length > 22 ? col.name.slice(0, 22) + "…" : col.name}
            </text>
            <text x={colW + 4} y={y + 9} fontSize="9" fill={color} fontFamily="monospace">
              {col.dataType}
            </text>
            {col.isPrimaryKey && (
              <text x={colW - 30} y={y + 9} fontSize="8" fill="#6ccff6" fontFamily="monospace" fontWeight="700">PK</text>
            )}
            {col.isForeignKey && (
              <text x={colW - 30} y={y + 9} fontSize="8" fill="#98ce00" fontFamily="monospace" fontWeight="700">FK</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

type SortDir = "asc" | "desc" | null;
type SortKey = "name" | "dataType" | "nullPercent" | "uniquePercent" | null;

export function DatasetDetail() {
  const { id } = useParams<{ id: string }>();
  const datasetId = id ?? "";
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"dictionary" | "schema" | "charts">("dictionary");

  const { data: dataset, isLoading, isError, refetch } = useGetDataset(datasetId, {
    query: { enabled: !!datasetId, queryKey: getGetDatasetQueryKey(datasetId as any) },
  });

  const { data: stats } = useGetDatasetStats(datasetId, {
    query: { enabled: !!datasetId, queryKey: getGetDatasetStatsQueryKey(datasetId as any) },
  });

  const analyzeMutation = useAnalyzeDataset();
  const deleteMutation = useDeleteDataset();

  const handleAnalyze = () => {
    analyzeMutation.mutate(
      { id: datasetId as any },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetDatasetQueryKey(datasetId as any) });
          queryClient.invalidateQueries({ queryKey: getGetDatasetStatsQueryKey(datasetId as any) });
        },
      }
    );
  };

  const handleExport = async () => {
    const response = await fetch(`/api/datasets/${datasetId}/export`);
    if (!response.ok) return;
    const text = await response.text();
    const blob = new Blob([text], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${dataset?.name.replace(".csv", "") ?? "dictionary"}_dictionary.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = () => {
    deleteMutation.mutate(
      { id: datasetId as any },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListDatasetsQueryKey() });
          setLocation("/datasets");
        },
      }
    );
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : d === "desc" ? null : "asc"));
      if (sortDir === "desc") setSortKey(null);
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const allTypes = useMemo(() => {
    if (!dataset) return [];
    return [...new Set(dataset.columns.map((c) => c.dataType))];
  }, [dataset]);

  const rowCountLabel = dataset?.rowCount != null ? dataset.rowCount.toLocaleString() : "0";

  const filteredColumns = useMemo(() => {
    if (!dataset) return [];
    let cols = dataset.columns;
    if (search) {
      const q = search.toLowerCase();
      cols = cols.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.dataType.toLowerCase().includes(q) ||
          (c.aiDescription ?? "").toLowerCase().includes(q)
      );
    }
    if (filterType !== "all") {
      cols = cols.filter((c) => c.dataType === filterType);
    }
    if (sortKey && sortDir) {
      cols = [...cols].sort((a, b) => {
        const av = a[sortKey as keyof typeof a] ?? "";
        const bv = b[sortKey as keyof typeof b] ?? "";
        const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return cols;
  }, [dataset, search, filterType, sortKey, sortDir]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-3" />
        <span className="font-mono">Loading dataset...</span>
      </div>
    );
  }

  if (isError || !dataset) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Dataset not found</h2>
        <p className="text-muted-foreground mb-6">This dataset may have been deleted or the ID is invalid.</p>
        <Button onClick={() => setLocation("/datasets")} variant="outline" className="border-primary/30 text-primary">
          Back to Datasets
        </Button>
      </div>
    );
  }

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      onClick={() => toggleSort(k)}
      className="flex items-center gap-1 hover:text-primary transition-colors text-xs font-mono uppercase tracking-wide"
      data-testid={`sort-${k}`}
    >
      {label}
      {sortKey === k && sortDir === "asc" ? (
        <ChevronUp className="h-3 w-3" />
      ) : sortKey === k && sortDir === "desc" ? (
        <ChevronDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <button
            onClick={() => setLocation("/datasets")}
            className="text-xs font-mono text-muted-foreground hover:text-primary transition-colors mb-2 flex items-center gap-1"
          >
            ← Back to Datasets
          </button>
          <h1 className="text-2xl font-bold text-foreground truncate max-w-xl" data-testid="text-dataset-name">
            {dataset.name}
          </h1>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground font-mono flex-wrap">
            <span>{rowCountLabel} rows</span>
            <span>{dataset.columnCount} columns</span>
            <span>{formatBytes(dataset.fileSize)}</span>
            <span>{formatDate(dataset.createdAt)}</span>
            {stats && <span className="text-accent">Quality: {stats.dataQualityScore.toFixed(0)}/100</span>}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={handleAnalyze}
            disabled={analyzeMutation.isPending}
            className="bg-primary text-primary-foreground font-bold hover:bg-primary/90 glow-border"
            data-testid="button-analyze"
          >
            {analyzeMutation.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analyzing...</>
            ) : dataset.aiSummary ? (
              <><RefreshCw className="mr-2 h-4 w-4" />Re-analyze</>
            ) : (
              <><Brain className="mr-2 h-4 w-4" />Analyze with AI</>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={handleExport}
            className="border-primary/30 text-primary hover:bg-primary/10"
            data-testid="button-export"
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => setDeleteOpen(true)}
            className="border-destructive/30 text-destructive hover:bg-destructive/10"
            data-testid="button-delete"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Analysis error */}
      {analyzeMutation.isError && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>AI analysis failed. Check your GEMINI_API_KEY and try again.</span>
        </div>
      )}

      {/* AI Summary */}
      {dataset.aiSummary && (
        <div className="mb-6 glass-card rounded-xl p-6 border-primary/30">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="h-4 w-4 text-primary" />
            <span className="text-xs font-mono text-primary uppercase tracking-widest">AI Dataset Summary</span>
          </div>
          <p className="text-foreground leading-relaxed mb-3" data-testid="text-ai-summary">{dataset.aiSummary}</p>
          {dataset.businessGlossary && (
            <div className="border-t border-primary/10 pt-3 mt-3">
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest block mb-2">Business Glossary</span>
              <p className="text-muted-foreground text-sm leading-relaxed">{dataset.businessGlossary}</p>
            </div>
          )}
          {stats && stats.dataQualityScore > 0 && (
            <div className="mt-4 flex items-center gap-3">
              <span className="text-xs font-mono text-muted-foreground">Data Quality Score</span>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[200px]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${stats.dataQualityScore}%`,
                    backgroundColor: stats.dataQualityScore >= 70 ? "#98ce00" : stats.dataQualityScore >= 40 ? "#6ccff6" : "#ef4444",
                  }}
                />
              </div>
              <span className="text-xs font-mono text-accent font-bold">{stats.dataQualityScore.toFixed(0)}/100</span>
            </div>
          )}
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          <StatCard label="Columns" value={stats.totalColumns} />
          <StatCard label="Numeric" value={stats.numericFields} />
          <StatCard label="Categorical" value={stats.categoricalFields} />
          <StatCard label="Missing Values" value={stats.missingValueCount.toLocaleString()} />
          <StatCard label="Duplicate Rows" value={stats.duplicateRows} />
          <StatCard label="Relationships" value={stats.relationshipCount} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-primary/10 pb-1">
        {(["dictionary", "schema", "charts"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-mono uppercase tracking-wide rounded-t transition-colors ${
              activeTab === tab
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`tab-${tab}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Data Dictionary Table */}
      {activeTab === "dictionary" && (
        <div>
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search columns..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-transparent border-primary/20 focus:border-primary/50 font-mono text-sm"
                data-testid="input-search"
              />
            </div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-card border border-primary/20 text-foreground text-sm rounded-md px-3 py-2 font-mono focus:outline-none focus:border-primary/50"
              data-testid="select-filter-type"
            >
              <option value="all">All Types</option>
              {allTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto rounded-xl border border-primary/20">
            <table className="w-full text-sm" data-testid="table-dictionary">
              <thead>
                <tr className="border-b border-primary/20 bg-primary/5">
                  <th className="text-left p-3 font-mono text-muted-foreground w-[180px]">
                    <SortBtn k="name" label="Field" />
                  </th>
                  <th className="text-left p-3 font-mono text-muted-foreground w-[100px]">
                    <SortBtn k="dataType" label="Type" />
                  </th>
                  <th className="text-left p-3 font-mono text-muted-foreground min-w-[200px]">Description</th>
                  <th className="text-left p-3 font-mono text-muted-foreground w-[80px]">
                    <SortBtn k="nullPercent" label="Null%" />
                  </th>
                  <th className="text-left p-3 font-mono text-muted-foreground w-[80px]">
                    <SortBtn k="uniquePercent" label="Uniq%" />
                  </th>
                  <th className="text-left p-3 font-mono text-muted-foreground min-w-[140px]">Sample Values</th>
                  <th className="text-left p-3 font-mono text-muted-foreground w-[100px]">Constraints</th>
                </tr>
              </thead>
              <tbody>
                {filteredColumns.map((col, i) => (
                  <tr
                    key={col.id}
                    data-testid={`row-column-${col.id}`}
                    className={`border-b border-primary/10 transition-colors hover:bg-primary/5 ${i % 2 === 0 ? "" : "bg-white/[0.01]"}`}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono font-semibold text-foreground text-xs">{col.name}</span>
                        {col.isPrimaryKey && (
                          <span title="Primary Key">
                            <Key className="h-3 w-3 text-primary" />
                          </span>
                        )}
                        {col.isForeignKey && (
                          <span title={`FK → ${col.foreignKeyRef}`}>
                            <Link2 className="h-3 w-3 text-accent" />
                          </span>
                        )}
                      </div>
                      {col.foreignKeyRef && (
                        <span className="text-[10px] text-accent font-mono">{col.foreignKeyRef}</span>
                      )}
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="outline"
                        className="text-[10px] font-mono"
                        style={{
                          borderColor: (TYPE_COLORS[col.dataType] ?? "#757780") + "60",
                          color: TYPE_COLORS[col.dataType] ?? "#757780",
                        }}
                      >
                        {col.dataType}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="space-y-1">
                        {col.aiDescription ? (
                          <p className="text-foreground text-xs leading-relaxed">{col.aiDescription}</p>
                        ) : (
                          <p className="text-muted-foreground text-xs italic">Run AI analysis to generate description</p>
                        )}
                        {col.businessMeaning && (
                          <p className="text-muted-foreground text-[10px]">{col.businessMeaning}</p>
                        )}
                        {(col.semanticTags ?? []).length > 0 && (
                          <div className="flex gap-1 flex-wrap mt-1">
                            {(col.semanticTags ?? []).slice(0, 3).map((tag) => (
                              <span key={tag} className="inline-flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-0.5 rounded border border-muted/40 text-muted-foreground">
                                <Tag className="h-2 w-2" />{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="text-xs font-mono text-center">
                        <span className={col.nullPercent > 30 ? "text-destructive" : col.nullPercent > 10 ? "text-yellow-400" : "text-accent"}>
                          {col.nullPercent.toFixed(1)}%
                        </span>
                        <div className="w-12 h-1 bg-muted rounded-full mt-1 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(col.nullPercent, 100)}%`,
                              backgroundColor: col.nullPercent > 30 ? "#ef4444" : col.nullPercent > 10 ? "#facc15" : "#98ce00",
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-xs font-mono text-muted-foreground">
                      {col.uniquePercent.toFixed(1)}%
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {col.sampleValues.slice(0, 3).map((v, vi) => (
                          <span
                            key={vi}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground truncate max-w-[80px]"
                            title={v}
                          >
                            {v}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="space-y-1">
                        {col.nullable === false && (
                          <span className="flex items-center gap-1 text-[10px] font-mono text-accent">
                            <CheckCircle className="h-3 w-3" />NOT NULL
                          </span>
                        )}
                        {col.isPrimaryKey && (
                          <span className="text-[10px] font-mono text-primary flex items-center gap-1">
                            <Key className="h-3 w-3" />PK
                          </span>
                        )}
                        {col.minValue && col.maxValue && (
                          <span className="text-[10px] font-mono text-muted-foreground block truncate" title={`${col.minValue}–${col.maxValue}`}>
                            {col.minValue}–{col.maxValue}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredColumns.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground text-sm font-mono">
                      No columns match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground font-mono mt-2">
            Showing {filteredColumns.length} of {dataset.columns.length} columns
          </p>
        </div>
      )}

      {/* Schema Graph Tab */}
      {activeTab === "schema" && (
        <div className="glass-card rounded-xl p-6">
          <h3 className="text-sm font-mono text-primary uppercase tracking-widest mb-4">Schema Structure</h3>
          {dataset.columns.length > 0 ? (
            <SchemaGraph
            columns={dataset.columns.map((c) => ({
              ...c,
              isPrimaryKey: c.isPrimaryKey ?? false,
              isForeignKey: c.isForeignKey ?? false,
            }))}
            relationships={dataset.relationships}
          />
          ) : (
            <p className="text-muted-foreground text-sm">No columns detected.</p>
          )}
          {dataset.relationships.length > 0 && (
            <div className="mt-6 border-t border-primary/10 pt-4">
              <h4 className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3">Detected Relationships</h4>
              <div className="space-y-2">
                {dataset.relationships.map((rel) => (
                  <div key={rel.id} className="flex items-center gap-3 text-sm">
                    <span className="font-mono text-foreground">{rel.fromColumn}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-mono text-accent">{rel.toColumn}</span>
                    <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary">
                      {rel.relationshipType}
                    </Badge>
                    {rel.description && (
                      <span className="text-muted-foreground text-xs">{rel.description}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Charts Tab */}
      {activeTab === "charts" && stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="glass-card rounded-xl p-6">
            <h3 className="text-sm font-mono text-primary uppercase tracking-widest mb-4">Column Type Distribution</h3>
            {(stats.columnTypeBreakdown ?? []).length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={stats.columnTypeBreakdown ?? []}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    dataKey="count"
                    nameKey="type"
                    label={({ type, percent }) => `${type} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {(stats.columnTypeBreakdown ?? []).map((entry, i) => (
                      <Cell key={i} fill={TYPE_COLORS[entry.type] ?? "#757780"} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#001011", border: "1px solid rgba(108,207,246,0.3)", borderRadius: "6px" }}
                    labelStyle={{ color: "#6ccff6" }}
                    itemStyle={{ color: "#fffffc" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-sm">No type data available.</p>
            )}
          </div>

          <div className="glass-card rounded-xl p-6">
            <h3 className="text-sm font-mono text-primary uppercase tracking-widest mb-4">Null Distribution (Top Columns)</h3>
            {(stats.nullDistribution ?? []).length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={stats.nullDistribution ?? []} layout="vertical" margin={{ left: 10 }}>
                  <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`}
                    tick={{ fill: "#757780", fontSize: 11, fontFamily: "monospace" }} />
                  <YAxis type="category" dataKey="column" width={90}
                    tick={{ fill: "#fffffc", fontSize: 10, fontFamily: "monospace" }} />
                  <Tooltip
                    formatter={(v: number) => [`${v.toFixed(1)}%`, "Null %"]}
                    contentStyle={{ background: "#001011", border: "1px solid rgba(108,207,246,0.3)", borderRadius: "6px" }}
                    labelStyle={{ color: "#6ccff6" }}
                    itemStyle={{ color: "#fffffc" }}
                  />
                  <Bar dataKey="nullPercent" radius={[0, 3, 3, 0]}>
                    {(stats.nullDistribution ?? []).map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.nullPercent > 30 ? "#ef4444" : entry.nullPercent > 10 ? "#facc15" : "#6ccff6"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-sm font-mono">No null values detected — clean data!</p>
            )}
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="glass-card border-destructive/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Delete Dataset</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will permanently delete "{dataset.name}" and all its analysis data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-primary/30 text-primary hover:bg-primary/10">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
