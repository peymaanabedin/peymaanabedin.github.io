import {test} from 'node:test';
import assert from 'node:assert/strict';
import {interpretCoordinates as parse} from '../dist/coordinates.mjs';
const cases=[
 ['35.7, 51.4',35.7,51.4],['۳۵٫۷، ۵۱٫۴',35.7,51.4],['٣٥٫٧؛٥١٫٤',35.7,51.4],['-12.5 40',-12.5,40],['35,7; 51,4',35.7,51.4],['(35.7, 51.4)',35.7,51.4],['[35.7,51.4]',35.7,51.4],['0,0',0,0],
 ['35° 42\' 0" N, 51° 24\' 0" E',35.7,51.4],['N35 42 0 E51 24 0',35.7,51.4],['51°24\' E 35°42\' N',35.7,51.4],['35°42\', 51°24\'',35.7,51.4],['35:42:00,51:24:00',35.7,51.4],['35.7S 51.4W',-35.7,-51.4],['۳۵°۴۲′ شمال، ۵۱°۲۴′ شرق',35.7,51.4],
 ['latitude:35.7 longitude:51.4',35.7,51.4],['lng=51.4; lat=35.7',35.7,51.4],['عرض جغرافیایی: 35.7، طول جغرافیایی:51.4',35.7,51.4],
 ['{"lat":35.7,"lng":51.4}',35.7,51.4],['{"type":"Point","coordinates":[51.4,35.7,1200]}',35.7,51.4],['{"type":"Feature","geometry":{"type":"Point","coordinates":[51.4,35.7]}}',35.7,51.4],['POINT(51.4 35.7)',35.7,51.4],['SRID=4326; POINT (51.4 35.7)',35.7,51.4],
 ['geo:35.7,51.4,1200;u=10',35.7,51.4],['geo:0,0?q=35.7%2C51.4(Cafe)',35.7,51.4],
 ['https://maps.google.com/?q=35.7,51.4',35.7,51.4],['https://www.google.com/maps/search/?api=1&query=35.7%2C51.4',35.7,51.4],['https://www.google.com/maps/dir/?api=1&destination=35.7,51.4',35.7,51.4],['https://www.google.com/maps/place/cafe/@36,52,15z/data=!3d35.7!4d51.4',35.7,51.4],
 ['https://maps.apple.com/?ll=35.7,51.4&q=Cafe',35.7,51.4],['https://maps.apple.com/?daddr=35.7,51.4',35.7,51.4],['https://www.openstreetmap.org/?mlat=35.7&mlon=51.4#map=12/36/52',35.7,51.4],['https://www.openstreetmap.org/#map=15/35.7/51.4',35.7,51.4],['https://waze.com/ul?ll=35.7%2C51.4&navigate=yes',35.7,51.4],['https://bing.com/maps?cp=35.7~51.4',35.7,51.4],['موقعیت من: (35.7, 51.4)',35.7,51.4]
];
test('common coordinate forms parse accurately without network requests',()=>{
 for(const [value,lat,lng] of cases){const p=parse(value);assert.ok(p.point,`${value}: ${p.error}`);assert.ok(Math.abs(p.point.lat-lat)<1e-9,value);assert.ok(Math.abs(p.point.lng-lng)<1e-9,value);}
});
test('an unambiguous longitude-first pair is flagged for review; ordinary order stays unchanged',()=>{
 assert.deepEqual(parse('120.5,35.7'),{point:{lat:35.7,lng:120.5},format:'decimal',reordered:true});assert.equal(parse('51.4,35.7').point.lat,51.4);assert.equal(parse('https://maps.google.com/@35.7,51.4,13z').format,'map-center');
});
test('short links, multiple points, invalid angles and unrelated text are never guessed',()=>{
 for(const text of ['91,181','35,51,21','35,7,51,4','35°60\'N 51°0\'E','-35N 51E','--35,51','2026-10-15','hello 10 20 more','(35,51) and (36,52)','https://example.org/?q=35,51','{"type":"Point","coordinates":["",35]}',''])assert.equal(parse(text).point,undefined,text);
 assert.equal(parse('https://maps.app.goo.gl/abcdef').error,'short-link');assert.equal(parse('https://maps.google.com/?q=Tehran').error,'link-without-coordinates');
});
