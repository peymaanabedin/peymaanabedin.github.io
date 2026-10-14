const paths={
 image:'<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.5"/><path d="m3 16 5-5 5 5 3-3 5 5"/>',
 camera:'<path d="M8 6 9.5 3h5L16 6h4a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4Z"/><circle cx="12" cy="13" r="4"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
 moon:'<path d="M20.5 14A9 9 0 0 1 10 3a9 9 0 1 0 10.5 11Z"/>',
 auto:'<circle cx="12" cy="12" r="9"/><path d="M12 3v18"/><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none"/>',

 pin:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.7"/>',
 bookmark:'<path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4Z"/>',
 map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15"/>',
 locate:'<path d="M12 2v3m0 14v3M2 12h3m14 0h3"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
 arrow:'<path d="M20 12H4m6-6-6 6 6 6"/>',
 chevron:'<path d="m14 6-6 6 6 6"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',
 share:'<path d="M12 15V3m-4 4 4-4 4 4M7 10H5v11h14V10h-2"/>',
 download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
 upload:'<path d="M12 16V4m-4 4 4-4 4 4M4 16v5h16v-5"/>',
 copy:'<rect x="8" y="8" width="13" height="13" rx="3"/><path d="M16 5V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h1"/>',
 route:'<path d="M7 21V9a3 3 0 0 1 3-3h10m-5-5 5 5-5 5M3 17l4 4 4-4"/>',
 home:'<path d="m3 10 9-7 9 7v10H3V10Zm6 10v-7h6v7"/>',
 briefcase:'<rect x="3" y="7" width="18" height="14" rx="3"/><path d="M8 7V3h8v4M3 12l9 3 9-3m-9 1v4"/>',
 car:'<path d="m5 5-2 7v8h3v-3h12v3h3v-8l-2-7H5Zm-2 7h18M7 14h1m8 0h1"/>',
 heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
 user:'<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
 settings:'<path d="m9 3 6 0 .7 3 2.3 1.3 3 .2 2 5-2.3 2-.3 2.7 1.3 2.8-4 3.5-2.7-1.5h-2.7L9.7 23l-4-3.5L7 16.7 6.7 14.5 4.4 12.5l2-5 3-.2L9 3Z" transform="translate(0 -1) scale(.9)"/><circle cx="12" cy="11" r="3"/>',
 shield:'<path d="M12 3 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-3Z"/><path d="m8 12 3 3 5-6"/>',
 layers:'<path d="m12 3 10 6-10 6L2 9l10-6Zm-9 11 9 5 9-5M3 18l9 5 9-5"/>',
 tap:'<path d="M9 13V5a2 2 0 0 1 4 0v6l5 1a3 3 0 0 1 3 3v3a4 4 0 0 1-4 4h-5l-7-7a2 2 0 0 1 3-3l1 1Z"/>',
 'wifi-off':'<path d="m3 3 18 18M2 8a17 17 0 0 1 4-2m4-1a17 17 0 0 1 12 3M5 12a12 12 0 0 1 5-2m5 .5a12 12 0 0 1 4 1.5M8 16a6 6 0 0 1 7-1M12 20h.01"/>',
 alert:'<path d="m12 3 10 18H2L12 3Zm0 6v5m0 3h.01"/>',
 grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
 external:'<path d="M14 3h7v7m0-7L10 14M9 3H3v18h18v-6"/>',
 trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
 sort:'<path d="M9 5h12M9 12h8M9 19h4M4 3v18m-3-3 3 3 3-3"/>',
 check:'<path d="m4 12 5 5L20 6"/>',
 refresh:'<path d="M20 7A9 9 0 0 0 4 5L2 8m0-5v5h5m-3 9a9 9 0 0 0 16 2l2-3m0 5v-5h-5"/>',
 edit:'<path d="m15 4 5 5M3 21l5-1L21 7a3.5 3.5 0 0 0-5-5L3 15v6Z"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a17 17 0 0 1 0 18 17 17 0 0 1 0-18Z"/>',
 coffee:'<path d="M3 8h13v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8Zm13 1h2a4 4 0 0 1 0 8h-2M6 2v2m4-2v2m4-2v2"/>'
};
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function icon(name){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.pin}</svg>`;}
export function categoryIcon(c){return `<span class="category-icon ${esc(c?.color||'teal')}">${paths[c?.icon]?icon(c.icon):esc(c?.icon||'📍')}</span>`;}
export function paintIcons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);});}
export const EN={paper:'Paper',ocean:'Ocean',lavender:'Lilac',sand:'Sand',themeHint:'Make it yours',about:'About Neshana',appVersion:'Neshana · Version 3.0',developerShort:'Made by Peymaan Abedinpour',privacyHeading:'Your data. Your device.',privacySummary:'Places, notes and photos stay on this device and are not sent to us. Maps and online search use external services. Sharing only happens when you choose it.',skip:'Skip to content',tagline:'Good places stay with you',personalAtlas:'Your personal atlas',install:'Install app',map:'Map',mapSearch:'Search places or addresses',mapSearchLabel:'Search a place or coordinates',search:'Search',showAll:'Show all places',zoomIn:'Zoom in',zoomOut:'Zoom out',locate:'Find my location',initialView:'Initial view · Tehran',retry:'Try again',offline:'You’re offline. Your saved places are available.',yourPlaces:'Your places. Your world.',heroTitle:'Keep this place.',heroSubtitle:'One tap. Find your way back.',latitude:'Latitude',longitude:'Longitude',copyLat:'Copy latitude',copyLng:'Copy longitude',manual:'Coordinates',savePlace:'Save this place',share:'Share place',directions:'Directions',tapMap:'Or choose a point on the map',recent:'Recent pins',seeAll:'See all',localNote:'Your places are stored only on this device.',yourCollection:'Your personal collection',savedPlaces:'My places',addPlace:'Add a place',savedSearch:'Search your places…',categories:'Categories',sort:'Sort',newest:'Newest first',oldest:'Oldest first',byName:'Place name',nearest:'Nearest',loadMore:'Show more',makeYours:'Make it yours',settings:'Settings',settingsSubtitle:'A little companion, your way.',appearance:'APPEARANCE & LANGUAGE',theme:'Colors & mood',auto:'Auto',light:'Light',dark:'Dark',language:'Language',organize:'KEEP IT ORGANIZED',manageCategories:'Manage categories',defaultMap:'Default directions app',linkSettings:'Custom links & sharing',yourData:'YOUR DATA',export:'Download a backup',import:'Import or restore',clearAll:'Delete all places',backupNote:'To move to another phone or the installed app, export a backup and import it there.',alwaysWithYou:'Always with you',installHint:'Add Neshana to your home screen',privacy:'About your data & privacy',navigation:'Main navigation',myPlaces:'My places',close:'Close',updateReady:'Update ready. Tap to refresh.'};
