// AXIOM security alerts -> email.
// Deploy:  supabase functions deploy send-alert --project-ref adqvtmnvyzkusswbwqdr
// Secrets (see SETUP.md "Email alerts"):
//   GMAIL_USER, GMAIL_APP_PASSWORD, ALERT_WEBHOOK_SECRET, [ALERT_RECIPIENTS]
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const RECIPIENTS = (Deno.env.get("ALERT_RECIPIENTS") ?? "ahnaf7624@gmail.com,ahnaf7625@gmail.com,zamankips@gmail.com")
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
  new Date().toLocaleString("en-GB", { timeZone: "Asia/Karachi", dateStyle: "long", timeStyle: "medium" }) + " PKT";

function device(ua: string) {
  const b = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome"
    : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Unknown browser";
  const o = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS"
    : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return o ? `${b} on ${o}` : b;
}

// ------------------------------------------------------------------ design
const ACCENTS = {
  critical: { color: "#8f2d2d", tint: "#fbf3f2", label: "Critical change" },
  login:    { color: "#1f4b82", tint: "#f2f6fb", label: "Sign-in notice" },
  file:     { color: "#1d6a5f", tint: "#f1f8f6", label: "File activity" },
};
type Kind = keyof typeof ACCENTS;
type Block = { heading: string; lines: string[] };
const SANS = "'Segoe UI',Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

