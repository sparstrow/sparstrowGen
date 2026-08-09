---
name: Sparstrowgen UI Design System
description: Technical developer tool interface system built on OKLCH, Shadcn UI, and quiet elevation.
colors:
  background: "#09090b"
  foreground: "#f4f4f5"
  card: "#18181b"
  card-foreground: "#f4f4f5"
  primary: "#f4f4f5"
  primary-foreground: "#18181b"
  secondary: "#27272a"
  secondary-foreground: "#f4f4f5"
  muted: "#27272a"
  muted-foreground: "#a1a1aa"
  accent: "#27272a"
  accent-foreground: "#f4f4f5"
  destructive: "#ef4444"
  border: "#27272a"
  input: "#27272a"
  ring: "#a1a1aa"
typography:
  display:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2rem, 5vw, 3.5rem)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.05em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  card-default:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.lg}"
    padding: "20px"
---

# Design System: Sparstrowgen UI

## 1. Overview

**Creative North Star: "The Developer Control Plane"**

Sparstrowgen's UI is designed as a quiet, hyper-focused, and technically precise environment for software engineers and AI developers. The visual language prioritizes high information density, crystal-clear typography, and fast keyboard-first navigation. The surface never competes with the agent transcripts and data for attention.

Every screen uses OKLCH-derived semantic tokens (`bg-background`, `bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`). Hardcoded Tailwind colors (`bg-slate-950`, `bg-cyan-500`, `#000`) and decorative glassmorphism blurs are strictly prohibited.

**Key Characteristics:**
- **Quiet Elevation**: Flat-by-default cards with 1px border contrast (`border-border`) rather than heavy drop shadows or glow effects.
- **Typography-Driven Hierarchy**: Scale and weight contrast (Inter Variable) rather than decorative icons or colored accent stripes.
- **Restrained Accent Strategy**: Accent colors carry purpose (e.g. status indicators, active tabs, error states).

## 2. Colors

The color palette is built on OKLCH neutral tokens tuned for zero-fatigue dark mode and clean daylight illumination.

### Primary
- **Primary Contrast** (`oklch(0.922 0 0)` / `#f4f4f5`): Reserved for high-priority CTA actions, primary buttons, and selected states.

### Neutral
- **Background** (`oklch(0.145 0 0)` / `#09090b`): Base page canvas tint.
- **Card / Surface** (`oklch(0.205 0 0)` / `#18181b`): Container panels, dialogs, and workspace card surfaces.
- **Border / Divider** (`oklch(1 0 0 / 10%)` / `#27272a`): Subtle 1px boundaries defining structural regions.
- **Muted Text** (`oklch(0.708 0 0)` / `#a1a1aa`): Secondary labels, timestamps, metadata, and helper descriptions.

### Named Rules
**The One Accent Rule.** Accent colors appear on ≤10% of any given screen. The surface is monochromatic and restrained so agent telemetry and code diffs stand out clearly.

## 3. Typography

**Display & Body Font:** Inter Variable (`@fontsource-variable/inter`)
**Mono Font:** Monospace stack (ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas)

### Hierarchy
- **Display** (700 weight, 2.5rem - 3.5rem, 1.1 line-height): Page titles and major section headers.
- **Headline** (600 weight, 1.5rem, 1.25 line-height): Subheadings and card group titles.
- **Title** (600 weight, 1.125rem, 1.3 line-height): Component titles and dialog headers.
- **Body** (400 weight, 0.875rem, 1.5 line-height): Primary content, descriptions, and agent chat messages. Max line length 65–75ch.
- **Label** (500 weight, 0.75rem, uppercase tracking 0.05em): Field labels, table headers, and badges.

### Named Rules
**The Line-Length Rule.** Paragraph text and message bodies are capped at 65–75 characters per line to preserve comfortable reading ergonomics.

## 4. Elevation

Sparstrowgen is flat-by-default. Surfaces rely on 1px border contrast (`border-border`) and subtle background lightness steps (`bg-background` -> `bg-card` -> `bg-accent`) rather than drop shadows.

### Shadow Vocabulary
- **Subtle Layer Drop** (`box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05)`): Applied only to floating popovers, dropdown menus, and command palettes.

### Named Rules
**The Flat-By-Default Rule.** Cards and panels sit flat against the canvas. Depth is conveyed exclusively through background lightness and 1px border lines.

## 5. Components

### Buttons
- **Shape:** Rounded medium radius (`rounded-md`, 8px).
- **Primary:** High-contrast background (`bg-primary text-primary-foreground`), height 36px (`h-9 px-4 py-2`).
- **Outline:** Subtle border (`border border-input bg-background hover:bg-accent hover:text-accent-foreground`).
- **Hover / Focus:** Smooth opacity/background transitions with visible focus ring (`focus-visible:ring-2 focus-visible:ring-ring`).

### Cards / Containers
- **Corner Style:** Rounded large radius (`rounded-xl`, 10px).
- **Background:** Surface card token (`bg-card text-card-foreground`).
- **Border:** 1px border (`border border-border`).
- **Internal Padding:** 20px (`p-5`).

### Inputs / Fields
- **Style:** 1px border (`border border-input bg-transparent rounded-md px-3 py-2 text-sm`).
- **Focus:** Border shift with subtle ring glow (`focus-visible:ring-1 focus-visible:ring-ring`).

### Navigation & Sidebar
- **Style:** Compact vertical list with muted icons, active state highlight (`bg-sidebar-accent text-sidebar-accent-foreground font-medium`).

## 6. Do's and Don'ts

### Do:
- **Do** use `@sparstrow/ui` Shadcn UI primitives (`Card`, `Button`, `Input`, `Label`, `Separator`, `Dialog`, `DropdownMenu`, etc.) across all routes.
- **Do** use the `shadcn` MCP server tools (`search_items_in_registries`, `view_items_in_registries`, `get_audit_checklist`) during all Impeccable commands to query, inspect, and audit Shadcn UI component patterns.
- **Do** use OKLCH semantic tokens (`bg-background`, `bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`).
- **Do** cap body text line length at 65–75ch for optimal reading comfort.
- **Do** enforce visible keyboard focus states on all interactive elements.

### Don't:
- **Don't** write custom UI primitives when an official Shadcn component exists in `@sparstrow/ui` or the Shadcn registry.
- **Don't** use hardcoded Tailwind slate/cyan colors (`bg-slate-950`, `bg-cyan-500`, `text-cyan-400`, `border-slate-800`).
- **Don't** use colored side-stripe borders (`border-left-4`) as decorative card accents.
- **Don't** use gradient text (`background-clip: text`) or decorative glassmorphism blurs (`backdrop-blur`).
- **Don't** use the hero-metric template (big number, small label) for simple dashboard stats.
