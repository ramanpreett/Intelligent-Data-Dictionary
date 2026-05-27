import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { Upload as UploadIcon, FileSpreadsheet, X, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/format";

type UploadState = "idle" | "uploading" | "success" | "error";

export function Upload() {
  const [, setLocation] = useLocation();
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const handleFile = useCallback((f: File) => {
    if (!f.name.endsWith(".csv")) {
      setError("Only CSV files are supported.");
      return;
    }
    setError(null);
    setFile(f);
    setUploadState("idle");
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) handleFile(dropped);
    },
    [handleFile]
  );

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected) handleFile(selected);
    },
    [handleFile]
  );

  const handleUpload = async () => {
    if (!file) return;
    setUploadState("uploading");
    setProgress(0);
    setError(null);

    // Simulate progress while uploading
    const progressInterval = setInterval(() => {
      setProgress((p) => Math.min(p + 10, 85));
    }, 150);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/datasets/upload", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);
      setProgress(100);

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Upload failed");
      }

      const dataset = await response.json() as { id: string | number };
      setUploadState("success");

      setTimeout(() => {
        setLocation(`/datasets/${dataset.id}`);
      }, 800);
    } catch (err) {
      clearInterval(progressInterval);
      setUploadState("error");
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
      setProgress(0);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-16">
      <div className="mb-10 text-center">
        <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-mono tracking-widest uppercase text-primary mb-6">
          Data Intake
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-3">Upload CSV Dataset</h1>
        <p className="text-muted-foreground">
          Drop your CSV file to begin automated schema analysis and AI-powered documentation.
        </p>
      </div>

      {/* Drop Zone */}
      <div
        data-testid="upload-dropzone"
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => !file && document.getElementById("file-input")?.click()}
        className={`
          relative rounded-xl border-2 border-dashed transition-all duration-300 cursor-pointer
          flex flex-col items-center justify-center p-12 text-center
          ${isDragging
            ? "border-primary bg-primary/10 shadow-[0_0_30px_rgba(108,207,246,0.3)]"
            : file
            ? "border-primary/50 bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-primary/5"
          }
        `}
      >
        <input
          id="file-input"
          type="file"
          accept=".csv"
          className="hidden"
          onChange={onFileInput}
          data-testid="input-file"
        />

        {!file ? (
          <>
            <div className="w-16 h-16 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center mb-6">
              <UploadIcon className="h-8 w-8 text-primary" />
            </div>
            <p className="text-lg font-semibold text-foreground mb-2">
              {isDragging ? "Release to upload" : "Drag & drop your CSV file"}
            </p>
            <p className="text-sm text-muted-foreground mb-4">or click to browse files</p>
            <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-mono text-primary">
              .CSV files only — up to 50 MB
            </span>
          </>
        ) : (
          <div className="w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center flex-shrink-0">
                <FileSpreadsheet className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="font-semibold text-foreground truncate" data-testid="text-filename">{file.name}</p>
                <p className="text-sm text-muted-foreground">{formatBytes(file.size)}</p>
              </div>
              {uploadState === "idle" && (
                <button
                  onClick={() => { setFile(null); setUploadState("idle"); setError(null); }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="button-remove-file"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
              {uploadState === "success" && <CheckCircle className="h-5 w-5 text-accent flex-shrink-0" />}
              {uploadState === "error" && <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />}
            </div>

            {/* Progress bar */}
            {uploadState === "uploading" && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Uploading...</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {uploadState === "success" && (
              <div className="mt-4 flex items-center gap-2 text-sm text-accent">
                <CheckCircle className="h-4 w-4" />
                <span>Upload complete — redirecting to analysis...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span data-testid="text-error">{error}</span>
        </div>
      )}

      {/* Actions */}
      {file && uploadState !== "success" && (
        <div className="mt-6 flex gap-3">
          <Button
            onClick={handleUpload}
            disabled={uploadState === "uploading"}
            className="flex-1 bg-primary text-primary-foreground font-bold hover:bg-primary/90 glow-border"
            data-testid="button-upload"
          >
            {uploadState === "uploading" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <UploadIcon className="mr-2 h-4 w-4" />
                Upload & Analyze
              </>
            )}
          </Button>
          {uploadState !== "uploading" && (
            <Button
              variant="outline"
              onClick={() => { setFile(null); setError(null); }}
              className="border-primary/30 text-primary hover:bg-primary/10"
              data-testid="button-cancel"
            >
              Cancel
            </Button>
          )}
        </div>
      )}

      {/* Info */}
      <div className="mt-10 glass-card rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-mono font-bold text-primary uppercase tracking-widest">What happens next</h3>
        {[
          "Column types are inferred (integer, float, date, email, category...)",
          "Null rates, unique value counts, and distributions are computed",
          "Primary key and foreign key candidates are auto-detected",
          "Click \"Analyze with AI\" to generate Gemini descriptions",
        ].map((item, i) => (
          <div key={i} className="flex gap-3 text-sm text-muted-foreground">
            <span className="font-mono text-accent flex-shrink-0">{String(i + 1).padStart(2, "0")}.</span>
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
