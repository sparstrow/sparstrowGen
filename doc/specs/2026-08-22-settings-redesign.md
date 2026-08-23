# Spec: Settings Page Redesign & Appearance Picker

| | |
|---|---|
| **Status** | Owner-reviewed 2026-08-22 |
| **Created** | 2026-08-22 |
| **Trigger** | The owner found the nested tabs navigation confusing ("tabception") and wanted a unified single page redesign with working appearance controls, as built in the HTML prototype. |
| **Plan** | doc/plans/2026-08-22-SettingsRedesign.md |
| **Open questions** | none |

## The experience today

The Settings page currently suffers from heavily nested `<Tabs>` layout (what the owner called "tabception"). Navigating between Account, Workspace, Profile, and Preferences requires clicking through multiple layers of tabs, making it easy to get lost. Furthermore, the theme picker UI was entirely missing (parked as a known gap), leaving the user stuck with the default appearance. The contrast on status badges in light mode was also poor.

## What I expect instead

A unified, single-page settings experience using a Master-Detail sidebar layout, just like standard macOS or modern web apps. The user should be able to instantly jump to any settings category from the sidebar and bookmark or link directly to it. Crucially, the user must be able to customize the app's appearance (Surface Character, Brand Accent, and Expression Mode) with an interactive picker that applies the changes instantly across the entire application without a page reload or flicker.

---

## User stories

### US1 — Unified Sidebar Navigation (Priority: P1)

**Why this priority:** The current nested tab structure makes the Settings page frustrating to navigate. Flattening it into a sidebar is the foundational UX improvement that makes all other settings discoverable.

**Independent test:** Open `/settings`, click any category in the sidebar, and verify the main content area updates immediately.

**Acceptance scenarios:**

1. **Given** I am on the Settings page, **When** I look at the layout, **Then** I see a clear sidebar on the left grouping settings into "PERSONAL" and "WORKSPACE" categories.
2. **Given** I am on the Profile tab, **When** I click "Factory Health & Engine" in the sidebar, **Then** the URL updates to `?tab=health` and the main pane immediately displays the health cards.
3. **Given** I share the URL `/settings?tab=git` with a colleague, **When** they open it, **Then** the Settings page loads with the Git Credentials tab pre-selected and visible.

---

### US2 — Interactive Appearance Picker (Priority: P1)

**Why this priority:** The app currently lacks any way to change the theme, leaving users stuck with the default colors. The new design doctrine specifies 4 surfaces and 5 brand accents that need to be exposed to the user.

**Independent test:** Open `/settings?tab=appearance`, click the "Slate" surface and "Blue" brand, and verify the entire application's colors update instantly.

**Acceptance scenarios:**

1. **Given** I am on the Appearance tab, **When** I click the "Slate (Cool)" surface character, **Then** the background of the entire app instantly transitions to a cool blue-grey, without waiting for a server save.
2. **Given** I change my brand accent to "Rose", **When** I reload the page or open a new tab, **Then** the app loads immediately with the Rose accent, with no flash of unstyled content (FOUC).
3. **Given** I click "System" expression mode, **When** my OS changes from Light to Dark mode, **Then** the app automatically switches to the appropriate dark or light variant of my chosen surface.

---

### US3 — Preserve Existing Profile & Account Actions (Priority: P2)

**Why this priority:** While redesigning the layout, we cannot lose any existing functionality like updating the user avatar, bio, or the highly destructive account deletion.

**Independent test:** Open `/settings?tab=profile` and verify the avatar upload, name, and bio fields are present. Open `/settings?tab=danger` and verify the delete account card is present.

**Acceptance scenarios:**

1. **Given** I am on the Profile & Identity tab, **When** I look at the main pane, **Then** I see the `ProfileForm` allowing me to upload an avatar and update my bio.
2. **Given** I click the "Danger Zone" tab in the sidebar, **When** I click the delete account button, **Then** I am gated by an explicit confirmation dialog asking me to type my email address.

## Interface & experience

### Surfaces

| Surface | New or existing | What the owner does here |
|---|---|---|
| Settings Page (`/settings`) | Existing (Redesigned) | Manages all personal and workspace configuration in one place |
| Master-Detail Sidebar | New | Navigates between setting categories quickly |
| Appearance Picker Card | New | Selects the visual theme of the application |

### The four states

| State | What the owner sees |
|---|---|
| **Populated** | The sidebar lists all categories, the active category is highlighted, and the detail pane shows the relevant configuration cards. The Appearance swatches show the currently active theme with a selection ring. |
| **Empty** | Not applicable for the overall layout, but for Profile, an empty bio shows placeholder text suggesting what to write. |
| **Loading** | The profile and workspace forms show skeleton loaders shaped exactly like the form fields and avatars while fetching data from Supabase. |
| **Error** | If saving a preference (like the theme or bio) fails, an inline red text error appears explaining what failed, and the UI state reverts to the last known good state. |

### Flow

The owner clicks "Settings" in the main app shell. They land on `/settings` (defaulting to the Profile tab). They click "Appearance & Theme" in the left sidebar. The URL updates. They click the "Violet" brand swatch. The entire app's accent colors instantly change to Violet.

## Edge cases

- What happens if the user opens a URL with an invalid `?tab=unknown` parameter? (It should fall back gracefully or render nothing in the detail pane until a valid sidebar item is clicked).
- How should it behave if the user is in local single-user mode without an authenticated account? (The Profile tab should show the read-only local mode `ProfileCard` instead of the editable `ProfileForm`).
- What happens if the user's cookie gets deleted? (The app should gracefully fall back to the default Paper/Amber theme).

## Requirements

### Functional requirements

- **FR-001**: System MUST provide a unified sidebar navigation that replaces all nested tabs.
- **FR-002**: System MUST sync the active sidebar tab to the URL query string (`?tab=...`) for deep linking.
- **FR-003**: System MUST provide interactive swatches for 4 Surface Characters and 5 Brand Accents.
- **FR-004**: System MUST instantly apply theme changes to the DOM upon clicking a swatch, without waiting for a server response.
- **FR-005**: System MUST persist the chosen theme to both the cloud database and a local cookie to prevent FOUC on subsequent loads.
- **FR-006**: System MUST preserve all previous setting cards (Profile, Workspace, Git, Providers, Health, Danger Zone).

### Key entities

- **Theme Preference**: The user's visual configuration, consisting of a Surface Character, a Brand Accent, and an Expression Mode (Light/Dark/System).

## Success criteria

- **SC-001**: The user can navigate to any settings category with exactly one click from the sidebar.
- **SC-002**: Selecting a theme swatch updates the UI colors within 50ms, with zero page reloads.
- **SC-003**: Opening the app in a new tab loads the correct user-selected theme immediately without flickering through the default colors.

## Assumptions

- We assume the existing `@sparstrow/shared` theme dictionary (tokens) already contains the required CSS variables for all 4 surfaces and 5 brands.
- We assume the `settings-redesign.dc.html` prototype accurately reflects the final approved design doctrine.
- The `Danger Zone` tab is isolated at the bottom of the sidebar with a distinct red hover state to prevent accidental clicks.

**Reviewed:** 2026-08-22 — accepted
*(Note: Reviewed retroactively, as the spec was backfilled after the plan was executed).*
