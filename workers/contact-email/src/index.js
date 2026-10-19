const ALLOWED_ORIGIN = "https://echobyte.co.za";
const ALLOWED_SERVICES = new Set([
  "",
  "PC Build & Upgrade",
  "Software Development",
  "Web Design & Development",
  "IT Support & Maintenance",
  "Something else",
]);

function json(data, status, origin = ALLOWED_ORIGIN) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": origin,
      "Vary": "Origin",
    },
  });
}

function clean(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    if (origin !== ALLOWED_ORIGIN) {
      return json({ error: "This origin is not allowed." }, 403);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
          "Vary": "Origin",
        },
      });
    }

    if (new URL(request.url).pathname !== "/api/contact") {
      return json({ error: "Not found." }, 404);
    }
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed." }), {
        status: 405,
        headers: { "Content-Type": "application/json; charset=utf-8", "Allow": "POST, OPTIONS" },
      });
    }

    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return json({ error: "Please submit the form using the website." }, 415);
    }

    const contentLength = Number(request.headers.get("Content-Length") || "0");
    if (contentLength > 12_000) {
      return json({ error: "Your message is too large. Please shorten it and try again." }, 413);
    }

    const ip = request.headers.get("CF-Connecting-IP");
    if (!ip) return json({ error: "We couldn't verify this request. Please try again." }, 400);

    // Cloudflare's regional rate-limit binding is deliberately enforced before parsing/sending.
    const rate = await env.CONTACT_LIMITER.limit({ key: ip });
    if (!rate.success) {
      return json({ error: "Too many attempts. Please wait a minute before trying again." }, 429);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "The form data wasn't valid. Please refresh and try again." }, 400);
    }

    // Honeypot: silently accept bots without sending email.
    if (clean(body.website, 200)) {
      return json({ ok: true }, 200);
    }

    const name = clean(body.name, 100);
    const email = clean(body.email, 254);
    const service = clean(body.service, 80);
    const message = clean(body.message, 5000);

    const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
    if (!name || name.length < 2) {
      return json({ error: "Please enter your name (at least 2 characters)." }, 400);
    }
    if (!emailPattern.test(email)) {
      return json({ error: "Please enter a valid email address." }, 400);
    }
    if (!ALLOWED_SERVICES.has(service)) {
      return json({ error: "Please choose a valid service." }, 400);
    }
    if (!message || message.length < 5) {
      return json({ error: "Please enter a message of at least 5 characters." }, 400);
    }

    if (!env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not configured.");
      return json({ error: "Our email service is temporarily unavailable. Please email info@echobyte.co.za directly." }, 503);
    }

    const textBody = [
      "New contact form submission — Echo Byte",
      "",
      "Name: " + name,
      "Email: " + email,
      "Service: " + (service || "Not specified"),
      "",
      "Message:",
      message,
    ].join("\n");

    let resendResponse;
    try {
      resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + env.RESEND_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Echo Byte Website <website@echobyte.co.za>",
          to: ["info@echobyte.co.za"],
          reply_to: email,
          subject: "Website enquiry from " + name,
          text: textBody,
        }),
      });
    } catch (error) {
      console.error("Resend request failed:", error instanceof Error ? error.message : "unknown error");
      return json({ error: "We couldn't send your message right now. Please try again or email info@echobyte.co.za." }, 502);
    }

    if (!resendResponse.ok) {
      const status = resendResponse.status;
      // Log only status, never the request body, email contents, or API key.
      console.error("Resend rejected contact email. HTTP status:", status);
      return json({ error: "We couldn't send your message right now. Please try again or email info@echobyte.co.za." }, 502);
    }

    return json({ ok: true }, 200);
  },
};
