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
      html+=panel(s.label+' · '+current.label,table(['Subject','Scored','Average','Median','Highest','Pass','Pass %','Fail','Fail %','Absent','Missing / invalid','Exempt'],s.subjects.map(function(x){return [x.name,x.n,pct(x.mean),pct(x.median),pct(x.highest),x.passed,pct(x.passRate),x.failed,pct(x.failRate),x.absent,x.unknown,x.exempt];})));
      var old=before.filter(function(b){return b.key===s.key;})[0];
      if(previous){
        var keys=s.subjects.map(function(x){return x.key;});if(old)old.subjects.forEach(function(x){if(keys.indexOf(x.key)<0)keys.push(x.key);});
        html+=panel(s.label+' · '+previous.label+' → '+current.label,table(['Subject','Previous scored','Current scored','Average (prev → now)','Median (prev → now)','Pass % (prev → now)','Fail % (prev → now)','Pass change'],keys.map(function(k){var a=old&&old.subjects.filter(function(x){return x.key===k;})[0],b=s.subjects.filter(function(x){return x.key===k;})[0];return [(b||a).name,a?a.n:'—',b?b.n:'—',pct(a&&a.mean)+' → '+pct(b&&b.mean),pct(a&&a.median)+' → '+pct(b&&b.median),pct(a&&a.passRate)+' → '+pct(b&&b.passRate),pct(a&&a.failRate)+' → '+pct(b&&b.failRate),delta(a&&a.passRate,b&&b.passRate,allowed&&a&&b&&a.max===b.max)];})));
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
  return {subjectStats:subjectStats,topTen:topTen,supplies:supplies,hydrateIdentities:hydrateIdentities,subjectsHtml:subjectsHtml,topsHtml:topsHtml,suppliesHtml:suppliesHtml,notesHtml:notesHtml,esc:esc};
});
