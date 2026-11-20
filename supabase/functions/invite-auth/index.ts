// Supabase Edge Function: invite-auth
// Deploy with --no-verify-jwt because invite registration is unauthenticated.
// Admin actions still validate the caller's access token and public.admin_users membership.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}
function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return response({ error: "Method not allowed." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(url, serviceKey, { auth: { persistSession: false } });

  try {
    const body = await req.json();
    if (body.action === "create-invite") {
      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (!token) return response({ error: "Sign in as an administrator first." }, 401);
      const { data: authData, error: authError } = await adminClient.auth.getUser(token);
      if (authError || !authData.user) return response({ error: "Your session is invalid. Sign in again." }, 401);
      const { data: adminRow, error: adminError } = await adminClient
        .from("admin_users").select("user_id").eq("user_id", authData.user.id).maybeSingle();
      if (adminError || !adminRow) return response({ error: "Administrator access required." }, 403);

      const email = String(body.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response({ error: "Enter a valid recipient email." }, 400);
      const code = randomCode();
      const { error: insertError } = await adminClient.from("registration_invites").insert({
        code_hash: await sha256(code), email, created_by: authData.user.id,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      if (insertError) return response({ error: insertError.message }, 500);
      return response({ code, email, expires_in_days: 7 });
    }

    if (body.action === "register") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const username = String(body.username || "").trim();
      const code = String(body.code || "").trim().toUpperCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response({ error: "Enter a valid email address." }, 400);
      if (password.length < 8) return response({ error: "Password must be at least 8 characters." }, 400);
      if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) return response({ error: "Username must be 3–24 characters: letters, numbers or underscores." }, 400);
      if (!/^[A-F0-9]{24}$/.test(code)) return response({ error: "Enter a valid invitation code." }, 400);

      const codeHash = await sha256(code);
      const { data: invite, error: lookupError } = await adminClient
        .from("registration_invites").select("id,email,expires_at,used_at")
        .eq("code_hash", codeHash).maybeSingle();
      if (lookupError) return response({ error: "Could not verify invitation. Try again." }, 500);
      if (!invite || invite.used_at || new Date(invite.expires_at).getTime() <= Date.now() ||
          invite.email.toLowerCase() !== email) {
        return response({ error: "This invitation is invalid, expired, already used, or belongs to another email address." }, 400);
      }

      // Atomically reserve the invite before creating the account, preventing reuse.
      const { data: reserved, error: reserveError } = await adminClient
        .from("registration_invites").update({ used_at: new Date().toISOString() })
        .eq("id", invite.id).is("used_at", null).gt("expires_at", new Date().toISOString())
        .select("id").maybeSingle();
      if (reserveError || !reserved) return response({ error: "This invitation has already been used or expired." }, 400);

      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { username },
      });
      if (createError || !created.user) {
        await adminClient.from("registration_invites").update({ used_at: null }).eq("id", invite.id);
        return response({ error: createError?.message || "Could not create account." }, 400);
      }
      await adminClient.from("registration_invites").update({ used_by: created.user.id }).eq("id", invite.id);
      return response({ user: { id: created.user.id, email: created.user.email } }, 200);
    }
    return response({ error: "Unknown action." }, 400);
  } catch (_error) {
    return response({ error: "Unexpected server error." }, 500);
  }
});
