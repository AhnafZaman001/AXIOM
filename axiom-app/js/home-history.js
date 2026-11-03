/* User-specific recently opened destinations; no academic data stored here. */
(function(){
'use strict';
  function create(getUserId){
  function storageKey(){return getUserId()?'axiom.home.'+getUserId():null;}
  function history(){try{return JSON.parse(localStorage.getItem(storageKey())||'[]');}catch(e){return [];}}
  function remember(route){if(!storageKey()||route==='home')return;try{localStorage.setItem(storageKey(),JSON.stringify([{route:route,at:Date.now()}].concat(history().filter(function(x){return x.route!==route;})).slice(0,6)));}catch(e){}}
    return {history:history,remember:remember};
  }
  window.AxiomHomeHistory={create:create};
})();
