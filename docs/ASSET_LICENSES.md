# Asset Licenses

Images used in the UrbanNest frontend, sourced from Unsplash and hotlinked
via Unsplash's CDN (`images.unsplash.com`) rather than vendored into the
repo — this matches how Unsplash's own API guidelines expect images to be
served, and keeps the repo free of binary image weight.

| Image | Source | Source URL | License | Author | Usage |
|---|---|---|---|---|---|
| Hero / auth panel background | Unsplash | https://unsplash.com/photos/concert-crowd-with-hands-raised-under-stage-lights-oqT3wEEu3ds | [Unsplash License](https://unsplash.com/license) (free for commercial & non-commercial use, no permission needed) | Joshua Hoehne (@joshua_hoehne) | Reused in three places under the same license: full-bleed background on the Events (home) page hero, and the photo side-panel on the login/register/verify-email pages — all under a dark gradient overlay for text legibility. Attribution is not legally required by the Unsplash License but is credited in-app (a small credit line) on every page it appears. |

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
