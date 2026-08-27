# clicktrail-gtm-attribution-variable

[ClickTrail](https://wordpress.org/plugins/click-trail-handler/) Attribution
Variable for Google Tag Manager. This is a [Community Template Gallery][gallery]
submission.

**Expose observed acquisition context inside GTM.**

The variable reads the current page URL plus persisted first-touch and
last-touch state, then returns a structured object. It does not decide which
campaign caused a conversion, send events, or configure destination tags.

```js
{
  utm_source, utm_medium, utm_campaign, utm_content, utm_term,
  gclid, gbraid, wbraid, fbclid, msclkid,
  initial_landing_page, initial_referrer,
  first_touch_timestamp, last_touch_timestamp,
  first: { source, medium, campaign, content, term, utm_id, referrer,
           landing_page, touch_timestamp, click_ids },
  last:  { ...same shape }
}
```

Captured ad click IDs: `gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`,
`ttclid`, `twclid`, `li_fat_id`, `sccid`, `epik`.

[gallery]: https://developers.google.com/tag-platform/tag-manager/templates/gallery

## Merge rules (deterministic)

- A URL counts as an attribution signal when it carries UTM parameters, an ad
  click ID, or an external referrer.
- **Last touch** always follows the newest signal.
- **First touch** is written once and never overwritten within this major
  version (the click-ID-aware guard mirrors ClickTrail's core merge law).
- Direct visits keep stored state; with nothing stored they become a direct
  entry baseline.

State persists in one localStorage key (`clicktrail_attribution`). When GTM
Consent Mode is active, storage access is gated by consent automatically;
refused reads/writes degrade to in-memory results.

Channel classification (paid search vs organic social vs …) is intentionally
**not** reimplemented here. Channel labels come from the ClickTrail engine,
stamped with `classifier_version`, so rules never diverge between surfaces.

## Parameters

| Parameter | Required | Notes |
|---|---|---|
| Current Referrer | recommended | Map the built-in `{{Referrer}}` variable |
| Debug logging | no | Console output during preview/debug |

## Use with the event tag

Pair with [`clicktrail-gtm-event-tag`](https://github.com/vizuh/clicktrail-gtm-event-tag):
set its *Attribution Object* parameter to `{{ClickTrail Attribution}}`.

## Install & submit

1. In Google Tag Manager: **Templates → Variable Templates → New → ⋮ → Import**
   → select `template.tpl`.
2. Create a variable from *ClickTrail Attribution* and reference it in tags,
   triggers, or other variables.

### Gallery submission checklist

- [ ] `template.tpl`, `metadata.yaml`, Apache-2.0 `LICENSE` at repo root, `main` branch
- [ ] GitHub Issues enabled on the repository
- [ ] Replace the placeholder `sha` in `metadata.yaml` with the release commit SHA (`git rev-parse HEAD`)
- [ ] Import into GTM, add template unit tests, then submit via the [Community Template Gallery form][form]

[form]: https://developers.google.com/tag-platform/tag-manager/templates/gallery#submit

## Consent

The variable follows the consent state supplied by the site's CMP via GTM
Consent Mode (`setDefaultConsentState` / `updateConsentState`). It renders no
consent UI; ClickTrail is not a Consent Management Platform.

## Repository structure

Follows the [Stape GTM standards](https://github.com/stape-io/gtm-standards)
(GTMS-4/5): the readable template code lives in [`template.js`](template.js)
and is mirrored inside `template.tpl`; `tests.yaml` mirrors the `___TESTS___`
section. Keep both files in sync on every change.

## License

Apache License 2.0; see [LICENSE](LICENSE).

### GTM Gallery Status
⚪ Not listed yet
