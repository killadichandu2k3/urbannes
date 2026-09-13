# Asset Licenses

Images used in the UrbanNes frontend, sourced from Unsplash and hotlinked
via Unsplash's CDN (`images.unsplash.com`) rather than vendored into the
repo — this matches how Unsplash's own API guidelines expect images to be
served, and keeps the repo free of binary image weight.

| Image | Source | Source URL | License | Author | Usage |
|---|---|---|---|---|---|
| Hero / auth panel background | Unsplash | https://unsplash.com/photos/concert-crowd-with-hands-raised-under-stage-lights-oqT3wEEu3ds | [Unsplash License](https://unsplash.com/license) (free for commercial & non-commercial use, no permission needed) | Joshua Hoehne (@joshua_hoehne) | Reused in four places under the same license: full-bleed background on the public landing page hero, the Events (home) page hero, and the photo side-panel on the login/register/verify-email pages — all under a dark gradient overlay for text legibility. Attribution is not legally required by the Unsplash License but is credited in-app (a small credit line) on every page it appears. |
| Brand icons (payment marks, app-store badges, social marks) | [Simple Icons](https://simpleicons.org) | https://github.com/simple-icons/simple-icons | [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) (public domain — no attribution required) | Simple Icons contributors | SVGs vendored directly into `frontend/src/assets/brand-icons/` (Razorpay, Visa, Mastercard, American Express, Google Pay, Paytm, App Store, Google Play, Instagram, Facebook, X, WhatsApp) and rendered inline via `<app-brand-icon>` on the landing page (payment trust row, footer social/app links). Each mark is trademarked by its respective owner; Simple Icons' CC0 grant covers the icon artwork itself, not the underlying trademark — these are used descriptively (e.g. "we accept Visa," "download on the App Store"), not as an endorsement claim. |

## Notes

- The Unsplash License permits broad commercial use, but it does not grant
  rights to any trademarks, logos, or identifiable people/property that may
  appear *within* a photo — this image is a silhouette/crowd shot with no
  identifiable individuals or brand marks, so no additional rights were
  needed.
- Images are requested at responsive widths via Unsplash's URL-based
  image API (`?w=`, `?q=`, `?auto=format`) rather than a single fixed
  asset — this is Unsplash's built-in CDN resizing, not a separate build
  step.
- If a future change bundles this (or any other) image directly into the
  repo instead of hotlinking, add its local filename to this table and
  keep the same source/license/author fields.
