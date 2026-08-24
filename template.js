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
const localStorage = require('localStorage');
const log = require('logToConsole');
const JSON = require('JSON');

const STORAGE_KEY = 'clicktrail_attribution';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id'];
const CLICK_IDS = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid', 'twclid', 'li_fat_id', 'sccid', 'epik'];

/* --- read current URL signals ---------------------------------------- */
let query = {};
try {
  query = getUrl('QUERY', undefined, UTM_KEYS.concat(CLICK_IDS)) || {};
} catch (e) {
  /* permission unavailable at runtime; treat as no signals */
}

function pick(key) {
  const v = query[key];
  return v === undefined || v === '' ? undefined : v;
}

function nowIso() {
  return new Date().toISOString();
}

function hostMatchesReferrer(referrer) {
  if (!referrer) return true;
  let host = '';
  try {
    host = getUrl('HOST') || '';
  } catch (e) {
    return true;
  }
  return referrer.indexOf(host) >= 0;
}

const referrer =
  typeof data.referrerInput === 'string' && data.referrerInput ? data.referrerInput : undefined;

const landingPage = (function () {
  try {
    return getUrl('URL');
  } catch (e) {
    return undefined;
  }
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
