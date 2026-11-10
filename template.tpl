___TERMS_OF_SERVICE___

By creating or modifying this file you agree to Google Tag Manager's Community
Template Gallery Developer Terms of Service available at
https://developers.google.com/tag-manager/gallery-tos (or such other URL as
Google may provide), as modified from time to time.


___INFO___

{
  "displayName": "ClickTrail Attribution",
  "description": "Returns a structured ClickTrail attribution object: UTMs, ad click IDs (gclid, gbraid, wbraid, fbclid, msclkid and more), initial landing page, initial referrer, and first-touch / last-touch timestamps with deterministic merge rules.",
  "categories": [
    "ADVERTISING",
    "ANALYTICS"
  ],
  "securityGroups": [],
  "id": "ct_attr",
  "type": "MACRO",
  "version": 1,
  "brand": {
    "thumbnail": "",
    "displayName": "",
    "id": "brand_clicktrail"
  },
  "containerContexts": [
    "WEB"
  ]
}


___TEMPLATE_PARAMETERS___

[
  {
    "type": "TEXT",
    "name": "referrerInput",
    "displayName": "Current Referrer",
    "simpleValueType": true,
    "help": "Set to the built-in {{Referrer}} variable. Used to classify external referrals and to detect internal navigation.",
    "valueHint": "{{Referrer}}"
  },
  {
    "type": "GROUP",
    "name": "advancedGroup",
    "displayName": "Advanced",
    "groupStyle": "ZIPPY_CLOSED",
    "subParams": [
      {
        "type": "CHECKBOX",
        "name": "debug",
        "checkboxText": "Log captured touches to the console (preview/debug only)",
        "simpleValueType": true,
        "defaultValue": false
      }
    ]
  }
]


___WEB_PERMISSIONS___

[
  {
    "instance": {
      "key": {
        "publicId": "access_local_storage",
        "versionId": "1"
      },
      "param": [
        {
          "key": "keys",
          "value": {
            "type": 2,
            "listItem": [
              {
                "type": 3,
                "mapKey": [
                  {
                    "type": 1,
                    "string": "key"
                  },
                  {
                    "type": 1,
                    "string": "read"
                  },
                  {
                    "type": 1,
                    "string": "write"
                  }
                ],
                "mapValue": [
                  {
                    "type": 1,
                    "string": "clicktrail_attribution"
                  },
                  {
                    "type": 8,
                    "boolean": true
                  },
                  {
                    "type": 8,
                    "boolean": true
                  }
                ]
              }
            ]
          }
        }
      ]
    },
    "clientAnnotations": {
      "isEditedByUser": true
    },
    "isRequired": true
  },
  {
    "instance": {
      "key": {
        "publicId": "get_url",
        "versionId": "1"
      },
      "param": [
        {
          "key": "urlParts",
          "value": {
            "type": 1,
            "string": "any"
          }
        },
        {
          "key": "queriesAllowed",
          "value": {
            "type": 1,
            "string": "any"
          }
        }
      ]
    },
    "clientAnnotations": {
      "isEditedByUser": true
    },
    "isRequired": true
  },
  {
    "instance": {
      "key": {
        "publicId": "logging",
        "versionId": "1"
      },
      "param": [
        {
          "key": "environments",
          "value": {
            "type": 1,
            "string": "debug"
          }
        }
      ]
    },
    "isRequired": true
  }
]

___SANDBOXED_JS_FOR_WEB_TEMPLATE___

/*
 * ClickTrail Attribution Variable v1
 *
 * Captures current-touch attribution signals from the page URL (UTM
 * parameters plus ad click IDs), merges them into a first-touch /
 * last-touch pair following ClickTrail's deterministic merge rules, and
 * returns a structured attribution object for use in tags and triggers.
 *
 * First-touch state persists in a single localStorage key so the visitor's
 * original touch survives navigation. When GTM Consent Mode is active,
 * storage access is gated by consent automatically; failures are caught
 * and treated as "no stored state".
 *
 * This template intentionally does NOT reimplement channel classification.
 * Channel labels come from the ClickTrail engine (classifier_version is
 * stamped server-side) so classification rules never diverge.
 */

const getUrl = require('getUrl');
const getTimestampMillis = require('getTimestampMillis');
const localStorage = require('localStorage');
const log = require('logToConsole');
const JSON = require('JSON');
const Math = require('Math');
const parseUrl = require('parseUrl');

