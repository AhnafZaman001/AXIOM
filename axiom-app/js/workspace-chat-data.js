(function () {
  'use strict';

  async function pages(query) {
    const records = [];
    const size = 500;
    for (let offset = 0;; offset += size) {
      const { data, error } = await query().range(offset, offset + size - 1);
      if (error) throw new Error('Could not load the complete report. Please retry.');
      records.push(...data);
      if (data.length < size) return records;
    }
  }

  function create(session, campus) {
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      accessToken: async () => session.access_token,
    });
    const cached = new Map();
    function cache(key, load) {
      const entry = cached.get(key);
      if (entry && Date.now() < entry.until) return entry.promise;
      const item = { until: Date.now() + 60_000 };
      item.promise = load().catch(error => {
        if (cached.get(key) === item) cached.delete(key);
        throw error;
      });
      cached.set(key, item);
      return item.promise;
    }

    const years = () => cache('years', () => pages(() => client.from('year_datasets')
      .select('id,label,assessment,grade_level').eq('campus', campus).order('label').order('id')));

    async function workspaceData() {
      const [sectionRows, studentRows, scoreRows] = await Promise.all([
        pages(() => client.from('sections').select('key,label,sheet_name,subject_group').eq('campus', campus).order('key')),
        pages(() => client.from('students').select('id,section_key,name,roll_no').order('id')),
        pages(() => client.from('tests').select('id,student_id,subject,test_name,test_date,obtained,max_marks,absent,created_at')
          .order('test_date', { ascending: true, nullsFirst: true }).order('created_at').order('id')),
      ]);
      const sections = sectionRows.map(row => ({ key: row.key, label: row.label, alias: row.sheet_name }));
      const sectionByKey = new Map(sectionRows.map(row => [row.key, row]));
      const students = studentRows.filter(row => sectionByKey.has(row.section_key)).map(row => ({
        id: row.id, name: row.name, rollNo: row.roll_no, section: row.section_key,
        sectionLabel: sectionByKey.get(row.section_key).label, tests: Object.create(null),
      }));
      const studentById = new Map(students.map(row => [row.id, row]));
      for (const row of scoreRows) {
        const student = studentById.get(row.student_id);
        if (!student) continue;
        const max = row.max_marks == null ? null : Number(row.max_marks);
        const obtained = row.obtained == null ? null : Number(row.obtained);
        const valid = !row.absent && obtained != null && max != null && max > 0 && obtained >= 0 && obtained <= max;
        (student.tests[row.subject] ||= []).push({
          test: row.test_name, date: row.test_date, absent: Boolean(row.absent),
          obtained: valid ? obtained : null, max, percent: valid ? Number((obtained / max * 100).toFixed(2)) : null,
        });
      }
      for (const student of students) {
        const row = sectionByKey.get(student.section);
        student.subjects = [...new Set([
          ...(SECTION_BY_KEY[student.section]?.subjects || SUBJECT_SETS[row.subject_group] || []),
          ...Object.keys(student.tests),
        ])];
        student.overall = studentOverallAverage(student, student);
        student.total = studentTotalMarks(student, student);
      }
      return {
        label: 'Current workspace', students, sections,
        totalNote: 'Overall raw marks add all attempted tests on record. For a like-for-like comparison, specify a subject and test.',
      };
    }

    const loadYear = id => cache('year:' + id, async () => {
      const { data, error } = await client.from('year_datasets')
        .select('id,label,assessment,grade_level,streams,records,import_report').eq('campus', campus).eq('id', id).maybeSingle();
      if (error || !data) throw new Error('This saved year is unavailable for your campus.');
      return data;
    });

    function yearSnapshot(dataset) {
      const core = window.AxiomYearCore;
      const settings = window.AxiomYearCompare?._state.settings || core.DEFAULTS;
      const byStream = new Map(dataset.streams.map(stream => [stream.key, stream]));
      const students = dataset.records.flatMap(record => {
        const stream = byStream.get(record.st);
        if (!stream) return [];
        const result = core.deriveRecord(record, stream, settings);
        const tests = Object.create(null), subjects = [];
        let obtained = 0, max = 0;
        for (const [i, subject] of stream.subjects.entries()) {
          const [status, value] = record.c[i] || [];
          if (status === 'n') continue;
          subjects.push(subject.name);
          if (status === 's') { obtained += value; max += subject.max; }
          if (status === 's' || status === 'a') tests[subject.name] = [{
            test: dataset.assessment || 'Saved assessment', absent: status === 'a',
            obtained: status === 's' ? value : null, max: subject.max,
            percent: status === 's' ? value / subject.max * 100 : null,
          }];
        }
        const counted = settings.basis === 'complete' ? result.complete : result.hasMarks;
        return [{
          section: stream.key, sectionLabel: stream.label, subjects, tests,
          overall: counted ? result.avail : null, total: counted ? { obtained, max } : null,
        }];
      });
      return {
        label: `${dataset.label} · ${dataset.assessment || 'Saved year'}`, students,
        sections: dataset.streams.map(stream => ({ key: stream.key, label: stream.label })),
        anonymous: true, totalNote: 'Overall marks come from the subjects counted in the selected year.',
      };
    }

    return {
      years,
      async snapshot(id) {
        return id === 'workspace' ? cache(id, workspaceData) : yearSnapshot(await loadYear(id));
      },
      async compare(first, second) {
        const [a, b] = await Promise.all([loadYear(first), loadYear(second)]);
        const core = window.AxiomYearCore;
        return core.meetingBrief(core.compareDatasets(a, b, window.AxiomYearCompare?._state.settings || core.DEFAULTS));
      },
    };
  }

  window.AxiomWorkspaceChatData = { create };
})();
