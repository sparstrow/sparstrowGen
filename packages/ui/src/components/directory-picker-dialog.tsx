import * as React from "react";
import type { ProjectCreateMode } from "@sparstrow/shared";
import { ChevronUp, Folder, FolderPlus, HardDrive } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreateHostDir, useHostDir, useHostVolumes } from "@/api/hooks";
import { canCreateFolder, isSingleSegment } from "@/lib/directory-picker";

/**
 * 001 User Stories 2 and 3 — the in-app directory browser.
 *
 * Used wherever the native Explorer dialog does not exist: the dev server in a
 * browser, and any future web client. Nested inside the New project dialog, so
 * the form behind it stays mounted with its state intact.
 */

interface DirectoryPickerDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Decides whether New folder is offered at all (FR-016). */
  mode: ProjectCreateMode;
  /** The field's current value; opened at when it resolves, home otherwise (FR-005). */
  initialPath?: string;
  onSelect(absolutePath: string): void;
}

export function DirectoryPickerDialog({
  open,
  onOpenChange,
  mode,
  initialPath,
  onSelect,
}: DirectoryPickerDialogProps) {
  // undefined = the core's home directory; null = the volume list.
  const [dirPath, setDirPath] = React.useState<string | undefined>(initialPath);
  const [showVolumes, setShowVolumes] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [fellBackToHome, setFellBackToHome] = React.useState(false);

  const volumes = useHostVolumes(open && showVolumes);
  const listing = useHostDir(dirPath, open && !showVolumes);
  const createDir = useCreateHostDir();

  const initial = initialPath?.trim() || undefined;

  // Reset on every open so the picker never resumes a previous session's
  // position — it opens at the field, or at home. Nothing is persisted.
  React.useEffect(() => {
    if (!open) return;
    setDirPath(initial);
    setShowVolumes(false);
    setCreating(false);
    setNewName("");
    setFellBackToHome(false);
  }, [open, initial]);

  // FR-005: a field holding a path that no longer resolves must not strand the
  // owner on an error — fall back to home once.
  //
  // Scoped to the path we OPENED at, deliberately. An earlier version fired on
  // any failed listing, which silently teleported the owner home when they
  // clicked an unreadable folder instead of telling them what happened —
  // FR-014 wants that reported, not papered over.
  React.useEffect(() => {
    if (listing.isError && dirPath !== undefined && dirPath === initial && !fellBackToHome) {
      setFellBackToHome(true);
      setDirPath(undefined);
    }
  }, [listing.isError, dirPath, initial, fellBackToHome]);

  /** `undefined` means the core's home directory. */
  const goTo = (next?: string) => {
    setShowVolumes(false);
    setCreating(false);
    setNewName("");
    createDir.reset();
    setDirPath(next);
  };

  const current = listing.data;
  const canSelect = !showVolumes && Boolean(current);
  const showNewFolder = canCreateFolder(mode);
  const nameValid = isSingleSegment(newName);

  const submitNewFolder = () => {
    if (!current || !nameValid) return;
    createDir.mutate(
      { parent: current.path, name: newName.trim() },
      {
        // FR-020: land inside the folder just created, ready to select.
        onSuccess: (created) => goTo(created.path),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose a folder</DialogTitle>
          <DialogDescription>
            {showVolumes
              ? "Drives on this machine."
              : "Browse this machine and pick the project's root directory."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setShowVolumes(true);
              setCreating(false);
            }}
            disabled={showVolumes}
          >
            <HardDrive className="size-4" />
            Drives
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (current?.parent) goTo(current.parent);
              else setShowVolumes(true);
            }}
            disabled={showVolumes || !current}
          >
            <ChevronUp className="size-4" />
            Up
          </Button>
          <p
            className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground"
            title={showVolumes ? undefined : current?.path}
          >
            {showVolumes ? "Drives" : (current?.path ?? "…")}
          </p>
        </div>

        <ScrollArea className="h-72 rounded-lg border">
          <div className="p-1">
            {showVolumes ? (
              <VolumeList
                loading={volumes.isPending}
                error={volumes.isError ? volumes.error.message : null}
                items={volumes.data?.volumes ?? []}
                onPick={goTo}
              />
            ) : (
              <EntryList
                loading={listing.isPending}
                error={listing.isError ? listing.error.message : null}
                onRetryHome={() => goTo(undefined)}
                entries={current?.entries ?? []}
                onOpen={goTo}
              />
            )}
          </div>
        </ScrollArea>

        {current?.truncated && (
          <p className="text-xs text-muted-foreground">
            Showing the first 500 folders. If the one you want is missing, type its path instead.
          </p>
        )}

        {showNewFolder && !showVolumes && current && (
          <div className="space-y-1.5">
            {creating ? (
              <>
                <div className="flex items-center gap-2">
                  <Input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        submitNewFolder();
                      }
                    }}
                    placeholder="new-folder-name"
                    aria-label="New folder name"
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={submitNewFolder}
                    disabled={!nameValid || createDir.isPending}
                  >
                    {createDir.isPending ? "Creating…" : "Create"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setCreating(false);
                      setNewName("");
                      createDir.reset();
                    }}
                  >
                    Cancel
                  </Button>
                </div>
                {newName.trim() && !nameValid && (
                  <p className="text-xs text-destructive">
                    Enter a single folder name — not a path, and not “.” or “..”.
                  </p>
                )}
                {createDir.isError && (
                  <p className="text-xs text-destructive">{createDir.error.message}</p>
                )}
              </>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => setCreating(true)}>
                <FolderPlus className="size-4" />
                New folder
              </Button>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSelect}
            onClick={() => {
              if (!current) return;
              onSelect(current.path);
              // Close through the same path as Cancel and Escape, so focus
              // restoration lives in exactly one place.
              onOpenChange(false);
            }}
          >
            Select this folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-1 p-1">
      {Array.from({ length: 7 }, (_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}

function RowButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {icon}
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

function EntryList({
  loading,
  error,
  onRetryHome,
  entries,
  onOpen,
}: {
  loading: boolean;
  error: string | null;
  onRetryHome(): void;
  entries: { name: string; path: string }[];
  onOpen(path: string): void;
}) {
  if (loading) return <LoadingRows />;
  if (error) {
    return (
      <div className="p-2">
        <Alert variant="destructive">
          <AlertTitle>Cannot open this folder</AlertTitle>
          <AlertDescription>
            {error}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={onRetryHome}
            >
              Go to home folder
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Folder />
          </EmptyMedia>
          <EmptyTitle>No folders inside</EmptyTitle>
          <EmptyDescription>
            This folder has no subfolders. You can still choose it — an empty folder is exactly
            what “Start from scratch” wants.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <>
      {entries.map((entry) => (
        <RowButton
          key={entry.path}
          icon={<Folder className="size-4 shrink-0 text-muted-foreground" />}
          label={entry.name}
          onClick={() => onOpen(entry.path)}
        />
      ))}
    </>
  );
}

function VolumeList({
  loading,
  error,
  items,
  onPick,
}: {
  loading: boolean;
  error: string | null;
  items: { path: string; label: string }[];
  onPick(path: string): void;
}) {
  if (loading) return <LoadingRows />;
  if (error) {
    return (
      <div className="p-2">
        <Alert variant="destructive">
          <AlertTitle>Cannot list drives</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }
  return (
    <>
      {items.map((volume) => (
        <RowButton
          key={volume.path}
          icon={<HardDrive className="size-4 shrink-0 text-muted-foreground" />}
          label={volume.label}
          onClick={() => onPick(volume.path)}
        />
      ))}
    </>
  );
}