const STORAGE_KEY = 'clicktrail_attribution';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id'];
const CLICK_IDS = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid', 'twclid', 'li_fat_id', 'sccid', 'epik'];

/* --- read current URL signals ---------------------------------------- */
/* getUrl(component, stripWww, defaultPages, queryKey): with a queryKey the
 * 'query' component returns that single parameter's value. */
function pick(key) {
  let v;
  try {
    v = getUrl('query', false, null, key);
  } catch (e) {
    /* permission unavailable at runtime; treat as no signal */
    return undefined;
  }
  return typeof v === 'string' && v !== '' ? v : undefined;
}

function pad(n, width) {
  let s = '' + n;
  while (s.length < width) s = '0' + s;
  return s;
}

/* Date is not available in the sandbox: format getTimestampMillis() as
 * ISO-8601 UTC with milliseconds (civil-from-days, H. Hinnant). */
function nowIso() {
  const ms = getTimestampMillis();
  const days = Math.floor(ms / 86400000);
  let rest = ms - days * 86400000;
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = era * 400 + yoe + (month <= 2 ? 1 : 0);
  const hh = Math.floor(rest / 3600000);
  rest = rest - hh * 3600000;
  const mm = Math.floor(rest / 60000);
  rest = rest - mm * 60000;
  const ss = Math.floor(rest / 1000);
  const msPart = rest - ss * 1000;
  return (
    pad(year, 4) + '-' + pad(month, 2) + '-' + pad(day, 2) + 'T' +
    pad(hh, 2) + ':' + pad(mm, 2) + ':' + pad(ss, 2) + '.' + pad(msPart, 3) + 'Z'
  );
}

function bareHost(host) {
  const h = host.toLowerCase().split(':')[0];
  return h.indexOf('www.') === 0 ? h.substring(4) : h;
}

/* Internal when the referrer's hostname equals the page hostname (ignoring
 * scheme, path, port, case and a leading www.). Unparseable referrers are
 * not treated as an external signal. */
function hostMatchesReferrer(referrer) {
  if (!referrer) return true;
  let host = '';
  try {
    host = getUrl('host', true) || '';
  } catch (e) {
    return true;
  }
  const parsed = parseUrl(referrer);
  if (!host || !parsed || !parsed.hostname) return true;
  return bareHost(parsed.hostname) === bareHost(host);
}

const referrer =
  typeof data.referrerInput === 'string' && data.referrerInput ? data.referrerInput : undefined;

/* Query string and fragment are dropped before persisting: they can carry
 * personal data and the attribution parameters are stored separately. */
const landingPage = (function () {
  let href;
  try {
    href = getUrl('url');
  } catch (e) {
    return undefined;
  }
  return typeof href === 'string' ? href.split('#')[0].split('?')[0] : undefined;
})();

const utm = {};
let hasUtm = false;
for (let i = 0; i < UTM_KEYS.length; i++) {
  const k = UTM_KEYS[i];
  const v = pick(k);
  if (v !== undefined) {
    utm[k] = v;
    hasUtm = true;
  }
}

const clickIds = {};
let hasClickId = false;
for (let j = 0; j < CLICK_IDS.length; j++) {
  const c = CLICK_IDS[j];
  const cv = pick(c);
  if (cv !== undefined) {
    clickIds[c] = cv;
    hasClickId = true;
  }
}

/* A touch counts as an attribution signal when it carries UTMs, an ad click
 * ID, or an external referrer. Anything else is direct / continuation. */
const hasSignal = hasUtm || hasClickId || (!!referrer && !hostMatchesReferrer(referrer));

/* --- load persisted state -------------------------------------------- */
let stored = null;
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !parsed.length) stored = parsed;
  }
} catch (e) {
  /* consent withheld or corrupted value: start fresh */
}

function buildTouch() {
  return {
    source: utm['utm_source'],
    medium: utm['utm_medium'],
    campaign: utm['utm_campaign'],
    content: utm['utm_content'],
    term: utm['utm_term'],
    utm_id: utm['utm_id'],
    referrer: referrer,
    landing_page: landingPage,
    touch_timestamp: nowIso(),
    click_ids: hasClickId ? clickIds : undefined
  };
}

let first = stored && stored.first ? stored.first : null;
let last = stored && stored.last ? stored.last : null;

