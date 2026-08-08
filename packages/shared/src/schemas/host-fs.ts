import { z } from "zod";

/**
 * 001 — host filesystem browsing for the New project folder picker.
 *
 * These shapes are shared because core validates them and the UI consumes
 * them. The capability behind them is registered ONLY by a core running in
 * local/desktop mode and refuses non-loopback callers on top of that; see
 * FR-022a/b. Nothing here is safe to expose from a multi-tenant server.
 */

/** A drive or mount point — the top level of navigation. */
export const volumeSchema = z.object({
  /** Absolute root path: `C:\` on Windows, `/` on POSIX. */
  path: z.string(),
  /** Display label: the drive letter, or `/`. */
  label: z.string(),
});
export type Volume = z.infer<typeof volumeSchema>;

/** One navigable child. Files are never represented — they are not selectable. */
export const directoryEntrySchema = z.object({
  name: z.string(),
  /** Absolute path, so the client never has to know the host's separator. */
  path: z.string(),
});
export type DirectoryEntry = z.infer<typeof directoryEntrySchema>;

/** One level of navigation. */
export const directoryListingSchema = z.object({
  path: z.string(),
  /** null at a volume root — the signal to offer the volume list, not an up-navigation. */
  parent: z.string().nullable(),
  entries: z.array(directoryEntrySchema),
  /** True when the entry cap was hit. Must be surfaced, never swallowed (FR-013). */
  truncated: z.boolean(),
});
export type DirectoryListing = z.infer<typeof directoryListingSchema>;

export const volumeListSchema = z.object({ volumes: z.array(volumeSchema) });
export type VolumeList = z.infer<typeof volumeListSchema>;

/** Create exactly one directory, directly inside `parent`. */
export const createDirectoryRequestSchema = z.object({
  parent: z.string().min(1),
  name: z.string().min(1).max(255),
});
export type CreateDirectoryRequest = z.infer<typeof createDirectoryRequestSchema>;
