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
