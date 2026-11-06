import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const roles = ["principal", "coordinator", "hod"];
const chatTerms = new Set("a about absent absences across all an and any are at average best bottom break breakdown by can chart class classes compare count difference did distribution do doing each every exactly fail failed failing fewer find for from give got graph group groups had has have high higher highest how i in is last latest least list low lower lowest many mark marks mean missing more most need number of on one overall pass passed passing percent percentage performance poor rank recorded result results same score scored scores section sections show some spread student students subject subjects summarize test than that the their them there these this those to top total trend under us was we weak weakest were what which who whose with without worst year years".split(" "));
const chatOperations = ["count", "average", "top", "bottom", "distribution", "subjects", "absences", "groups", "clarify"];
const dashboardMetrics = {
  average: "Overall average (%)",
  passRate: "Overall pass rate (%) at 50% or higher",
  attention: "Students flagged below 60% or down 10 points or more",
  listed: "Students listed",
  scored: "Students with an overall result",
};
const yearMetrics = {
  listed: "Students listed",
  counted: "Students included in overall figures",
  complete: "Students with complete results",
  median: "Typical result (median %)",
  belowPass: "Students with at least one recorded subject fail",
  unknown: "Students whose subject pass outcome is unconfirmed",
};
const subjectMetrics = {
  average: "Average of latest scores (%)",
  listed: "Students listed in the section",
  scored: "Students with a latest score",
  absent: "Students marked absent on the latest result",
  missing: "Students without a usable latest result or absence",
};

function reply(body: unknown, status = 200) {
  return Response.json(body, { status, headers: cors });
}

