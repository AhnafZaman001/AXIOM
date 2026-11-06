(function () {
  'use strict';

  let panel, launcher, feed, source, input, sendButton;
  let userId, campus, token, store, savedYears = [], context = {}, generation = 0, sending = false;
  const core = window.AxiomWorkspaceChatCore;
  const examples = ['How many students scored 90% or more?', 'Which subjects have the lowest averages?', 'Show the score distribution'];

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
    feed.replaceChildren();
    message('Ask about marks, a student, a subject, or a saved year. I’ll show the figures and who was counted.');
    const shortcuts = node('div', null, 'ax-chat-shortcuts');
    for (const example of examples) {
      const button = node('button', example, 'ghost small');
      button.type = 'button';
      button.addEventListener('click', () => { input.value = example; input.focus(); });
      shortcuts.append(button);
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

  function updateYears(years) {
    savedYears = years;
    const selected = source.value;
    const options = [new Option('Current workspace', 'workspace')];
    for (const year of years) options.push(new Option([year.label, year.assessment].filter(Boolean).join(' · '), year.id));
    source.replaceChildren(...options);
    if (options.some(option => option.value === selected)) source.value = selected;
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
      const years = await data.years().catch(() => savedYears);
      if (generation !== request) return;
      updateYears(years);
      const text = core.normalize(question);
      const yearsMentioned = years.filter(year => {
        const label = core.normalize(year.label);
        const start = label.match(/^(\d{4})(?:\s|$)/)?.[1];
        return (label && (' ' + text + ' ').includes(' ' + label + ' ')) ||
          (start && text.split(' ').includes(start));
      });
      if (/\b(?:compare|comparison|difference|changed)\b/.test(text) && yearsMentioned.length > 1) {
        if (yearsMentioned.length !== 2) throw new Error('Name exactly two saved years and their assessments if the year labels repeat.');
        const brief = await data.compare(yearsMentioned[0].id, yearsMentioned[1].id);
        if (generation !== request) return;
        render({
          title: brief.title, detail: brief.summary, note: [brief.limit, brief.action.text].filter(Boolean).join(' '),
          source: yearsMentioned.map(year => year.label).join(' → '), columns: ['Measure', 'Earlier → later'],
          rows: brief.metrics.map(metric => [metric.label, metric.values]),
        });
        return;
      }
      if (yearsMentioned.length > 1) throw new Error('Choose one saved year, or ask to compare two years.');
      if (yearsMentioned.length === 1 && source.value !== yearsMentioned[0].id) {
        source.value = yearsMentioned[0].id;
        context = {};
      }
      const snapshot = await data.snapshot(source.value);
      if (generation !== request) return;
      const result = core.answer(question, snapshot, context) ||
        await window.AxiomChatInterpret?.resolve(question, snapshot, context, token);
      if (generation !== request) return;
      if (result) {
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
      '<label class="ax-chat-source">Data source <select><option value="workspace">Current workspace</option></select></label>' +
      '<div role="log" aria-label="Chat messages" class="ax-chat-feed"></div>' +
      '<form><input type="text" autocomplete="off" maxlength="400" aria-label="Question" placeholder="Ask about your results…"><button type="submit" class="primary small">Send</button></form>';
    document.body.append(launcher, panel);
    source = panel.querySelector('select');
    feed = panel.querySelector('[role="log"]');
    input = panel.querySelector('input');
    sendButton = panel.querySelector('[type="submit"]');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.addEventListener('click', () => {
      setOpen(panel.hidden);
      if (!panel.hidden) dataStore().then(data => data.years()).then(updateYears).catch(() => {});
    });
    panel.querySelector('[data-close]').addEventListener('click', () => setOpen(false));
    panel.addEventListener('keydown', event => { if (event.key === 'Escape') setOpen(false); });
    panel.querySelector('form').addEventListener('submit', event => { event.preventDefault(); submit(input.value.trim()); });
    source.addEventListener('change', () => { generation++; context = {}; });
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
