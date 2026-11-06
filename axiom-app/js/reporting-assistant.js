(function () {
  'use strict';

  const dashboards = {};
  let enabled = false;
  let reportUserId;
  let pending;
  let choices = [];
  const metricNames = {
    average: 'Explain the overall average',
    passRate: 'Explain the pass rate',
    attention: 'Explain who is counted as needing attention',
  };

  function element(tag, text) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    return node;
  }

  const dialog = element('dialog');
  dialog.className = 'ax-assistant';
  dialog.setAttribute('aria-labelledby', 'axAssistantTitle');
  dialog.innerHTML = '<form><header><h2 id="axAssistantTitle">Reporting Assistant</h2>' +
    '<button type="button" class="ghost small" data-close>Close</button></header>' +
    '<p data-scope></p><div data-question-controls><label for="axAssistantQuestion">Question</label>' +
    '<div class="ax-assistant-controls"><select id="axAssistantQuestion"></select>' +
    '<button type="submit" class="primary small">Ask</button></div></div>' +
    '<p role="status" data-status></p><div data-answer></div></form>';
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  const question = dialog.querySelector('select');
  const ask = dialog.querySelector('[type="submit"]');
  const status = dialog.querySelector('[data-status]');
  const answer = dialog.querySelector('[data-answer]');

  function dashboardChoices(snapshot) {
    if (!snapshot?.listed) return [];
    const { sourceIds, listed, scored, subjects = [] } = snapshot;
    const options = Object.entries(metricNames).filter(([key]) => scored > 0 && snapshot[key] != null)
      .map(([key, label]) => ({
        label, kind: 'dashboard', sourceIds, facts: { [key]: snapshot[key], listed, scored },
        note: (scored < listed ? `${listed - scored} listed students have no overall result. ` : '') +
          'Overall figures use the latest available marks. Individual subjects may have missing or absent results.',
      }));
    for (const subject of subjects) {
      const missing = listed - subject.scored - subject.absent;
      options.push({
        label: 'Summarize ' + subject.subject, kind: 'subject', sourceIds,
        facts: { average: subject.avg, listed, scored: subject.scored, absent: subject.absent, missing },
        note: subject.scored < listed ? 'The average covers scored results only. Absences and missing results are counted separately.' : '',
      });
    }
    return options;
  }

  function open(page) {
    const isYearBrief = page === 'years';
    const comparison = isYearBrief ? window.AxiomYearCompare?.assistantComparison() : null;
    const dashboard = dashboards[page];
    dialog.querySelector('h2').textContent = isYearBrief ? 'Year Comparison Brief' : 'Reporting Assistant';
    dialog.querySelector('[data-question-controls]').hidden = isYearBrief;
    dialog.querySelector('[data-scope]').textContent = comparison ? `${comparison.A.label} → ${comparison.B.label}` : dashboard?.title || 'Year Comparison';
    answer.replaceChildren();
    choices = isYearBrief ? [] : dashboardChoices(dashboard);
    if (isYearBrief) {
      status.textContent = comparison ? '' : 'Select exactly two years, then reopen the brief.';
      if (comparison) renderYearBrief(window.AxiomYearCore.meetingBrief(comparison));
      dialog.showModal();
      return;
    }
    question.replaceChildren(...choices.map((choice, index) => {
      const option = element('option', choice.label);
      option.value = index;
      return option;
    }));
    question.disabled = ask.disabled = !choices.length;
    status.textContent = choices.length ? 'Uses the figures in this report.' : 'Load scored results for this dashboard first.';
    dialog.showModal();
  }

  function renderYearBrief(brief) {
    const body = element('div');
    body.className = 'ax-assistant-brief';
    body.append(element('h3', brief.title), element('p', brief.summary));
    const metrics = element('dl');
    for (const metric of brief.metrics) {
      const card = element('div');
      const value = element('dd', metric.values);
      value.append(element('small', metric.detail));
      card.append(element('dt', metric.label), value);
      metrics.append(card);
    }
    const action = element('button', brief.action.label);
    action.type = 'button';
    action.className = 'ghost small';
    action.addEventListener('click', () => {
      dialog.close();
      document.querySelector('#yearComparePage [data-view="' + brief.action.view + '"]')?.click();
    });
    body.append(metrics, element('h4', 'What to check next'), element('p', brief.action.text), action);
    if (brief.limit) {
      const note = element('p', brief.limit);
      note.className = 'ax-assistant-brief-note';
      body.append(note);
    }
    answer.append(body);
  }

  function render(result, choice) {
    const facts = new Map(result.evidence.map(fact => [fact.id, fact]));
    for (const observation of result.observations) {
      const block = element('section');
      block.append(element('p', observation.text));
      const list = element('ul');
      for (const id of new Set(observation.sources)) {
        const { label, value } = facts.get(id);
        const display = label.includes('(%)') ? `${value}%` : String(value);
        list.append(element('li', label + ' — ' + display));
      }
      block.append(list);
      answer.append(block);
    }
    if (choice.note) answer.append(element('p', choice.note));
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const choice = choices[Number(question.value)];
    if (!choice || pending) return;
    const controller = new AbortController();
    pending = controller;
    ask.disabled = question.disabled = true;
    answer.replaceChildren();
    status.textContent = 'Reading the report figures…';
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) throw new Error('Sign in again to use the assistant.');
      if (session.user.id !== reportUserId) throw new Error('Reload AXIOM to update the report for your current account.');
      const { kind, sourceIds, facts } = choice;
      const response = await fetch(SUPABASE_URL + '/functions/v1/reporting-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ kind, sourceIds, facts }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (pending !== controller) return;
      if (response.status === 404) throw new Error('The reporting assistant is awaiting deployment.');
      if (!response.ok) throw new Error(result.error || 'The reporting assistant is unavailable.');
      render(result, choice);
      status.textContent = 'Summary ready.';
    } catch (error) {
      if (pending === controller) status.textContent = error.message || 'The reporting assistant is unavailable.';
    } finally {
      if (pending === controller) {
        pending = null;
        ask.disabled = question.disabled = false;
      }
    }
  });

  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  question.addEventListener('change', () => {
    answer.replaceChildren();
    status.textContent = 'Uses the figures in this report.';
  });
  dialog.addEventListener('close', () => {
    pending?.abort();
    pending = null;
    answer.replaceChildren();
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-ax-assistant]');
    if (enabled && button) open(button.dataset.axAssistant);
  });

  window.AxiomAssistant = {
    enable(role, userId) {
      enabled = ['principal', 'coordinator', 'hod'].includes(role);
      reportUserId = userId;
      document.querySelectorAll('[data-ax-assistant]').forEach(button => { button.hidden = !enabled; });
    },
    setDashboard(page, snapshot) { dashboards[page] = snapshot; },
  };
})();
