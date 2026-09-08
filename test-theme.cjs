// Run with: node test-theme.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(`${__dirname}/threat-desk.html`, 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const options = [...html.match(/<select id="theme"[\s\S]*?<\/select>/)[0]
  .matchAll(/value="([^"]+)"/g)].map(m => ({value:m[1]}));
const storage = new Map();
function boot() {
  const nodes = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(m =>
    [m[1], {value:'', options, dataset:{}, style:{}, addEventListener(event, fn){this[event] = fn;}}]));
  const document = {getElementById:id=>nodes[id], documentElement:{dataset:{}}, addEventListener(){}};
  const context = vm.createContext({document, localStorage:{
    getItem:key=>storage.get(key) ?? null, setItem:(key,value)=>storage.set(key,value)
  }});
  // Exercise actual initialization and handlers without starting network polling.
  vm.runInContext(script.slice(0, script.indexOf("adopt(EMBED,'embedded');")), context);
  return {nodes, document};
}
assert.deepEqual(options.map(o=>o.value), ['night','day','violet','mint','crimson','slate']);
assert.equal(boot().document.documentElement.dataset.theme, 'night');
for (const {value} of options) {
  const {nodes,document} = boot();
  nodes.theme.change({target:{value}});
  assert.equal(document.documentElement.dataset.theme, value);
  assert.equal(nodes.theme.value, value);
  assert.equal(boot().document.documentElement.dataset.theme, value);
}
storage.set('td.lights', JSON.stringify('invalid-theme'));
assert.equal(boot().nodes.theme.value, 'night');
console.log('PASS: all six themes, selection, persistence, legacy day/night settings, invalid-value fallback.');
