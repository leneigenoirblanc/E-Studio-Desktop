# E-Studio Rebuild Blueprint

This document is the implementation blueprint for turning the current E-Studio application into a coherent, production-grade, maintainable, and scalable product.

It is based on a full engineering review of the current codebase and focuses on a rebuild that preserves the product’s strongest ideas while removing architectural, workflow, data, and UX problems that would become costly in a real production environment.

---

## 1. Rebuild objective

The current codebase demonstrates a strong product vision: a retail label design and print-production studio with template authoring, import mapping, pricing logic, mobile intake, export tooling, and catalog workflows.

The main issue is not lack of ambition; it is lack of coherent product architecture and clear responsibility boundaries. The rebuild should transform this from a feature-rich prototype into a durable application with:

- a clean modular architecture
- explicit domain boundaries
- predictable state management
- real production workflows
- maintainable front-end and service layers
- a secure and reliable backend for sync and integration
- a strong accessibility and UX foundation
- testability from day one

---

## 2. Design principles

The rebuild will follow these principles:

1. Product-first architecture
   - each module solves one job
   - no module owns unrelated state or unauthorized side effects

2. Clear domain separation
   - UI code handles rendering and events
   - domain services handle rules, calculations, validation, and orchestration
   - repositories handle persistence
   - integrations handle external APIs and sync

3. Local-first but production-safe
   - local data is fast and resilient
   - external sync is explicit, authenticated, and recoverable

4. Accessibility by default
   - keyboard support, focus management, screen reader semantics, contrast, and reduced motion are mandatory

5. Reliability over cleverness
   - prefer explicit flows over hidden side effects
   - every operation should have a recoverable state

6. Test the real behavior
   - UI tests for user workflows
   - domain tests for pricing, imposition, and data mapping
   - integration tests for sync and export flows

---

## 3. Recommended target architecture

### 3.1 Architectural direction

Use a layered architecture with explicit module ownership.

- Presentation layer
  - React screens and components
  - route-driven layouts
  - design-system primitives

- Application layer
  - feature orchestration
  - workflow state
  - navigation and task setup

- Domain layer
  - template editing logic
  - pricing engine
  - imposition engine
  - validation
  - export orchestration
  - rules evaluation

- Data layer
  - repositories for templates, catalog, jobs, preferences
  - IndexedDB/local-first persistence
  - sync queue and reconciliation logic

- Integration layer
  - API adapters
  - mobile pairing
  - print/export services
  - remote sync and catalog integrations

- Backend layer
  - authenticated services
  - durable job records
  - device registry
  - catalog and sync storage

### 3.2 State model

The application must use a strict split between:

- UI state
  - panel open/closed
  - selected tool
  - transient toast messages
  - hover states

- Domain state
  - template structure
  - product records
  - job lifecycle
  - sync status
  - validation results

- Server state
  - remote catalogs
  - device registry
  - sync jobs
  - print/export metadata

This split prevents “everything is local state” problems that currently create fragile cross-feature coupling.

---

## 4. Recommended file and folder structure

