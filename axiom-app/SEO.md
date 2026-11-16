# AXIOM search and discovery

## Public and private entry points

- `https://axiom.keystonelabs.site/` is the public, server-delivered product overview. Its physical file is `index.html` so Vercel's static index takes the correct precedence.
- `/app` serves `workspace.html`, the existing authenticated application. `/sign-in` serves `login.html`.
- Old `/index.html` workspace bookmarks redirect to `/app`. `/landing.html` and `/landing` redirect to `/`. Old login links retain their query parameters while redirecting to `/sign-in`.
- The existing `axiom-hsus.vercel.app` temporary redirects are preserved. HTTPS redirection and HSTS were already present on the custom domain.
- Public content has a self-referencing canonical, product-specific metadata, one H1, semantic H2/H3 sections, Organization/WebSite/SoftwareApplication JSON-LD and a 1200 × 630 social image. No ratings, prices or review counts are invented.
- Login and workspace pages intentionally have `noindex`; this is separate from authentication and database authorization. Do not remove authorization to make product pages crawlable.
- `robots.txt` permits crawling so robots can read those noindex directives. `sitemap.xml` lists only the canonical public homepage. Add future public content pages when they exist, not app tabs or sign-in URLs.

## Verification and indexing

Keep the Google HTML ownership verification file in the deployed root. It is a public ownership marker, not a private API credential. Do not delete it after verification.

The Search Console property for this setup is the URL prefix `https://axiom.keystonelabs.site/`. This does not establish ownership of all Keystone Labs subdomains. Submit `https://axiom.keystonelabs.site/sitemap.xml` in its Sitemaps report and inspect the homepage URL. Verification and submission do not guarantee indexing, rankings or a processing deadline.

After deployment, check:

1. `/` returns the public product HTML with HTTP 200 and no noindex header.
2. `/app` and `/sign-in` return the intended app/login HTML and noindex headers.
3. `/robots.txt`, `/sitemap.xml`, the favicon, social image and verification file return 200 with appropriate content.
4. Legacy links and login account-add query parameters reach the correct destinations.
5. Nonexistent pages return 404 rather than a public-page catch-all.

## Performance and mobile maintenance

The homepage no longer downloads the authenticated application's inline spreadsheet engine, application scripts or data client. Fonts do not block initial rendering; animation libraries and landing code are deferred. The product introduction is visible with JavaScript disabled or third-party CDNs unavailable. Small screens use the readable unpinned story. Reduced motion is respected, and the compass pauses while offscreen or the tab is hidden.

The 2172 × 724 PNG logo is retained as an original asset. App screens use an 864 × 288 lossless WebP derived from it, reducing the file from 342,943 to 42,396 bytes. Existing image alt text and dimensions are preserved. Social cards use PNG for broad sharing compatibility.

Run `node --test tests/seo.test.cjs` from this directory. Browser checks use Playwright and an installed Chrome via `node tests/seo-browser.cjs`; install Playwright in a development environment first. The browser check models the static index as well as explicit rewrites and tests public/no-JS access, third-party failure, sign-in redirects, 360/390/768/1440 pixel widths, and current authenticated navigation with stubbed data.

Lighthouse results are lab diagnostics, not field Core Web Vitals. Check real-user LCP, INP and CLS in Search Console/PageSpeed once sufficient traffic is available. Never report a Lighthouse score as proof that all real-user Core Web Vitals pass.

References: [Google canonicals](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), [sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals), [ownership verification](https://support.google.com/webmasters/answer/9008080).