function evidenceFor(facts: unknown, labels: Record<string, string>, prefix = "") {
  if (!facts || typeof facts !== "object" || Array.isArray(facts)) return null;
  const values = facts as Record<string, unknown>;
  const entries = Object.entries(labels).filter(([key]) => Object.hasOwn(values, key));
  if (entries.length !== Object.keys(values).length || !entries.length) return null;
  const evidence = [];
  for (const [key, label] of entries) {
    const value = values[key];
    if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1_000_000)) return null;
    evidence.push({ id: prefix + key, label, value });
  }
  return evidence;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return reply({ error: "Method not allowed." }, 405);
  const authorization = request.headers.get("Authorization") || "";
  if (!/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/i.test(authorization)) return reply({ error: "Sign in again." }, 401);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser(authorization.slice(7));
    if (authError || !user) return reply({ error: "Sign in again." }, 401);
    const { data: profile } = await userClient.from("profiles").select("role,campus").eq("id", user.id).maybeSingle();
    if (!roles.includes(profile?.role)) return reply({ error: "The assistant is available to reporting staff." }, 403);
    if (!profile.campus) return reply({ error: "Ask your administrator to assign your account to a campus." }, 403);

    const raw = await request.text();
    if (raw.length > 6000) return reply({ error: "This report is too large for the assistant." }, 413);
    let input;
    try { input = JSON.parse(raw); } catch { return reply({ error: "Invalid report request." }, 400); }
    const { kind, sourceIds, facts, review } = input || {};
    const isChat = kind === "chat-intent";
    if (isChat && (typeof input.phrase !== "string" || input.phrase.length > 350 ||
        !input.phrase.split(" ").every((word: string) => chatTerms.has(word)))) {
      return reply({ error: "Invalid chat request." }, 400);
    }
    if (!isChat && (!["dashboard", "years", "subject"].includes(kind) || !Array.isArray(sourceIds) ||
        !sourceIds.length || sourceIds.length > 200 || new Set(sourceIds).size !== sourceIds.length ||
        sourceIds.some(id => typeof id !== "string" || !id || id.length > 128) ||
        (kind === "years" && sourceIds.length !== 2) || (kind === "subject" && sourceIds.length !== 1))) {
      return reply({ error: "Choose a supported report and its sources." }, 400);
    }
    if (kind === "years" && sourceIds.some(id => !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id))) {
      return reply({ error: "Choose two saved years." }, 400);
    }
    if (!isChat) {
      const [table, column] = kind === "years" ? ["year_datasets", "id"] : ["sections", "key"];
      const { data: sources, error: sourceError } = await userClient.from(table)
        .select(column).eq("campus", profile.campus).in(column, sourceIds);
      if (sourceError) {
        console.error("Reporting assistant campus check unavailable", sourceError.code);
        return reply({ error: "The assistant could not check campus access." }, 503);
      }
      if (sources?.length !== sourceIds.length) {
        return reply({ error: "One or more report sources are unavailable for your campus." }, 403);
      }
    }

    const earlier = kind === "years" ? evidenceFor(facts?.earlier, yearMetrics, "earlier_") : null;
    const later = kind === "years" ? evidenceFor(facts?.later, yearMetrics, "later_") : null;
    const evidence = kind === "years" ? (earlier && later ? [...earlier, ...later] : null)
      : evidenceFor(facts, kind === "subject" ? subjectMetrics : dashboardMetrics);
    const available = evidence?.filter(item => item.value !== null);
    if (!isChat && !available?.length) return reply({ error: "There are no usable figures for this report." }, 422);

    const key = Deno.env.get("GROQ_API_KEY");
    if (!key) return reply({ error: "The assistant is awaiting setup." }, 503);
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: claimed, error: quotaError } = await admin.rpc("claim_reporting_assistant_request", { p_user_id: user.id });
    if (quotaError) {
      console.error("Reporting assistant quota unavailable", quotaError.code);
      return reply({ error: "The assistant is awaiting setup." }, 503);
    }
    if (!claimed) return reply({ error: "Wait 10 seconds between requests. The daily limit is 20 per account and resets at midnight UTC." }, 429);

    const result = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        temperature: 0.1,
        reasoning_effort: "low",
        reasoning_format: "hidden",
        max_completion_tokens: isChat ? 220 : 500,
        response_format: { type: "json_object" },
        messages: isChat ? [
          { role: "system", content: 'Classify the academic query into one operation. Return JSON {"operation":"..."} using only ' + chatOperations.join(", ") + '. The input contains only public analytical vocabulary. Subjects means compare subject averages, groups means counts by section or stream. Use clarify for unsupported or ambiguous requests. Never answer the question or invent an entity.' },
          { role: "user", content: input.phrase },
        ] : [
          { role: "system", content: 'You explain school report figures in plain English. Return JSON {"observations":[{"text":"one short sentence","sources":["evidence_id"]}]} with one or two useful observations. Every sentence must cite the supplied evidence IDs that support it. Leave digits and percentages out of text because the app shows the exact cited values alongside it. The earlier_ and later_ prefixes identify different cohorts, never individual progress. When review is true, do not conclude that performance improved or declined; explain that a like-for-like comparison needs checking. Treat missing, absent and unknown separately from failure. Avoid causal claims, names and speculation. If coverage is incomplete, qualify the observation.' },
          { role: "user", content: JSON.stringify({ job: kind, review: kind === "years" && review === true, evidence }) },
        ],
      }),
    });
    if (!result.ok) {
      console.error("Reporting assistant provider rejected request", result.status);
      return reply({ error: "The assistant could not write a summary. The report figures are still available." }, 502);
    }
    const completion = await result.json();
    const output = JSON.parse(completion.choices[0].message.content);
    if (isChat) return reply({ operation: chatOperations.includes(output.operation) ? output.operation : "clarify" });
    const { observations } = output;
    const validIds = new Set(available?.map(item => item.id));
    if (!Array.isArray(observations) || observations.length < 1 || observations.length > 2 ||
        observations.some(item => typeof item?.text !== "string" || !item.text.trim() || item.text.length > 300 ||
          /\d/.test(item.text) || !Array.isArray(item.sources) || !item.sources.length ||
          item.sources.length > 7 || item.sources.some((id: string) => !validIds.has(id)))) {
      return reply({ error: "The assistant could not verify its citations. Try again in a moment." }, 502);
    }
    return reply({ observations: observations.map(({ text, sources }) => ({ text, sources })), evidence });
  } catch {
    console.error("Reporting assistant request failed");
    return reply({ error: "The assistant is temporarily unavailable." }, 503);
  }
});
