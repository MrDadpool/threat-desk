// Run with: node test-map.cjs
const assert = require('node:assert/strict');
// values built inside the vm belong to another realm, so their Array prototype is
// not this realm's — normalize before any deep comparison
const plain = v => JSON.parse(JSON.stringify(v));
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(`${__dirname}/threat-desk.html`, 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const head = script.slice(0, script.indexOf("adopt(EMBED,'embedded');"));

// `attack` is a module-level `let`; assign it through the sandbox
const setAttack = (run, value) => { run.IN = value; run('attack = IN'); };

function boot() {
  const nodes = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(m =>
    [m[1], {value:'', options:[], dataset:{}, style:{}, innerHTML:'', textContent:'',
            hidden:false, addEventListener(event, fn){this[event] = fn;}}]));
  const document = {getElementById:id=>nodes[id], documentElement:{dataset:{}}, addEventListener(){}};
  const context = vm.createContext({document, localStorage:{getItem:()=>null, setItem(){}}, IN:null});
  vm.runInContext(head, context);
  // top-level `const`/`let` in a vm script live in the context's lexical scope,
  // not on the sandbox object, so reach them by evaluating in the same context
  const run = expr => vm.runInContext(expr, context);
  Object.defineProperty(run, 'IN', {set: v => { context.IN = v; }});
  return {nodes, run};
}

// ── geometry the page carries ────────────────────────────────────────────
{
  const {run} = boot();
  const {CENT, CNAME, LAND, MAPW, MAPH} = run('({CENT,CNAME,LAND,MAPW,MAPH})');
  assert.equal(MAPW, 720); assert.equal(MAPH, 360);
  const {VIEWY, VIEWH} = run('({VIEWY,VIEWH})');
  assert.ok(VIEWY >= 0 && VIEWY + VIEWH <= MAPH, 'frame sits inside the projection box');
  assert.ok(VIEWH < MAPH, 'frame actually crops something');
  assert.ok(LAND.startsWith('M') && LAND.endsWith('Z'), 'land path is closed subpaths');
  assert.ok(LAND.length > 8000, 'land path is not a stub');
  // Every centroid must land inside the projection box.
  // Stronger than "on the canvas": a country with a centroid is a country we
  // claim we can plot, so it must fall inside the cropped frame. AQ's true area
  // centroid does not, which is why it is pinned to the peninsula.
  for (const [cc, [x, y]] of Object.entries(CENT)) {
    assert.ok(x >= 0 && x <= MAPW, `${cc} centroid off-canvas in x: ${x}`);
    assert.ok(y >= VIEWY && y <= VIEWY + VIEWH,
      `${cc} centroid outside the visible frame: y=${y}`);
    assert.ok(CNAME[cc], `${cc} has a centroid but no display name`);
  }
  // The countries DShield actually reports at the top must all be plottable,
  // including the micro-states Natural Earth omits.
  for (const cc of ['US','NL','BG','FR','CA','DE','GB','SG','CN','PL','HK','TW','MT','MU','MO'])
    assert.ok(CENT[cc], `no centroid for top DShield source ${cc}`);
}

// ── panel renders from telemetry ─────────────────────────────────────────
const FIXTURE = {
  t: 1, src: 'SANS Internet Storm Center / DShield',
  countries: [
    {c:'US', r:1000, s:500, t:9, p:75.7},
    {c:'SG', r:250,  s:40,  t:3, p:12.5},
    {c:'BG', r:100,  s:10,  t:2, p:9},
    {c:'DE', r:80,   s:8,   t:2, p:7},     // outside the top three
    {c:'ZZ', r:50,   s:5,   t:1, p:1},     // unknown code, must be dropped
    {c:'FR', r:0,    s:0,   t:0, p:0},     // zero reports, must be dropped
  ],
  ports: [{p:443,r:900,s:80,t:9},{p:22,r:300,s:70,t:8},{p:65000,r:10,s:1,t:1}],
  day: {d:'2026-09-08', records: 11367010, sources: 133347, targets: 1001},
};

