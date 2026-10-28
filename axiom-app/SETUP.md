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
