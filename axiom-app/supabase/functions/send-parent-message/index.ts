// AXIOM -> WhatsApp messages to parents (official WhatsApp Cloud API).
//
// Who may call it : signed-in principal / coordinator only (checked here).
// Admin number    : read from the app_settings table ('admin_whatsapp'); it is
//                   never stored as a parent contact and never in the repo.
// TEST MODE       : app_settings 'wa_test_mode' = 'on' (default). Nothing goes
//                   to parents; every message goes ONLY to the admin number,
//                   labelled with the parent it was meant for.
// LIVE MODE       : 'wa_test_mode' = 'off'. Each message goes to the parent's
//                   number AND a copy goes to the admin number.
//
// Secrets: WA_PHONE_NUMBER_ID, WA_ACCESS_TOKEN
//          optional: WA_TEMPLATE_NAME, WA_TEMPLATE_LANG (use a template when the
//          24-hour customer-service window is not open; see SETUP.md)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const GRAPH = `https://graph.facebook.com/${Deno.env.get("WA_GRAPH_VERSION") || "v23.0"}`;
class RejectedMessage extends Error {}
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 0300 1234567 / 300 1234567 / +92 300 1234567 / 0092... -> 923001234567
function digits(raw: unknown): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = "92" + d.slice(1);
  else if (d.length === 10 && d.startsWith("3")) d = "92" + d;
  return d.length >= 11 && d.length <= 15 ? d : null;
}
// Template parameters may not contain newlines or long runs of spaces.
const flat = (t: string) => t.replace(/\s*\n+\s*/g, " | ").replace(/ {4,}/g, "   ").slice(0, 1000);

// A persisted queue survives closing the browser; cron resumes queued work.
async function drainQueue(db: any) {
  const until = Date.now() + 45000;
  while (Date.now() < until) {
    const { data, error } = await db.rpc("claim_message_job");
    if (error) throw error;
    const job = data?.[0];
    if (!job) return;
    let status = "accepted", detail: string | null = null;
    try {
      const {data: settings, error: settingsError} = await db.from("app_settings").select("key,value");
      if(settingsError) throw new RejectedMessage("Messaging settings unavailable; no request sent.");
      const cfg=Object.fromEntries((settings||[]).map((r:any)=>[r.key,r.value]));
      if(job.kind==='parent' && (cfg.wa_test_mode!=='off' || !Deno.env.get("WA_TEMPLATE_NAME"))) throw new RejectedMessage("Parent send blocked: test mode is enabled or the approved template is missing.");
      detail = await sendWhatsApp(job.recipient, job.body);
    }
    catch (e) { status = e instanceof RejectedMessage ? "failed" : "uncertain"; detail = String((e as Error).message ?? e).slice(0, 300); }
    // A network failure may happen after Meta accepted the request. Do not retry blindly.
    const { error: saved } = await db.from("message_jobs").update({ status, detail, updated_at: new Date().toISOString() }).eq("id", job.id);
    if (saved) throw saved;
    await sleep(job.kind === "parent" ? 250 : 7000);
  }
}