function layout(o: { kind: Kind; title: string; lead: string; rows: [string, unknown][]; blocks?: Block[]; preheader: string }) {
  const a = ACCENTS[o.kind];
  const rows = o.rows.filter(([, v]) => v !== undefined && v !== null && v !== "");
  const rowsHtml = rows.map(([k, v], i) => {
    const line = i === rows.length - 1 ? "" : "border-bottom:1px solid #e9edf2;";
    return `<tr>
      <td width="32%" style="padding:13px 16px 13px 0;${line}font:600 11px ${SANS};letter-spacing:.09em;text-transform:uppercase;color:#7b8696;vertical-align:top">${esc(k)}</td>
      <td style="padding:13px 0;${line}font:400 15px/1.5 ${SANS};color:#1b2533;vertical-align:top">${esc(v)}</td></tr>`;
  }).join("");
  const blocksHtml = (o.blocks ?? []).filter((b) => b.lines.length).map((b) => `
    <p style="margin:30px 0 10px;font:600 11px ${SANS};letter-spacing:.09em;text-transform:uppercase;color:#7b8696">${esc(b.heading)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="background:${a.tint};border-left:3px solid ${a.color};padding:14px 18px;border-radius:0 6px 6px 0">
        ${b.lines.map((l) => `<div style="font:400 14px/1.6 ${SANS};color:#27323f;padding:2px 0">${esc(l)}</div>`).join("")}
      </td></tr></table>`).join("");

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><title>${esc(o.title)}</title></head>
<body style="margin:0;padding:0;background:#eef1f5">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#eef1f5">${esc(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5"><tr><td align="center" style="padding:36px 12px">
 <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 14px rgba(20,35,60,.10)">
  <tr><td style="background:#0f1b2d;padding:24px 36px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font:700 19px ${SANS};letter-spacing:.34em;color:#ffffff">AXIOM</td>
      <td align="right" style="font:400 11px ${SANS};letter-spacing:.14em;text-transform:uppercase;color:#8fa3bf">Security Notification</td>
    </tr></table></td></tr>
  <tr><td style="background:${a.color};height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>
  <tr><td style="padding:38px 36px 34px">
    <span style="display:inline-block;background:${a.tint};color:${a.color};border:1px solid ${a.color}33;border-radius:20px;padding:5px 13px;font:600 11px ${SANS};letter-spacing:.1em;text-transform:uppercase">${esc(a.label)}</span>
    <h1 style="margin:18px 0 12px;font:400 27px/1.25 ${SERIF};color:#101a2a">${esc(o.title)}</h1>
    <p style="margin:0 0 26px;font:400 15px/1.65 ${SANS};color:#4b5767">${esc(o.lead)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e9edf2">${rowsHtml}</table>
    ${blocksHtml}
  </td></tr>
  <tr><td style="background:#f6f8fa;border-top:1px solid #e9edf2;padding:22px 36px">
    <p style="margin:0 0 6px;font:400 12.5px/1.6 ${SANS};color:#6a7686">This is an automated security notification from AXIOM. If this activity is unexpected, we recommend reviewing it promptly and changing the affected account's password.</p>
    <p style="margin:0;font:400 12px ${SANS};color:#98a2b0">Sent to the AXIOM administrators &nbsp;·&nbsp; Please do not reply to this message</p>
  </td></tr>
 </table>
</td></tr></table></body></html>`;

  const text = [`AXIOM — ${a.label}`, "", o.title, o.lead, "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(o.blocks ?? []).flatMap((b) => ["", b.heading.toUpperCase(), ...b.lines.map((l) => `  - ${l}`)]),
    "", "This is an automated security notification from AXIOM. If this activity is unexpected, please review it promptly."].join("\n");
  return { html, text };
}

async function sendMail(subject: string, mail: { html: string; text: string }) {
  const user = Deno.env.get("GMAIL_USER")!;
  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com", port: 465, tls: true,
      auth: { username: user, password: Deno.env.get("GMAIL_APP_PASSWORD")! },
    },
  });
  try {
    await client.send({ from: `AXIOM Security <${user}>`, to: RECIPIENTS, subject, content: mail.text, html: mail.html });
  } finally {
    await client.close();
  }
}

// Turn the trigger's details object into readable blocks (no raw JSON).
const HEADINGS: Record<string, string> = {
  changes: "What changed", sections: "Sections affected", students: "Students affected", assignments: "Assignments",
  removed: "Removed", subjects: "Subjects", profiles: "Users affected", count: "Number of records",
};
const LIST_BY_COMMA = new Set(["sections", "students", "profiles"]);
function detailBlocks(details: Record<string, unknown> | undefined): Block[] {
  return Object.entries(details ?? {}).map(([k, v]) => {
    const s = String(v ?? "");
    const parts = s.includes("\n") ? s.split("\n") : LIST_BY_COMMA.has(k) ? s.split(", ") : [s];
    return { heading: HEADINGS[k] ?? k, lines: parts.map((p) => p.trim().replace(/ -> /g, "  →  ")).filter(Boolean) };
  });
}

// ------------------------------------------------------------------ handler
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
      const mail = layout({
        kind: "critical",
        title: String(body.event ?? "Database change"),
        lead: "An important change was made to the AXIOM database. The details are below for your records.",
        rows: [
          ["Summary", body.summary],
          ["Performed by", body.actor ?? "Direct database access"],
          ["Date & time", nowPK()],
        ],
        blocks: detailBlocks(body.details),
        preheader: `${body.event}: ${body.summary}`,
      });
      await sendMail(`AXIOM · Critical change: ${body.event}`, mail);
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
    const role = profile?.role ? String(profile.role).charAt(0).toUpperCase() + String(profile.role).slice(1) : "";

    if (body.type === "login") {
      await sendMail(`AXIOM · Sign-in: ${user.email}`, layout({
        kind: "login",
        title: "A user signed in to AXIOM",
        lead: "A successful sign-in was just recorded. If you recognise this activity, no action is needed.",
        rows: [["Account", user.email], ["Name", profile?.full_name], ["Role", role],
          ["Date & time", nowPK()], ["IP address", ip], ["Device", device(ua)]],
        preheader: `${user.email} signed in to AXIOM`,
      }));
    } else if (body.type === "file_upload" || body.type === "file_delete") {
      const added = body.type === "file_upload";
      const name = String(body.fileName ?? "");
      await sendMail(`AXIOM · File ${added ? "added" : "deleted"}: ${name.slice(0, 80)}`, layout({
        kind: "file",
        title: added ? "A file was added to cloud storage" : "A file was deleted from cloud storage",
        lead: added
          ? "A roster file was uploaded to AXIOM cloud storage. If a file with the same name existed, it has been replaced."
          : "A roster file was permanently removed from AXIOM cloud storage.",
        rows: [["File name", name], ["Size", body.size ? `${(body.size / 1024).toFixed(1)} KB` : ""],
          ["Performed by", user.email], ["Name", profile?.full_name], ["Role", role],
          ["Date & time", nowPK()], ["IP address", ip]],
        preheader: `${name} was ${added ? "added" : "deleted"} by ${user.email}`,
      }));
    } else {
      return json({ error: "bad type" }, 400);
    }
    return json({ ok: true });
  } catch (e) {
    console.error("send-alert failed:", e);
    return json({ error: "send failed" }, 500);
  }
});
