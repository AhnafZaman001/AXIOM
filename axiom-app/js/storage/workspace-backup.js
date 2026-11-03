/* ---- 015_save-load-workspace.js ---- */

/* ===================== SAVE / LOAD WORKSPACE ===================== */
function serializeWorkspace(){ return JSON.stringify(workspace, null, 0); }

async function autoSaveToHandle(){
  if(!fileHandle) return;
  try{
    const writable = await fileHandle.createWritable();
    await writable.write(serializeWorkspace());
    await writable.close();
    dirty = false;
    updateStatusLine();
  }catch(e){
    console.error('auto-save failed', e);
  }
}

async function connectPendriveFile(){
  if(!window.showSaveFilePicker){
    showToast('Your browser doesn\'t support direct file connection (works in Chrome/Edge). Use Download/Upload Workspace instead.', 'warning', 5000);
    return;
  }
  try{
    const handle = await window.showOpenFilePicker({
      types:[{description:'Workspace file', accept:{'application/json':['.json']}}],
      excludeAcceptAllOption:false, multiple:false
    }).then(h=>h[0]).catch(async ()=>{
      // user may want to create a new one
      return await window.showSaveFilePicker({suggestedName:'data.json', types:[{description:'Workspace file', accept:{'application/json':['.json']}}]});
    });
    fileHandle = handle;
    // try to read existing content
    try{
      const file = await fileHandle.getFile();
      const text = await file.text();
      if(text && text.trim()){
        const parsed = JSON.parse(text);
        if(parsed && parsed.sections){ workspace = parsed; }
      }
    }catch(e){ /* new/empty file, ignore */ }
    dirty = false;
    updateStatusLine();
    refreshAllUI();
    showToast('Connected — changes will auto-save to this file as you work.', 'success');
  }catch(e){
    if(e.name !== 'AbortError') console.error(e);
  }
}

function downloadWorkspace(){
  const blob = new Blob([serializeWorkspace()], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0,10);
  a.href = url; a.download = `workspace_${stamp}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  dirty = false;
  updateStatusLine();
  showToast('✓ Workspace downloaded.', 'success');
}

function uploadWorkspace(file){
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const parsed = JSON.parse(reader.result);
      if(!parsed || !parsed.sections) throw new Error('not a valid workspace file');
      workspace = parsed;
      workspace.sectionRenames = workspace.sectionRenames || {};
      workspace.teacherOverrides = workspace.teacherOverrides || {};
      applyPersistedSectionRenames();
      populateSectionSelects();
      dirty = false;
      updateStatusLine();
      updateLastUpdatedNow();
      refreshAllUI();
      showToast('✓ Workspace loaded.', 'success');
    }catch(e){
      showToast('Could not read that file — it doesn\'t look like a workspace file saved by this tool.', 'error', 5000);
    }
  };
  reader.readAsText(file);
}

window.addEventListener('beforeunload', (e)=>{
  if(dirty){ e.preventDefault(); e.returnValue=''; }
});