async function sendWhatsApp(to: string, text: string): Promise<string | null> {
  const id = Deno.env.get("WA_PHONE_NUMBER_ID"), token = Deno.env.get("WA_ACCESS_TOKEN");
  if (!id || !token) throw new RejectedMessage("WhatsApp is not configured yet (WA_PHONE_NUMBER_ID / WA_ACCESS_TOKEN missing).");
  const tpl = Deno.env.get("WA_TEMPLATE_NAME");
  const body = tpl
    ? { messaging_product: "whatsapp", to, type: "template", template: {
        name: tpl, language: { code: Deno.env.get("WA_TEMPLATE_LANG") ?? "en" },
        components: [{ type: "body", parameters: [{ type: "text", text: flat(text) }] }] } }
    : { messaging_product: "whatsapp", to, type: "text", text: { body: text.slice(0, 4000), preview_url: false } };
  const r = await fetch(`${GRAPH}/${id}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const message = j?.error?.message ?? `WhatsApp API error ${r.status}`;
    if (r.status >= 400 && r.status < 500) throw new RejectedMessage(message);
    throw new Error(message);
  }
  if (!j?.messages?.[0]?.id) throw new Error("WhatsApp returned no message ID; check delivery before retrying.");
  return j.messages[0].id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  try {
    if (body?.action === "process") {
      const secret = Deno.env.get("MESSAGING_WORKER_SECRET");
      if (!secret || req.headers.get("x-messaging-secret") !== secret) return json({ error: "unauthorized" }, 401);
      const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await drainQueue(db);
      return json({ ok: true });
    }
    if (!body || typeof body !== "object") return json({ error: "bad request" }, 400);
    // ---- who is calling? -------------------------------------------------
    const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "unauthorized" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const { data: { user }, error: uerr } = await createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!).auth.getUser(jwt);
    if (uerr || !user) return json({ error: "unauthorized" }, 401);

    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: prof } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!prof || !["principal", "coordinator"].includes(prof.role)) {
      return json({ error: "Only the principal or a coordinator can send messages." }, 403);
    }

    if (body.action === "batches") {
      const { data, error } = await db.from("message_batches").select("id,title,created_at,test_mode,total").order("created_at", { ascending: false }).limit(15);
      if (error) throw error;
      return json({ batches: data });
    }
    if (body.action === "batch-status") {
      if (typeof body.batchId !== "string") return json({ error: "Invalid batch" }, 400);
      const jobs: any[] = [];
      for(let offset=0;offset<2000;offset+=500) {
        const { data, error } = await db.from("message_jobs").select("id,label,kind,status,detail").eq("batch_id", body.batchId).order("id").range(offset,offset+499);
        if (error) throw error;
        jobs.push(...(data||[]));
        if(!data || data.length<500) break;
      }
      return json({ jobs });
    }
    if (body.action === "retry-failed") {
      if (typeof body.batchId !== "string") return json({ error: "Invalid batch" }, 400);
      const { error } = await db.from("message_jobs").update({status:"queued",detail:null,updated_at:new Date().toISOString()}).eq("batch_id",body.batchId).eq("status","failed");
      if (error) throw error;
      EdgeRuntime.waitUntil(drainQueue(db).catch((e) => console.error("Queue worker:", e)));
      return json({ok:true});
    }

    const { data: rows, error: settingsError } = await db.from("app_settings").select("key,value");
    if (settingsError) return json({ error: "Messaging settings could not be loaded. No messages were sent." }, 503);
    const settings: Record<string, string> = Object.fromEntries((rows ?? []).map((r: any) => [r.key, r.value]));
    const admin = digits(settings.admin_whatsapp);
    const testMode = (settings.wa_test_mode ?? "on").toLowerCase() !== "off";
    const configured = !!(Deno.env.get("WA_PHONE_NUMBER_ID") && Deno.env.get("WA_ACCESS_TOKEN"));

    if (body.action === "status") {
      return json({ configured, testMode, adminSet: !!admin, queueConfigured: !!Deno.env.get("MESSAGING_WORKER_SECRET"), mode: Deno.env.get("WA_TEMPLATE_NAME") ? "template" : "text" });
    }
    if (body.action === "enqueue") {
      if (!configured || !admin) return json({ error: "Configure WhatsApp and the admin number before sending." }, 400);
      if (!Deno.env.get("MESSAGING_WORKER_SECRET")) return json({ error: "Configure MESSAGING_WORKER_SECRET and the queue schedule first (SETUP.md)." }, 400);
      if (!testMode && !Deno.env.get("WA_TEMPLATE_NAME")) return json({ error: "Live bulk sending requires an approved WhatsApp template." }, 400);
      if (body.expectedTestMode !== testMode) return json({ error: "Messaging mode changed. Refresh and review the batch before sending." }, 409);
      if (typeof body.batchId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.batchId)) return json({ error: "Invalid batch ID" }, 400);
      const msgs = body.messages;
      if (!Array.isArray(msgs) || !msgs.length || msgs.length > 1000) return json({ error: "Select between 1 and 1000 students." }, 400);
      if (msgs.some((m: any) => !m || typeof m.text !== "string" || !m.text.trim() || m.text.length > 3500 || typeof m.label !== "string" || m.label.length > 200)) return json({ error: "Invalid message content (maximum 3500 characters)." }, 400);
      if (!testMode && msgs.some((m: any) => !digits(m.to) || digits(m.to) === admin)) return json({ error: "Every selected student needs a valid parent number in live mode. Admin numbers cannot be parent contacts." }, 400);
      const jobs: any[] = [];
      for (const m of msgs) {
        const base = { label: m.label, student_name: String(m.studentName ?? "").slice(0, 200) };
        if (!testMode) jobs.push({ ...base, recipient: digits(m.to), kind: "parent", body: m.text });
        jobs.push({ ...base, recipient: admin, kind: testMode ? "admin_test" : "admin_copy",
          body: `[${testMode ? "TEST: Intended for" : "Admin copy: Intended for"} ${m.label}]\n\n${m.text}` });
      }
      if (Deno.env.get("WA_TEMPLATE_NAME") && jobs.some(j => j.body.replace(/\s*\n+\s*/g," | ").length > 1000)) return json({ error: "A message is too long for the configured template (1000 characters). Shorten the report or select a shorter message type." }, 400);
      const { error } = await db.rpc("enqueue_message_batch", { batch: body.batchId, actor: user.id, title: String(body.title ?? "Parent messages").slice(0, 120), testing: testMode, jobs });
      if (error) throw error;
      EdgeRuntime.waitUntil(drainQueue(db).catch((e) => console.error("Queue worker:", e)));
      return json({ batchId: body.batchId, testMode, students: msgs.length, queued: jobs.length });
    }
    if (body.action !== "send") return json({ error: "bad action" }, 400);
    if (!admin) return json({ error: "Set a valid admin WhatsApp number before sending. No messages were sent." }, 400);
    if (!configured) return json({ error: "Automatic sending is not set up yet. Add the WhatsApp secrets (see SETUP.md)." }, 400);

    const msgs = Array.isArray(body.messages) ? body.messages : [];
    if (!msgs.length) return json({ error: "No messages to send." }, 400);
    if (msgs.length > 60) return json({ error: "Send at most 60 messages per request." }, 400);
    if (msgs.some((m: any) => !m || typeof m !== "object" || typeof m.text !== "string" || !m.text.trim())) {
      return json({ error: "Every message must contain non-empty text. No messages were sent." }, 400);
    }

    // ---- send ------------------------------------------------------------
    const log: any[] = [];
    const results: any[] = [];
    const attempt = async (kind: string, to: string, text: string, m: any) => {
      try {
        const id = await sendWhatsApp(to, text);
        log.push({ sent_by: user.id, student_name: m.studentName ?? null, label: m.label ?? null, recipient: to, kind, status: "sent", detail: id });
        return "sent";
      } catch (e) {
        const msg = String((e as Error).message ?? e).slice(0, 300);
        log.push({ sent_by: user.id, student_name: m.studentName ?? null, label: m.label ?? null, recipient: to, kind, status: "failed", detail: msg });
        return "failed: " + msg;
      }
    };

    for (const m of msgs) {
      const text = String(m.text ?? "").trim();
      const label = String(m.label ?? "student");
      const to = digits(m.to);
      if (!text) { results.push({ label, parent: "skipped: empty message", admin: "skipped" }); continue; }
      const r: any = { label, parent: "skipped", admin: "skipped" };

      if (!testMode && to && to !== admin) r.parent = await attempt("parent", to, text, m);
      else if (!testMode && to === admin) r.parent = "skipped: admin number cannot be a parent contact";
      else r.parent = testMode ? "skipped: test mode (not sent to parents)" : "skipped: no parent number saved";

      if (admin) {
        const head = (!testMode && to)
          ? `[Copy] Parent send status: ${r.parent}. Intended for ${label} (+${to})\n\n`
          : `[TEST${testMode ? "" : " - no parent number"}] Intended for ${label} (${to ? "+" + to : "no parent number saved"})\n\n`;
        r.admin = await attempt((!testMode && to) ? "admin_copy" : "admin_test", admin, head + text, m);
      } else r.admin = "skipped: admin number not set";
      results.push(r);
      await sleep(200); // stay well inside WhatsApp rate limits
    }
    if (log.length) await db.from("message_log").insert(log).then(() => {}, () => {});

    const failed = results.filter((r) => String(r.parent).startsWith("failed") || String(r.admin).startsWith("failed")).length;
    return json({ ok: true, testMode, total: msgs.length, failed,
      parentSent: results.filter((r) => r.parent === "sent").length,
      adminSent: results.filter((r) => r.admin === "sent").length, results });
  } catch (e) {
    console.error("send-parent-message failed:", e);
    return json({ error: "send failed" }, 500);
  }
});
