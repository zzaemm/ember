/* Town and district search: plain functions, shared by app.js and tests/search.test.js. */
const PRESET_STATE={'Kerala':'kerala','Odisha':'odisha','Uttarakhand':'uttarakhand','Punjab':'punjab_haryana','Haryana':'punjab_haryana'};
/* Up to 6 places: names that start with the text first (districts and states before towns), then names that contain it. */
function matchPlaces(all,text){
  const t=text.trim().toLowerCase(); if(t.length<2) return [];
  const rank={district:0,state:0,town:1}, starts=all.filter(p=>p[0].toLowerCase().startsWith(t)), inside=all.filter(p=>!p[0].toLowerCase().startsWith(t)&&p[0].toLowerCase().includes(t));
  return [...starts.sort((a,b)=>rank[a[3]]-rank[b[3]]),...inside].slice(0,6);
}
/* A preset region for a state that has one; otherwise a square of rad degrees around the point, with an honest label. */
function placeArea([name,,,kind]){
  const preset=kind==='state'&&PRESET_STATE[name]; if(preset) return {preset};
  return {rad:kind==='state'?1.0:kind==='district'?.45:.3, label:kind==='town'?`the area around ${name}`:kind==='district'?`${name} district (approx.)`:`the area around the centre of ${name}`};
}
if(typeof module!=='undefined') module.exports={matchPlaces,placeArea};
