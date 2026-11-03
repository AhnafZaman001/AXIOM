# AXIOM code structure

AXIOM is a static browser application. It currently uses classic scripts with
shared global functions, not a bundler or ES modules. `index.html` owns their
load order. Keep that order when moving code between files.

## Responsibilities extracted from app.js

- `js/config/sections.js`: subject sets, section definitions, section matching,
  registration and section-name helpers.
- `js/config/teachers.js`: teacher reference data, assignment lookup and
  promoted-section teacher matching.
- `js/results/zones.js`: performance-zone boundaries and their display helpers.
- `js/imports/excel-engine.js`: workbook parsing, validation and merging into the
  existing workspace. The import form and cloud selection still use `app.js`.
- `js/storage/workspace-backup.js`: workspace serialization, local JSON backup,
  pendrive connection and the unsaved-changes guard. Supabase persistence remains
  in `js/supabase-client.js`.

These files load before `app.js`; their functions read workspace/UI state when
called. Moving them does not introduce a second store, new calculations or a
new persistence method.

## Home hub

- `js/home-history.js`: per-user recently opened destinations; it retains the
  existing `axiom.home.<user ID>` browser storage key.
- `js/home-content.js`: Home and workflow-hub markup.
- `js/home.js`: navigation, events and connection to existing feature actions.

Home history stores destinations and timestamps, not student results. It is
local to the current browser. It is not a server audit log or shared activity
history.

## Existing feature modules

- `js/year-compare*.js`: comparison parsing/calculations, private source files,
  charts, meeting reports, exports and UI. Its cloud library stays separate from
  roster files.
- `js/parent-comms.js`: parent contacts, message preparation, batches and report
  cards. This refactor does not change messaging.
- `js/auth-guard.js`: authenticated profile, role restrictions and workspace load.
- `js/app.js`: remaining workspace state, roster rendering, dashboards, forms,
  shared UI events and print/report generation. This file has been reduced but
  is not yet fully decomposed.

## Focused checks

- `node --test axiom-app/tests/import-performance.test.cjs`: import merge,
  replacement, history preservation and indexed lookup behavior.
- `node axiom-app/tests/navigation-browser.cjs`: offline browser routes, Data
  Center, reports, personal Home history and mobile layout. Requires Playwright
  and Chrome; it stubs Supabase and sends no real email or messages.

Run commands from the repository root. Browser checks need Playwright available
through the environment's Node module path.

## Database setup

This code organization requires **no SQL migration**, database reset, new secrets
or Edge Function deployment. Existing migration files are unchanged.

For database feature setup and deployment instructions use `SETUP.md` and the
files in `supabase/`. A dedicated migration guide should distinguish a fresh
installation from an existing database; do not rerun the schema or all old
migrations solely because JavaScript files were reorganized.
