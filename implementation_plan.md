# E-Studio Desktop — Next Steps: Catalog Pipeline, Pre-Flight Engine & Job Manager

E-Studio is a retail label designer running as a local Tauri 2 desktop application backed by SQLite. This phase integrates an end-to-end catalog ingestion workflow with configurable conflict resolution, an automated pre-flight quality verification engine with live status computation, and a print job history manager with spool re-export capabilities.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following core behaviors and capabilities were confirmed based on your requirements and will be fully integrated:
> - **Unified Step 6 Scope**: Implements the catalog ingestion pipeline, template rule verification engine, and print job history manager together.
> - **Tri-Mode Catalog Ingestion**: Supports three selectable conflict handling strategies: `Merge & Update` (updates existing barcodes/SKUs and appends new ones), `Full Replace` (transactional table wipe and reload), and `Interactive Conflict Review` (item-by-item resolution before committing).
> - **Two-Tier Pre-Flight Verification**: Combines automated pre-flight checks (margin bounds, barcode encodability, font minimums, and mandatory retail price fields) with a clear export confirmation summary showing label counts and target file paths.

---

### 1. Overview & Core Concept

- **What It Delivers**:
  1. **Robust Catalog Ingestion**: Ingests Excel (`.xlsx`, `.xls`) and CSV files directly into the SQLite `products` table and records ingestion metadata into `import_batches`. Automatically maps headers via the persisted dictionary.
  2. **Pre-Flight Validation & Computed Status**: Computes real-time template health (`draft`, `ready`, or `warning`) based on geometrical bounds, font sizing, barcode validity, and field completeness without storing hardcoded status strings.
  3. **Print Job History & Re-Spooling**: Displays historical print runs from the SQLite `print_jobs` table, allowing operators to inspect past job configurations and re-export PDFs or ZPL streams.
- **Target Audience**: Retail shelf managers, print operators, and store technicians operating offline or in corporate retail local networks.
- **Key Value**: Guarantees zero data loss during inventory catalog updates, prevents printing unreadable barcodes or out-of-bounds labels, and maintains a durable audit trail of all physical label production.

---

### 2. User Experience & Visual Design

#### A. Key User Flows
1. **Catalog Import Flow**:
   - Operator clicks **Importer un fichier** in `CatalogManagementStudio`.
   - File picker loads sheet; mapping step displays recognized columns against the SQLite dictionary.
   - Operator selects conflict mode (`Merge & Update`, `Replace Entire Catalog`, or `Review Collisions`).
   - SQLite executes the batch transaction and renders an import summary with exact row counts.
2. **Pre-Flight Verification & Label Status Flow**:
   - In `TemplateEditor` or `GenerationWorkspace`, the pre-flight indicator dynamically computes template readiness.
   - Any boundary overflow, missing mandatory price fields, or invalid barcode characters trigger visual callouts with actionable navigation directly to the offending canvas element.
3. **Print Job Inspection & Re-Export Flow**:
   - Operator navigates to the **Historique des Impressions** tab.
   - High-density data grid lists historical print jobs (ID, format, label count, date, destination path).
   - Operator can view full job parameters and trigger a direct re-export to PDF or ZPL.

#### B. Visual Identity & Theme
- **Color Palette**: Dark utilitarian slate baseline (`bg-slate-950` shell, `bg-slate-900` cards, `border-slate-800` hairline dividers) with neutral `bg-white` canvas in the preview and editor zones.
- **Accent Tokens**: Steel blue (`#2563eb`) for primary production triggers, emerald (`#059669`) for valid pre-flight status, amber (`#d97706`) for margin/field warnings, and crimson (`#dc2626`) for critical pre-flight errors.
- **Typography**: Clean sans-serif hierarchy for controls and navigation; tabular figures and monospace font (`font-mono tabular-nums`) for barcode digits, dimensions, coordinates, and prices.
- **Zero-Pill Discipline**: Status indicators and metadata displayed as clean unboxed text separated by typographic middots (`·`) rather than garish capsule badges.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Tri-Mode Conflict Resolution in SQLite**
  - *Chosen Approach*: Implement SQL transactions supporting `INSERT OR REPLACE`, `DELETE FROM products + INSERT`, and staging-table collision reviews.
  - *Why*: Large inventory imports (thousands of SKUs) must be atomic and predictable without corrupting existing catalog data.
  - *Alternatives Considered*: Client-side array diffing was rejected because large catalogs cause memory bloat and UI thread stutter.
