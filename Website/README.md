# Beyond the Finish Line — website developer guide

The site markets Bradley Emerson’s stewardship performance platform, with his practice, books, talks and work journal. Geist and Allura are unchanged. No pricing is displayed.

## Run locally

Requires Node.js; no package installation is needed.

```
node build.mjs
node preview.mjs
```

Open http://127.0.0.1:8780/. The local preview simulates the owner account and saves test uploads under ignored `.local-data/`. It never uses the production bucket or sends emails. Restart the preview after rebuilding server or HTML changes.

Edit `public/index.html` and the styles/scripts in `public/`. `experience.css` and `experience.js` contain the latest glass navigation, responsive name fitting, scroll effects, photo journal, video viewer and enquiry form. The older styles remain the visual foundation. `server/worker.mjs` handles the protected gallery and email endpoint; `server/studio.html` is the studio page. `build.mjs` copies public assets to `dist/client`, embeds the home/studio HTML in `dist/server/index.js`, and writes hosting metadata. Do not edit generated `dist` directly.

## Gallery updates

Open `/studio` while signed into the Site with the owner account. Use **New programme** to add a title, description, host/organisation, optional programme date, and photographs. Save as Draft to prepare privately, Published to display on the website, or Archived to hide. Select an existing programme to change its details or add more photos. Supports JPG, PNG and WebP, up to 12 photos per upload, 10 MB each and 40 MB per update. Multiple programmes appear in the work journal selector and archive.

Production uses the Sites-managed R2 `BUCKET`. Each programme is a JSON object under `posts/`; image bytes are under `media/<programme-id>/`. No browser storage is used for published content. The original supplied Inner Game programme is an initial built-in record and may be edited/archived in the studio. Production uploads persist independently of subsequent source deployments. Local QA uploads are not packaged or uploaded.

Owner authorization is checked on the server against `GALLERY_ADMIN_EMAIL` and the platform’s authenticated user header. Studio sign-in uses the Sites-owned `/signin-with-chatgpt` flow. No separate password is created. Draft/archived uploaded media are unavailable to non-owners. Current Site sharing stays owner-private; changing it later does not make studio writes public. The studio owner is the current Site owner account configured in Sites environment settings.

## Contact form and email

Recipient: `bradley@thebusinessathletes.com`.

Without an email provider, the form validates the enquiry and opens a populated draft in the visitor’s email application. It clearly says **Prepare email enquiry**, and never claims delivery. The visitor must press Send in their email application.

Direct server delivery is implemented for Resend and requires these production runtime values in Sites:

- `RESEND_API_KEY` — secret; configure through Sites environment settings, never public JavaScript or source files.
- `CONTACT_FROM` — a sender address on a domain verified in the Resend account, e.g. `BTFL Website <website@your-verified-domain>`.
- `GALLERY_ADMIN_EMAIL` — existing owner account; already configured.

Deploy a new version after changing runtime values. With both email values available, the form switches to **Send enquiry**. `/api/contact` sends to the fixed Bradley address and uses the visitor’s email as Reply-To. It validates input, rejects cross-origin submissions, includes a honeypot and applies a one-minute per-sender throttle. Delivery failures retain the form and offer the email-draft alternative. Email routing was tested with a mocked provider; no live test message has been sent. Provider connection and an actual delivery test remain necessary before claiming direct email delivery is live.

## Platform and media

Four distinct screen frames are reserved for Work, Reflect, Review and Grow. The owner will add approved screenshots later; see Reserved platform screens below. This marketing website does not authenticate visitors into the separate platform applications or configure their AI connection.

The four supplied YouTube URLs are embedded only after a visitor presses Play, using youtube-nocookie.com. A direct YouTube link remains available for each video if embedding is restricted.

The name fits its available width after fonts load and on resize. Portrait/name scroll depth and book effects honour reduced motion. The photo reel moves downward, pauses on hover/focus and while off-screen, and becomes a manual scroll area under reduced motion. The signature-style loader remains once per browser session; the removed hero signature and old pause controls remain removed.

## Checks and publishing

```
node build.mjs
node check-site.mjs
node test-worker.mjs
```

Backend checks cover owner access, cross-origin rejection, file validation, draft media privacy, publish/archive transitions and mocked email routing. The website was also checked in the browser for gallery uploads, reload persistence, platform switching, image expansion and responsive layout.

Keep the existing `.openai/hosting.json` project ID. It now declares `r2: "BUCKET"`; it is a Worker site, not a static-only deployment. Use the Sites workflow to push and package the exact source before publication. Preserve the current audience. Never copy `.env` or `.local-data` into deployment output.

`CONTENT-SOURCES.md` records source provenance. One-time authoring scripts are retained for history and must not be rerun on the completed page.


### Reserved platform screens
The public Work, Reflect, Review and Grow tabs intentionally show empty screen frames until the owner supplies approved screenshots. Put new files in public/assets and replace the four null entries in platformScreens in public/app.js with their asset paths, in that order. Each populated slot displays its image and enables the existing expand viewer; unfilled slots remain reserved. Run node build.mjs before publishing. The older demo screenshot assets are retained but no longer displayed.

## Updating testimonials

Edit the testimonial entries at the top of `public/testimonials.js`. Each has `quote`, `name`, `role`, `label`, optional `source`, and `sample`. Three entries are intentionally fictional placeholders and display a SAMPLE badge and a placeholder note. Replace them with approved client content before changing `sample` to `false`. The existing Ashani Jayasinghe quote remains attributed and linked to its source. Run `node build.mjs` after editing.

The cards move continuously, pause on hover/focus or via Pause movement, and stop while off-screen. Reduced-motion users receive a manually scrollable row. The repeated cards are hidden from assistive technology.
