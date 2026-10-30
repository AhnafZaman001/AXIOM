/* Year Comparison Excel export. No dependencies: writes a real .xlsx (a zip of XML parts, stored
   uncompressed) with borders, bold headers, grey fills and merged titles, so the school-format
   result tables open in Excel looking like the printed ones. Pure functions; download() is the only DOM use. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.AxiomYearExport=factory();
})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  var XLSX_MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  /* ---- cell styles (indices into cellXfs below) ---- */
  var S={DEFAULT:0,TITLE:1,HEAD:2,LABEL:3,NUM:4,TOTAL:5,FOOT_LABEL:6,FOOT_NUM:7,NOTE:8};

  function esc(v){return String(v==null?'':v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function colName(i){var s='';for(i=i+1;i>0;i=Math.floor((i-1)/26))s=String.fromCharCode(65+((i-1)%26))+s;return s;}
  function safeSheetName(name,used){
    var n=String(name||'Sheet').replace(/[\[\]:*?\/\\]/g,' ').replace(/\s+/g,' ').trim().slice(0,31)||'Sheet',base=n,k=2;
    while(used.indexOf(n.toLowerCase())>=0){var suffix=' ('+k+')';n=base.slice(0,31-suffix.length)+suffix;k++;}
    used.push(n.toLowerCase());return n;
  }

  function stylesXml(){
    var border='<border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border>';
    function xf(font,fill,bord,h,wrap){return '<xf numFmtId="0" fontId="'+font+'" fillId="'+fill+'" borderId="'+bord+'" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="'+h+'" vertical="center"'+(wrap?' wrapText="1"':'')+'/></xf>';}
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
      '<fonts count="4"><font><sz val="11"/><name val="Times New Roman"/></font><font><b/><sz val="11"/><name val="Times New Roman"/></font><font><b/><sz val="14"/><name val="Times New Roman"/></font><font><i/><sz val="10"/><name val="Times New Roman"/></font></fonts>'+
      '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/><bgColor indexed="64"/></patternFill></fill></fills>'+
      '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'+border+'</borders>'+
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'+
      '<cellXfs count="9">'+
        xf(0,0,0,'left',false)+      // 0 default
        xf(2,2,1,'center',false)+    // 1 title
        xf(1,3,1,'center',false)+    // 2 column heads
        xf(1,0,1,'center',false)+    // 3 row labels
        xf(0,0,1,'center',false)+    // 4 numbers
        xf(1,0,1,'center',false)+    // 5 total column
        xf(1,3,1,'center',false)+    // 6 footer label
        xf(1,3,1,'center',false)+    // 7 footer numbers
        xf(3,0,0,'left',true)+       // 8 notes
      '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  }

  // sheet: {name, widths:[...], rows:[[{v,s}|v,...]], merges:[[r1,c1,r2,c2]] (0-based), heights:{rowIndex:points}}
  function sheetXml(sheet){
    var rows=sheet.rows||[],out='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="18"/>';
    if(sheet.widths&&sheet.widths.length)out+='<cols>'+sheet.widths.map(function(w,i){return '<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>';}).join('')+'</cols>';
    out+='<sheetData>';
    rows.forEach(function(row,ri){
      var h=sheet.heights&&sheet.heights[ri];
      out+='<row r="'+(ri+1)+'"'+(h?' ht="'+h+'" customHeight="1"':'')+'>';
      row.forEach(function(cell,ci){
        if(cell==null)return;
        var v=cell&&typeof cell==='object'&&'v' in cell?cell.v:cell,style=cell&&typeof cell==='object'&&cell.s!=null?cell.s:0,ref=colName(ci)+(ri+1);
        if(typeof v==='number'&&isFinite(v))out+='<c r="'+ref+'" s="'+style+'"><v>'+v+'</v></c>';
        else if(v===''||v==null)out+='<c r="'+ref+'" s="'+style+'"/>';
        else out+='<c r="'+ref+'" s="'+style+'" t="inlineStr"><is><t xml:space="preserve">'+esc(v)+'</t></is></c>';
      });
      out+='</row>';
    });
    out+='</sheetData>';
    if(sheet.merges&&sheet.merges.length)out+='<mergeCells count="'+sheet.merges.length+'">'+sheet.merges.map(function(m){return '<mergeCell ref="'+colName(m[1])+(m[0]+1)+':'+colName(m[3])+(m[2]+1)+'"/>';}).join('')+'</mergeCells>';
    out+='<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/><pageSetup orientation="portrait" fitToWidth="1" fitToHeight="0"/></worksheet>';
    return out;
  }

  /* ---- minimal zip (stored, no compression) ---- */
  var CRC=null;
  function crc32(bytes){
    if(!CRC){CRC=[];for(var n=0;n<256;n++){var c=n;for(var k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;CRC[n]=c>>>0;}}
    var crc=0xFFFFFFFF;for(var i=0;i<bytes.length;i++)crc=CRC[(crc^bytes[i])&0xFF]^(crc>>>8);
    return (crc^0xFFFFFFFF)>>>0;
  }
  function utf8(s){
    if(typeof TextEncoder!=='undefined')return new TextEncoder().encode(s);
    return Uint8Array.from(Buffer.from(s,'utf8'));
  }
  function zip(files){
    var chunks=[],central=[],offset=0,dosTime=(12<<11)|(0<<5)|0,dosDate=((2026-1980)<<9)|(1<<5)|1;
    files.forEach(function(f){
      var name=utf8(f.name),data=f.data,crc=crc32(data);
      var local=new Uint8Array(30+name.length),dv=new DataView(local.buffer);
      dv.setUint32(0,0x04034b50,true);dv.setUint16(4,20,true);dv.setUint16(6,0x0800,true);dv.setUint16(8,0,true);dv.setUint16(10,dosTime,true);dv.setUint16(12,dosDate,true);
      dv.setUint32(14,crc,true);dv.setUint32(18,data.length,true);dv.setUint32(22,data.length,true);dv.setUint16(26,name.length,true);dv.setUint16(28,0,true);
      local.set(name,30);chunks.push(local,data);
      var cd=new Uint8Array(46+name.length),cv=new DataView(cd.buffer);
      cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x0800,true);cv.setUint16(10,0,true);cv.setUint16(12,dosTime,true);cv.setUint16(14,dosDate,true);
      cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);
      cd.set(name,46);central.push(cd);offset+=local.length+data.length;
    });
    var cdSize=central.reduce(function(a,c){return a+c.length;},0),end=new Uint8Array(22),ev=new DataView(end.buffer);
    ev.setUint32(0,0x06054b50,true);ev.setUint16(8,files.length,true);ev.setUint16(10,files.length,true);ev.setUint32(12,cdSize,true);ev.setUint32(16,offset,true);
    var all=chunks.concat(central,[end]),total=all.reduce(function(a,c){return a+c.length;},0),out=new Uint8Array(total),pos=0;
    all.forEach(function(c){out.set(c,pos);pos+=c.length;});
    return out;
  }

  function build(sheets){
    var used=[],named=sheets.map(function(s){return Object.assign({},s,{name:safeSheetName(s.name,used)});});
    var files=[
      {name:'[Content_Types].xml',data:utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+named.map(function(s,i){return '<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';}).join('')+'</Types>')},
      {name:'_rels/.rels',data:utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')},
      {name:'xl/workbook.xml',data:utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>'+named.map(function(s,i){return '<sheet name="'+esc(s.name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>';}).join('')+'</sheets></workbook>')},
      {name:'xl/_rels/workbook.xml.rels',data:utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+named.map(function(s,i){return '<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>';}).join('')+'<Relationship Id="rId'+(named.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')},
      {name:'xl/styles.xml',data:utf8(stylesXml())}
    ];
    named.forEach(function(s,i){files.push({name:'xl/worksheets/sheet'+(i+1)+'.xml',data:utf8(sheetXml(s))});});
    return zip(files);
  }

  /* Turn Reports.resultTables(...) into one worksheet per table, laid out like the school's printed tables. */
  function fromTables(result){
    return result.tables.map(function(t){
      var cols=t.head.length,rows=[],merges=[],heights={};
      function titleRow(text){var r=[{v:text,s:S.TITLE}];for(var i=1;i<cols;i++)r.push({v:'',s:S.TITLE});merges.push([rows.length,0,rows.length,cols-1]);heights[rows.length]=24;rows.push(r);}
      titleRow(t.title);
      if(t.subtitle&&t.subtitle!==result.label)titleRow(t.subtitle);
      rows.push(t.head.map(function(h){return {v:h,s:S.HEAD};}));
      t.rows.forEach(function(r){
        var foot=/^(Total Appeared|Counted in|Incomplete results)/.test(r[0]);
        rows.push(r.map(function(c,i){return {v:c,s:i===0?(foot?S.FOOT_LABEL:S.LABEL):foot?S.FOOT_NUM:i===r.length-1?S.TOTAL:S.NUM};}));
      });
      rows.push([]);
      t.notes.forEach(function(n){var r=[{v:n,s:S.NOTE}];merges.push([rows.length,0,rows.length,cols-1]);heights[rows.length]=30;rows.push(r);});
      var widths=[30];for(var i=1;i<cols;i++)widths.push(13);
      return {name:t.sheet,widths:widths,rows:rows,merges:merges,heights:heights};
    });
  }
  function fileName(result){return 'Result-tables-'+String(result.label||'year').replace(/[^A-Za-z0-9._-]+/g,'-')+'.xlsx';}
  function download(result){
    var bytes=build(fromTables(result)),blob=new Blob([bytes],{type:XLSX_MIME}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=fileName(result);document.body.appendChild(a);a.click();a.remove();
    setTimeout(function(){URL.revokeObjectURL(url);},4000);
    return fileName(result);
  }
  return {build:build,fromTables:fromTables,fileName:fileName,download:download,crc32:crc32,MIME:XLSX_MIME};
});
