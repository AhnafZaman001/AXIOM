const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const config = JSON.parse(read('vercel.json'));
test('public homepage is distinct from the authenticated workspace', () => {
  assert.equal(config.rewrites.find(r=>r.source==='/').destination,'/landing.html');
  assert.equal(config.rewrites.find(r=>r.source==='/app').destination,'/index.html');
  for(const [old,to] of [['/index.html','/app'],['/landing.html','/'],['/login.html','/sign-in']]) {
    assert.ok(config.redirects.some(r=>r.source===old&&r.destination===to&&r.permanent));
  }
  assert.ok(config.redirects.some(r=>r.has?.some(h=>h.value==='axiom-hsus.vercel.app')));
});
test('discovery includes only the public canonical homepage', () => {
  const sitemap=read('sitemap.xml');
  assert.deepEqual([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]),['https://axiom.keystonelabs.site/']);
  assert.match(read('robots.txt'),/Sitemap: https:\/\/axiom.keystonelabs.site\/sitemap.xml/);
  assert.doesNotMatch(read('robots.txt'),/Disallow: \/$/m); // crawlers must see private-page noindex directives
});
test('each HTML entry has a unique title, description, canonical and one H1', () => {
  const titles=new Set();
  for(const file of ['landing.html','login.html','index.html']) {
    const html=read(file);
    assert.equal((html.match(/<h1\b/g)||[]).length,1,file);
    assert.equal((html.match(/rel="canonical"/g)||[]).length,1,file);
    assert.match(html,/<meta name="description" content="[^"]+"/);
    titles.add(html.match(/<title>(.*?)<\/title>/)[1]);
    for(const image of html.matchAll(/<img\b[^>]*>/g)) assert.match(image[0],/\balt="[^"]*"/);
  }
  assert.equal(titles.size,3);
  assert.doesNotMatch(read('landing.html'),/noindex|auth-guard\.js|supabase-client\.js/);
  assert.match(read('index.html'),/name="robots" content="noindex, nofollow"/);
});
test('public structured data and social previews describe the actual product', () => {
  const html=read('landing.html');
  const graph=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(graph['@graph'].find(x=>x['@type']==='SoftwareApplication').name,'AXIOM');
  assert.ok(!html.includes('aggregateRating')); // no invented ratings or prices
  assert.match(html,/property="og:image" content="https:\/\/axiom.keystonelabs.site\/assets\/axiom-og.png"/);
  assert.ok(fs.statSync(path.join(root,'assets/axiom-og.png')).size>0);
});
test('public relative navigation and section links resolve', () => {
  const html=read('landing.html'),ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
  const routes=new Set(config.rewrites.map(r=>r.source));
  for(const [,href] of html.matchAll(/\bhref="([^"]+)"/g)) {
    if(href.startsWith('#')) assert.ok(ids.has(href.slice(1)),href);
    else if(href.startsWith('/')) assert.ok(routes.has(href)||fs.existsSync(path.join(root,href)),href);
  }
});
