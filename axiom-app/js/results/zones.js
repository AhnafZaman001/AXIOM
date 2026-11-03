/* ---- 003_zone-logic.js ---- */

/* ===================== ZONE LOGIC ===================== */
function zoneOf(percent, absent){
  if(absent) return 'grey';
  if(percent === null || percent === undefined || Number.isNaN(percent)) return null;
  if(percent >= 90) return 'green';
  if(percent >= 80) return 'blue';
  if(percent >= 70) return 'yellow';
  if(percent >= 60) return 'pink';
  return 'red';
}
const ZONE_RANK = {red:0, pink:1, yellow:2, blue:3, green:4};
const ZONE_LABEL = {green:'Green',blue:'Blue',yellow:'Yellow',pink:'Pink',red:'Red',grey:'Absent'};
// A small solid-colour swatch (no emoji) used everywhere a zone needs a
// quick visual marker — table cells, cards, popups. Cross-platform
// consistent, unlike relying on the OS's own emoji glyphs.
function zoneDotHtml(z){ return z ? `<span class="dot ${z}"></span>` : ''; }