- **Decision 2: Computed Status Engine (No Stored Status Field)**
  - *Chosen Approach*: Template status is calculated dynamically on-the-fly from the template's current geometrical elements and active catalog bindings.
  - *Why*: Eliminates stale status states when products or imposition presets change; complies with the single template schema rule.
  - *Alternatives Considered*: Storing a static status string in SQLite was rejected to maintain single-source-of-truth invariants.
- **Decision 3: Dedicated Print Job Spool Management**
  - *Chosen Approach*: Surface the SQLite `print_jobs` table via a dedicated modal and sidebar tab with status tracking (`ready`, `sent`, `failed`).
  - *Why*: Gives operators total visibility over print jobs generated across sessions without relying on volatile application memory.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                          E-Studio UI Layer                             │
│                                                                        │
│  ┌────────────────────────┐  ┌───────────────────┐  ┌───────────────┐  │
│  │ CatalogManagementStudio│  │  TemplateEditor   │  │ GenerationWS  │  │
│  │  - Tri-Mode Ingestion  │  │  - Canvas Items   │  │  - Pre-Flight │  │
│  │  - Mapping Dictionary  │  │  - Status Display │  │  - Job Spool  │  │
│  └───────────┬────────────┘  └─────────┬─────────┘  └───────┬───────┘  │
└──────────────┼─────────────────────────┼────────────────────┼──────────┘
               │                         │                    │
               ▼                         ▼                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Services & Pre-Flight Layer                     │
│                                                                        │
│  ┌────────────────────────┐  ┌───────────────────┐  ┌───────────────┐  │
│  │   CatalogRepository    │  │ PreFlightEngine   │  │ DesktopFileSvc│  │
│  │  (batch_upsert/replace)│  │ (bounds, barcodes)│  │ (native save) │  │
│  └───────────┬────────────┘  └─────────┬─────────┘  └───────┬───────┘  │
└──────────────┼─────────────────────────┼────────────────────┼──────────┘
               │                         │                    │
               ▼                         ▼                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Tauri IPC & SQLite Database Layer                    │
│                                                                        │
│   commands: catalog_upsert, catalog_replace_all, job_insert, job_list  │
│                                                                        │
│   SQLite Tables:                                                       │
│   ├── products (scan, partno, itemname, price, dept, indexed)          │
│   ├── import_batches (id, filename, report_json, created_at)           │
│   ├── print_jobs (id, job_json, created_at)                            │
│   ├── templates & template_revisions (snake_case millimetres)          │
│   └── kv (mapping dictionary, fonts, user preferences)                 │
└────────────────────────────────────────────────────────────────────────┘
```

#### Interactive Component & State Mapping
1. **Catalog Import Wizard**:
   - `CatalogManagementStudio.tsx`: Triggers `desktopFileService.openBinary` or file input -> parses XLSX/CSV -> auto-matches headers via `mappingDictionary` -> prompts for conflict mode -> calls `api.catalogUpsert` / `api.catalogReplaceAll` -> stores batch in `import_batches` -> updates live state.
2. **Pre-Flight Validation Engine**:
   - `src/utils/preFlightEngine.ts`: Evaluates `LabelTemplate` and selected `ProductRecord`:
     - Inner margin breaches ($x < \text{margin\_left}$, $y < \text{margin\_top}$, $x + w > \text{width} - \text{margin\_right}$, etc.)
     - Barcode format validation (EAN-13 checksum, Code 128 ASCII limits, QR text length)
     - Missing mandatory retail attributes (unmapped price, blank item designation)
     - Overlapping elements and minimum font size enforcement ($\ge 5\text{pt}$ for retail legibility).
3. **Print Job Queue & Re-Spooler**:
   - `src/components/PrintJobHistoryModal.tsx`: Reads from `api.jobList()` -> renders high-density chronological log -> allows re-exporting recorded PDF and ZPL targets through `desktopFileService.saveBinary` and `desktopFileService.saveText`.
