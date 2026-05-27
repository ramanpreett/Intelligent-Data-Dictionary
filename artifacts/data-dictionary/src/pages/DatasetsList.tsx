import { Link, useLocation } from "wouter";
import { Database, Upload, Trash2, ExternalLink, Clock, FileSpreadsheet, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useListDatasets, useDeleteDataset, getListDatasetsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatBytes, formatDate } from "@/lib/format";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    uploading: { label: "Uploading", className: "border-muted-foreground/30 text-muted-foreground" },
    analyzing: { label: "Analyzing", className: "border-primary/40 text-primary bg-primary/10" },
    ready: { label: "Ready", className: "border-accent/40 text-accent bg-accent/10" },
    error: { label: "Error", className: "border-destructive/40 text-destructive bg-destructive/10" },
  };
  const s = map[status] ?? map.error;
  return (
    <Badge variant="outline" className={`font-mono text-xs ${s.className}`}>
      {status === "analyzing" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
      {s.label}
    </Badge>
  );
}

export function DatasetsList() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: datasets, isLoading, isError } = useListDatasets();
  const deleteMutation = useDeleteDataset();
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const confirmDelete = (id: number) => setDeleteId(id);

  const handleDelete = () => {
    if (deleteId == null) return;
    deleteMutation.mutate(
      { id: deleteId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListDatasetsQueryKey() });
          setDeleteId(null);
        },
        onError: () => setDeleteId(null),
      }
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-10">
        <div>
          <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-mono tracking-widest uppercase text-primary mb-3">
            Data Repository
          </div>
          <h1 className="text-3xl font-bold text-foreground">Datasets</h1>
          <p className="text-muted-foreground mt-1">All uploaded datasets and their analysis status.</p>
        </div>
        <Link href="/upload">
          <Button className="bg-primary text-primary-foreground font-bold hover:bg-primary/90 glow-border" data-testid="button-upload-new">
            <Upload className="mr-2 h-4 w-4" />
            Upload New
          </Button>
        </Link>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-3" />
          <span className="font-mono">Loading datasets...</span>
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-5 text-destructive">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>Failed to load datasets. Make sure the API server is running.</span>
        </div>
      )}

      {!isLoading && !isError && (!datasets || datasets.length === 0) && (
        <div className="glass-card rounded-xl p-16 text-center">
          <div className="w-16 h-16 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center mb-6 mx-auto">
            <Database className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-3">No datasets yet</h3>
          <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
            Upload your first CSV to begin automated analysis and AI-powered documentation.
          </p>
          <Link href="/upload">
            <Button className="bg-primary text-primary-foreground font-bold hover:bg-primary/90" data-testid="button-upload-first">
              <Upload className="mr-2 h-4 w-4" />
              Upload CSV
            </Button>
          </Link>
        </div>
      )}

      {datasets && datasets.length > 0 && (
        <div className="space-y-3">
          {datasets.map((dataset) => (
            <div
              key={dataset.id}
              data-testid={`card-dataset-${dataset.id}`}
              className="glass-card rounded-xl p-5 flex items-center gap-4 group hover:border-primary/40 transition-all duration-200"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center flex-shrink-0">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="font-semibold text-foreground truncate" data-testid={`text-dataset-name-${dataset.id}`}>
                    {dataset.name}
                  </h3>
                  <StatusBadge status={dataset.status} />
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground font-mono flex-wrap">
                  <span>{dataset.rowCount.toLocaleString()} rows</span>
                  <span>{dataset.columnCount} columns</span>
                  <span>{formatBytes(dataset.fileSize)}</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDate(dataset.createdAt)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-primary/30 text-primary hover:bg-primary/10 h-8"
                  onClick={() => setLocation(`/datasets/${dataset.id}`)}
                  data-testid={`button-view-${dataset.id}`}
                >
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  View
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-destructive/30 text-destructive hover:bg-destructive/10 h-8"
                  onClick={() => confirmDelete(dataset.id)}
                  data-testid={`button-delete-${dataset.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent className="glass-card border-destructive/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Delete Dataset</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will permanently delete this dataset and all its analysis data. This action cannot be undone.
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
