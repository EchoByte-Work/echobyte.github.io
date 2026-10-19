# Echo Byte contact form Worker

This Worker sends contact form submissions to `info@echobyte.co.za` through Resend. The Resend API key is only read from the Worker secret `RESEND_API_KEY`; never put it in the website repository.

## Deploy

Prerequisites: access to the Cloudflare account managing `echobyte.co.za`, and Wrangler installed/authenticated locally.

1. In Resend, confirm `echobyte.co.za` is verified for sending.
2. From this directory, authenticate Wrangler if needed: `npx wrangler login`.
3. Add the API key as a secret (paste it into the secure terminal prompt; do not commit it):
   `npx wrangler secret put RESEND_API_KEY`
4. Deploy: `npx wrangler deploy`.
5. In Cloudflare, confirm the Worker route `echobyte.co.za/api/contact*` is attached to this Worker. If Wrangler reports the route/zone cannot be configured, add the route manually in **Workers & Pages → echobyte-contact → Settings → Domains & Routes**. Do not route the entire site to this Worker.
6. Verify the contact page is deployed and test a real submission. Confirm receipt at `info@echobyte.co.za`, then check Worker logs and Resend logs if it fails.

The Worker uses a Cloudflare Rate Limiting binding (5 requests per IP per 60 seconds, per Cloudflare location), validates fields server-side, rejects non-JSON and oversized requests, checks the request Origin, and includes a honeypot. The rate limiter is regional rather than a globally exact counter; consider Cloudflare managed bot protection/Turnstile if abuse becomes a problem.

## Test checklist

- Valid form sends one email to `info@echobyte.co.za`; reply goes to the visitor's validated email.
- Missing/invalid name, email, service, or message is rejected.
- A sixth rapid request from the same IP is rate limited.
- A request with a filled honeypot is accepted without sending an email.
- The UI displays success only on HTTP 200 and gives a useful error on failure.
- Check spam/quarantine as well as inbox.

## Security notes

- Never log submitted message bodies or the Resend API key.
- The sender is `website@echobyte.co.za`, on the verified domain. Do not set the visitor's address as the From address; it is used only as Reply-To.
- The contact endpoint is not an authenticated endpoint; the rate limit and honeypot are anti-abuse controls, not proof that a human submitted the form.
