"use client";

import * as React from "react";
import type { ChatMessageAttachment } from "@sparstrow/shared";
import { CHAT_ATTACHMENT_BUCKET } from "@sparstrow/shared";
import { createClient } from "@web/utils/supabase/client";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  Search,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Copy,
  Check,
  FileCode,
  File as FileIcon,
  AlertCircle,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import * as XLSX from "xlsx";

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileCategory(
  mimeType: string,
  filename: string,
): "spreadsheet" | "pdf" | "markdown" | "text" | "image" | "unknown" {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    mimeType === "text/csv" ||
    ["xlsx", "xls", "csv"].includes(ext)
  ) {
    return "spreadsheet";
  }
  if (mimeType === "application/pdf" || ext === "pdf") {
    return "pdf";
  }
  if (mimeType === "text/markdown" || ["md", "markdown"].includes(ext)) {
    return "markdown";
  }
  if (
    mimeType.startsWith("image/") ||
    ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext)
  ) {
    return "image";
  }
  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    ["json", "txt", "js", "ts", "tsx", "jsx", "py", "sql", "yaml", "yml"].includes(ext)
  ) {
    return "text";
  }
  return "unknown";
}

function useAttachmentSignedUrl(storagePath: string): {
  url: string | null;
  state: "loading" | "ready" | "unavailable";
  handleError: () => void;
} {
  const [url, setUrl] = React.useState<string | null>(null);
  const [state, setState] = React.useState<"loading" | "ready" | "unavailable">("loading");
  const retriedRef = React.useRef(false);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let ignore = false;
    const supabase = createClient();
    supabase.storage
      .from(CHAT_ATTACHMENT_BUCKET)
      .createSignedUrl(storagePath, 3600)
      .then(({ data, error }) => {
        if (ignore) return;
        if (error || !data?.signedUrl) {
          setState("unavailable");
          return;
        }
        setUrl(data.signedUrl);
        setState("ready");
      })
      .catch(() => {
        if (!ignore) setState("unavailable");
      });
    return () => {
      ignore = true;
    };
  }, [storagePath, attempt]);

  const handleError = React.useCallback(() => {
    if (retriedRef.current) {
      setState("unavailable");
      return;
    }
    retriedRef.current = true;
    setAttempt((a) => a + 1);
  }, []);

  return { url, state, handleError };
}

// ── 1. Spreadsheet & CSV In-Pane Viewer ──────────────────────────────────────────

