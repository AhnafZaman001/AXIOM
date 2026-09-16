-- =========================================================
-- migration_005_section_subject_overrides.sql
--
-- Real problem this solves: students promoted from 1st year to 2nd
-- year need a different subject list for the SAME section -- e.g.
-- Islamiat is replaced by Pak Study, and I.Com 2nd-year students
-- gain 4 new subjects (Banking, Business Statistics, Commercial
-- Geography, Statistics) that don't exist anywhere in the current
-- hardcoded subject groups at all.
--
-- Confirmed scope directly rather than guessed: this is a PER-
-- SECTION override, not a change to the whole subject group. A
-- future brand-new 1st-year section in the same group (e.g. a new
-- Pre-Medical section next year) should NOT inherit Pak Study or
-- lose Islamiat just because some other Pre-Medical section was
-- promoted -- each section's subject list can now diverge
-- independently from its group's base list, and from every other
-- section in that same group.
--
-- Every section in this app currently shares the exact same JS
-- array object as every other section in its group (SECTION_DEFS
-- does `subjects: SUBJECT_SETS[d.group]` -- a shared reference, not
-- a copy). The application-code fix (js/app.js) is what actually
-- breaks that sharing safely; this table is just where a section's
-- own independent list gets persisted once it has one.
-- =========================================================

create table if not exists section_subject_overrides (
  section_key text primary key references sections(key) on delete cascade,
  subjects    text[] not null
);

alter table section_subject_overrides enable row level security;

create policy "section_subject_overrides: everyone logged in can read"
  on section_subject_overrides for select using (auth.uid() is not null);

create policy "section_subject_overrides: authenticated can write"
  on section_subject_overrides for all using (auth.uid() is not null);

grant select, insert, update, delete on section_subject_overrides to authenticated;