if (hasSignal) {
  /* Last touch always follows the newest signal. First touch is written
   * once and never overwritten within this major version (click-ID-aware
   * guard mirrors core merge law). */
  last = buildTouch();
  if (!first) first = buildTouch();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ first: first, last: last }));
  } catch (e) {
    /* storage write refused (e.g. consent denied); in-memory result only */
  }
} else if (!last) {
  last = buildTouch();
}

if (data.debug) {
  log('ClickTrail attribution:', { signal: hasSignal, first: first, last: last });
}

/* --- output ----------------------------------------------------------- */
function from(touch, key) {
  return touch && touch[key] !== undefined ? touch[key] : undefined;
}

return {
  /* flat convenience fields (current/last touch) */
  utm_source: from(last, 'source'),
  utm_medium: from(last, 'medium'),
  utm_campaign: from(last, 'campaign'),
  utm_content: from(last, 'content'),
  utm_term: from(last, 'term'),
  gclid: last && last.click_ids ? last.click_ids['gclid'] : undefined,
  gbraid: last && last.click_ids ? last.click_ids['gbraid'] : undefined,
  wbraid: last && last.click_ids ? last.click_ids['wbraid'] : undefined,
  fbclid: last && last.click_ids ? last.click_ids['fbclid'] : undefined,
  msclkid: last && last.click_ids ? last.click_ids['msclkid'] : undefined,
  initial_landing_page: from(first, 'landing_page'),
  initial_referrer: from(first, 'referrer'),
  first_touch_timestamp: from(first, 'touch_timestamp'),
  last_touch_timestamp: from(last, 'touch_timestamp'),
  /* full structured objects (ClickTrail engine parity) */
  first: first,
  last: last
};


___TESTS___

scenarios:
- name: UTM and click ID in the URL populate first and last touch
  code: |-
    mockPage('https://shop.example.com/landing?utm_source=google&utm_medium=cpc&utm_campaign=spring&gclid=abc123');
    const r = runCode({});
    assertThat(r.utm_source).isEqualTo('google');
    assertThat(r.utm_medium).isEqualTo('cpc');
    assertThat(r.utm_campaign).isEqualTo('spring');
    assertThat(r.gclid).isEqualTo('abc123');
    assertThat(r.last.click_ids.gclid).isEqualTo('abc123');
    assertThat(r.first.source).isEqualTo('google');
    assertThat(r.first_touch_timestamp).isEqualTo(NOW_ISO);
    assertThat(r.last_touch_timestamp).isEqualTo(NOW_ISO);
    const s = saved();
    assertThat(s.first.source).isEqualTo('google');
    assertThat(s.last.click_ids.gclid).isEqualTo('abc123');
- name: Landing page is kept without query string or fragment
  code: |-
    mockPage('https://shop.example.com/landing?utm_source=google&email=a%40b.com#section');
    const r = runCode({});
    assertThat(r.initial_landing_page).isEqualTo('https://shop.example.com/landing');
    assertThat(r.last.landing_page).isEqualTo('https://shop.example.com/landing');
    assertThat(saved().first.landing_page).isEqualTo('https://shop.example.com/landing');
    assertThat(store[KEY].indexOf('email')).isEqualTo(-1);
- name: No signal with stored state is a continuation
  code: |-
    store[KEY] = JSON.stringify({
      first: { source: 'newsletter', touch_timestamp: '2023-05-01T10:00:00.000Z' },
      last: { source: 'google', touch_timestamp: '2023-06-01T10:00:00.000Z' }
    });
    mockPage('https://shop.example.com/checkout');
    const r = runCode({ referrerInput: 'https://shop.example.com/cart' });
    assertThat(r.first.source).isEqualTo('newsletter');
    assertThat(r.utm_source).isEqualTo('google');
    assertThat(r.last_touch_timestamp).isEqualTo('2023-06-01T10:00:00.000Z');
    assertThat(writes).isEqualTo(0);
- name: No signal and nothing stored returns a direct baseline without persisting
  code: |-
    mockPage('https://shop.example.com/');
    const r = runCode({});
    assertThat(r.first).isEqualTo(null);
    assertThat(r.utm_source).isUndefined();
    assertThat(r.last.landing_page).isEqualTo('https://shop.example.com/');
    assertThat(r.last_touch_timestamp).isEqualTo(NOW_ISO);
    assertThat(writes).isEqualTo(0);
