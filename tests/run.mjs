// Runs the ___TESTS___ scenarios from tests.yaml against template.js in Node,
// with a small shim of the GTM template test API (mock, mockObject, runCode,
// assertThat, fail) and the sandbox APIs the template uses.
//
// Usage: node tests/run.mjs [path/to/template.js]
//
// Template and test code run with non-sandbox globals (Date, Math, URL, ...)
// shadowed to undefined, so code that only works outside the GTM sandbox fails here.
// ponytail: shim covers only the test API subset tests.yaml uses; extend it when a scenario needs more.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(root + f, 'utf8');
const code = process.argv[2] ? readFileSync(process.argv[2], 'utf8') : read('template.js');

const SHADOWED = [
  'Date', 'Math', 'URL', 'URLSearchParams', 'parseInt', 'parseFloat', 'Number', 'String',
  'Object', 'Array', 'encodeURIComponent', 'decodeURIComponent', 'console', 'globalThis',
  'window', 'document', 'process', 'setTimeout', 'Function'
];

function compile(src, params) {
  const outer = new Function(...SHADOWED, `return function (${params.join(', ')}) {\n${src}\n};`);
  return outer(...SHADOWED.map(() => undefined));
}

// GTM parseUrl: object of URL parts, undefined for malformed input.
function parseUrl(input) {
  let u;
  try {
    u = new URL(input);
  } catch {
    return undefined;
  }
  const searchParams = {};
  for (const [k, v] of u.searchParams) {
    searchParams[k] = k in searchParams ? [].concat(searchParams[k], v) : v;
  }
  const { href, origin, protocol, username, password, host, hostname, port, pathname, search, hash } = u;
  return { href, origin, protocol, username, password, host, hostname, port, pathname, search, searchParams, hash };
}

function sandboxApi(name) {
  switch (name) {
    case 'JSON':
      return {
        parse: (s) => {
          try {
            return JSON.parse(s);
          } catch {
            return undefined;
          }
        },
        stringify: (v) => JSON.stringify(v)
      };
    case 'Math':
      return Math;
    case 'parseUrl':
      return parseUrl;
    case 'logToConsole':
      return () => {};
    case 'getTimestampMillis':
      return () => Date.now();
  }
  throw new Error(`sandbox API not mocked: ${name}`);
}

function runTemplate(mocks, data) {
  const require = (name) => (mocks.has(name) ? mocks.get(name) : sandboxApi(name));
  return compile(code, ['require', 'data'])(require, data);
}

function assertThat(actual) {
  const check = (ok, what) => {
    if (!ok) throw new Error(`expected ${JSON.stringify(actual)} ${what}`);
  };
  return {
    isEqualTo: (expected) => check(isDeepStrictEqual(actual, expected), `to equal ${JSON.stringify(expected)}`),
    isUndefined: () => check(actual === undefined, 'to be undefined'),
    isTrue: () => check(actual === true, 'to be true'),
    isFalse: () => check(actual === false, 'to be false')
  };
}

function runScenario(setup, scenario) {
  const mocks = new Map();
  const api = {
    require: sandboxApi,
    mock: (name, v) => mocks.set(name, typeof v === 'function' ? v : () => v),
    mockObject: (name, obj) => mocks.set(name, obj),
    runCode: (data) => runTemplate(mocks, data),
    assertThat,
    fail: (msg) => {
      throw new Error(msg);
    }
  };
  const names = Object.keys(api);
  compile(`${setup}\n${scenario.code}`, names)(...names.map((n) => api[n]));
}

// Strict parser for the GTM ___TESTS___ YAML layout; throws on anything else.
function parseTests(text) {
  const lines = text.split('\n');
  const out = { scenarios: [], setup: '' };
  let i = 0;
  const block = (indent) => {
    const buf = [];
    const pad = ' '.repeat(indent);
    while (i < lines.length && (lines[i] === '' || lines[i].startsWith(pad))) buf.push(lines[i++].slice(indent));
    while (buf.length && buf[buf.length - 1] === '') buf.pop();
    return buf.join('\n');
  };
  while (i < lines.length) {
    const line = lines[i];
    const name = /^- name: (.+)$/.exec(line);
    i++;
    if (line === '' || line.startsWith('#') || line === 'scenarios:') continue;
    if (name) out.scenarios.push({ name: name[1] });
    else if (line === '  code: |-' && out.scenarios.length) out.scenarios.at(-1).code = block(4);
    else if (line === 'setup: |-') out.setup = block(2);
    else throw new Error(`tests.yaml line ${i} not understood: ${line}`);
  }
  for (const s of out.scenarios) if (!s.code) throw new Error(`scenario without code: ${s.name}`);
  return out;
}

let failed = 0;
const report = (label, fn) => {
  try {
    fn();
    console.log(`ok - ${label}`);
  } catch (e) {
    failed++;
    console.log(`not ok - ${label}\n    ${e.message}`);
  }
};

/* --- behaviour: tests.yaml scenarios --------------------------------- */
const yaml = read('tests.yaml');
const tests = parseTests(yaml);
if (tests.scenarios.length === 0) throw new Error('tests.yaml has no scenarios');
for (const s of tests.scenarios) report(s.name, () => runScenario(tests.setup, s));

/* --- behaviour: timestamp format matches Date#toISOString ------------ */
report('touch_timestamp matches toISOString across 1970-9999', () => {
  let seed = 12345;
  const samples = [0, 951782400000, 4107456000000, 253402300799999];
  for (let k = 0; k < 2000; k++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    samples.push(Math.floor((seed / 2147483648) * 253402300799999));
  }
  for (const ms of samples) {
    const mocks = new Map([
      ['getUrl', (c, stripWww, pages, key) => (c === 'query' ? (key ? undefined : '') : c === 'host' ? 'a.test' : 'https://a.test/')],
      ['localStorage', { getItem: () => undefined, setItem: () => {} }],
      ['getTimestampMillis', () => ms]
    ]);
    const got = runTemplate(mocks, {}).last_touch_timestamp;
    const want = new Date(ms).toISOString();
    if (got !== want) throw new Error(`${ms}: got ${got}, want ${want}`);
  }
});

/* --- sync guards: template.tpl mirrors template.js and tests.yaml ---- */
const tpl = read('template.tpl');
const parts = tpl.split(/^___([A-Z_]+)___\n/m);
const sections = {};
for (let k = 1; k < parts.length; k += 2) sections[parts[k]] = parts[k + 1];
const trimNl = (s) => (s || '').replace(/^\n+|\n+$/g, '');
report('sync: template.tpl code section is identical to template.js', () => {
  if (trimNl(sections.SANDBOXED_JS_FOR_WEB_TEMPLATE) !== trimNl(read('template.js'))) throw new Error('out of sync');
});
report('sync: template.tpl ___TESTS___ is identical to tests.yaml', () => {
  const body = yaml.replace(/^(#.*\n)+/, ''); // leading comment header exists only in tests.yaml
  if (trimNl(sections.TESTS) !== trimNl(body)) throw new Error('out of sync');
});

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}: ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
