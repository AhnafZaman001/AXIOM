(function () {
  'use strict';

  let panel, launcher, feed, input, sendButton;
  let userId, campus, token, store, context = {}, previousRoute, generation = 0, sending = false;
  const core = window.AxiomWorkspaceChatCore;
  const examples = {
    'Student Roster': [
      'In the roster, show roll 12 in F1A and their latest subject results.',
      'Show all test history for roll 12 in F1A in the Student Roster.',
      'How many students in F1A got at least 80/100 in Physics Test 2?',
      'List students in F1A who were absent in Physics Test 2.',
    ],
    'Dashboard': [
      'Which subjects have the lowest averages across the current workspace?',
      'Show the score distribution for the current workspace.',
    ],
    'Year Comparison': [
      'Compare 2025–26 and 2026–27 in Year Comparison.',
      'Compare Physics averages in PM for 2025–26 and 2026–27.',
      'In the latest saved year, how many students scored 90% or more?',
      'In Year Comparison, show roll 12 in 2026–27.',
      'In the latest saved year, compare subject averages in ICS.',
    ],
  };
  const intentWords = new Set('a about absent absences across all an and any are at average best bottom break breakdown by can chart class classes compare count difference did distribution do doing each every exactly fail failed failing fewer find for from give got graph group groups had has have high higher highest how i in is last latest least list low lower lowest many mark marks mean missing more most need number of on one overall pass passed passing percent percentage performance poor rank recorded result results same score scored scores section sections show some spread student students subject subjects summarize test than that the their them there these this those to top total trend under us was we weak weakest were what which who whose with without worst year years'.split(' '));
  const intents = {
    count: 'How many students', average: 'Average result', top: 'Top results',
    bottom: 'Lowest results', distribution: 'Score distribution', subjects: 'Compare subjects',
    absences: 'How many were absent', groups: 'Students by section',
  };

  async function interpret(question, snapshot) {
    const phrase = core.normalize(question).split(' ').filter(word => intentWords.has(word)).slice(0, 35).join(' ');
    if (phrase.length < 8) return null;
    try {
      const response = await fetch(SUPABASE_URL + '/functions/v1/reporting-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token },
        body: JSON.stringify({ kind: 'chat-intent', phrase }),
        signal: AbortSignal.timeout(8500),
      });
      if (!response.ok) return null;
      const { operation } = await response.json();
      return Object.hasOwn(intents, operation) ? core.answer(intents[operation] + ' ' + question, snapshot, context) : null;
    } catch {
      return null;
    }
  }

  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text != null) element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  function message(text, kind) {
    const block = node('div', text, 'ax-chat-message ' + (kind || ''));
    feed.append(block);
    feed.scrollTop = feed.scrollHeight;
    return block;
  }

  function render(result) {
    const block = message(null);
    block.append(node('strong', result.title));
    if (result.detail) block.append(node('p', result.detail));
    if (result.chart?.length) {
      const chart = node('div', null, 'ax-chat-chart');
      const max = result.chartUnit === '%' ? 100 : Math.max(1, ...result.chart.map(row => row[1]));
      for (const [label, value] of result.chart.slice(0, 12)) {
        const row = node('div');
        const bar = node('progress');
        bar.max = max;
        bar.value = value;
        bar.setAttribute('aria-label', label);
        row.append(node('span', label), bar, node('b', Number(value.toFixed(2)) + (result.chartUnit || '')));
        chart.append(row);
      }
      block.append(chart);
      if (result.chart.length > 12) block.append(node('small', 'Chart shows the first 12 groups.'));
    }
    if (result.rows?.length) {
      const wrap = node('div', null, 'ax-chat-table');
      const table = node('table'), head = table.createTHead().insertRow(), body = table.createTBody();
      result.columns.forEach(text => head.append(node('th', text)));
      let offset = 0;
      const more = node('button', null, 'ghost small');
      more.type = 'button';
      function addRows() {
        for (const values of result.rows.slice(offset, offset + 12)) {
          const row = body.insertRow();
          values.forEach(value => row.append(node('td', value)));
        }
        offset += 12;
        more.hidden = offset >= result.rows.length;
        more.textContent = 'Show more (' + Math.max(0, result.rows.length - offset) + ')';
      }
      more.addEventListener('click', addRows);
      addRows();
      wrap.append(table);
      block.append(wrap, more);
    }
    if (result.note) block.append(node('small', result.note));
    if (result.source) block.append(node('small', 'Source · ' + result.source));
    feed.scrollTop = feed.scrollHeight;
  }

  function clear() {
    generation++;
    context = {};
    previousRoute = null;
    feed.replaceChildren();
    message('Ask about the Student Roster, dashboard results, or Year Comparison from here. Name a section, test, or year when it matters.');
    const shortcuts = node('details', null, 'ax-chat-shortcuts');
    shortcuts.append(node('summary', 'Example questions'));
    for (const [section, prompts] of Object.entries(examples)) {
      const group = node('section');
      group.append(node('strong', section));
      for (const example of prompts) {
        const button = node('button', example, 'ghost small');
        button.type = 'button';
        button.addEventListener('click', () => { input.value = example; input.focus(); });
        group.append(button);
      }
      shortcuts.append(group);
    }
    feed.append(shortcuts);
  }

  function setOpen(open) {
    panel.hidden = !open;
    launcher.setAttribute('aria-expanded', String(open));
    if (open) input.focus();
    else launcher.focus();
  }

  async function dataStore() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session?.user.id !== userId) throw new Error('Reload AXIOM to use the assistant with your current account.');
    if (token !== session.access_token) {
      token = session.access_token;
      store = window.AxiomWorkspaceChatData.create(session, campus);
    }
    return store;
  }

  async function submit(question) {
    if (!question || sending) return;
    input.value = '';
    message(question, 'user');
    const progress = message('Checking the records…');
    const request = generation;
    sending = sendButton.disabled = true;
    try {
      const data = await dataStore();
      const repaired = core.repairQuestion(question, intentWords);
      let route = core.routeQuestion(repaired, [], previousRoute);
      if (route.error) route = core.routeQuestion(repaired, await data.years(), previousRoute);
      if (generation !== request) return;
      if (route.error) throw new Error(route.error);
      if (route.kind === 'compare') {
        const [earlier, later] = route.years;
        const [brief, ...snapshots] = await Promise.all([data.compare(earlier.id, later.id),
          data.snapshot(earlier.id), data.snapshot(later.id)]);
        if (generation !== request) return;
        previousRoute = route;
        context = {};
        render(core.compareYears(repaired, snapshots, route.years, brief, intentWords));
        return;
      }
      const sourceId = route.id || 'workspace';
      if (previousRoute?.kind !== route.kind || previousRoute?.id !== route.id) {
        context = {};
      }
      const snapshot = await data.snapshot(sourceId, repaired, context);
      if (generation !== request) return;
      const subjects = new Set(snapshot.students.flatMap(row => row.subjects));
      const normalized = core.repairQuestion(repaired, [...intentWords, ...subjects]);
      const result = core.answer(normalized, snapshot, context, question) || await interpret(normalized, snapshot);
      if (generation !== request) return;
      if (result) {
        previousRoute = route;
        if (result.context) context = result.context;
        render(result);
      } else {
        message('I couldn’t find a clear way to answer that from this data. ' + core.help);
      }
    } catch (error) {
      if (generation === request) message(error.message || 'The records could not be loaded.');
    } finally {
      progress.remove();
      sending = sendButton.disabled = false;
    }
  }

  function enable(session, profile) {
    if (launcher || !profile.campus || !['principal', 'coordinator', 'hod'].includes(profile.role)) return;
    userId = session.user.id;
    campus = profile.campus;
    launcher = node('button', 'Ask AXIOM', 'ax-chat-launcher');
    launcher.type = 'button';
    launcher.setAttribute('aria-controls', 'axWorkspaceChat');
    panel = node('section', null, 'ax-chat-panel');
    panel.id = 'axWorkspaceChat';
    panel.setAttribute('aria-label', 'AXIOM workspace chat');
    panel.hidden = true;
    panel.innerHTML = '<header><strong>Ask AXIOM</strong><button type="button" class="ghost small" data-close aria-label="Close chat">Close</button></header>' +
      '<div role="log" aria-label="Chat messages" class="ax-chat-feed"></div>' +
      '<form><input type="text" autocomplete="off" maxlength="400" aria-label="Question" placeholder="Ask about your results…"><button type="submit" class="primary small">Send</button></form>';
    document.body.append(launcher, panel);
    feed = panel.querySelector('[role="log"]');
    input = panel.querySelector('input');
    sendButton = panel.querySelector('[type="submit"]');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.addEventListener('click', () => setOpen(panel.hidden));
    panel.querySelector('[data-close]').addEventListener('click', () => setOpen(false));
    panel.addEventListener('keydown', event => { if (event.key === 'Escape') setOpen(false); });
    panel.querySelector('form').addEventListener('submit', event => { event.preventDefault(); submit(input.value.trim()); });
    supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
      if (nextSession?.user.id === userId) return;
      clear();
      store = null;
      token = null;
      launcher.hidden = panel.hidden = true;
    });
    clear();
  }

  window.AxiomWorkspaceChat = { enable };
})();
