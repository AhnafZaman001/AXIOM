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

  // ---- 0. Personalize the welcome hero greeting, if it's still on screen ----
  const heroGreeting = document.getElementById('welcomeHeroGreeting');
  if (heroGreeting && profile.full_name) {
    heroGreeting.textContent = 'Welcome back, ' + profile.full_name.split(' ')[0];
  }

  // ---- 1. Show identity + logout in the masthead ----
  const actionsWrap = document.querySelector('.masthead-actions');
  if (actionsWrap) {
    // Make sure the account that's signed in right now is in the saved list.
    axRememberAccount(session, profile);

    const who = document.createElement('div');
    who.style.cssText = 'display:flex;align-items:center;gap:10px;position:relative;';
    who.innerHTML = `
      <button type="button" id="accountSwitchBtn" aria-haspopup="true" title="Switch account" style="background:none;border:none;cursor:pointer;text-align:right;padding:2px 4px;font-family:inherit;">
        <div style="font-size:0.82rem;font-weight:700;color:#fff;">${escapeHtmlSafe(profile.full_name)} <span style="font-size:0.65rem;opacity:0.7;">▾</span></div>
        <div style="font-size:0.68rem;color:rgba(255,255,255,0.65);text-transform:capitalize;">${escapeHtmlSafe(profile.role)}</div>
      </button>
      <div id="accountMenu" style="display:none;position:absolute;top:calc(100% + 8px);right:0;min-width:270px;background:var(--surface-2);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow-lg);z-index:120;padding:6px;text-align:left;"></div>
      <button class="ghost small" id="logoutBtn" style="background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.16);color:#fff;">Log Out</button>
    `;
    actionsWrap.prepend(who);
    document.getElementById('logoutBtn').addEventListener('click', axSignOut);

    const menu = document.getElementById('accountMenu');
    const itemStyle = 'display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;box-sizing:border-box;background:none;border:none;color:var(--ink);padding:9px 10px;border-radius:10px;cursor:pointer;font-family:inherit;font-size:0.82rem;text-align:left;';
    function renderAccountMenu() {
      const accounts = axGetSavedAccounts();
      menu.innerHTML = accounts.map(a => `
        <button type="button" class="ax-acct" data-id="${escapeHtmlSafe(a.id)}" style="${itemStyle}">
          <span><div style="font-weight:700;">${escapeHtmlSafe(a.name)}</div>
          <div style="font-size:0.7rem;color:var(--muted);text-transform:capitalize;">${escapeHtmlSafe(a.role)}${a.role ? ' · ' : ''}${escapeHtmlSafe(a.email)}</div></span>
          ${a.id === session.user.id ? '<span style="color:var(--accent);font-weight:700;">✓</span>' : ''}
        </button>`).join('') + `
        <div style="height:1px;background:var(--line);margin:6px 4px;"></div>
        <button type="button" id="axAddAccount" style="${itemStyle}">+ Add another account</button>
        <button type="button" id="axSignOutAll" style="${itemStyle}color:var(--muted);">Sign out of all accounts</button>`;
      menu.querySelectorAll('.ax-acct').forEach(btn => btn.addEventListener('click', async () => {
        if (btn.dataset.id === session.user.id) { menu.style.display = 'none'; return; }
        btn.style.opacity = '0.6';
        try { await axSwitchAccount(btn.dataset.id); }
        catch (err) { alert(err.message); renderAccountMenu(); }
      }));
      document.getElementById('axAddAccount').addEventListener('click', () => { window.location.href = 'login.html?add=1'; });
      document.getElementById('axSignOutAll').addEventListener('click', () => {
        if (confirm('Sign out of all saved accounts on this browser?')) axSignOutAll();
      });
    }
    document.getElementById('accountSwitchBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      renderAccountMenu();
      menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', (e) => { if (!who.contains(e.target)) menu.style.display = 'none'; });
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
  // Must run AFTER section registration above -- applySubjectOverride()
  // looks the section up by key, so the section has to exist locally first.
  (workspace._cloudSubjectOverrides || []).forEach(row => {
    if(row.section_key && Array.isArray(row.subjects)) applySubjectOverride(row.section_key, row.subjects);
  });
  delete workspace._cloudSubjectOverrides;

  populateSectionSelects();
  populateSubjectFilter();
  updateStatusLine();
  updateLastUpdatedNow();
  renderTable();
  renderPinnedPanel();
})();