```text
src/
  app/
    App.tsx
    routes.tsx
    providers/
      AppProviders.tsx
      ThemeProvider.tsx
      QueryProvider.tsx
      StoreProvider.tsx
    shell/
      AppShell.tsx
      TopNav.tsx
      SideNav.tsx
      WorkspaceHeader.tsx
      GlobalModalHost.tsx

  features/
    dashboard/
      components/
      hooks/
      services/
      routes/
      types/
      state/
    template-editor/
      components/
      hooks/
      stores/
      services/
      selectors/
      utils/
      types/
    generation/
      components/
      hooks/
      services/
      stores/
      types/
    catalog/
      components/
      services/
      hooks/
      types/
    mobile-sync/
      components/
      services/
      hooks/
      types/
    rules-engine/
      components/
      services/
      types/
      engine/

  domains/
    templates/
      Template.ts
      templateSchema.ts
      templateValidation.ts
      TemplateRepository.ts
    catalog/
      ProductRecord.ts
      catalogRepository.ts
      catalogNormalizer.ts
      mergeRules.ts
    pricing/
      pricingEngine.ts
      discountRules.ts
      currency.ts
      tierRules.ts
    imposition/
      impositionCalculator.ts
      pagePlanner.ts
      exportPlanning.ts
    export/
      pdfExporter.ts
      pptxExporter.ts
      zplExporter.ts
    sync/
      syncQueue.ts
      deviceSession.ts
      reconciliation.ts

  shared/
    components/
      Button.tsx
      Modal.tsx
      DataTable.tsx
      EmptyState.tsx
      Toast.tsx
      Field.tsx
    design-system/
      tokens.ts
      spacing.ts
      typography.ts
      colors.ts
      motion.ts
    hooks/
      useLocalStorage.ts
      useDebounce.ts
      usePersistedState.ts
      useOnlineStatus.ts
    utils/
      formatters.ts
      ids.ts
      validation.ts
      time.ts
    lib/
      api.ts
      storage.ts
      logger.ts
      errors.ts

  infra/
    storage/
      indexedDb.ts
      repositories/
    api/
      client.ts
      endpoints.ts
      auth.ts
    sync/
      eventBus.ts
      liveStatus.ts
    monitoring/
      logger.ts
      telemetry.ts

  server/
    api/
      routes/
      controllers/
      middleware/
    domain/
      jobs/
      sync/
      catalog/
    infra/
      db/
      auth/
      config/

  tests/
    unit/
      domains/
      features/
    integration/
      api/
      sync/
    e2e/
      workflows/
      print-flows/

  __mocks__/
  vite-env.d.ts
```

---

## 5. Module definitions and responsibilities

### 5.1 App shell

Responsibilities:
- global layout and navigation
- route selection and shell composition
- modal host
- global notifications
- authentication/session handling if needed

Key modules:
- AppShell
- TopNav
- SideNav
- WorkspaceHeader
- GlobalModalHost

### 5.2 Dashboard module

Responsibilities:
- open workspaces
- recent templates
- quick actions
- search and filters
- start new template flow

Primary user goals:
- choose a template or start a new one
- see overall workspace status
- access high-level actions

### 5.3 Template editor module

Responsibilities:
- canvas editing
- selection and transform logic
- smart guides and snapping
- object property editing
- history and undo/redo
- save and validation flow

This module should not own catalog, print queue, or mobile sync responsibilities.

### 5.4 Generation / print preparation module

Responsibilities:
- data import and review
- mapping and normalization
- preview generation
- imposition planning
- export generation
- print queue state

This is the successor to the current generation workspace and should become a domain-oriented production workflow.

### 5.5 Catalog module

Responsibilities:
- product database management
- lookup/search/filtering
- import processing
- dedupe and merge options
- manual edits and review

This module should operate on canonical product data and expose domain-level functions rather than raw UI-only mutations.

### 5.6 Mobile sync module

Responsibilities:
- handshake and pairing
- lot ingestion
- device sessions
- batch review
- acceptance/rejection workflow
- sync status and recovery

The mobile sync module should not directly manipulate the entire app state; it should emit actions and sync queue events.

### 5.7 Rules engine module

Responsibilities:
- condition evaluation
- action execution
- contextual routing and display rules
- conflict resolution
- audit logs

This should be designed as a deterministic rules engine with formal evaluation output.

### 5.8 Export and print orchestration module

Responsibilities:
- PDF generation
- ZPL generation
- PowerPoint export
- job queue management
- print validation and warnings

This should be treated as a dedicated service domain, not as inline UI code.

---

## 6. Interface contracts

The project needs explicit contracts so that UI, domain logic, storage, and APIs share a single truth model.

### 6.1 Template model

