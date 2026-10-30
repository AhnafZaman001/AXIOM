/* Year Comparison meeting reports. Pure data functions and escaped HTML; no storage. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./year-compare-core.js'));
  else root.AxiomYearReports=factory(root.AxiomYearCore);
})(typeof self!=='undefined'?self:this,function(Core){
  'use strict';
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function pct(v){return v==null?'—':v.toFixed(1)+'%';}
  function rate(n,d){return d?100*n/d:null;}
  function cell(r,i,max){var c=(r.c||[])[i];return c&&c[0]==='s'&&typeof c[1]==='number'&&isFinite(c[1])&&c[1]>=0&&c[1]<=max?c:null;}
  function table(headers,rows){return '<div class="yc-wrap"><table class="yc-report-table"><thead><tr>'+headers.map(function(h){return '<th scope="col">'+esc(h)+'</th>';}).join('')+'</tr></thead><tbody>'+rows.map(function(r){return '<tr>'+r.map(function(c,i){return '<'+(i?'td':'th scope="row"')+'>'+esc(c)+'</'+(i?'td':'th')+'>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>';}
  function panel(title,content){return '<section class="yc-card yc-report-section"><h3>'+esc(title)+'</h3>'+content+'</section>';}
  function subjectStats(ds,settings){
    var pass=Core.settingsFrom(settings).pass;
    return (ds.streams||[]).map(function(stream){
      var records=(ds.records||[]).filter(function(r){return r.st===stream.key;});
      return {key:stream.key,label:stream.label,subjects:stream.subjects.map(function(sub,i){
        var scores=[],absent=0,unknown=0,exempt=0,failed=0,bands=[0,0,0,0,0];
        records.forEach(function(r){var c=cell(r,i,sub.max),raw=(r.c||[])[i];
          if(c){var p=c[1]*100/sub.max;scores.push(p);if(p<pass)failed++;bands[p<40?0:p<60?1:p<80?2:p<90?3:4]++;}
          else if(raw&&raw[0]==='a')absent++;else if(raw&&raw[0]==='n')exempt++;else unknown++;
        });
        return {key:sub.key,name:sub.name,max:sub.max,listed:records.length,n:scores.length,passed:scores.length-failed,failed:failed,
          passRate:rate(scores.length-failed,scores.length),failRate:rate(failed,scores.length),absent:absent,unknown:unknown,exempt:exempt,
          mean:scores.length?scores.reduce(function(a,b){return a+b;},0)/scores.length:null,median:Core.quantile(scores,.5),
          highest:scores.length?Math.max.apply(null,scores):null,bands:bands};
      })};
    });
  }
  function topTen(ds,streamKey,subjectKey){
    var stream=(ds.streams||[]).filter(function(s){return s.key===streamKey;})[0];if(!stream)return [];
    var index=stream.subjects.findIndex(function(s){return s.key===subjectKey;});if(index<0)return [];
    var sub=stream.subjects[index];
    var rows=(ds.records||[]).filter(function(r){return r.st===streamKey&&cell(r,index,sub.max);}).map(function(r){return {id:r.i,name:r.name||'',roll:r.roll||'',sheet:r.sheet||'',marks:r.c[index][1],max:sub.max,percent:r.c[index][1]*100/sub.max};});
    rows.sort(function(a,b){return b.marks-a.marks||a.name.localeCompare(b.name)||a.roll.localeCompare(b.roll)||String(a.id).localeCompare(String(b.id));});
    var rank=0,last=null;
    rows.forEach(function(r,i){if(r.marks!==last)rank=i+1;r.rank=rank;last=r.marks;});
    return rows.filter(function(r){return r.rank<=10;});
  }
  function supplies(ds,settings,streamKey){
    var pass=Core.settingsFrom(settings).pass,counts={listed:0,passed:0,unknown:0,failed:0,one:0,two:0,three:0,unresolvedFailures:0};
    (ds.streams||[]).filter(function(s){return !streamKey||s.key===streamKey;}).forEach(function(s){
      (ds.records||[]).filter(function(r){return r.st===s.key;}).forEach(function(r){
        counts.listed++;var failures=0,unresolved=0,scored=0;
        s.subjects.forEach(function(sub,i){var c=cell(r,i,sub.max),raw=(r.c||[])[i];if(c){scored++;if(c[1]*100/sub.max<pass)failures++;}else if(!raw||raw[0]!=='n')unresolved++;});
        if(failures){counts.failed++;counts[failures===1?'one':failures===2?'two':'three']++;if(unresolved)counts.unresolvedFailures++;}
        else if(scored&&!unresolved)counts.passed++;else counts.unknown++;
      });
    });return counts;
  }
  function hydrateIdentities(ds,parsed){
    var mapping=ds.import_report&&ds.import_report.sheets;
    if(!mapping||!mapping.length)throw new Error('The saved year has no sheet mapping. Ask an administrator to reload its workbook first.');
    var included=mapping.map(function(m){var p=parsed.sheets.filter(function(s){return s.sheet===m.sheet;})[0];if(!p)throw new Error('A saved sheet could not be read. Reload the workbook before using named reports.');return {parsed:p,streamLabel:m.stream};});
    var named=Core.buildDataset({label:ds.label,assessment:ds.assessment,grade:ds.grade_level,includeIdentity:true},included);
    function fingerprint(d){return JSON.stringify({streams:d.streams.map(function(s){return {key:s.key,subjects:s.subjects.map(function(x){return [x.key,x.max];})};}),records:d.records.map(function(r){return [r.i,r.st,r.c];})});}
    if(fingerprint(named)!==fingerprint(ds))throw new Error('Workbook marks do not match this saved year. Ask an administrator to reload the workbook before using named reports.');
    return Object.assign({},ds,{records:named.records});
  }
  function comparisonAllowed(previous,current,settings){
    if(!previous)return false;
    return !Core.compareDatasets(previous,current,settings).findings.some(function(f){return f.id==='comparability';});
  }
  function delta(a,b,allowed){return !allowed||a==null||b==null?'—':(b>a?'+':'')+(b-a).toFixed(1)+' pp';}
  function strip(parts,total){
    return '<div class="yc-report-stack" role="img" aria-label="'+esc(parts.map(function(p){return p[0]+': '+p[1]+' of '+total;}).join(', '))+'">'+parts.map(function(p,i){return p[1]&&total?'<span style="width:'+(p[1]*100/total)+'%;--report-color:var(--yc-r'+i+')" tabindex="0" data-yc-tip="'+esc(p[0]+': '+p[1]+' of '+total)+'" title="'+esc(p[0]+': '+p[1]+' of '+total)+'"></span>':'';}).join('')+'</div>';
  }
  function legend(labels,cls){return '<div class="yc-report-key '+(cls||'')+'">'+labels.map(function(label,i){return '<span><i style="background:var(--yc-r'+i+')"></i>'+esc(label)+'</span>';}).join('')+'</div>';}
  function subjectsHtml(current,previous,settings,streamKey){
    var now=subjectStats(current,settings),before=previous?subjectStats(previous,settings):[],allowed=comparisonAllowed(previous,current,settings);
    var html='<p class="yc-report-caption">Pass ≥ '+Core.settingsFrom(settings).pass+'%. Pass/fail percentages use scored results; absence and missing marks stay separate.</p>';
    if(previous){var reviews=Core.compareDatasets(previous,current,settings).checks.filter(function(c){return c.status==='review';});if(reviews.length)html+='<p class="yc-report-caption">Review: '+esc(reviews.map(function(c){return c.label;}).join(' · '))+'.</p>';}
    if(previous&&!allowed)html+='<p class="yc-report-caption">These assessments are not directly comparable. Both years are shown; change figures are withheld.</p>';
    now.filter(function(s){return !streamKey||s.key===streamKey;}).forEach(function(s){
      html+=panel(s.label+' · '+current.label,table(['Subject','Scored','Average','Highest','Pass','Pass %','Fail','Fail %','Absent','Missing / invalid','Exempt'],s.subjects.map(function(x){return [x.name,x.n,pct(x.mean),pct(x.highest),x.passed,pct(x.passRate),x.failed,pct(x.failRate),x.absent,x.unknown,x.exempt];})));
      var old=before.filter(function(b){return b.key===s.key;})[0];
      if(previous){
        var keys=s.subjects.map(function(x){return x.key;});if(old)old.subjects.forEach(function(x){if(keys.indexOf(x.key)<0)keys.push(x.key);});
        html+=panel(s.label+' · '+previous.label+' → '+current.label,table(['Subject','Previous scored','Current scored','Average (prev → now)','Highest (prev → now)','Pass % (prev → now)','Fail % (prev → now)','Pass change'],keys.map(function(k){var a=old&&old.subjects.filter(function(x){return x.key===k;})[0],b=s.subjects.filter(function(x){return x.key===k;})[0];return [(b||a).name,a?a.n:'—',b?b.n:'—',pct(a&&a.mean)+' → '+pct(b&&b.mean),pct(a&&a.highest)+' → '+pct(b&&b.highest),pct(a&&a.passRate)+' → '+pct(b&&b.passRate),pct(a&&a.failRate)+' → '+pct(b&&b.failRate),delta(a&&a.passRate,b&&b.passRate,allowed&&a&&b&&a.max===b.max)];})));
      }
      html+=panel(s.label+' · Subject vista',legend(['Pass','Fail','Absent','Missing / invalid','Exempt'])+'<div class="yc-vista-grid">'+s.subjects.map(function(x){return '<article class="yc-vista"><h4>'+esc(x.name)+'</h4><strong>'+pct(x.passRate)+' <small>pass</small></strong>'+strip([['Pass',x.passed],['Fail',x.failed],['Absent',x.absent],['Missing / invalid',x.unknown],['Exempt',x.exempt]],x.listed)+'<p>'+x.passed+' pass · '+x.failed+' fail · '+(x.absent+x.unknown)+' unresolved · '+x.listed+' listed</p><div class="yc-report-bands">'+strip(x.bands.map(function(n,i){return [['Below 40%','40–59%','60–79%','80–89%','90%+'][i],n];}),x.n)+'</div><p>Score bands · '+x.n+' scored</p></article>';}).join('')+'</div>'+legend(['Below 40%','40–59%','60–79%','80–89%','90%+'],'yc-report-bands'));
    });
    // A stream missing from the current cohort must remain visible in comparison.
    before.filter(function(s){return !now.some(function(n){return n.key===s.key;})&&(!streamKey||s.key===streamKey);}).forEach(function(s){html+=panel(s.label+' · previous year only',table(['Subject','Scored','Pass %','Fail %'],s.subjects.map(function(x){return [x.name,x.n,pct(x.passRate),pct(x.failRate)];})));});
    return html;
  }
  function topsHtml(ds,streamKey,subjectKey){
    var html='<p class="yc-report-caption">Ranked by subject marks within each stream. Competition ranks include everyone tied at rank 10. Unscored results are excluded.</p>';
    (ds.streams||[]).filter(function(s){return !streamKey||s.key===streamKey;}).forEach(function(s){s.subjects.filter(function(x){return !subjectKey||x.key===subjectKey;}).forEach(function(sub){var rows=topTen(ds,s.key,sub.key);html+=panel(s.label+' · '+sub.name+' · '+ds.label,rows.length?table(['Rank','Student','Roll','Source sheet','Marks','Percentage'],rows.map(function(r){return [r.rank,r.name||'Name unavailable',r.roll||'—',r.sheet||'—',r.marks+' / '+r.max,pct(r.percent)];})):'<p>No scored results.</p>');});});return html;
  }
  function suppliesHtml(current,previous,settings,streamKey){
    var years=previous?[previous,current]:[current],totals=years.map(function(d){return supplies(d,settings,streamKey);}),allowed=comparisonAllowed(previous,current,settings);
    var categories=[['passed','All subjects passed'],['failed','At least one recorded failure'],['unknown','No recorded failure; result incomplete'],['one','One recorded failed subject'],['two','Two recorded failed subjects'],['three','Three or more recorded failed subjects']];
    var html=(previous&&!allowed?'<p class="yc-report-caption">Assessments are not directly comparable; change figures are withheld.</p>':'')+panel('Supplies · students',table(['Outcome'].concat(years.map(function(d){return d.label+' · count / listed (%)';})).concat(previous?['Change']:[]),categories.map(function(c){var row=[c[1]].concat(totals.map(function(t){return t[c[0]]+' / '+t.listed+' ('+pct(rate(t[c[0]],t.listed))+')';}));if(previous)row.push(delta(rate(totals[0][c[0]],totals[0].listed),rate(totals[1][c[0]],totals[1].listed),allowed));return row;})));
    html+='<p class="yc-report-caption">Each student counts once in the total with a failure. The one/two/three-plus groups count recorded failed subjects; '+totals[totals.length-1].unresolvedFailures+' failing students also have unresolved marks in '+esc(current.label)+'.</p>';
    html+=legend(['Confirmed pass','Recorded failure','Unknown'])+'<div class="yc-vista-grid">'+years.map(function(d,i){var t=totals[i];return panel(d.label,strip([['Confirmed pass',t.passed],['Recorded failure',t.failed],['Unknown',t.unknown]],t.listed)+'<p>'+t.failed+' / '+t.listed+' students with a recorded failure</p>');}).join('')+'</div>';
    var a=previous?subjectStats(previous,settings):[],b=subjectStats(current,settings),groups=b.slice();a.forEach(function(s){if(!groups.some(function(g){return g.key===s.key;}))groups.push(s);});
    groups.filter(function(s){return !streamKey||s.key===streamKey;}).forEach(function(s){var old=a.find(function(x){return x.key===s.key;}),now=b.find(function(x){return x.key===s.key;}),keys=(now?now.subjects:[]).map(function(x){return x.key;});if(old)old.subjects.forEach(function(x){if(keys.indexOf(x.key)<0)keys.push(x.key);});
      html+=panel(s.label+' · subject supplies',table(['Subject'].concat(years.map(function(d){return d.label+' · failed / scored (%)';})),keys.map(function(k){var currentSub=now&&now.subjects.find(function(x){return x.key===k;}),oldSub=old&&old.subjects.find(function(x){return x.key===k;});return [(currentSub||oldSub).name].concat((previous?[oldSub,currentSub]:[currentSub]).map(function(x){return x?x.failed+' / '+x.n+' ('+pct(x.failRate)+')':'—';}));})));});return html;
  }
  function notesHtml(current,notes,editable){
    notes=notes||{};return panel('Teacher observations · '+current.label,'<p class="yc-report-caption">Written by the teacher. '+(editable?'Drafts stay in this browser tab; print the meeting report to keep them.':'')+'</p>'+[['faculty','Faculty-related issues · previous and current year'],['reasons','Subject-wise reasons for improvement or decline']].map(function(x){return editable?'<label class="yc-report-note">'+x[1]+'<textarea data-report-note="'+x[0]+'" rows="5" placeholder="Subject / stream, year, observation and supporting evidence">'+esc(notes[x[0]]||'')+'</textarea></label>':'<div class="yc-teacher-entry"><h4>'+x[1]+'</h4><div class="yc-note-print'+(notes[x[0]]?'':' yc-note-blank')+'">'+esc(notes[x[0]]||'To be completed by the teacher.').replace(/\n/g,'<br>')+'</div></div>';}).join(''));
  }

  /* ===== Overall marks: complete list, Top 10 and year comparison ===== */
  function rowsForOverall(ds,streamKey,settings){
    var pass=Core.settingsFrom(settings).pass,out=[];
    (ds.streams||[]).filter(function(s){return !streamKey||s.key===streamKey;}).forEach(function(s){
      (ds.records||[]).filter(function(r){return r.st===s.key;}).forEach(function(r){
        var total=0,max=0,scored=0,applicable=0,failed=0;
        s.subjects.forEach(function(sub,i){
          var raw=(r.c||[])[i];if(raw&&raw[0]==='n')return;applicable++;
          var c=cell(r,i,sub.max);if(c){scored++;total+=c[1];max+=sub.max;if(c[1]*100/sub.max<pass)failed++;}
        });
        out.push({id:r.i,stream:s.key,streamLabel:s.label,name:r.name||'',roll:r.roll||'',sheet:r.sheet||'',total:total,max:max,
          percent:max?total*100/max:null,scored:scored,applicable:applicable,failed:failed,complete:scored>0&&scored===applicable,appeared:scored>0});
      });
    });
    return out;
  }
  // Complete results are ranked (competition ranking: ties share a rank); incomplete results are listed after them, unranked.
  function overallRanking(ds,streamKey,settings){
    var all=rowsForOverall(ds,streamKey,settings),groups=[];
    (ds.streams||[]).filter(function(s){return !streamKey||s.key===streamKey;}).forEach(function(s){
      var mine=all.filter(function(r){return r.stream===s.key;});
      var ranked=mine.filter(function(r){return r.complete;}).sort(function(a,b){return b.percent-a.percent||b.total-a.total||a.name.localeCompare(b.name)||a.roll.localeCompare(b.roll)||String(a.id).localeCompare(String(b.id));});
      var rank=0,lastP=null,lastT=null;
      ranked.forEach(function(r,i){if(r.percent!==lastP||r.total!==lastT)rank=i+1;r.rank=rank;lastP=r.percent;lastT=r.total;});
      var rest=mine.filter(function(r){return !r.complete;}).sort(function(a,b){return a.name.localeCompare(b.name)||a.roll.localeCompare(b.roll)||String(a.id).localeCompare(String(b.id));});
      rest.forEach(function(r){r.rank=null;});
      groups.push({key:s.key,label:s.label,max:s.subjects.reduce(function(a,x){return a+x.max;},0),ranked:ranked,top:ranked.filter(function(r){return r.rank<=10;}),incomplete:rest,listed:mine.length});
    });
    return groups;
  }
  function overallSummary(group){
    var top=group.top,ranked=group.ranked;
    return {listed:group.listed,ranked:ranked.length,incomplete:group.incomplete.length,
      highestMarks:ranked.length?ranked[0].total:null,highestMax:ranked.length?ranked[0].max:null,highest:ranked.length?ranked[0].percent:null,
      topAverage:top.length?top.reduce(function(a,r){return a+r.percent;},0)/top.length:null,
      tenth:ranked.length>=10?ranked[9].percent:null,
      average:ranked.length?ranked.reduce(function(a,r){return a+r.percent;},0)/ranked.length:null};
  }
  function overallHtml(ds,previous,settings,streamKey,mode){
    var now=overallRanking(ds,streamKey,settings),before=previous?overallRanking(previous,streamKey,settings):[],allowed=comparisonAllowed(previous,ds,settings);
    var html='<p class="yc-report-caption">Overall marks are the sum of every applicable subject; ranking uses percentage within each stream. Exempt subjects reduce the applicable maximum. Only complete results (every subject scored) are ranked; students with a missing or absent subject are listed afterwards without a rank. Ties share a rank'+(mode==='top'?', so a list can run past ten rows':'')+'.</p>';
    if(previous&&!allowed)html+='<p class="yc-report-caption">These assessments are not directly comparable. Both years are shown; change figures are withheld.</p>';
    now.forEach(function(g){
      var sum=overallSummary(g),old=before.filter(function(b){return b.key===g.key;})[0],os=old?overallSummary(old):null;
      if(previous){
        var rows=[['Students with complete results',os?os.ranked:'—',sum.ranked,'—'],
          ['Highest result',os?pct(os.highest):'—',pct(sum.highest),os?delta(os.highest,sum.highest,allowed):'—'],
          ['Average of the top 10',os?pct(os.topAverage):'—',pct(sum.topAverage),os?delta(os.topAverage,sum.topAverage,allowed):'—'],
          ['10th place',os?pct(os.tenth):'—',pct(sum.tenth),os?delta(os.tenth,sum.tenth,allowed):'—'],
          ['Average of everyone ranked',os?pct(os.average):'—',pct(sum.average),os?delta(os.average,sum.average,allowed):'—']];
        html+=panel(g.label+' · overall marks, '+previous.label+' → '+ds.label,table(['Measure',previous.label,ds.label,'Change'],rows));
      }
      var head=['Rank','Student','Roll','Source sheet','Marks (out of '+g.max+')','Percentage'];
      var list=mode==='top'?g.top:g.ranked;
      var body=list.map(function(r){return [r.rank,r.name||'Name unavailable',r.roll||'—',r.sheet||'—',r.total+' / '+r.max,pct(r.percent)];});
      var extra=mode==='top'?[]:g.incomplete.map(function(r){return ['—',r.name||'Name unavailable',r.roll||'—',r.sheet||'—',r.appeared?r.total+' / '+r.max+' so far':'No marks','Incomplete: '+r.scored+' of '+r.applicable+' subjects'];});
      html+=panel(g.label+' · overall marks · '+(mode==='top'?'Top 10':'complete list')+' · '+ds.label,(body.length||extra.length)?table(head,body.concat(extra)):'<p>No complete results.</p>');
    });
    return html;
  }

  /* ===== School-format result tables: %-age wise, marks wise, grade wise ===== */
  function gradeFor(percent,failed,pass){
    if(failed>0||percent==null||percent<pass)return 'F';
    return percent>=80?'A+':percent>=70?'A':percent>=60?'B':percent>=50?'C':percent>=40?'D':'E';
  }
  var PCT_BANDS=[['90% -> 100%',90],['80% -> 89%',80],['70% -> 79%',70],['60% -> 69%',60],['50% -> 59%',50],['40% -> 49%',40],['30% -> 39%',30],['20% -> 29%',20],['Less than 20%',-1]];
  function bandIndex(percent){for(var i=0;i<PCT_BANDS.length-1;i++)if(percent>=PCT_BANDS[i][1])return i;return PCT_BANDS.length-1;}
  function resultTables(ds,settings,streamKey){
    var st=Core.settingsFrom(settings),streams=(ds.streams||[]).filter(function(s){return !streamKey||s.key===streamKey;}),all=rowsForOverall(ds,streamKey,st);
    var counted=function(r){return st.basis==='complete'?r.complete:r.appeared;};
    var cols=streams.map(function(s){return s.label;});
    var per=streams.map(function(s){return all.filter(function(r){return r.stream===s.key;});});
    function build(labels,pick){
      var counts=labels.map(function(){return per.map(function(){return 0;});});
      per.forEach(function(rows,c){rows.filter(counted).forEach(function(r){counts[pick(r)][c]++;});});
      return counts;
    }
    function withTotals(labels,counts){
      return labels.map(function(l,i){var total=counts[i].reduce(function(a,b){return a+b;},0);return [l].concat(counts[i].map(function(n){return n?n:'-';})).concat([total]);});
    }
    var appeared=per.map(function(rows){return rows.filter(function(r){return r.appeared;}).length;});
    var bandedN=per.map(function(rows){return rows.filter(counted).length;});
    function footer(){
      var out=[];
      var diff=appeared.map(function(n,i){return n-bandedN[i];}),anyDiff=diff.some(function(n){return n>0;});
      if(anyDiff){out.push(['Counted in this table'].concat(bandedN.map(function(n){return n||'-';})).concat([bandedN.reduce(function(a,b){return a+b;},0)]));
        out.push(['Incomplete results, not counted'].concat(diff.map(function(n){return n||'-';})).concat([diff.reduce(function(a,b){return a+b;},0)]));}
      out.push(['Total Appeared in Exams'].concat(appeared).concat([appeared.reduce(function(a,b){return a+b;},0)]));
      return out;
    }
    var pctLabels=PCT_BANDS.map(function(b){return b[0];});
    var pctRows=withTotals(pctLabels,build(pctLabels,function(r){return bandIndex(r.percent);}));
    var mb=st.marksBands,marksLabels=mb.map(function(b){return b+'+';}).concat([mb[mb.length-1]+' BELOW']);
    var marksRows=withTotals(marksLabels,build(marksLabels,function(r){for(var i=0;i<mb.length;i++)if(r.total>=mb[i])return i;return mb.length;}));
    var gradeLabels=['A+','A','B','C','D','E','F'];
    var gradeRows=withTotals(gradeLabels,build(gradeLabels,function(r){return gradeLabels.indexOf(gradeFor(r.percent,r.failed,st.pass));}));
    var head=[''].concat(cols).concat(['Total']);
    var assessment=String(ds.assessment||'RESULT').toUpperCase();
    var note=st.basis==='complete'?'Students are counted when every subject has a score.':'Students are counted on the subjects they have a score for; totals for students with a missing subject are lower.';
    return {label:ds.label,basis:st.basis,tables:[
      {id:'percent',sheet:'%age wise',title:'%AGE WISE RESULT '+ds.label,subtitle:'',head:head,rows:pctRows.concat(footer()),notes:[note]},
      {id:'marks',sheet:'Marks wise',title:'MARKS WISE RESULT '+ds.label,subtitle:'',head:head,rows:marksRows.concat(footer()),notes:[note,'Marks bands: '+mb.join(', ')+' (total marks obtained).']},
      {id:'grades',sheet:'Grade wise',title:assessment+' '+ds.label,subtitle:'GRADE WISE RESULT',head:['Grades'].concat(cols).concat(['Total']),rows:gradeRows.concat(footer()),
        notes:[note,'Calculated grade bands: A+ 80% and above · A 70–79% · B 60–69% · C 50–59% · D 40–49% · E below 40%, provided the pass threshold is met. F = any recorded subject below '+st.pass+'% (or overall below '+st.pass+'%).',st.basis==='marked'?'Available-subject grades are provisional; incomplete results cannot confirm a pass.':'Check these calculated grade bands against your school’s grading rules.']}
    ]};
  }
  function resultTablesHtml(ds,settings,streamKey){
    var t=resultTables(ds,settings,streamKey);
    return t.tables.map(function(x){
      var last=x.rows.length-1,foot=x.rows.filter(function(r){return /^(Total Appeared|Counted in|Incomplete results)/.test(r[0]);}).length;
      return '<section class="yc-card yc-report-section yc-school-table"><h3>'+esc(x.title)+(x.subtitle?' · '+esc(x.subtitle):'')+'</h3><div class="yc-wrap"><table class="yc-report-table yc-school"><thead><tr>'+x.head.map(function(h){return '<th scope="col">'+esc(h)+'</th>';}).join('')+'</tr></thead><tbody>'+
        x.rows.map(function(r,ri){var isFoot=ri>=x.rows.length-foot;return '<tr'+(isFoot?' class="yc-school-foot"':'')+'>'+r.map(function(c,i){return '<'+(i?'td':'th scope="row"')+(i===r.length-1&&i?' class="yc-school-total"':'')+'>'+esc(c)+'</'+(i?'td':'th')+'>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>'+x.notes.map(function(n){return '<p class="yc-report-caption">'+esc(n)+'</p>';}).join('')+'</section>';
    }).join('');
  }

  return {overallRows:rowsForOverall,overallRanking:overallRanking,overallSummary:overallSummary,overallHtml:overallHtml,gradeFor:gradeFor,resultTables:resultTables,resultTablesHtml:resultTablesHtml,subjectStats:subjectStats,topTen:topTen,supplies:supplies,hydrateIdentities:hydrateIdentities,subjectsHtml:subjectsHtml,topsHtml:topsHtml,suppliesHtml:suppliesHtml,notesHtml:notesHtml,esc:esc};
});
