# AXIOM + Supabase — Setup Guide

## 1. Create / confirm your Supabase project
1. Go to https://supabase.com/dashboard and sign in.
2. You already have a project reference in this build: `adqvtmnvyzkusswbwqdr`.
   Open it (or create a new project if that one isn't yours: **New Project** →
   pick a name, password, and region).
3. Go to **Project Settings → API**. Copy:
   - **Project URL** → already filled into `js/supabase-client.js`
   - **anon / public key** → paste it into `js/supabase-client.js`
     (`SUPABASE_ANON_KEY = '...'`)

## 2. Create the database tables
1. In the dashboard, open **SQL Editor → New query**.
2. Paste the entire contents of `supabase/schema.sql` and click **Run**.
   This creates: `profiles`, `sections`, `students`, `teacher_assignments`,
   `tests`, plus all the role-based access rules (Row Level Security).

## 3. Turn on email/password login
1. **Authentication → Providers** → make sure **Email** is enabled.
2. **Authentication → Settings** → if you don't want new users confirming
   via email link (useful while testing), you can temporarily disable
   "Confirm email".

## 4. Create your own account (as Principal)
1. **Authentication → Users → Add user** → enter your email + a password.
   Copy the generated **User UID**.
2. Back in **SQL Editor**, run (replace the two placeholders):
   ```sql
   insert into profiles (id, full_name, role)
   values ('PASTE-USER-UID-HERE', 'Your Name', 'principal');
   ```
3. Open `login.html` in a browser and sign in with that email/password —
   you should land on the dashboard with full access and a "Log Out"
   button in the top right.

## 5. Add teachers, HOD, coordinator
Same pattern as step 4, changing the role:
```sql
insert into profiles (id, full_name, role, teacher_name)
values ('USER-UID', 'Ms. Sarah Khan', 'teacher', 'Sarah Khan');
```
`teacher_name` must exactly match the name you use in
**Manage Teacher Assignments** in the app, so the RLS policies know which
rows that login is allowed to edit.

For HOD / coordinator, omit `teacher_name`:
```sql
insert into profiles (id, full_name, role)
values ('USER-UID', 'Mr. Ahmed', 'hod');
```

## 6. Add students (self-service report cards)
1. First make sure the student already exists as a row in `students`
   (add them normally through the app's "Add Student", once that's wired
   to Supabase — see "What's not done yet" below — or insert directly):
   ```sql
   insert into students (section_key, name, roll_no)
   values ('9A', 'Ali Raza', '12');
   ```
2. Create their login the same way as step 4 (**Authentication → Users**).
3. Link it:
   ```sql
   update profiles set role = 'student' where id = 'STUDENT-USER-UID';
   update students set user_id = 'STUDENT-USER-UID' where name = 'Ali Raza' and section_key = '9A';
   ```
   Also insert their `profiles` row (`full_name`, `role='student'`) if you
   haven't already.

## What's working now
- Real login/logout for all 5 roles, backed by Supabase Auth.
- Role-based visibility: students and HOD get a read-only view; teachers
  don't see section/teacher-management controls; principal & coordinator
  see everything.
- On sign-in, the app pulls sections/students/tests from Supabase and
  renders them — a student's view is automatically limited to just their
  own record because of the database's row-level security rules, not
  just hidden by the interface.

## What's NOT wired yet (next step)
The app's existing "Add / Edit Test Score", "Add Student", "Add Section",
and "Manage Teacher Assignments" forms still save to the local in-browser
copy only — they don't push to Supabase yet. I've already written the
functions to do this (`axSaveTestScore`, `axAddStudent`, `axAddSection`,
`axSetTeacherAssignment` in `js/supabase-client.js`); they just need to be
called from inside those forms' existing submit handlers in `js/app.js`.
That's a good next step once you've confirmed the login/roles feel right —
happy to wire that in next.

## Email alerts (login, critical changes, files)

Alerts go to `ahnaf7624@gmail.com` and `zamankips@gmail.com` (change them with the
optional `ALERT_RECIPIENTS` secret, comma-separated).

