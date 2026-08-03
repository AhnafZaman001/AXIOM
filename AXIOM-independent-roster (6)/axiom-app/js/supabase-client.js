// =========================================================================
// Supabase connection + auth/data helpers for AXIOM
// Fill in SUPABASE_URL and SUPABASE_ANON_KEY below (Project Settings -> API
// in your Supabase dashboard). The anon key is safe to expose in frontend
// code — access is controlled by the RLS policies in schema.sql, not by
// keeping this key secret.
// =========================================================================
// This URL was already in your uploaded file — confirm it's your real project,
// then paste the matching anon key from Project Settings -> API below.
const SUPABASE_URL = 'https://adqvtmnvyzkusswbwqdr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_dah_Nl6Jpf69RuaDYWhoNA_AL6bzpaj';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- Auth helpers ----------
async function axSignIn(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function axSignOut() {
  await supabaseClient.auth.signOut();
  window.location.href = 'login.html';
}

async function axGetSessionAndProfile() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return null;
  const { data: profile, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();
  if (error) { console.error(error); return null; }
  return { session, profile };
}

// Call at the top of any protected page. Redirects to login.html if not
// signed in, and returns {session, profile} otherwise.
async function axRequireAuth() {
  const result = await axGetSessionAndProfile();
  if (!result) { window.location.href = 'login.html'; return null; }
  return result;
}

// ---------- Data layer: Supabase tables <-> the app's in-memory `workspace` shape ----------
// workspace = { sections: { [sectionKey]: { students: [ {id,name,rollNo,matric,tests:{ [subject]: [ {test,date,obtained,max,percent,absent,position} ] } } ] } }, teacherOverrides: {} }

async function axLoadWorkspaceFromSupabase() {
  const [{ data: sections }, { data: students }, { data: tests }, { data: assignments }] = await Promise.all([
    supabaseClient.from('sections').select('*'),
    supabaseClient.from('students').select('*'),
    supabaseClient.from('tests').select('*'),
    supabaseClient.from('teacher_assignments').select('*'),
  ]);

  const workspace = { sections: {}, sectionRenames: {}, teacherOverrides: {} };

  (sections || []).forEach(sec => { workspace.sections[sec.key] = { students: [] }; });
  // Raw section metadata (not just the student/test container above) — used
  // by app.js to register any section that exists in the cloud but isn't
  // one of the hardcoded SECTION_DEFS baked into this build yet.
  workspace._cloudSections = sections || [];

  const testsByStudent = {};
  (tests || []).forEach(t => {
    testsByStudent[t.student_id] = testsByStudent[t.student_id] || {};
    testsByStudent[t.student_id][t.subject] = testsByStudent[t.student_id][t.subject] || [];
    const max = Number(t.max_marks) || 0;
    const obtained = Number(t.obtained) || 0;
    testsByStudent[t.student_id][t.subject].push({
      test: t.test_name, date: t.test_date, obtained: t.obtained, max: t.max_marks,
      percent: (!t.absent && max) ? +(obtained / max * 100).toFixed(2) : null,
      absent: t.absent, position: t.position, _dbId: t.id,
    });
  });

  (students || []).forEach(s => {
    if (!workspace.sections[s.section_key]) workspace.sections[s.section_key] = { students: [] };
    workspace.sections[s.section_key].students.push({
      id: s.id, name: s.name, rollNo: s.roll_no, matric: s.matric,
      tests: testsByStudent[s.id] || {}, _dbId: s.id,
    });
  });

  (assignments || []).forEach(a => {
    workspace.teacherOverrides[a.section_key] = workspace.teacherOverrides[a.section_key] || {};
    workspace.teacherOverrides[a.section_key][a.subject] = a.teacher_name;
  });

  return workspace;
}

// Upserts a single test score (used by the Add/Edit Test Score form).
async function axSaveTestScore({ studentId, subject, testName, date, obtained, max, absent, position, dbId }) {
  const row = {
    student_id: studentId, subject, test_name: testName, test_date: date || null,
    obtained: absent ? null : obtained, max_marks: max, absent: !!absent, position: position || null,
  };
  if (dbId) {
    const { error } = await supabaseClient.from('tests').update(row).eq('id', dbId);
    if (error) throw error;
  } else {
    const { error } = await supabaseClient.from('tests').insert(row);
    if (error) throw error;
  }
}

async function axDeleteTestScore(dbId) {
  const { error } = await supabaseClient.from('tests').delete().eq('id', dbId);
  if (error) throw error;
}

async function axAddStudent({ sectionKey, name, rollNo, matric }) {
  const { data, error } = await supabaseClient
    .from('students')
    .insert({ section_key: sectionKey, name, roll_no: rollNo, matric })
    .select().single();
  if (error) throw error;
  return data;
}

async function axAddSection({ key, label, sheetName, group }) {
  const { error } = await supabaseClient
    .from('sections')
    .insert({ key, label, sheet_name: sheetName, subject_group: group });
  if (error) throw error;
}

// Deletes the section row. The schema's foreign keys (students, tests,
// teacher_assignments all reference sections.key with "on delete cascade")
// mean this also removes every student/test/teacher-assignment tied to it.
async function axDeleteSection(key) {
  const { error } = await supabaseClient.from('sections').delete().eq('key', key);
  if (error) throw error;
}

// Updates an existing section's name/label/subject group in the cloud —
// used by Rename Section (including fixing a section that was created with
// the wrong subject group). Throws a clear error if no matching row exists
// yet (e.g. the original Add Section never made it to the cloud).
async function axUpdateSectionMeta({ key, label, sheetName, group }) {
  const { data, error } = await supabaseClient
    .from('sections')
    .update({ label, sheet_name: sheetName, subject_group: group })
    .eq('key', key)
    .select();
  if (error) throw error;
  if (!data || !data.length) throw new Error('No matching section found in the cloud — try re-adding it with Add Section instead.');
}

async function axSetTeacherAssignment({ sectionKey, subject, teacherName }) {
  const { error } = await supabaseClient
    .from('teacher_assignments')
    .upsert({ section_key: sectionKey, subject, teacher_name: teacherName }, { onConflict: 'section_key,subject' });
  if (error) throw error;
}

// Removes an override entirely (as opposed to setting teacher_name to '')
// so the section/subject falls back to the default roster again — mirrors
// clearTeacherOverride() on the local workspace object.
async function axDeleteTeacherAssignment({ sectionKey, subject }) {
  const { error } = await supabaseClient
    .from('teacher_assignments')
    .delete()
    .eq('section_key', sectionKey)
    .eq('subject', subject);
  if (error) throw error;
}

// ---------- "Import from Cloud" — Supabase Storage helpers ----------
// Bucket must exist first: run supabase/migration_002_storage_bucket.sql once.
const ROSTER_BUCKET = 'roster-files';

// Lists every file currently sitting in the cloud bucket, newest first.
async function axListCloudFiles() {
  const { data, error } = await supabaseClient
    .storage.from(ROSTER_BUCKET)
    .list('', { sortBy: { column: 'created_at', order: 'desc' } });
  if (error) throw error;
  // Storage's list() can return a placeholder entry for empty folders — filter that out.
  return (data || []).filter(f => f.id);
}

// Downloads one file from the bucket and returns it as an ArrayBuffer,
// ready to hand straight to XLSX.read() — same shape as a local file pick.
async function axDownloadCloudFile(fileName) {
  const { data, error } = await supabaseClient.storage.from(ROSTER_BUCKET).download(fileName);
  if (error) throw error;
  return await data.arrayBuffer();
}

// Uploads a File object (from a local <input type=file>) into the bucket.
// upsert:true means re-uploading a file with the same name replaces it,
// so "Preboard 2" can overwrite an older copy of the same-named file.
async function axUploadCloudFile(file) {
  const { error } = await supabaseClient
    .storage.from(ROSTER_BUCKET)
    .upload(file.name, file, { upsert: true, cacheControl: '3600' });
  if (error) throw error;
}

async function axDeleteCloudFile(fileName) {
  const { error } = await supabaseClient.storage.from(ROSTER_BUCKET).remove([fileName]);
  if (error) throw error;
}
