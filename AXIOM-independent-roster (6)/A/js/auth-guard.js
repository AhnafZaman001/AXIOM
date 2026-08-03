// =========================================================================
// Runs after app.js has already done its normal (empty/local) boot.
// 1. Confirms the user is signed in (else bounces to login.html)
// 2. Shows who's signed in + a Logout button
// 3. Hides UI the current role shouldn't see
// 4. Pulls real data from Supabase and re-renders with it
// =========================================================================
(async function authGuard() {
  const result = await axRequireAuth(); // redirects to login.html if not signed in
  if (!result) return;
  const { session, profile } = result;

  // ---- 1. Show identity + logout in the masthead ----
  const actionsWrap = document.querySelector('.masthead-actions');
  if (actionsWrap) {
    const who = document.createElement('div');
    who.style.cssText = 'display:flex;align-items:center;gap:10px;';
    who.innerHTML = `
      <div style="text-align:right;">
        <div style="font-size:0.82rem;font-weight:700;color:#fff;">${escapeHtmlSafe(profile.full_name)}</div>
        <div style="font-size:0.68rem;color:rgba(255,255,255,0.65);text-transform:capitalize;">${escapeHtmlSafe(profile.role)}</div>
      </div>
      <button class="ghost small" id="logoutBtn" style="background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.16);color:#fff;">Log Out</button>
    `;
    actionsWrap.prepend(who);
    document.getElementById('logoutBtn').addEventListener('click', axSignOut);
  }

  function escapeHtmlSafe(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---- 2. Role-based UI restrictions ----
  const role = profile.role;
  const hide = (id) => { const el = document.getElementById(id); if (el) el.style.display = 'none'; };

  if (role === 'student') {
    // Read-only: no editing tools, no cross-student browsing controls.
    hide('actionsToolbar');
    hide('addSectionBtn'); hide('deleteSectionBtn'); hide('renameSectionBtn');
  } else if (role === 'hod') {
    // Full read access, no editing.
    hide('actionsToolbar');
  } else if (role === 'teacher') {
    // Can add/edit test scores for their own subjects (enforced by RLS),
    // but not manage sections, students, or teacher assignments.
    hide('addSectionBtn'); hide('deleteSectionBtn'); hide('renameSectionBtn');
    hide('addStudentBtn'); hide('manageTeacherBtn');
    // Restrict the Section View (subject filter, table columns, charts,
    // reports) to just the subject(s) this teacher is on record teaching —
    // otherwise every subject for every student shows, which is confusing
    // for a teacher who should only see their own.
    currentTeacherRestriction = profile.teacher_name || null;
  }
  // principal / coordinator: nothing hidden — full access.

  // ---- 3. Load real data from Supabase and re-render ----
  try {
    workspace = await axLoadWorkspaceFromSupabase();
  } catch (err) {
    console.error('Failed to load data from Supabase:', err);
    return;
  }

  // Any section that was added from another device/login won't be in this
  // build's hardcoded SECTION_DEFS yet — register it now, before the
  // dropdowns/subject filters below get populated from SECTION_DEFS.
  (workspace._cloudSections || []).forEach(registerCloudSectionDef);
  delete workspace._cloudSections;

  populateSectionSelects();
  populateSubjectFilter();
  updateStatusLine();
  updateLastUpdatedNow();
  renderTable();
  renderPinnedPanel();
})();