| Event | Email |
|---|---|
| Any user logs in | login email used, name, role, time, IP, device |
| Section added / renamed / removed | immediately, one email per action (removing a section = one email, not one per student) |
| Student removed, teacher assignment changed, section subject list changed, user role changed / profile removed, bulk delete of 10+ test scores | immediately |
| File added / replaced / deleted in cloud storage | immediately |
| Adding a student, entering or editing marks | **no email** |

### One-time setup
1. **Gmail app password** (the mailbox that *sends* the alerts, e.g. one of the two above):
   Google Account → Security → turn on 2-Step Verification → search "App passwords" →
   create one called `AXIOM` → copy the 16 characters.
2. **Deploy the function** (needs the [Supabase CLI](https://supabase.com/docs/guides/cli)):
   ```bash
   supabase login
   supabase secrets set --project-ref adqvtmnvyzkusswbwqdr \
     GMAIL_USER=you@gmail.com \
     GMAIL_APP_PASSWORD=abcdefghijklmnop \
     ALERT_WEBHOOK_SECRET=$(openssl rand -hex 32)
   supabase functions deploy send-alert --project-ref adqvtmnvyzkusswbwqdr --no-verify-jwt
   ```
   Keep the `ALERT_WEBHOOK_SECRET` value — step 3 needs the same one.
3. **Database triggers:** SQL Editor → run all of `supabase/migration_007_email_alerts.sql`,
   then run the commented `insert into public.alert_config ...` block at the bottom of that
   file with your real secret filled in.
4. **Test:** log in → an email should arrive within seconds. Rename a section → second email.

Notes: login and file alerts are sent by the app after a successful action; the critical-change
alerts come from database triggers, so they fire even if someone changes data outside the app.
If Gmail/the function is down the app keeps working normally — alerts are best-effort.

## Parents & communication (report cards, Message Parent)

**One-time:** SQL Editor → run `supabase/migration_008_parent_contacts.sql`
(creates the `parent_contacts` table with row-level security: principal/coordinator
read+write, HOD reads all, teachers read their own sections, students nothing).
The app works without it, but parent contacts can't be saved until it is run.

**Report cards** — branded A4 card per student: overall %, grade, total marks,
class position, subject table (teacher, tests, marks, overall %, latest test,
section average), automatic remarks, signature lines.
- One student: open the student drawer → **Report Card**.
- Whole section: Section View toolbar → **Report Cards** (one card per page,
  ordered by class position). In the print dialog choose **Save as PDF**.
- School name on cards/messages: Parent Messages → "School name" (saved on that device).

**Message Parent** — student drawer → **Message Parent** (or the list below).
Builds a message from the student's real numbers in English or Urdu; edit it,
then **WhatsApp** (opens wa.me with the text ready), **Email** (opens your mail app)
or **Copy**. Nothing is sent until you press Send in WhatsApp/your mail app.
Pakistani numbers are normalised automatically (0300…, 300…, +92 300…).

**Parent Messages** (Section View toolbar) — every student in the section with
overall %, "needs attention" flags (critical zone under 60%, or a drop of
10+ points since the previous test), contact status and one-click WhatsApp.
A red badge on the button counts students needing attention, and after every
results import a notice tells you how many *newly* need attention.
- **Download contact template** → fill Roll No., Parent Name, Phone, Email in Excel →
  **Import contacts (Excel)**. Matching is by Roll No. (or name).
- Only principal/coordinator can edit or import contacts; HOD/teachers can message
  with saved contacts; students never see these controls.

## Admin-controlled bulk WhatsApp (new queue setup)

The principal/coordinator opens **Parent Messages**, chooses current/all sections,
filters low performers (below 60% or a drop of at least 10 points), top performers
(80% or above), or all students, then checks individual rows or **Select all**.
Choose progress report summary, low-performance alert, congratulations, or
individual test marks. A named test includes only students with a record for
that test and reports each subject's marks/absence. Preview the personalised
messages, then press **Send to selected students** and confirm.
No WhatsApp window opens. Progress report messages are text summaries; PDF
attachments and delivery/read receipt webhooks are not implemented.

### Additional one-time setup (after migrations 008–010)

1. Run `supabase/migration_011_bulk_messaging.sql` in SQL Editor.
2. Generate a private worker secret in Supabase Vault (run once):
   ```sql
   select vault.create_secret(encode(gen_random_bytes(32),'hex'), 'axiom_messaging_worker_secret');
   select decrypted_secret from vault.decrypted_secrets
   where name='axiom_messaging_worker_secret';
   ```
   Copy the resulting value directly into Edge Function Secrets as
   `MESSAGING_WORKER_SECRET`. Do not put it in application settings, Git, or frontend code.
3. Run `supabase/migration_012_bulk_worker_schedule.sql`. It installs the named
   minute-by-minute queue worker using pg_cron + pg_net; credentials come from Vault.
   The project URL is the current AXIOM project. Change it if deploying elsewhere.
4. Redeploy the updated `send-parent-message/index.ts` function with Verify JWT
   disabled. It checks user tokens/roles internally; the worker endpoint instead
   checks the separate private worker secret.
5. Add `WA_PHONE_NUMBER_ID` and `WA_ACCESS_TOKEN` as described below. The function
   uses Graph v23.0 by default; optionally set `WA_GRAPH_VERSION` to a supported
   version from your Meta app. Keep `wa_test_mode=on` for admin-only tests.
6. Send one selected student, then a small batch. Close the page and reopen
   **Parent Messages → Recent batches → View progress** to check server progress.

Queue behaviour:
- Up to 1000 students per batch. Test mode sends only to the admin. Live mode
  requires a valid parent phone for every selected student and an approved
  `WA_TEMPLATE_NAME`. Each parent message has a separately queued admin copy.
- Selections hidden by a filter are not sent. Preview/confirmation freezes the
  message content submitted for this batch; changing test/live mode before
  submission requires reviewing again.
- Queued jobs are saved transactionally. Workers claim jobs atomically; a retry
  of the same unconfirmed submission uses the same batch ID in that browser tab.
- Messages to the same phone are spaced by at least seven seconds. Admin-only
  tests and admin copies therefore take several minutes for large batches.
- **Accepted** means Meta returned a message ID, not confirmed delivery.
- **Failed** means a definite rejection or a local block before sending; the
  **Retry rejected messages only** button retries only these jobs after you fix
  the cause. Accepted jobs are never retried by this action.
- **Uncertain** means a network failure, server error, or interrupted send whose
  outcome cannot be confirmed. Check the recipient before creating a replacement.
  No automatic retry is performed for these jobs, to avoid duplicate messages.
- Enabling test mode blocks remaining queued parent jobs. Admin copies retain
  the destination captured when the batch was created and do not claim parent delivery.
- The existing `message_log` covers the older individual send path; bulk results
  live in `message_batches` and `message_jobs`. Only principal/coordinator can read them.

Troubleshooting: inspect function logs and `cron.job_run_details`. Queued jobs
that remain untouched usually indicate a missing/mismatched worker secret,
missing schedule, or an undeployed function. This schedule only processes batches
an admin explicitly submitted; it does not generate alerts automatically.

## Automatic WhatsApp (test on the admin number first)

How it behaves
- A server function (`send-parent-message`) sends the messages — no one needs to press Send per parent.
- **Test mode (default):** nothing goes to parents. Every message goes ONLY to the admin number,
  labelled `[TEST] Intended for <student> (<parent number or "no parent number saved">)`.
- **Live mode:** each message goes to the parent's saved number AND a copy goes to the admin number.
- The admin number lives in the private `app_settings` table — never in `parent_contacts`
  ("All Contacts") and never in this public repository. Parent contact numbers stay empty until you add them.
- Only principal / coordinator can send. Every attempt is recorded in `message_log`.

Setup
1. SQL Editor → run `supabase/migration_009_messaging.sql`.
2. SQL Editor → store the admin number (do this in the dashboard, not in a file):
   ```sql
   insert into public.app_settings (key, value) values ('admin_whatsapp', '923414703169')
   on conflict (key) do update set value = excluded.value;
   ```
   After this, **Message Parent → Test on admin** already works (it opens WhatsApp to the admin number).
3. WhatsApp Cloud API (free to test) — https://developers.facebook.com :
   create an app (type *Business*) → add the **WhatsApp** product → **API Setup**.
   Copy the **Phone number ID** and the **temporary access token** (valid 24 h; for a permanent one
   create a System User token). Under **To**, add the admin number and confirm the code WhatsApp sends.
   From the admin's WhatsApp, send "hi" to the test number — this opens the 24-hour window that lets
   free-text messages through.
4. Supabase → Edge Functions → **Deploy a new function** → name `send-parent-message`,
   paste `supabase/functions/send-parent-message/index.ts`, turn **Verify JWT off** → Deploy.
5. Edge Functions → Secrets → add `WA_PHONE_NUMBER_ID` and `WA_ACCESS_TOKEN`.
6. Open **Parent Messages**: the banner shows TEST MODE → **Send … shown automatically**.
   The admin number receives the messages.

Going live (parents)
- Messaging a parent who has not written to your number first requires a **template message**
  approved by Meta (category *Utility*, body like `{{1}}`). Create it in WhatsApp Manager, then add the
  secrets `WA_TEMPLATE_NAME` (and `WA_TEMPLATE_LANG`, e.g. `en` or `ur`). The whole message text is sent
  as the template's single variable (line breaks become ` | `).
- Use a real, verified business number (Meta business verification), add parent numbers via
  **Import contacts**, then switch test mode off:
  ```sql
  update public.app_settings set value = 'off' where key = 'wa_test_mode';
  ```
  Switch back with `'on'` at any time.
- Cost: Meta charges per conversation (a few cents in Pakistan); check current pricing.

## Year Comparison (compare yearly results as groups)

Compares any number of years side by side: typical result, support need,
breadth across streams, subject priorities and achievement. Each year holds
different students, so every statement describes **groups**, never individual
progress, and no cause is implied.

**One-time setup:** SQL Editor → run `supabase/migration_013_year_comparison.sql`,
then `supabase/migration_014_year_source_files.sql`. If 013 already ran, run only
014. It adds original-file references and the private `year-result-files`
storage bucket. Deploy the updated static files; no new keys or Edge Functions
are needed. Cloud saving never silently falls back to a temporary local copy.

**Where:** principal / coordinator → **Year Comparison** button next to Teacher
Report. HOD → the same button in the top bar (read-only). Teachers and
students do not see it.

**Using it**
1. **Add year** → choose the Excel (`.xls` / `.xlsx`) results workbook for one
   year. The screen shows what was found (sheets, streams, subjects with their
   maximum marks and source Excel row). Enter the year, assessment name, class
   or grade and stream names. Check the student counts and maxima against the
   workbook, tick the confirmation, then save. The original workbook and its
   calculated results are both saved to Supabase. Maximum upload size is 6 MB.
   Rename a stream so it matches the same stream in other years (PM in every
   year). Add one workbook per year. Adding the same year + assessment again
   replaces it (the screen says so first).
2. Tick the years to compare. The findings compare the two most recent ticked
   years; the table and chart show every ticked year.
3. Saved years load from cloud whenever the page opens; **Refresh** fetches
   updates without another local upload. Each year offers **Download** for its
   original file. Principal/coordinator can use **Reload file** to reimport it
   from cloud; saving that reimport reuses the original object, not a duplicate.
   Existing years without a source file show **Attach workbook**; attach the
   local original once. Their calculated results remain available meanwhile.
4. The overview shows complete-result counts, median, support and excellence.
   Purple comparison notes open the checks; they indicate differences in exam,
   subject, grade or coverage, not an application failure. Up to three insight
   cards show a short metric; **Details** expands evidence and qualifications.
   Charts include a year trend (median/support/excellence toggle), stacked score
   bands, result-status donut, stream bars and subject bars with a stream filter.
   Hover or keyboard-focus data points for exact counts. Phone layouts adapt
   chart dimensions and reduced-motion preferences disable chart animation.
   Everything else is in expandable sections. **Settings**
   (support threshold, pass mark, excellence threshold, who is counted) apply to
   every year equally and are saved on that device. Complete results are the
   default for overall measures; available-subject mode is an explicit option.
5. **Print Report** gives a PDF through the normal print dialog. It retains the
   detailed evidence and comparison checks, even though the screen is concise.

Cloud replacement uploads a new object, saves the result reference, then removes
the previous file. A failed upload does not replace saved results. An ambiguous
save failure retains a file if it may be referenced by a committed dataset;
refresh before retrying. Cleanup failures are reported for administrator review.
Deleting a year removes its result row and attempts source-file cleanup. An
unconfirmed cleanup can leave an orphan in Storage, but never silently claims
that everything was removed. Raw workbooks may contain names; keep this bucket
private and separate from the broader roster-files permissions.

**Rules the page follows**
- Workbook layout: one sheet per stream (e.g. PM, PE, ICS), a header row with
  subject names, the maximum marks directly beneath, then one row per student.
  Empty template rows are ignored. Rows without a Sr.No are still read. A real
  student with only a roll number and no scores stays listed. A numeric student
  row cannot stand in for a maximum-marks row; unsupported or ambiguous sheets
  are skipped with a reason. Conflicting duplicate student rows must be resolved.
- Sheets assigned to the same stream must have matching subject lists and
  maximum marks. An omitted subject cannot silently become an exemption.
  Different maxima must be corrected or kept in separate streams/assessments.
- **A blank subject cell is never a zero.** It is "no score", the student is
  measured on the subjects they have, and the subject is left out of that
  subject's statistics. A real `0` is a score. `AB` / `ABS` means absent
  (not a zero, not a failure); it makes the overall result incomplete. Dash,
  `nil` and `x` placeholders mean missing; only explicit `N/A` or `exempt`
  means not applicable. Marks above a paper's maximum are invalid and reported.
- **Students listed with no marks at all** are counted separately (coverage),
  never as failures.
- **Typical result** = median overall percentage of students with every applicable
  subject scored. Incomplete results do not enter overall support, excellence
  or distribution by default. Available-subject mode instead uses earned / max
  over scored subjects and is explicitly labelled as exploratory.
- **Support need** = overall percentage below the support threshold (default
  50%). **Below pass** = below the pass mark (default 33%) in **any one**
  subject; a student counts once. An all-subject pass is confirmed only when
  every applicable subject has a score. Recorded subject failures, confirmed
  passes and unknown outcomes always use all listed students, independent of
  the overall-result filter. Subject absence/missing counts also include
  students without any numeric marks.
- Whole-cohort support limits treat every incomplete overall result as unknown,
  including partial records. They are conservative bounds, not estimated scores.
- Different assessment names, known grades, stream lists, subject baskets or
  maxima withhold automatic improvement/decline findings. Missing metadata or
  incomplete coverage is flagged for review. Matching labels cannot establish
  equal exam difficulty or a causal explanation.
- **Excellence** = overall percentage at or above the excellence threshold
  (default 90%). This is not the school's A+ grade boundary.
- Subjects are compared inside their own stream only.

**What is stored:** anonymous result records (stream, subject maximums and each
student's mark/status under a made-up id such as `r12`) in `year_datasets`, plus
the original Excel workbook in private Storage. Original files retain their
contents, including any student names or roll numbers. Principal/coordinator
can add, replace and delete years; HOD can view results and download files;
teachers and students have no access to either. Year Comparison does not send
email alerts. Storage access is enforced by migration 014's bucket policies.

**Tests:** `node --test axiom-app/tests/*.test.cjs`

**Reading the dashboard:** hover or focus the information buttons beside Typical
result, Support need and Excellence for short definitions. Current thresholds
appear above the years; use **Settings** to change them. **Overview** shows the
main changes with visual evidence, **Subjects** contains the subject map and
paired evidence charts, **Support** shows pass outcomes and missing-result
limits, and **Data quality** holds comparison checks and the import audit.
These views replace the previous Explore details accordions. This interface
update needs no additional migration beyond 013 and 014.

**Browser integration:** with Playwright and Chrome available, run
`node axiom-app/tests/year-compare-browser.cjs`. It uses real synthetic XLSX
workbooks and a local page with mocked Supabase storage, never production
credentials or real student records. It covers import validation, confirmation,
anonymous save/reload, denominators, settings, print inputs and role controls.
Database RLS and real workbook compatibility still require a staging check.