```ts
export type TemplateStatus = 'draft' | 'valid' | 'warning' | 'error';

export interface TemplateMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ImpositionConfig {
  pageSize: 'A4' | 'A3' | 'Letter' | 'Custom';
  orientation: 'portrait' | 'landscape';
  gapXmm: number;
  gapYmm: number;
  showCropMarks: boolean;
  startOffsetSlot: number;
  customPageWidthMm?: number;
  customPageHeightMm?: number;
}

export interface LabelTemplate {
  id: string;
  name: string;
  width_mm: number;
  height_mm: number;
  inner_margins_mm: Margins;
  bg_color: string;
  default_imposition?: ImpositionConfig;
  items: TemplateItem[];
  revision: number;
  updated_at: string;
  created_at: string;
}
```

### 6.2 Template item model

```ts
export type TemplateItemType =
  | 'text'
  | 'shape'
  | 'ellipse'
  | 'line'
  | 'barcode'
  | 'qrcode'
  | 'image'
  | 'tier_price'
  | 'pictogram'
  | 'price_block'
  | 'curved_text';

export interface TemplateItemBase {
  id: string;
  type: TemplateItemType;
  name: string;
  x_mm: number;
  y_mm: number;
  w_mm: number;
  h_mm: number;
  rotation: number;
  z_index: number;
  locked: boolean;
  binding_key?: string;
  conditional_display?: ConditionalDisplayConfig;
}

export interface TemplateItem extends TemplateItemBase {
  [key: string]: unknown;
}
```

### 6.3 Product record model

```ts
export interface ProductRecord {
  id: string;
  ITEMNAME: string;
  PRODUCT_SCAN?: string;
  PARTNO?: string;
  BRAND_INFO?: string;
  CATEGORY_NAME?: string;
  DEPT_NAME?: string;
  STORE_NAME?: string;
  SELLING_PRICE?: number;
  PROMOPRICE?: number;
  CASE_SIZE?: number;
  UNIT?: string;
  CURRENCY?: string;
  raw?: Record<string, unknown>;
  updatedAt?: string;
}
```

### 6.4 Catalog import result

```ts
export interface ImportResult {
  sourceName: string;
  rowCount: number;
  validRows: number;
  invalidRows: number;
  mappedProducts: ProductRecord[];
  warnings: ImportWarning[];
  errors: ImportError[];
}

export interface ImportWarning {
  code: string;
  message: string;
  rowIndex?: number;
}

export interface ImportError {
  code: string;
  message: string;
  rowIndex?: number;
}
```

### 6.5 Sync session and job model

```ts
export type SyncJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'needs_review';

export interface SyncJob {
  id: string;
  type: 'product_import' | 'template_sync' | 'mobile_lot' | 'catalog_pull';
  status: SyncJobStatus;
  createdAt: string;
  updatedAt: string;
  sourceDeviceId?: string;
  destinationDeviceId?: string;
  payload?: Record<string, unknown>;
  error?: string;
}

export interface SyncSession {
  id: string;
  deviceId: string;
  deviceName: string;
  startedAt: string;
  lastSeenAt: string;
  status: 'connected' | 'offline' | 'paired' | 'error';
  token?: string;
}
```

### 6.6 Export job model

```ts
export type ExportFormat = 'pdf' | 'pptx' | 'zpl' | 'json';

export interface ExportJob {
  id: string;
  templateId: string;
  format: ExportFormat;
  status: 'queued' | 'generating' | 'ready' | 'failed';
  fileName: string;
  createdAt: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
}
```

---

## 7. Application workflow architecture

The rebuild should define the user journey as a workflow engine, not a loose collection of screens.

### 7.1 Core workflow states

1. Template selection
2. Template validation
3. Product import
4. Mapping confirmation
5. Print preview
6. Export / print submission
7. Sync and handoff

### 7.2 Standard screen state model

Every major screen should support:

- loading
- idle empty
- data available
- validation warnings
- partial errors
- transient offline mode
- permission or access denied
- recovery / retry state
- success state

This pattern reduces hidden assumptions and creates predictable UX.

---

