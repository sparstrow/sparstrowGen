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
export { MachineTabs, type MachineTabsProps, type MachineTabItem } from "./machines/machine-tabs";
export { MachineProfileHeader, type MachineProfileHeaderProps } from "./machines/machine-profile-header";
export { MachineSubtabs, type MachineSubtabsProps, type MachineSubtabKey } from "./machines/machine-subtabs";
export { MachineProfileView, type MachineProfileViewProps } from "./machines/machine-profile-view";
export { ProviderLogo, type ProviderLogoProps } from "./runtimes/provider-logo";
export { RuntimeTable, type RuntimeTableProps, type DiscoveredRuntime, type DiscoveredModel } from "./runtimes/runtime-table";
export { RuntimeInspector, type RuntimeInspectorProps } from "./runtimes/runtime-inspector";
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
