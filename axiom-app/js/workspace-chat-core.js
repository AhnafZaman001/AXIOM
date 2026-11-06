(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AxiomWorkspaceChatCore = factory();
})(typeof self === 'undefined' ? this : self, function () {
  'use strict';

  const normalize = value => String(value ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const rounded = value => Number(value.toFixed(2));
  const percent = value => `${rounded(value)}%`;
  const help = 'Try “How many students got exactly 90% in Physics?”, “Show roll 12 in F1A”, or “Show the score distribution”.';

  function findMention(text, choices, names) {
    const haystack = ' ' + normalize(text) + ' ';
    let longest = 0, matches = [];
    for (const choice of choices) {
      const size = Math.max(0, ...names(choice).map(name => {
        const key = normalize(name);
        return key && haystack.includes(' ' + key + ' ') ? key.length : 0;
      }));
      if (!size || size < longest) continue;
      if (size > longest) { longest = size; matches = []; }
      matches.push(choice);
    }
    return matches;
  }

  function scoreFilter(question) {
    const number = '(\\d+(?:\\.\\d+)?)';
    const range = question.match(new RegExp('(?:between|from)\\s+' + number + '\\s*%?\\s*(?:and|to|–|-)\\s*' + number, 'i'));
    const explicit = question.match(new RegExp(number + '\\s*(%|marks?\\b|points?\\b|\\+|/\\s*' + number + ')', 'i'));
    const phrase = question.match(new RegExp('(?:exactly|at least|at most|more than|less than|above|below|under|over|got|scored|greater than|equal to|marks? of|score of)\\s+' + number, 'i'));
    if (!range && !explicit && !phrase) return null;
    const value = Number((range || explicit || phrase)[1]);
    const upper = range ? Number(range[2]) : null;
    const denominator = explicit && explicit[2].startsWith('/') ? Number(explicit[3]) : null;
    const marks = denominator != null || (/\bmarks?\b/i.test(question) && !question.includes('%'));
    if (denominator != null && (denominator <= 0 || value > denominator)) return { invalid: true };
    if (range && upper < value) return { invalid: true };
    if (range) return { marks, denominator, label: `${value}–${upper}`, match: n => n >= value && n <= upper };
    const rule = [
      [/at least|or more|or above|or higher|\d\s*\+|>=|≥/i, 'at least', n => n >= value],
      [/at most|or less|or below|or lower|<=|≤/i, 'at most', n => n <= value],
      [/more than|greater than|\babove\b|\bover\b|>/i, 'above', n => n > value],
      [/less than|\bbelow\b|\bunder\b|</i, 'below', n => n < value],
    ].find(([pattern]) => pattern.test(question));
    return {
      marks, denominator, label: `${rule?.[1] || 'exactly'} ${value}`,
      match: rule?.[2] || (n => Math.abs(n - value) < 0.000001),
    };
  }

  function studentSummary(row, subject, test, snapshot) {
    const subjects = subject ? [subject] : row.subjects;
    const details = [];
    for (const name of subjects) {
      const scores = row.tests[name] || [];
      const selected = test ? scores.filter(score => score.test === test) : subject ? scores : scores.slice(-1);
      if (!selected.length) details.push([name, test || 'Latest', 'No result']);
      for (const score of selected) {
        const value = score.absent ? 'Absent' : score.percent == null ? 'No usable mark' :
          `${score.obtained}/${score.max} · ${percent(score.percent)}`;
        details.push([name, score.test, value]);
      }
    }
    const overall = row.overall == null ? 'No overall result is available.' : `Overall average ${percent(row.overall)}.`;
    return {
      title: row.name, detail: `${row.sectionLabel} · Roll ${row.rollNo || 'unlisted'}. ${overall}`,
      columns: ['Subject', 'Test', 'Result'], rows: details, source: snapshot.label,
      student: row.id ? { id: row.id, section: row.section } : null,
      chart: subject ? (row.tests[subject] || []).filter(score => !score.absent && score.percent != null)
        .slice(-8).map(score => [score.test, score.percent]) : null,
      chartUnit: subject ? '%' : null,
    };
  }

  function answer(question, snapshot, context = {}) {
    const reply = (title, detail) => ({ title, detail, source: snapshot.label });
    const text = normalize(question);
    const follow = /^(?:and|what about|how about|same|show their|their|list them|show them)\b/i.test(question);
    const sections = findMention(question, snapshot.sections, item => [item.key, item.label, item.alias]);
    if (sections.length > 1) return reply('Which section did you mean?', 'Use the full section label to disambiguate.');
    const section = sections[0]?.key || (follow ? context.section : null);
    const scope = section ? snapshot.students.filter(row => row.section === section) : snapshot.students;
    const subjectNames = [...new Set(scope.flatMap(row => row.subjects))];
    const alias = subject => /^math$/i.test(subject) ? ['mathematics', 'maths'] : /^computer$/i.test(subject) ? ['computer science'] : [];
    const allSubjects = section ? [...new Set(snapshot.students.flatMap(row => row.subjects))] : subjectNames;
    const explicitSubject = findMention(question, allSubjects, name => [name, ...alias(name)])[0];
    const subject = explicitSubject || (follow ? context.subject : null);
    const testNames = subject ? [...new Set(scope.flatMap(row => (row.tests[subject] || []).map(score => score.test)))] : [];
    const test = findMention(question, testNames, name => [name])[0] || null;
    const roll = question.match(/\broll(?:\s*(?:no\.?|number|#))?\s*[:#]?\s*([\p{L}\p{N}-]+)/iu);
    let people = roll ? scope.filter(row => normalize(row.rollNo) === normalize(roll[1])) :
      findMention(question, scope, row => [row.name]);
    if (!people.length && !roll) {
      const named = text.match(/\b(?:named|student name|student called) (.+)$/)?.[1] ||
        text.match(/^how did (.+?) (?:do|perform)(?: in .+)?$/)?.[1];
      if (named) people = scope.filter(row => row.name && normalize(row.name).includes(named));
    }
    if (!people.length && follow && context.studentId && !roll) people = scope.filter(row => row.id === context.studentId);
    if (people.length > 1) return reply('More than one student matches', 'Add the section and roll number so I can identify the right student.');
    if (people.length === 1) {
      const student = people[0];
      return { ...studentSummary(student, subject, test, snapshot), context: { section: student.section, subject, studentId: student.id } };
    }
    if (roll || /\b(?:named|student name|student called)\b/.test(text)) {
      return reply('Student not found', snapshot.anonymous ?
        'Saved year results contain anonymous records. Switch to Current workspace for named students.' :
        'Check the spelling or add the student’s section and roll number.');
    }
    if (/\b(?:test|quiz|paper)\b/i.test(question) && !subject && !snapshot.anonymous) {
      return reply('Which subject is the test for?', 'Include the subject and test name, such as “Physics Test 2”.');
    }
    const requestedTest = question.match(/\b(?:test|quiz)\s*#?\s*\d+\b/i)?.[0];
    if (requestedTest && !test && !snapshot.anonymous) return reply('Test not found', 'Use the test name shown in the roster, or ask for the latest result.');
    const scoreQuestion = test ? question.replace(new RegExp(test.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), '') : question;
    const filter = scoreFilter(scoreQuestion) || (/^(?:list|show) them\b/i.test(question) ? context.filter : null);
    if (filter?.invalid) return reply('Check the score range', 'Use a valid range or a mark within its total, such as 75/100.');
    const distribution = /\b(distribution|chart|graph|histogram|bands)\b/.test(text) && !filter;
    const average = /\b(average|mean|summary|summarize|overview|performance)\b/.test(text) && !filter;
    const rank = text.match(/\b(top|bottom|highest|lowest)(?:\s+(\d+))?\b/);
    const absences = /\b(absent|absence|absences)\b/.test(text) && !filter;
    const count = /\b(how many|count|number of|show students|list students)\b/.test(text);
    const missing = !filter && /\b(no marks|without marks|missing (?:marks|scores|results)|no results)\b/.test(text);
    const outcome = !filter && text.match(/\b(pass(?:ed|ing)?|fail(?:ed|ing)?)\b/)?.[1];
    const groups = /\b(by section|across sections|by stream|across streams)\b/.test(text);
    const subjectOverview = !subject && /\bsubjects?\b/.test(text) && /\b(compare|weakest|strongest|average|performance|rank|struggl\w*)\b/.test(text);
    if (!scope.length) return reply('No student records in this scope', 'Choose a workspace or saved year that contains results.');
    if (!filter && !distribution && !average && !rank && !absences && !count && !groups && !subjectOverview && !outcome && !missing) return null;

    const rawMarks = filter?.marks || (rank && /\bby (?:total )?marks\b/.test(text));
    const unit = rawMarks ? 'marks' : '%';
    const eligible = subject ? scope.filter(row => row.subjects.includes(subject)) : scope;
    const rows = eligible.map(row => {
      const history = subject ? (row.tests[subject] || []) : [];
      const score = test ? history.find(item => item.test === test) : history.at(-1);
      return {
        row, absent: Boolean(score?.absent),
        value: subject ? (score?.absent ? null : rawMarks ? score?.obtained : score?.percent)
          : rawMarks ? row.total?.obtained : row.overall,
        max: subject ? score?.max : row.total?.max,
      };
    });
    const scored = rows.filter(row => row.value != null && Number.isFinite(row.value) && (filter?.denominator == null || row.max === filter.denominator));
    const coverage = `${scored.length} of ${eligible.length} students had a usable ${subject ? 'subject score' : 'overall result'}${filter?.denominator ? ` out of ${filter.denominator}` : ''}.`;
    const label = [subject, test, sections[0]?.label || snapshot.sections.find(item => item.key === section)?.label].filter(Boolean).join(' · ') || snapshot.label;
    const nextContext = { section, subject, filter };
    const display = item => unit === '%' ? percent(item.value) : `${rounded(item.value)} / ${item.max ?? '—'}`;
    const show = (items, heading) => ({
      ...reply(heading, coverage), context: nextContext,
      columns: ['Student', 'Section', unit === '%' ? 'Result' : 'Marks'],
      rows: snapshot.anonymous ? [] : items.map(item => [item.row.name, item.row.sectionLabel, item.absent ? 'Absent' : display(item)]),
      note: snapshot.anonymous ? 'Saved year results are anonymous.' :
        rawMarks && !subject ? snapshot.totalNote : (subject && !test ? 'Latest recorded result per student. Name a test to use the same assessment.' : ''),
    });
    if (filter) {
      const matching = scored.filter(item => filter.match(item.value));
      return show(matching, `${matching.length} ${matching.length === 1 ? 'student' : 'students'} · ${filter.label}${unit === '%' ? '%' : ' marks'}${filter.denominator ? ` out of ${filter.denominator}` : ''} · ${label}`);
    }
    if (absences) {
      if (!subject) return reply('Which subject’s absences?', 'Name a subject and optionally a test.');
      const absent = rows.filter(row => row.absent);
      return show(absent, `${absent.length} marked absent · ${label}`);
    }
    if (missing) {
      const missingScores = rows.filter(item => item.value == null && !item.absent);
      return {
        ...reply(`${missingScores.length} without a usable result · ${label}`, coverage),
        columns: ['Student', 'Section'],
        rows: snapshot.anonymous ? [] : missingScores.map(item => [item.row.name, item.row.sectionLabel]),
        note: subject ? 'Recorded absences are counted separately.' : '',
        context: nextContext,
      };
    }
    if (outcome) {
      const passing = outcome.startsWith('pass');
      if (snapshot.anonymous && !subject) {
        const failed = scope.filter(row => row.belowPass > 0).length;
        const passed = scope.filter(row => row.complete && row.belowPass === 0).length;
        return reply(`${passing ? passed + ' passed every subject' : failed + ' failed at least one subject'} · ${label}`,
          `${scope.length - passed - failed} of ${scope.length} students have unconfirmed outcomes.`);
      }
      const cutoff = snapshot.passMark || 50;
      const matches = scored.filter(row => passing ? row.value >= cutoff : row.value < cutoff);
      return show(matches, `${matches.length} ${passing ? 'at or above' : 'below'} ${cutoff}% · ${label}`);
    }
    if (subjectOverview) {
      const metrics = subjectNames.map(name => {
        const enrolled = scope.filter(row => row.subjects.includes(name));
        const valid = enrolled.map(row => (row.tests[name] || []).at(-1))
          .filter(score => score && !score.absent && score.percent != null);
        return { name, listed: enrolled.length, scored: valid.length,
          mean: valid.length ? valid.reduce((sum, score) => sum + score.percent, 0) / valid.length : null };
      }).filter(metric => metric.mean != null).sort((a, b) => a.mean - b.mean);
      return {
        ...reply('Subject performance · ' + label, 'Lowest average first. Coverage can differ by subject.'),
        columns: ['Subject', 'Average', 'Scored / listed'],
        rows: metrics.map(metric => [metric.name, percent(metric.mean), `${metric.scored} / ${metric.listed}`]),
        chart: metrics.slice(0, 8).map(metric => [metric.name, metric.mean]), chartUnit: '%', context: nextContext,
      };
    }
    if (distribution || groups) {
      const bands = [['Below 50%', 0, 50], ['50–59%', 50, 60], ['60–69%', 60, 70], ['70–79%', 70, 80], ['80–89%', 80, 90], ['90% and above', 90, Infinity]];
      const chart = groups ? [...new Set(scored.map(item => item.row.sectionLabel))].map(group => [group, scored.filter(item => item.row.sectionLabel === group).length])
        : bands.map(([name, min, max]) => [name, scored.filter(item => item.value >= min && item.value < max).length]);
      return { ...reply(groups ? `Scored students by group · ${label}` : `Score distribution · ${label}`, coverage), chart, context: nextContext };
    }
    if (rank) {
      const sorted = scored.slice().sort((a, b) => /bottom|lowest/.test(rank[1]) ? a.value - b.value : b.value - a.value);
      const limit = Math.min(Math.max(Number(rank[2]) || 5, 1), 50);
      const top = sorted.slice(0, limit);
      if (snapshot.anonymous) {
        return { ...reply(`Ranked results · ${label}`, coverage), columns: ['Rank', 'Stream', 'Result'],
          rows: top.map((item, i) => [i + 1, item.row.sectionLabel, display(item)]), note: 'Saved year results are anonymous.', context: nextContext };
      }
      return show(top, `${/bottom|lowest/.test(rank[1]) ? 'Lowest' : 'Highest'} ${top.length} results · ${label}`);
    }
    if (average || subject) {
      const mean = scored.length ? percent(scored.reduce((sum, item) => sum + item.value, 0) / scored.length) : 'Unavailable';
      return { ...reply(`${mean} average · ${label}`, coverage), context: nextContext };
    }
    return { ...reply(`${scope.length} students listed · ${label}`, coverage), context: nextContext };
  }

  return { answer, normalize, help };
});