## 8. Delivery backlog and epics

## Epic 0 — Project foundation and product contract

Goal: define the real product contract before implementing screens.

Deliverables:
- target user personas
- canonical domain schemas
- screen inventory
- workflow map
- acceptance criteria for all major modules

Milestone: product contract approved

Exit criteria:
- all core domain objects are designed and versioned
- major user journeys are mapped
- engineering and product align on the target scope

---

## Epic 1 — Design system and shell

Goal: create a stable visual system and app shell.

Deliverables:
- design tokens
- component library foundations
- layout system
- top navigation and app shell
- modal system
- toast and status feedback
- empty/loading/error states

Milestone: shell and design system stable

Exit criteria:
- all screens use the same foundation
- navigation is consistent and predictable
- accessibility baseline is implemented

---

## Epic 2 — Local-first data layer and persistence

Goal: replace fragile ad hoc persistence with a dependable data layer.

Deliverables:
- IndexedDB repositories
- migration system
- local query layer
- template repository
- catalog repository
- sync queue model
- offline-first write strategy

Milestone: local-first storage reliable

Exit criteria:
- app survives refreshes and offline interruptions
- templates and records persist predictably
- storage migrations are explicit and testable

---

## Epic 3 — Template authoring workflow

Goal: rebuild template editing into a clean, domain-driven system.

Deliverables:
- canvas system and coordinate model
- selection and transform services
- ruler/snap system
- undo/redo engine
- property inspector
- validation panel
- template save workflow

Milestone: template editor production-ready for core flows

Exit criteria:
- template creation, edit, duplicate, and save work reliably
- selection and transform behavior is predictable
- validation warnings are understandable and actionable

---

## Epic 4 — Catalog management and data mapping

Goal: replace ad hoc catalog import behavior with a reliable mapping and review pipeline.

Deliverables:
- import adapters for CSV/XLSX
- schema normalization
- mapping UI and matching logic
- merge and dedupe rules
- manual validation table
- batch update flows

Milestone: catalog import and mapping usable in production-like scenarios

Exit criteria:
- realistic files import without breaking structure
- mapping is reviewable and reversible
- duplicates and invalid records are handled intentionally

---

## Epic 5 — Print generation and export orchestration

Goal: move print generation from UI code into dedicated services.

Deliverables:
- imposition calculation service
- preview rendering pipeline
- PDF exporter
- PPTX exporter
- ZPL exporter
- print queue job model
- validation before export

Milestone: print flow stable for production scenarios

Exit criteria:
- label count and page planning are predictable
- printers and output formats are generated from validated config
- export failures are surfaced clearly

---

## Epic 6 — Mobile sync and device intake

Goal: create robust, secure mobile work scenarios.

Deliverables:
- pairing and handshake flow
- device registry
- lot intake job model
- queue and status states
- review and acceptance workflow
- retry and conflict handling
- offline-safe behavior

Milestone: mobile sync operational

Exit criteria:
- device pairing works with retry and token lifecycle
- lots can be received, reviewed, and accepted or rejected
- sync state remains consistent during connectivity changes

---

## Epic 7 — Rules engine and automation

Goal: turn rules from scattered UI logic into a reliable evaluation system.

Deliverables:
- rule definitions and validation
- condition evaluation engine
- action execution layer
- audit trail
- conflict handling
- execution traces

Milestone: rules engine predictable and auditable

Exit criteria:
- all rule outcomes are reproducible
- conflicts are measurable
- rule execution is traceable

---

## Epic 8 — Production hardening, security, and operations

Goal: make the product deployment-ready.

Deliverables:
- secure backend and auth model
- durable job persistence
- structured logs and telemetry
- monitoring and alerts
- CI/CD pipeline
- test automation
- release checklist
- security review

Milestone: production-ready release candidate

Exit criteria:
- secure configuration management
- no plaintext secrets or unsafe defaults
- critical flows are tested and measurable
- app is deployable in a real operational environment

---