{
  const {nodes, run} = boot();
  setAttack(run, FIXTURE);
  nodes.geo.hidden = true;
  run('threatmap()');

  assert.equal(nodes.geo.hidden, false, 'panel shows when telemetry is present');
  const svg = nodes.map.innerHTML;
  const circles = [...svg.matchAll(/<circle class="orig( hot)?" cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)];
  assert.equal(circles.length, 4, 'unknown and zero-report countries are dropped');

  const r = circles.map(m => Number(m[4]));
  assert.ok(r[0] > r[1] && r[1] > r[2] && r[2] > r[3], 'radius tracks report volume');
  // Area-proportional: SG has a quarter of US reports, so half the radius.
  assert.ok(Math.abs(r[1] / r[0] - 0.5) < 0.02, `sqrt scale broken: ${r[0]} ${r[1]}`);
  assert.ok(r.every(v => v >= 1.8), 'floor keeps small sources hittable');
  // Largest first, so small bubbles paint on top.
  assert.deepEqual(plain(circles.map(m => m[1] === ' hot')), [true, true, true, false],
    'the top three carry the accent, the fourth does not');

  const frame = run('"0 "+VIEWY+" "+MAPW+" "+VIEWH');
  assert.ok(svg.includes(`viewBox="${frame}"`), 'the svg is framed on the cropped box');
  assert.ok(svg.includes('<path class="land"'), 'land drawn under the bubbles');
  assert.ok(svg.indexOf('<path class="land"') < svg.indexOf('<circle'), 'land painted first');
  assert.ok(svg.includes('United States of America (US) · 1,000 reports · 500 sources'),
    'tooltip names the country and its counts');

  assert.ok(nodes.geoh.innerHTML.includes('4 source countries'));
  assert.ok(nodes.geoh.innerHTML.includes('1,430 reports'), 'header totals only plotted rows');
  assert.ok(nodes.geoh.innerHTML.includes('top United States of America'));
  assert.ok(nodes.geonote.textContent.includes('11,367,010 records'));
  assert.ok(/no target geography/.test(nodes.geonote.textContent),
    'the panel states that destinations are not geography');

  const ports = nodes.ports.innerHTML;
  assert.ok(ports.includes('443 HTTPS') && ports.includes('22 SSH'));
  assert.ok(ports.includes('65000 \u2014'), 'unknown ports still list, without a made-up service');
  assert.ok(ports.includes('width:100.0%') && ports.includes('width:33.3%'),
    'port bars are scaled to the leader');
}

// ── degenerate telemetry ─────────────────────────────────────────────────
for (const [label, attack] of [
  ['null',            null],
  ['empty object',    {}],
  ['no countries',    {countries: []}],
  ['all unplottable', {countries: [{c:'ZZ', r:5, s:1, t:1, p:1}]}],
  ['all zero',        {countries: [{c:'US', r:0, s:0, t:0, p:0}]}],
  ['null entries',    {countries: [null, undefined]}],
]) {
  const {nodes, run} = boot();
  setAttack(run, attack);
  nodes.geo.hidden = false;
  run('threatmap()');
  assert.equal(nodes.geo.hidden, true, `panel hides on ${label} telemetry`);
}

// One country, no ports, no daily summary — must not divide by zero or throw.
{
  const {nodes, run} = boot();
  setAttack(run, {countries: [{c:'US', r:7, s:2, t:1, p:1}]});
  run('threatmap()');
  assert.equal(nodes.geo.hidden, false);
  const circles = nodes.map.innerHTML.match(/<circle/g);
  assert.equal(circles.length, 1);
  assert.ok(/r="13.5"/.test(nodes.map.innerHTML), 'the only country gets the full radius');
  assert.ok(nodes.ports.innerHTML.includes('No port telemetry'));
  assert.ok(!nodes.geonote.textContent.includes('records from'), 'no summary, no summary clause');
}

