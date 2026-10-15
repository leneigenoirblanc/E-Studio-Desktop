# Implementation Notes

## Step 0 / 1 — Tauri Shell Baseline
- Created branch `desktop-real` from clean baseline.
- Verified TypeScript diagnostics (`tsc --noEmit`) passes with 0 errors.
- Installed Tauri 2 dependencies: `@tauri-apps/api`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`, `@tauri-apps/cli`.
- Initialized `src-tauri/` crate structure: `Cargo.toml`, `build.rs`, `src/main.rs`, `src/lib.rs`, `capabilities/default.json`.
- Configured `tauri.conf.json` with product `E-Studio`, ID `com.estudio.desktop`, min size 1280x800, strict IPC/asset CSP.
- Added `tauri`, `tauri:dev`, and `tauri:build` scripts in `package.json`.
- Restarted development server on port 3000; Vite dev server is running and verified live.
- Acceptance: Existing React application (`src/app/App.tsx`) UI opens unchanged with 0 compile/lint errors.

## Step 2 — Single Schema, Delete the Fake Architecture
- Enforced single template model in src/types.ts with required id, revision, created_at, updated_at.
- Added PrintJob and PrintJobStatus types for subsequent job persistence.
- Refactored src/app/App.tsx: template selection, navigation, saving, duplication, and deletion now keyed by id.
- Duplication in App.tsx creates deep item clones with unique UUID, name suffix ' - Copie', and revision = 1.
- Updated src/components/HomeDashboard.tsx to pass template.id on delete and key cards by template.id.
- Converted NewGabaritWizard.tsx state and JSX to use snake_case millimetres (width_mm, height_mm).
- Updated README.md specifications to use snake_case millimetre schema; confirmed 0 occurrences of widthMm.
- Verified removal of dead paths (src/features, src/domains, src/app/store, src/app/routes.tsx, databaseService.ts).
- Ran TypeScript check (tsc --noEmit) with 0 errors and verified Vite build succeeds.
- Acceptance: UI runs using existing components keyed by id, zero widthMm across repo, single template schema.

## Step 3 — SQLite in Rust
- Integrated rusqlite (bundled), whoami, and chrono into src-tauri/Cargo.toml.
- Implemented SQLite migrations on startup in src-tauri/src/db.rs targeting {app_data_dir}/estudio.sqlite.
- Created tables: templates, template_revisions, products (with scan/partno indexes), import_batches, print_jobs, audit, and kv.
- Authored robust Tauri commands in src-tauri/src/commands.rs returning Result<T, String> without raw WebView SQL.
- Implemented template validation in template_save (name non-empty, finite width/height between 0 and 2000 mm).
- Configured revision tracking: new templates insert revision 1, updates increment revision and record template_revisions.
- Implemented catalog_search, catalog_upsert (transactional), catalog_replace_all, print jobs, and kv preferences.
- Handled audit_append with immutable OS user from whoami runtime, ignoring untrusted WebView inputs.
- Mounted commands and initialized DbState in src-tauri/src/lib.rs; added temporary dev-only test button in HomeDashboard.
- Acceptance: tsc passes with 0 errors; Tauri IPC command contracts wired to durable SQLite tables on disk.

## Step 4 — Wire UI to SQLite, Eliminate localStorage
- Created src/services/api.ts with typed IPC bridges and browser preview memory store for zero-localStorage execution.
- Connected template CRUD in src/app/App.tsx directly to SQLite commands (template_list, template_get, template_save, template_delete).
- Replaced catalog repository localStorage persistence in src/services/catalogRepository.ts with SQLite catalog and import history.
- Migrated audit trail in src/services/auditLogService.ts and AuditTrailModal.tsx to SQLite audit table with whoami runtime OS user.
- Migrated mapping dictionary in src/utils/mappingDictionary.ts and font manager in src/utils/fontManager.ts to SQLite kv storage.
- Migrated omni-channel rules in src/components/OmniChannelStudioModal.tsx and UI settings in src/context/TooltipContext.tsx to SQLite kv.
- Removed periodic auto-save to localStorage in src/components/TemplateEditor.tsx; all mutations now sync to SQLite.
- Completely purged hardcoded "Opérateur Local" strings across App.tsx, BatchSpoolerModal.tsx, and CatalogManagementStudio.tsx.
- Zero localStorage occurrences remaining in application code; verified clean build with npx tsc --noEmit and compile_applet.
- Acceptance: Durable SQLite storage completely replaces localStorage for all templates, catalog, rules, dictionary, audit, and prefs.

## Step 5 — Native Desktop File I/O, Print Jobs & Purge Forbidden Patterns
- Built src/services/desktopFileService.ts integrating @tauri-apps/plugin-dialog and @tauri-apps/plugin-fs for OS file operations.
- Replaced browser downloads in TemplateEditor.tsx, CatalogManagementStudio.tsx, and HomeDashboard.tsx with native file dialog save.
- Connected GenerationWorkspace PDF export to desktopFileService.saveBinary and registered print jobs via SQLite job_insert.
- Wired ZPL export in zplExporter.ts and GenerationWorkspace.tsx to native text saving and print_jobs table persistence.
- Purged all occurrences of URL.createObjectURL and <a download> across presets, workspaces, and template export routines.
- Eliminated all alert() calls throughout App.tsx, CatalogManagementStudio, DataCleaning, Mapping, and ImpositionCalibration.
- Removed fake direct print mechanisms, iframe printing, and forbidden window.print() calls from GenerationWorkspace.
- Deleted unused dead code and fake progress simulators (BatchSpoolerModal.tsx and batchSpooler.ts).
- Verified TypeScript compilation (tsc --noEmit) and applet compile with 0 errors and zero warnings.
- Acceptance: Native desktop dialogs handle all file exports/saves, PDF/ZPL log to print_jobs in SQLite, zero forbidden patterns remain.

## Step 6 — Catalog Pipeline, Pre-Flight Engine & Job Manager
- Added `batch_import_record` and `batch_import_list` Tauri commands in Rust (`src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`) and API bridge (`src/services/api.ts`) saving to SQLite `import_batches` table.
- Upgraded `src/services/catalogRepository.ts` to persist and load import reports to/from SQLite `import_batches` with in-memory fallback.
- Wired catalog ingestion pipeline in `CatalogManagementStudio.tsx` supporting native file picker via `desktopFileService.openBinary`, header auto-mapping via persistent `mappingDictionaryManager`, and tri-mode conflict handling (`Merge & Update`, `Full Replace`, `Interactive Collision Review`).
- Integrated `PreFlightEngine` (`src/utils/preFlightEngine.ts`) with live computed template status (`ready`, `warning`, `draft`) without stored status strings in template records.
- Added live Pre-Flight status badge and inspection modal in `TemplateEditor.tsx` with one-click canvas element targeting and boundary issue reporting.
- Added Two-Tier Pre-Export Quality Verification modal in `GenerationWorkspace.tsx` displaying label count, sheet count, target filename, and pre-flight health before spooling PDF or ZPL files.
- Connected `PrintJobHistoryModal.tsx` for spool inspection, status updates (`ready`, `sent`, `failed`), and native file re-exports.
- Verified TypeScript compilation (`npx tsc --noEmit`) and applet compilation with 0 errors and zero warnings.
- Acceptance: Catalog pipeline, pre-flight verification engine, and print job history manager fully operational.

## Step 7 — Safe Types Consolidation & Non-Breaking Deduplication
- Purged dead types with 0 external readers from src/types.ts: `EcoRenderingConfig`, `DualPriceDisplayConfig`, `BatchSpoolConfig`, `BrandAwareConfig`, `ColorPaletteMode`, `DitheringMethod`, `RulerPositionMode`, `RulerSettings`, `UiPreferences`.
- Removed unread optional fields on `LabelTemplate`: `blueprint`, `color_palette_mode`, `dithering_method`, `brand_aware`. Template JSON keys and flat structure remain strictly preserved without nesting.
- Deduplicated `ElementPlacementStrategy`: removed duplicate union in `src/utils/dynamicPlacement.ts` and imported canonical definition from `src/types.ts`.
- Consolidated price tiers: updated `src/utils/tierEngine.ts` to read canonical `price_tiers` first with fallback to `TIERS`; updated `src/utils/pricingEngine.ts` so `has_tiers` checks both arrays.
- Updated `GenerationWorkspace.tsx` to read `p.price_tiers` first before falling back to `p.TIERS` in table rendering.
- Added `NET_WEIGHT_KG` (number), `VOLUME_L` (number), `PROMO_START_DATE` (date), `PROMO_PERIOD` (text) to `DOMAIN_FIELDS` in `src/domainFields.ts`.
- Added `LAST_SELLING_PRICE?: number` and `label?: string` to `ProductRecord` and `PriceTier` in `src/types.ts`.
- Pricing engine fixes: replaced `sellingPrice > 500 ? 'FCFA' : '€'` with `item.currency_symbol ?? ''`; updated discount calculation to return `''` instead of hardcoded `'-20%'` when no discount applies; updated `splitPrice` to accept dynamic `decimals` (0 for FCFA/GNF/XOF/XAF, 2 otherwise) and use `item.decimal_separator`; enabled date prefix fallback by `date_type`; enabled promo period date boundary checks in `has_promo`.
- Purged demo barcode and QR constants (`3250390123456`, `3017620422003`, `1234567890128`) from `pricingEngine.ts`, `preFlightEngine.ts`, and `zplExporter.ts`. Added `{ sample: boolean }` flag so exports and preflight receive real product data.
- Hardened PreFlightEngine with `target: 'screen' | 'pdf' | 'zpl'`: enforced strict price presence errors, boundary overflow detection, EAN-13 checksum validation, and ZPL target compatibility checks.
- Enforced export blocking in `GenerationWorkspace.tsx`: PDF and ZPL exports strictly refuse execution if `preFlightReport.passed === false`. Added `price_block` rendering to PDF and ZPL outputs.
- Verified with `npx tsc --noEmit` and `compile_applet`: 0 errors, 0 warnings.

## Step 8 — Production Hardening & Code Audit Resolutions (P0 / P1)
- **Unified Canonical Resolution Layer (`LabelResolutionEngine`)**: Standardized label element resolution across Screen, PDF, ZPL, and PPTX targets. Eliminated price, EAN, exchange rate, and URL fallbacks for real product data.
- **Export Pre-Flight Strict Blocking**: Export in PDF and ZPL is hard-blocked if any item exceeds canvas boundaries, if mandatory retail prices are missing or invalid, or if an element type is unsupported by the target format.
- **ZPL Security & Encoding Hardening (P0)**: Injected `^CI28` for native UTF-8 international support, added `^FH` hexadecimal field escaping for text, barcodes, and QR data to eliminate command injection (`^`, `~`, `_`), and sanitized `^FX` comments.
- **Unified Price Parsing & Promo Precedence (P0)**: Unified `excelCleaner` and `PricingEngine` under `PricingEngine.parsePriceNumber()`. Resolved `PROMOPRICE = 0` so zero doesn't bypass promo evaluation, and normalized decimal separators dynamically by currency.
- **Price Element Discriminator Fix**: Updated `isPriceRelatedElement` to recognize `role === 'price'`, `is_price === true`, `unit_price_config`, `secondary_currency_config`, and `calculation_mode` ('unit_price' / 'secondary_currency') so `sanitizeNonPriceElement` does not erase price-per-kg or secondary currency configurations.
- **Full TypeScript Cleanliness**: Fixed all typing issues in `pptxExporter.ts`, `zplExporter.ts`, `labelResolutionEngine.ts`, and `preFlightEngine.ts`. `tsc --noEmit` and Vite production build pass with 0 errors and 0 warnings.



