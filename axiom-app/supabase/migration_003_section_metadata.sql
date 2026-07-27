-- =========================================================================
-- Run this once in: Supabase Dashboard -> SQL Editor -> New query
-- Adds two columns to the existing `sections` table so a section created
-- on one device carries enough info (its subject group) to be rebuilt
-- correctly on another device/login.
-- Safe to re-run — "if not exists" makes it a no-op if already applied.
-- =========================================================================
alter table sections add column if not exists sheet_name text;
alter table sections add column if not exists subject_group text;