## 9. Phased milestone plan

### Milestone M1 — Architecture and contracts

Target: 2-3 weeks

Scope:
- domain schema finalized
- module map approved
- app shell skeleton in place
- storage contracts defined

Definition of done:
- no major ambiguities in core domain model
- engineering team agrees on module boundaries

### Milestone M2 — Design system and app shell

Target: 2-4 weeks

Scope:
- UI kit foundation
- screens built to a common system
- navigation completed
- empty/loading/error states in place

Definition of done:
- all user-facing modules share consistent pattern and identity

### Milestone M3 — Template editor and local data layer

Target: 4-6 weeks

Scope:
- editor features migrated to domain-oriented structure
- data persistence stable
- save and recover flows work

Definition of done:
- template creation and editing workflow is stable
- local-first persistence is resilient and tested

### Milestone M4 — Catalog and generation workflows

Target: 4-6 weeks

Scope:
- import pipeline complete
- mapping and dedupe logic live
- imposition and export pipeline functional

Definition of done:
- realistic product files can be imported and produced end-to-end

### Milestone M5 — Mobile sync and backend hardening

Target: 4-5 weeks

Scope:
- paired-device flows live
- good sync/retry behavior
- secure backend and status system

Definition of done:
- real device intake works reliably and safely

### Milestone M6 — Production readiness

Target: 2-3 weeks

Scope:
- CI/CD, security review, observability, final fixes, launch validation

Definition of done:
- release candidate passes production readiness review

---

## 10. Migration strategy from the current implementation

The rebuild should not be a full stop-the-world rewrite. It should be phased and incremental.

### Phase A — Freeze and inventory
- identify stable features worth preserving
- document variants and hidden dependencies
- decide which parts are truly strategic vs disposable

### Phase B — Introduce foundations without breaking the app
- add design system foundation
- introduce repository abstractions
- create typed domain contracts
- migrate one feature at a time

### Phase C — Migrate feature modules
- dashboard first
- then template editor
- then generation and print workflows
- then catalog and sync

### Phase D — Remove legacy dependencies
- delete legacy “everything in one state” patterns
- remove ad hoc side effects from UI modules
- replace localStorage-heavy logic with repository interfaces

### Phase E — Harden and launch
- production readiness checks
- monitoring and validation
- final release gating

---

## 11. Recommended implementation order

1. Contracts and domain schemas
2. Design system and shell
3. Local storage and repository layer
4. Template editor domain
5. Catalog import and mapping
6. Print generation and export services
7. Sync and mobile modules
8. Rules engine
9. Security and observability
10. Release hardening

This order keeps system architecture stable before more complex workflows are rebuilt.

---

## 12. Validation criteria by phase

### Phase validation checklist

- no leaky state across unrelated features
- no feature directly mutates unrelated modules
- all critical flows are testable and observable
- all screens have clear empty/loading/error states
- key actions are accessible with keyboard navigation
- data persistence survives refresh/restart
- sync flows work offline and recover on reconnect
- export jobs produce consistent output for realistic cases

---

## 13. Final outcome

The final product should be:

- coherent: one clear product architecture, not a bag of adjacent features
- maintainable: modules have clearly defined responsibilities
- user-friendly: workflows are guided, efficient, and understandable
- scalable: local data and sync systems can grow without architectural breakage
- production-ready: security, monitoring, reliability, and validation are built in

This rebuild is not about removing the product’s ambition; it is about making the ambition sustainable.

---

## 14. Recommended immediate next steps

1. Freeze the product contract in a single source of truth.
2. Define the core domain models for templates, products, jobs, and sync.
3. Build the design system foundation before migrating feature logic.
4. Move storage and data access behind repository contracts.
5. Rebuild the editor in a modular structure.
6. Move print and export into service domains.
7. Rebuild catalog and sync flows using explicit job and sync states.
8. Add automated tests and release readiness checks before launch.

This is the lowest-risk path to converting the current product into a durable, coherent digital production platform.
