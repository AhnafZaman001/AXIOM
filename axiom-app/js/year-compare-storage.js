/* Private original workbooks plus the existing anonymous result snapshots. */
(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.AxiomYearStorage=factory();
})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  var BUCKET='year-result-files', MAX_BYTES=6*1024*1024;
  function checkFile(file){
    if(!file || !/\.xlsx?$/i.test(file.name||'')) throw new Error('Choose an Excel .xls or .xlsx workbook.');
    if(!file.size || file.size>MAX_BYTES) throw new Error('Workbooks must be between 1 byte and 6 MB.');
  }
  function migrationError(error){
    return error && (/bucket not found|schema cache/i.test(error.message||'') || ['42P01','42703','PGRST204','PGRST205'].indexOf(error.code)>=0);
  }
  function message(error){ return migrationError(error)?'Cloud setup needs migration 014. Run it in Supabase SQL Editor, then refresh.':(error.message||String(error)); }
  function create(client){
    function storage(){if(!client || !client.storage) throw new Error('Sign in to use cloud files.');return client.storage.from(BUCKET);}
    async function list(){
      var res=await client.from('year_datasets').select('*').order('created_at',{ascending:true});
      if(res.error) throw new Error(message(res.error));
      return res.data||[];
    }
    async function save(ds,file,previous){
      checkFile(file);
      var path='workbooks/'+crypto.randomUUID()+(/\.xlsx$/i.test(file.name)?'.xlsx':'.xls');
      var upload=await storage().upload(path,file,{upsert:false,cacheControl:'0',contentType:/\.xlsx$/i.test(file.name)?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/vnd.ms-excel'});
      if(upload.error) throw new Error(message(upload.error));
      var payload=Object.assign({},ds,{source_path:path,source_size:file.size,source_uploaded_at:new Date().toISOString()});
      if(previous)payload.id=previous.id;
      var result;
      try{
        result=await client.from('year_datasets').upsert(payload,{onConflict:previous?'id':'label,assessment,grade_level'}).select('*').single();
        if(result.error) throw result.error;
      }catch(error){
        // Only definite transaction/validation rejections are safe to clean up.
        // A read showing no reference cannot rule out an interrupted request
        // still committing later. Retain the object when outcome is uncertain.
        if(['23505','23514','42501','42703','42P01','23502','23503','22P02','22001','PGRST204','PGRST205'].indexOf(error.code)>=0){
          try{await storage().remove([path]);}catch(ignore){}
        }
        throw new Error(message(error)+' Refresh cloud years before retrying if the connection was interrupted.');
      }
      var saved=Object.assign({},payload,result.data);
      if(previous && previous.source_path && previous.source_path!==path){
        try{
          var cleanup=await storage().remove([previous.source_path]);
          if(cleanup.error) saved.cleanupWarning='Year saved. The old source file could not be removed; contact an administrator to clean up storage.';
        }catch(error){saved.cleanupWarning='Year saved. Old source cleanup could not be confirmed.';}
      }
      return saved;
    }
    async function download(ds){
      if(!ds.source_path) throw new Error('This year has saved results but no original workbook. Upload it once to attach a cloud file.');
      var result=await storage().download(ds.source_path);
      if(result.error) throw new Error(message(result.error));
      return result.data;
    }
    async function saveSnapshot(ds,source){
      if(!source.source_path)throw new Error('No cloud workbook is attached.');
      var payload=Object.assign({},ds,{source_path:source.source_path,source_size:source.source_size,source_uploaded_at:source.source_uploaded_at});
      var result=await client.from('year_datasets').update(payload).eq('id',source.id).select('*').single();
      if(result.error)throw new Error(message(result.error));
      return Object.assign({},payload,result.data);
    }
    async function remove(ds){
      var result=await client.from('year_datasets').delete().eq('id',ds.id);
      if(result.error) throw new Error(message(result.error));
      if(ds.source_path){
        try{
          var cleanup=await storage().remove([ds.source_path]);
          if(cleanup.error) return 'Results deleted. The source file needs administrator cleanup in Storage.';
        }catch(error){return 'Results deleted. Source file cleanup could not be confirmed.';}
      }
      return '';
    }
    return {list:list,save:save,saveSnapshot:saveSnapshot,download:download,remove:remove};
  }
  return {create:create,checkFile:checkFile,bucket:BUCKET,maxBytes:MAX_BYTES};
});