- name: External referrer counts as a signal
  code: |-
    mockPage('https://shop.example.com/post');
    const r = runCode({ referrerInput: 'https://news.example.org/article' });
    assertThat(r.initial_referrer).isEqualTo('https://news.example.org/article');
    assertThat(r.last.referrer).isEqualTo('https://news.example.org/article');
    assertThat(writes).isEqualTo(1);
- name: Referrer that only contains the page host as a substring is external
  code: |-
    mockPage('https://mysite.com/');
    assertThat(runCode({ referrerInput: 'https://x.com/?u=mysite.com' }).last.referrer).isEqualTo('https://x.com/?u=mysite.com');
    assertThat(runCode({ referrerInput: 'https://notmysite.com/' }).last.referrer).isEqualTo('https://notmysite.com/');
    assertThat(writes).isEqualTo(2);
- name: Same-host referrer is internal regardless of www, case, port and path
  code: |-
    mockPage('https://www.mysite.com/pricing');
    const r = runCode({ referrerInput: 'https://MySite.com:8443/blog/post?x=1' });
    assertThat(r.first).isEqualTo(null);
    assertThat(writes).isEqualTo(0);
- name: First touch is preserved and last touch follows the newest signal
  code: |-
    store[KEY] = JSON.stringify({
      first: { source: 'newsletter', touch_timestamp: '2023-05-01T10:00:00.000Z' },
      last: { source: 'newsletter', touch_timestamp: '2023-05-01T10:00:00.000Z' }
    });
    mockPage('https://shop.example.com/?utm_source=bing&msclkid=m1');
    const r = runCode({});
    assertThat(r.first.source).isEqualTo('newsletter');
    assertThat(r.first_touch_timestamp).isEqualTo('2023-05-01T10:00:00.000Z');
    assertThat(r.utm_source).isEqualTo('bing');
    assertThat(r.msclkid).isEqualTo('m1');
    assertThat(r.last_touch_timestamp).isEqualTo(NOW_ISO);
    const s = saved();
    assertThat(s.first.source).isEqualTo('newsletter');
    assertThat(s.last.source).isEqualTo('bing');
- name: Touch timestamp is an ISO-8601 UTC string with milliseconds
  code: |-
    mockPage('https://shop.example.com/');
    mock('getTimestampMillis', 0);
    assertThat(runCode({}).last_touch_timestamp).isEqualTo('1970-01-01T00:00:00.000Z');
    mock('getTimestampMillis', 951782400000);
    assertThat(runCode({}).last_touch_timestamp).isEqualTo('2000-02-29T00:00:00.000Z');
    mock('getTimestampMillis', 1735689599999);
    assertThat(runCode({}).last_touch_timestamp).isEqualTo('2024-12-31T23:59:59.999Z');
setup: |-
  const JSON = require('JSON');
  const parseUrl = require('parseUrl');

  const NOW = 1704067200123;
  const NOW_ISO = '2024-01-01T00:00:00.123Z';
  const KEY = 'clicktrail_attribution';
  const store = {};
  let writes = 0;

  mockObject('localStorage', {
    getItem: function (k) {
      return store[k];
    },
    setItem: function (k, v) {
      writes = writes + 1;
      store[k] = v;
    }
  });
  mock('getTimestampMillis', NOW);

  // Documented signature: getUrl(component, stripWww, defaultPages, queryKey).
  // Components are lowercase; anything else returns the full href.
  function mockPage(href) {
    mock('getUrl', function (component, stripWww, defaultPages, queryKey) {
      const u = parseUrl(href);
      if (component === 'query') {
        if (queryKey === undefined || queryKey === null) {
          return u.search ? u.search.substring(1) : '';
        }
        const v = u.searchParams[queryKey];
        return typeof v === 'object' && v ? v[0] : v;
      }
      if (component === 'host') {
        return stripWww && u.hostname.indexOf('www.') === 0 ? u.hostname.substring(4) : u.hostname;
      }
      if (component === 'path') return u.pathname;
      if (component === 'protocol') return u.protocol.substring(0, u.protocol.length - 1);
      if (component === 'port') return u.port;
      if (component === 'fragment') return u.hash ? u.hash.substring(1) : '';
      return u.href;
    });
  }

  function saved() {
    return store[KEY] ? JSON.parse(store[KEY]) : undefined;
  }


___NOTES___

Maintained by Vizuh OU as part of ClickTrail.
Repository: https://github.com/vizuh/clicktrail-gtm-attribution-variable
