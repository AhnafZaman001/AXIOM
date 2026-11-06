(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AxiomWorkspaceChatCore = factory();
})(typeof self === 'undefined' ? this : self, function () {
  'use strict';

  const normalize = value => String(value ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const rounded = value => Number(value.toFixed(2));
  const percent = value => `${rounded(value)}%`;
  const help = 'Try “How many students got exactly 90% in Physics?”, “Show roll 12 in F1A”, or “Show the score distribution”.';
  const routingWords = 'academic academy assessment average board change changed compare comparison current dashboard distribution exactly first last latest marks previous quarter results roll roster saved scored section show student students subject subjects test workspace year years above absent absence below between fewer greater least less lower more over than under'.split(' ');

  function editDistance(a, b) {
    const grid = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 0; j <= b.length; j++) grid[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        grid[i][j] = Math.min(grid[i - 1][j] + 1, grid[i][j - 1] + 1,
          grid[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          grid[i][j] = Math.min(grid[i][j], grid[i - 2][j - 2] + 1);
        }
      }
    }
    return grid[a.length][b.length];
  }

  function nearest(word, candidates) {
    let best = word.length >= 8 ? 2 : 1, matches = [];
    for (const candidate of candidates) {
      if (Math.abs(word.length - candidate.length) > best) continue;
      const distance = editDistance(word, candidate);
      if (distance > best) continue;
      if (distance < best) { best = distance; matches = []; }
      matches.push(candidate);
    }
    return matches.length === 1 ? matches[0] : null;
  }

  function repairQuestion(question, extraWords = []) {
    const words = new Set([...routingWords, ...extraWords].flatMap(value => normalize(value).split(' ')));
    return question.replace(/\b[a-z]{4,24}\b/gi, value => {
      const word = value.toLowerCase();
      return words.has(word) ? value : nearest(word, words) || value;
    });
  }

  function routeQuestion(question, years, previous = null) {
    const text = normalize(question), padded = ' ' + text + ' ';
    const yearRequest = /\b(year comparison|saved (?:year|years|results)|academic year|board results?|latest year|previous year|last year)\b/.test(text);
    const roster = /\b(roster|current workspace)\b/.test(text);
    const compares = /\b(compare|comparison between|difference|changed|versus|vs)\b/.test(text);
    const follow = /^(and|what about|how about|same|show their|their|list them|show them)\b/.test(text);
    const ranges = [...text.matchAll(/\b((?:19|20)\d{2})\s+((?:19|20)\d{2}|\d{2})\b/g)]
      .filter(match => Number(match[2].slice(-2)) === (Number(match[1]) + 1) % 100)
      .map(match => match[1] + ' ' + match[2].slice(-2));
    const yearTokens = [...text.matchAll(/\b(?:19|20)\d{2}\b/g)].map(match => match[0])
      .filter(token => !ranges.some(range => range.startsWith(token)));
    const singles = yearRequest || compares || !roster ? [...new Set(yearTokens)].filter(token => {
      if (yearRequest || compares) return true;
      return !new RegExp('(?:exactly|at least|above|below|scored|got)\\s+' + token + '\\b|\\b' + token + '\\s*(?:marks?|/)', 'i').test(question);
    }) : [];
    const catalog = years.map(year => {
      const label = normalize(year.label).replace(/\b((?:19|20)\d{2}) ((?:19|20)\d{2})\b/g, (_, first, second) => first + ' ' + second.slice(-2));
      return { ...year, key: label, start: label.match(/\b(?:19|20)\d{2}\b/)?.[0] };
    });
    const requested = [...new Set([...ranges, ...singles])];
    const named = catalog.filter(year => year.key && padded.includes(' ' + year.key + ' '));
    if (roster && !yearRequest && !ranges.length) return { kind: 'workspace' };
    if (requested.length || named.length) {
      const picks = new Map(named.map(year => [year.id, year]));
      for (const value of requested) {
        const matches = catalog.filter(year => year.key === value || year.start === value);
        if (!matches.length) return { error: 'I couldn’t find ' + value.replace(' ', '–') + ' in your campus’s saved years.' };
        for (const year of matches) picks.set(year.id, year);
      }
      let selected = [...picks.values()];
      const sameYear = selected.some((year, index) => selected.findIndex(item => item.start && item.start === year.start) !== index && year.start);
      if (sameYear) {
        const namedAssessments = selected.filter(year => year.assessment && padded.includes(' ' + normalize(year.assessment) + ' '));
        if (namedAssessments.length) selected = namedAssessments;
        else return { error: 'More than one assessment uses that year. Include the assessment name from Year Comparison.' };
      }
      if (selected.length === 1) return { kind: 'year', id: selected[0].id };
      if (selected.length === 2 && compares) return { kind: 'compare', years: selected.sort((a, b) => a.key.localeCompare(b.key)) };
      return { error: 'Name one year for that question, or ask to compare two saved years.' };
    }
    if (yearRequest) {
      if (!catalog.length) return { error: 'Your campus has no saved years in Year Comparison.' };
      const latest = catalog.slice().sort((a, b) => b.key.localeCompare(a.key));
      if (compares) {
        if (latest.length < 2) return { error: 'Save a second year before asking for a comparison.' };
        if (latest.length === 2 && latest[0].key !== latest[1].key) return { kind: 'compare', years: latest.reverse() };
        return { error: 'Which two years should I compare? Include the year labels, and the assessment if a label repeats.' };
      }
      if (latest.length === 1 || (/\blatest (?:saved )?year\b/.test(text) && latest[0].key !== latest[1].key)) {
        return { kind: 'year', id: latest[0].id };
      }
      return { error: 'Which saved year should I use? Name a year, or ask for the latest year.' };
    }
    return follow && previous?.kind === 'year' ? previous : { kind: 'workspace' };
  }

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

  function studentSummary(row, subject, test, snapshot, history) {
    const subjects = subject ? [subject] : row.subjects;
    const details = [];
    for (const name of subjects) {
      const scores = row.tests[name] || [];
      const selected = test ? scores.filter(score => score.test === test) : subject || history ? scores : scores.slice(-1);
      if (!selected.length) details.push([name, test || 'Latest', 'No result', '—']);
      for (const score of selected) {
        const value = score.absent ? 'Absent' : score.percent == null ? 'No usable mark' :
          `${score.obtained}/${score.max} · ${percent(score.percent)}`;
        details.push([name, score.date ? score.test + ' · ' + score.date : score.test, value, score.position ?? '—']);
      }
    }
    const overall = row.overall == null ? 'No overall result is available.' : `Overall average ${percent(row.overall)}.`;
    return {
      title: row.name || 'Roll ' + row.rollNo, detail: `${row.sectionLabel} · Roll ${row.rollNo || 'unlisted'}. ${overall}`,
      columns: ['Subject', 'Test', 'Result', 'Position'], rows: details, source: snapshot.label,
      note: [row.matric ? 'Matric marks: ' + row.matric + '.' : '', row.sheet ? 'Workbook sheet: ' + row.sheet + '.' : ''].filter(Boolean).join(' '),
      student: row.id ? { id: row.id, section: row.section } : null,
      chart: subject ? (row.tests[subject] || []).filter(score => !score.absent && score.percent != null)
        .slice(-8).map(score => [score.test, score.percent]) : null,
      chartUnit: subject ? '%' : null,
    };
  }

  function answer(question, snapshot, context = {}, originalQuestion = question) {
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
      findMention(originalQuestion, scope, row => [row.name]);
    if (!people.length && !roll) {
      const named = text.match(/\b(?:named|student name|student called) (.+)$/)?.[1] ||
        text.match(/^how did (.+?) (?:do|perform)(?: in .+)?$/)?.[1];
      if (named) people = scope.filter(row => row.name && normalize(row.name).includes(named));
    }
    if (!people.length && follow && context.studentId && !roll) people = scope.filter(row => row.id === context.studentId);
    if (people.length > 1) return reply('More than one student matches', 'Add the section and roll number so I can identify the right student.');
    if (people.length === 1) {
      const student = people[0];
      return { ...studentSummary(student, subject, test, snapshot, /\b(history|all tests|every test)\b/.test(text)),
        context: { section: student.section, subject, studentId: student.id } };
    }
    if (roll || /\b(?:named|student name|student called)\b/.test(text)) {
      return reply('Student not found', snapshot.anonymous ?
        snapshot.identityIssue || 'Names aren’t available for this query. Ask by roll number or include “student named” and their full name.' :
        'Check the spelling or add the student’s section and roll number.');
    }
    if (/\b(?:test|quiz|paper)\b/i.test(question) && !subject && !snapshot.isSavedYear) {
      return reply('Which subject is the test for?', 'Include the subject and test name, such as “Physics Test 2”.');
    }
    const requestedTest = question.match(/\b(?:test|quiz)\s*#?\s*\d+\b/i)?.[0];
    if (requestedTest && !test && !snapshot.isSavedYear) return reply('Test not found', 'Use the test name shown in the roster, or ask for the latest result.');
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
    if (!scope.length) return reply('No student records in this source', 'Name a saved year or a roster section that contains results.');
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
      rows: snapshot.anonymous ? [] : items.map(item => [item.row.name || (item.row.rollNo ? 'Roll ' + item.row.rollNo : 'Name unavailable'), item.row.sectionLabel, item.absent ? 'Absent' : display(item)]),
      note: snapshot.anonymous ? (snapshot.identityIssue || 'Ask “who” or “list students” to include names from the attached workbook.') :
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
      if (snapshot.isSavedYear && !subject) {
        const failed = scope.filter(row => row.belowPass > 0).length;
        const passed = scope.filter(row => row.complete && row.belowPass === 0).length;
        const known = passed + failed;
        const rate = known ? ' (' + percent((passing ? passed : failed) / known * 100) + ' of confirmed outcomes)' : '';
        return reply(`${passing ? passed + ' passed every subject' : failed + ' failed at least one subject'}${rate} · ${label}`,
          `${scope.length - passed - failed} of ${scope.length} students have unconfirmed outcomes.`);
      }
      const cutoff = snapshot.passMark || 50;
      const matches = scored.filter(row => passing ? row.value >= cutoff : row.value < cutoff);
      const rate = scored.length ? ' (' + percent(matches.length / scored.length * 100) + ' of scored)' : '';
      return show(matches, `${matches.length} ${passing ? 'at or above' : 'below'} ${cutoff}%${rate} · ${label}`);
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
          rows: top.map((item, i) => [i + 1, item.row.sectionLabel, display(item)]),
          note: snapshot.identityIssue || 'Student names are unavailable for this result.', context: nextContext };
      }
      return show(top, `${/bottom|lowest/.test(rank[1]) ? 'Lowest' : 'Highest'} ${top.length} results · ${label}`);
    }
    if (average || subject) {
      const mean = scored.length ? percent(scored.reduce((sum, item) => sum + item.value, 0) / scored.length) : 'Unavailable';
      return { ...reply(`${mean} average · ${label}`, coverage), context: nextContext };
    }
    return { ...reply(`${scope.length} students listed · ${label}`, coverage), context: nextContext };
  }

  function compareYears(question, snapshots, years, brief, vocabulary = []) {
    const subjectNames = [...new Set(snapshots.flatMap(snapshot => snapshot.students.flatMap(row => row.subjects)))];
    const sections = [...new Map(snapshots.flatMap(snapshot => snapshot.sections).map(section => [section.key, section])).values()];
    const query = repairQuestion(question, [...vocabulary, ...subjectNames])
      .replace(/\b(?:19|20)\d{2}\s*[-–—/]\s*(?:(?:19|20)\d{2}|\d{2})\b/g, '')
      .replace(/\b(?:19|20)\d{2}\b(?!\s*(?:%|marks?\b|\/))/gi, '');
    const subject = findMention(query, subjectNames, name => /^math$/i.test(name) ? [name, 'maths', 'mathematics'] : [name])[0];
    const section = findMention(query, sections, item => [item.key, item.label])[0];
    const source = years.map(year => year.label).join(' → ');
    if (/\b(?:roll|student named|student called)\b/i.test(query)) return {
      title: 'Choose one year for a student lookup', detail: 'A roll number or name can belong to different students across cohorts.', source,
    };
    const specific = subject || section || scoreFilter(query) || /\b(average|mean|pass(?:ed|ing)?|fail(?:ed|ing)?|absent|absence|missing|how many)\b/i.test(query);
    if (!specific) return {
      title: brief.title, detail: brief.summary, note: [brief.limit, brief.action.text].filter(Boolean).join(' '),
      source, columns: ['Measure', 'Earlier → later'], rows: brief.metrics.map(metric => [metric.label, metric.values]),
    };

    const questionForEach = scoreFilter(query) || /\b(pass(?:ed|ing)?|fail(?:ed|ing)?|absent|absence|missing|how many)\b/i.test(query) ? query : query + ' average';
    return {
      title: ['Year Comparison', section?.label, subject].filter(Boolean).join(' · '),
      source, columns: ['Year', 'Result', 'Coverage'], note: brief.limit,
      rows: snapshots.map((snapshot, index) => {
        const available = (!section || snapshot.sections.some(item => item.key === section.key)) &&
          (!subject || snapshot.students.some(row => (!section || row.section === section.key) && row.subjects.includes(subject)));
        const result = available ? answer(questionForEach, snapshot) : null;
        return [years[index].label, result?.title || 'Unavailable', result?.detail || 'No matching results in this saved year.'];
      }),
    };
  }

  return { answer, compareYears, normalize, repairQuestion, routeQuestion, help };
});
