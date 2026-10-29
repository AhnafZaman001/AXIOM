/* Dependency-free SVG charts. Percent axes stay fixed at 0–100. */
(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.AxiomYearCharts=factory();
})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  var COLORS=['var(--accent)','var(--yc-cyan)','var(--yc-lilac)','var(--yc-blue)','var(--yc-mint)','var(--yc-rose)','var(--yc-gold)'];
  var BANDS=['#725c91','#8461a7','#926abd','#9b7bd2','#a592e7','#79b9df','#38c8bf'];
  var compact=false;
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function value(v){return v==null?'—':v.toFixed(1)+'%';}
  function short(v){v=String(v);var n=compact?12:20;return v.length>n?v.slice(0,n-2)+'…':v;}
  function color(i){return COLORS[i%COLORS.length];}
  function tip(s){return ' tabindex="0" data-yc-tip="'+esc(s)+'" aria-label="'+esc(s)+'"';}
  function label(x,y,text,anchor,extra){return '<text x="'+x+'" y="'+y+'" text-anchor="'+(anchor||'start')+'"'+(extra||'')+'>'+esc(text)+'</text>';}
  function svg(title,body,w,h){return '<svg class="yc-svg" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="'+esc(title)+'"><title>'+esc(title)+'</title>'+body+'</svg>';}
  function panel(title,content,actions,cls){return '<section class="yc-card yc-chart '+(cls||'')+'"><div class="yc-head"><h3>'+esc(title)+'</h3><span class="yc-sp"></span>'+(actions||'')+'</div>'+content+'</section>';}
  function legend(names){return '<div class="yc-legend">'+names.map(function(n,i){return '<span><i style="background:'+color(i)+'"></i>'+esc(n)+'</span>';}).join('')+'</div>';}
  function metric(a,key){return key==='median'?a.pooled.median:a.pooled[key].share;}

  function trend(analyses,key,settings){
    var names={median:'Median result',support:'Below '+settings.support+'%',excellence:settings.excellence+'% and above'};
    if(!analyses.some(function(a){return metric(a,key)!=null;}))return '';
    var w=compact?380:720,h=250,l=compact?40:48,r=28,t=25,b=44,pw=w-l-r,ph=h-t-b,body='';
    [0,25,50,75,100].forEach(function(v){var y=t+ph-v/100*ph;body+='<line x1="'+l+'" x2="'+(w-r)+'" y1="'+y+'" y2="'+y+'"/>'+label(l-9,y+4,v+'%','end');});
    var path='',segment=false;
    analyses.forEach(function(a,i){
      var x=l+(analyses.length===1?pw/2:i*pw/(analyses.length-1)),v=metric(a,key);
      if(i%Math.max(1,Math.ceil(analyses.length/8))===0||i===analyses.length-1)body+=label(x,h-17,short(a.label),'middle');
      if(v==null){segment=false;return;}
      var y=t+ph-v/100*ph;path+=(segment?' L':' M')+x+' '+y;segment=true;
    });
    body+='<path class="yc-trace" d="'+path+'" fill="none" stroke="var(--accent-2)" stroke-width="3" pathLength="1"/>';
    analyses.forEach(function(a,i){
      var v=metric(a,key);if(v==null)return;
      var x=l+(analyses.length===1?pw/2:i*pw/(analyses.length-1)),y=t+ph-v/100*ph;
      var text=a.label+' · '+names[key]+': '+value(v)+' · '+a.pooled.n+' eligible results';
      body+='<circle cx="'+x+'" cy="'+y+'" r="6" fill="var(--accent-2)" class="yc-point"'+tip(text)+'><title>'+esc(text)+'</title></circle>';
      if(analyses.length<=8)body+=label(x,y-13,value(v),'middle',' class="yc-value"');
    });
    var controls='<div class="yc-segments" aria-label="Trend metric">'+Object.keys(names).map(function(k){return '<button class="ghost small'+(key===k?' active':'')+'" data-chart-metric="'+k+'" aria-pressed="'+(key===k)+'">'+esc(k==='median'?'Median':k==='support'?'Support':'Excellence')+'</button>';}).join('')+'</div>';
    return panel('Yearly trend',svg(names[key]+' by year, percent of eligible results (0–100%)',body,w,h),controls,'yc-trend');
  }

  function distribution(analyses,labels){
    var rows=analyses.filter(function(a){return a.pooled.n>0;});if(!rows.length)return '';
    var w=compact?400:820,l=compact?80:125,r=18,h=rows.length*52+38,pw=w-l-r,body='';
    rows.forEach(function(a,i){
      var y=i*52+12,x=l;body+=label(8,y+18,short(a.label));
      a.pooled.bandShares.forEach(function(v,j){
        if(!v)return;
        var width=pw*v/100,txt=a.label+' · '+labels[j]+': '+a.pooled.bands[j]+'/'+a.pooled.n+' ('+value(v)+')';
        body+='<rect class="yc-bar" x="'+x+'" y="'+y+'" width="'+width+'" height="26" fill="'+BANDS[j]+'"'+tip(txt)+'><title>'+esc(txt)+'</title></rect>';
        if(v>=12)body+=label(x+width/2,y+18,Math.round(v)+'%','middle',' class="yc-band-value"');
        x+=width;
      });
    });
    body+=label(l,h-5,'0%')+label(w-r,h-5,'100%','end');
    var legendHtml='<div class="yc-legend">'+labels.map(function(s,i){return '<span><i style="background:'+BANDS[i]+'"></i>'+esc(s)+'</span>';}).join('')+'</div>';
    return panel('Score distribution',svg('Overall score bands by year; share of eligible results from 0 to 100%',body,w,h)+legendHtml,'','yc-distribution');
  }

  function bars(title,rows,years,actions,cls){
    if(!rows.some(function(r){return r.values.some(function(x){return x&&x.v!=null;});}))return '';
    var w=compact?400:680,l=compact?90:132,r=55,pw=w-l-r,rowH=years.length*20+22,h=rows.length*rowH+38,body='';
    [0,25,50,75,100].forEach(function(v){var x=l+pw*v/100;body+='<line x1="'+x+'" x2="'+x+'" y1="12" y2="'+(h-25)+'"/>'+label(x,h-7,v+'%','middle');});
    rows.forEach(function(row,i){
      var y=i*rowH+16;body+=label(l-12,y+14,short(row.label),'end');
      row.values.forEach(function(x,j){
        if(!x||x.v==null)return;
        var by=y+j*20,width=pw*x.v/100,txt=row.label+' · '+years[j]+': '+value(x.v)+' · n='+x.n;
        body+='<rect class="yc-bar" x="'+l+'" y="'+by+'" width="'+width+'" height="12" rx="4" fill="'+color(j)+'"'+tip(txt)+'><title>'+esc(txt)+'</title></rect>'+label(l+width+6,by+11,value(x.v),'start',' class="yc-value"');
      });
    });
    return panel(title,legend(years)+svg(title+'; median result by group, percent (0–100%)',body,w,h),actions,cls);
  }
  function streams(cmp){
    return bars('Stream comparison',cmp.streams.map(function(row){return {label:row.label,values:[row.a?{v:row.a.median,n:row.a.n}:null,row.b?{v:row.b.median,n:row.b.n}:null]};}),[cmp.A.label,cmp.B.label],'','yc-streams');
  }
  function subjects(cmp,stream){
    var groups=cmp.streams.filter(function(r){return cmp.subjects.some(function(s){return s.streamKey===r.key;});});
    if(!groups.length)return '';
    if(!groups.some(function(r){return r.key===stream;}))stream=groups[0].key;
    var control='<select data-chart-stream aria-label="Subject chart stream">'+groups.map(function(g){return '<option value="'+esc(g.key)+'"'+(g.key===stream?' selected':'')+'>'+esc(g.label)+'</option>';}).join('')+'</select>';
    var rows=cmp.subjects.filter(function(s){return s.streamKey===stream;}).map(function(s){return {label:s.subject,values:[{v:s.a.median,n:s.a.n},{v:s.b.median,n:s.b.n}]};});
    return bars('Subjects',rows,[cmp.A.label,cmp.B.label],control,'yc-subjects');
  }
  function status(a){
    var m=a.pooled;if(!m.listed)return '';
    var parts=[{name:'Pass confirmed',n:m.belowPass.confirmedPass,color:'var(--yc-cyan)'},{name:'Below subject pass',n:m.belowPass.recorded,color:'var(--yc-rose)'},{name:'Incomplete / unknown',n:m.belowPass.unknown,color:'var(--accent)'}];
    var r=64,circ=2*Math.PI*r,offset=0,body='';
    parts.forEach(function(p){
      if(!p.n)return;var len=p.n/m.listed*circ,txt=a.label+' · '+p.name+': '+p.n+'/'+m.listed+' ('+value(p.n/m.listed*100)+')';
      body+='<circle class="yc-ring" cx="130" cy="94" r="'+r+'" fill="none" stroke="'+p.color+'" stroke-width="22" stroke-dasharray="'+len+' '+(circ-len)+'" stroke-dashoffset="'+(-offset)+'" transform="rotate(-90 130 94)"'+tip(txt)+'><title>'+esc(txt)+'</title></circle>';offset+=len;
    });
    body+=label(130,92,m.listed,'middle',' class="yc-donut-number"')+label(130,113,'students','middle');
    var counts='<div class="yc-status-legend">'+parts.map(function(p){return '<div><span><i style="background:'+p.color+'"></i>'+esc(p.name)+'</span><b>'+p.n+'</b></div>';}).join('')+'</div>';
    return panel('Result status · '+a.label,svg('Student result status in '+a.label+'; counts of all '+m.listed+' listed students',body,260,185)+counts,'','yc-status');
  }
  return {trend:trend,distribution:distribution,streams:streams,subjects:subjects,status:status,setCompact:function(value){compact=!!value;}};
});
