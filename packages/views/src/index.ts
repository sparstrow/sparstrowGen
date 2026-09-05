/**
 * `@sparstrow/views` — feature UI, one folder per domain, mirroring
 * `@sparstrow/core`.
 *
 * A view reads data through `@sparstrow/core` and renders with
 * `@sparstrow/ui`. It must not know which app is rendering it: no `next/*`, no
 * Electron, no router import. Navigation arrives as props — that is what lets
 * the same screen serve a browser tab and a desktop window.
 */
export { EntityTile, type EntityStatus, type EntityTileProps } from "./entity-tile";
export { MachineList, type MachineListProps } from "./machines/machine-list";
export { PlatformMark, platformLabel, type PlatformMarkProps } from "./machines/platform-mark";
export {
  ChatLayout,
  SessionList,
  Transcript,
  Composer,
  NewSessionDialog,
  type ChatLayoutProps,
  type SessionListProps,
  type TranscriptProps,
  type ComposerProps,
  type NewSessionDialogProps,
} from "./chat";

