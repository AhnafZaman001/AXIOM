// AXIOM security alerts -> email.
// Deploy:  supabase functions deploy send-alert --project-ref adqvtmnvyzkusswbwqdr
// Secrets (see SETUP.md "Email alerts"):
//   GMAIL_USER, GMAIL_APP_PASSWORD, ALERT_WEBHOOK_SECRET, [ALERT_RECIPIENTS]
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const RECIPIENTS = (Deno.env.get("ALERT_RECIPIENTS") ?? "ahnaf7624@gmail.com,zamankips@gmail.com")
  .split(",").map((s) => s.trim()).filter(Boolean);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const nowPK = () =>
  new Date().toLocaleString("en-GB", { timeZone: "Asia/Karachi", dateStyle: "medium", timeStyle: "medium" }) + " (PKT)";

function table(rows: [string, unknown][]) {
  return `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">` +
    rows.filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) =>
      `<tr><td style="padding:6px 14px 6px 0;color:#555;vertical-align:top"><b>${esc(k)}</b></td>` +
      `<td style="padding:6px 0;white-space:pre-wrap">${esc(v)}</td></tr>`).join("") + `</table>`;
}

async function sendMail(subject: string, html: string) {
  const user = Deno.env.get("GMAIL_USER")!;
  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com", port: 465, tls: true,
      auth: { username: user, password: Deno.env.get("GMAIL_APP_PASSWORD")! },
    },
  });
  try {
    await client.send({ from: `AXIOM Alerts <${user}>`, to: RECIPIENTS, subject, content: "auto", html });
  } finally {
    await client.close();
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const ua = req.headers.get("user-agent") ?? "";

  try {
    // ---- 1. Trusted call from a database trigger -------------------------
    const secret = Deno.env.get("ALERT_WEBHOOK_SECRET");
    if (secret && req.headers.get("x-alert-secret") === secret) {
      if (body.type !== "db_change") return json({ error: "bad type" }, 400);
      await sendMail(
        `🚨 AXIOM critical change: ${body.event}`,
        `<h2 style="font-family:Arial">Critical database change</h2>` +
        table([
          ["What", body.event], ["Summary", body.summary], ["Done by", body.actor ?? "unknown / direct database access"],
          ["When", nowPK()], ["Details", JSON.stringify(body.details ?? {}, null, 2)],
        ]),
      );
      return json({ ok: true });
    }

    // ---- 2. Browser call: identify the user from their Supabase JWT ------
    const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "unauthorized" }, 401);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error } = await sb.auth.getUser(jwt);
    if (error || !user) return json({ error: "unauthorized" }, 401);

    // Role/name come from the DB, never from the client.
    const { data: profile } = await sb.from("profiles").select("full_name, role")
      .eq("id", user.id).maybeSingle().then((r) => r, () => ({ data: null }));

    const who: [string, unknown][] = [
      ["Login email", user.email], ["Name", profile?.full_name], ["Role", profile?.role],
    ];

    if (body.type === "login") {
      await sendMail(`🔐 AXIOM login: ${user.email}`,
        `<h2 style="font-family:Arial">User logged in</h2>` +
        table([...who, ["When", nowPK()], ["IP address", ip], ["Device / browser", ua]]));
    } else if (body.type === "file_upload" || body.type === "file_delete") {
      const added = body.type === "file_upload";
      await sendMail(`📁 AXIOM file ${added ? "added" : "deleted"}: ${String(body.fileName ?? "").slice(0, 80)}`,
        `<h2 style="font-family:Arial">File ${added ? "added / replaced" : "deleted"} in cloud storage</h2>` +
        table([["File", body.fileName], ["Size", body.size ? `${(body.size / 1024).toFixed(1)} KB` : ""],
          ...who, ["When", nowPK()], ["IP address", ip]]));
    } else {
      return json({ error: "bad type" }, 400);
    }
    return json({ ok: true });
  } catch (e) {
    console.error("send-alert failed:", e);
    return json({ error: "send failed" }, 500);
  }
});
