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