// ── shapeAttack normalizes exactly what the ISC endpoints return ─────────
{
  const {run} = boot();
  run.IN = {
    rows: [
      {country:'US', reports:1000, sources:500, targets:9, persistance:75.66},
      {country:'xk', reports:10,   sources:1,   targets:1, persistance:1},   // lowercase
      {country:'',   reports:309,  sources:5,   targets:37, persistance:185},// blank code
      {country:'XX', reports:99,   sources:2,   targets:2, persistance:2},   // unknown
      {country:'FR', reports:0,    sources:0,   targets:0, persistance:0},   // no reports
      {country:'BG', reports:500,  sources:4,   targets:2, persistance:43.3},
    ],
    // the real shape: object keyed "0","1",… with date/limit scalars mixed in
    ports: {'0':{rank:1,targetport:443,records:900,targets:300,sources:80},
            '1':{rank:2,targetport:22, records:300,targets:279,sources:70},
            '2':{rank:3,targetport:99, records:0,  targets:1,  sources:1},
            date:'2026-09-08', limit:10},
    day: {d:'2026-09-08', records:11367010, sources:133347, targets:1001},
  };
  const a = plain(run('shapeAttack(IN.rows,IN.ports,IN.day)'));
  assert.deepEqual(a.countries.map(c => c.c), ['US','BG','XK'],
    'blank, XX and zero-report rows dropped; codes upcased; sorted by volume');
  assert.equal(a.countries[0].p, 75.7, 'persistence rounded to one decimal');
  assert.deepEqual(a.ports.map(p => p.p), [443, 22], 'scalars skipped, zero-record dropped');
  assert.equal(a.day.records, 11367010);
  assert.ok(a.t > 0 && a.src.includes('DShield'));

  // Garbage in must not throw.
  for (const [rows, ports] of [[null,null], [undefined,{}], ['nope',[]], [[],{date:'x'}]]) {
    run.IN = {rows, ports};
    const empty = plain(run('shapeAttack(IN.rows,IN.ports,null)'));
    assert.equal(empty.countries.length, 0);
    assert.equal(empty.ports.length, 0);
  }
  // The 90-country cap.
  run.IN = {rows: Array.from({length: 200}, (_, i) => ({country:'C'+i, reports:200-i, sources:1, targets:1, persistance:1}))};
  assert.equal(plain(run('shapeAttack(IN.rows,{},null)')).countries.length, 90, 'capped at TOPN');
}

// ── takeAttack refuses to go backwards ───────────────────────────────────
{
  const {nodes, run} = boot();
  const take = a => { run.IN = a; return run('takeAttack(IN)'); };
  assert.equal(take(null), false, 'null is ignored');
  assert.equal(take({t: 5, countries: []}), false, 'empty telemetry is ignored');
  assert.equal(nodes.geo.hidden, false, 'a rejected payload does not touch the panel');

  assert.equal(take({...FIXTURE, t: 100}), true);
  assert.equal(run('attack').t, 100);
  assert.equal(take({...FIXTURE, t: 50}), false, 'older telemetry cannot clobber newer');
  assert.equal(run('attack').t, 100);
  assert.equal(take({...FIXTURE, t: 100}), false, 'same timestamp is not newer');
  assert.equal(take({...FIXTURE, t: 101}), true, 'newer wins');
  assert.equal(run('attack').t, 101);
  assert.ok(nodes.map.innerHTML.includes('<circle'), 'accepting telemetry repaints');
}

// ── adopt() primes the panel but never overwrites a live pull ────────────
{
  const {run} = boot();
  const snap = t => ({t, items:[{id:'a',title:'a',ts:t,cat:'Cyber News',src:'x'}]});
  const adopt = s => { run.IN = s; return run('adopt(IN,"test")'); };
  const primed = {...FIXTURE, t: 1000};
  assert.equal(adopt({...snap(10), dshield: primed}), true);
  assert.equal(run('attack').t, 1000, 'a snapshot primes the map');
  adopt({...snap(20), dshield: null});                          // DShield was down
  assert.equal(run('attack').t, 1000, 'null telemetry does not blank the panel');
  adopt({...snap(30), dshield: {...FIXTURE, t: 900}});
  assert.equal(run('attack').t, 1000, 'a stale snapshot cannot clobber a live pull');
  adopt({...snap(40), dshield: {...FIXTURE, t: 2000}});
  assert.equal(run('attack').t, 2000, 'newer telemetry replaces it');
}

console.log('PASS: geometry bounds, bubble scale + paint order, port bars, six degenerate ' +
            'telemetry shapes, single-country edge, shapeAttack normalization + caps, ' +
            'takeAttack monotonicity, adopt() priming.');