function SpreadsheetView({ url }: { url: string; filename: string }) {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [sheetNames, setSheetNames] = React.useState<string[]>([]);
  const [activeSheet, setActiveSheet] = React.useState<string>("");
  const [sheetsData, setSheetsData] = React.useState<Record<string, unknown[][]>>({});
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(0);
  const ROWS_PER_PAGE = 50;

  React.useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buffer) => {
        if (ignore) return;
        try {
          const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
          const names = workbook.SheetNames;
          if (names.length === 0) {
            setError("Spreadsheet contains no sheets.");
            setLoading(false);
            return;
          }
          const dataMap: Record<string, unknown[][]> = {};
          for (const name of names) {
            const worksheet = workbook.Sheets[name];
            if (worksheet) {
              const rows = XLSX.utils.sheet_to_json(worksheet, {
                header: 1,
                defval: "",
                raw: false,
              }) as unknown[][];
              dataMap[name] = rows;
            } else {
              dataMap[name] = [];
            }
          }
          setSheetNames(names);
          setActiveSheet(names[0] ?? "");
          setSheetsData(dataMap);
          setLoading(false);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to parse spreadsheet");
          setLoading(false);
        }
      })
      .catch((err) => {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "Failed to download file");
        setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [url]);

  const rawRows = sheetsData[activeSheet] ?? [];
  const headerRow = rawRows.length > 0 ? (rawRows[0] as unknown[]) : [];
  const dataRows = rawRows.length > 1 ? rawRows.slice(1) : [];

  const filteredRows = React.useMemo(() => {
    if (!search.trim()) return dataRows;
    const q = search.toLowerCase();
    return dataRows.filter((row) =>
      row.some((cell) => String(cell ?? "").toLowerCase().includes(q)),
    );
  }, [dataRows, search]);

  const totalPages = Math.ceil(filteredRows.length / ROWS_PER_PAGE) || 1;
  const paginatedRows = filteredRows.slice(
    page * ROWS_PER_PAGE,
    (page + 1) * ROWS_PER_PAGE,
  );

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
        <AlertCircle className="size-8 text-destructive mb-2" />
        <p className="text-sm font-medium text-foreground">Could not render spreadsheet</p>
        <p className="text-xs mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-3 py-2">
        {sheetNames.length > 1 ? (
          <Tabs value={activeSheet} onValueChange={(v: string) => { setActiveSheet(v); setPage(0); }}>
            <TabsList className="h-7">
              {sheetNames.map((name) => (
                <TabsTrigger key={name} value={name} className="px-2.5 py-1 text-xs">
                  {name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : (
          <Badge variant="outline" className="text-[11px] font-normal">
            {rawRows.length} rows &times; {headerRow.length} cols
          </Badge>
        )}

        <div className="relative w-full max-w-[200px]">
          <Search className="absolute left-2 top-2 size-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Filter cells…"
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <Table className="border-collapse text-xs">
          <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur z-10">
            <TableRow>
              <TableHead className="w-10 text-center font-mono text-[10px] text-muted-foreground border-r">
                #
              </TableHead>
              {headerRow.map((col, idx) => (
                <TableHead key={idx} className="font-semibold text-foreground border-r whitespace-nowrap px-3 py-2">
                  {String(col ?? "") || `Col ${idx + 1}`}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={Math.max(headerRow.length + 1, 1)}
                  className="py-10 text-center text-muted-foreground"
                >
                  {search ? "No matching rows found." : "Sheet is empty."}
                </TableCell>
              </TableRow>
            ) : (
              paginatedRows.map((row, rIdx) => (
                <TableRow key={rIdx} className="hover:bg-muted/40 transition-colors">
                  <TableCell className="w-10 text-center font-mono text-[10px] text-muted-foreground border-r select-none">
                    {page * ROWS_PER_PAGE + rIdx + 1}
                  </TableCell>
                  {headerRow.map((_, cIdx) => (
                    <TableCell key={cIdx} className="border-r px-3 py-1.5 whitespace-nowrap max-w-xs truncate">
                      {String(row[cIdx] ?? "")}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
          <span>
            Page {page + 1} of {totalPages} ({filteredRows.length} rows)
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="size-6"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-6"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 2. PDF In-Pane Viewer ────────────────────────────────────────────────────────

function PdfView({ url, filename }: { url: string; filename: string }) {
  return (
    <div className="relative h-full w-full bg-muted/10">
      <iframe
        src={`${url}#view=FitH&toolbar=1`}
        title={filename}
        className="h-full w-full border-0"
      />
    </div>
  );
}

// ── 3. Markdown / Code / Text In-Pane Viewer ─────────────────────────────────────

function TextCodeView({ url, category }: { url: string; category: string; filename: string }) {
  const [content, setContent] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (!ignore) {
          setContent(text);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Failed to load document content");
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [url]);

  const handleCopy = () => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
        <AlertCircle className="size-8 text-destructive mb-2" />
        <p className="text-sm font-medium text-foreground">Could not load document</p>
        <p className="text-xs mt-1">{error}</p>
      </div>
    );
  }

  if (category === "markdown") {
    return (
      <div className="relative h-full flex flex-col">
        <div className="flex items-center justify-end border-b bg-muted/20 px-3 py-1.5">
          <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-xs" onClick={handleCopy}>
            {copied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
            {copied ? "Copied" : "Copy Markdown"}
          </Button>
        </div>
        <div className="flex-1 overflow-auto p-4 prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content ?? ""}</ReactMarkdown>
        </div>
      </div>
    );
  }

  // Code / Plain text with line numbers
  const lines = (content ?? "").split("\n");

  return (
    <div className="relative h-full flex flex-col">
      <div className="flex items-center justify-between border-b bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
        <span>{lines.length} lines</span>
        <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-xs" onClick={handleCopy}>
          {copied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy text"}
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-3 font-mono text-xs leading-5">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} className="hover:bg-muted/30">
                <td className="w-8 select-none pr-3 text-right text-muted-foreground/60 text-[11px] align-top">
                  {idx + 1}
                </td>
                <td className="whitespace-pre-wrap break-all text-foreground align-top">{line || " "}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 4. Image In-Pane Viewer ──────────────────────────────────────────────────────

function ImageView({ url, filename }: { url: string; filename: string }) {
  const [zoom, setZoom] = React.useState(false);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end border-b bg-muted/20 px-3 py-1.5">
        <Button
          size="sm"
          variant="ghost"
          className="h-6 gap-1 px-2 text-xs"
          onClick={() => setZoom((z) => !z)}
        >
          {zoom ? <ZoomOut className="size-3" /> : <ZoomIn className="size-3" />}
          {zoom ? "Fit view" : "Actual size"}
        </Button>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-auto p-4 bg-muted/5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={filename}
          className={zoom ? "max-w-none object-none" : "max-h-full max-w-full object-contain rounded-md shadow-sm"}
        />
      </div>
    </div>
  );
}

// ── 5. Main DocumentSheetViewer Component ────────────────────────────────────────

export interface DocumentSheetViewerProps {
  attachment: ChatMessageAttachment;
  onBack?: () => void;
}

export function DocumentSheetViewer({ attachment, onBack }: DocumentSheetViewerProps): React.JSX.Element {
  const { url, state } = useAttachmentSignedUrl(attachment.storagePath);
  const category = getFileCategory(attachment.mimeType, attachment.filename);

  const renderIcon = () => {
    switch (category) {
      case "spreadsheet":
        return <FileSpreadsheet className="size-4 text-emerald-500" />;
      case "pdf":
        return <FileText className="size-4 text-rose-500" />;
      case "markdown":
      case "text":
        return <FileCode className="size-4 text-blue-500" />;
      case "image":
        return <ImageIcon className="size-4 text-amber-500" />;
      default:
        return <FileIcon className="size-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Inspector Top Bar */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-3 gap-2 bg-sidebar">
        <div className="flex min-w-0 items-center gap-2">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={onBack}
              title="Back to all files"
            >
              <ArrowLeft className="size-4" />
            </Button>
          )}
          <div className="shrink-0">{renderIcon()}</div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold leading-tight text-foreground" title={attachment.filename}>
              {attachment.filename}
            </p>
            <p className="text-[10px] text-muted-foreground">{formatFileSize(attachment.sizeBytes)}</p>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex shrink-0 items-center gap-1">
          {url && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              asChild
              title="Open in new tab"
            >
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
          )}
          {url && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              asChild
              title="Download file"
            >
              <a href={url} download={attachment.filename}>
                <Download className="size-3.5" />
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {state === "loading" && (
          <div className="space-y-3 p-4">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}

        {state === "unavailable" && (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground">
            <AlertCircle className="size-8 text-destructive mb-2" />
            <p className="text-sm font-medium text-foreground">File unavailable</p>
            <p className="text-xs mt-1">This attachment could not be reached or expired.</p>
          </div>
        )}

        {state === "ready" && url && (
          <>
            {category === "spreadsheet" && <SpreadsheetView url={url} filename={attachment.filename} />}
            {category === "pdf" && <PdfView url={url} filename={attachment.filename} />}
            {(category === "markdown" || category === "text") && (
              <TextCodeView url={url} category={category} filename={attachment.filename} />
            )}
            {category === "image" && <ImageView url={url} filename={attachment.filename} />}
            {category === "unknown" && (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                <FileIcon className="size-10 text-muted-foreground" />
                <p className="text-sm font-medium">{attachment.filename}</p>
                <p className="text-xs text-muted-foreground">{formatFileSize(attachment.sizeBytes)}</p>
                <Button size="sm" asChild className="gap-1.5 mt-2">
                  <a href={url} download={attachment.filename}>
                    <Download className="size-3.5" /> Download file
                  </a>
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
