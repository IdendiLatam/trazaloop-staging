import assert from "node:assert/strict";
import fs from "node:fs";

const auth = fs.readFileSync("server/actions/auth.ts", "utf8");
const callback = fs.readFileSync("app/auth/callback/route.ts", "utf8");
const resetPage = fs.readFileSync(
  "app/(auth)/reset-password/page.tsx",
  "utf8"
);
const resetForm = fs.readFileSync(
  "components/domain/auth/reset-password-form.tsx",
  "utf8"
);
const loginForm = fs.readFileSync(
  "components/domain/auth/login-form.tsx",
  "utf8"
);

assert(
  auth.includes(
    'redirectTo: `${siteUrl}/auth/callback?next=/reset-password`'
  ),
  "password recovery must return through the PKCE auth callback"
);

assert(
  !auth.includes('redirectTo: `${siteUrl}/login`'),
  "password recovery must never redirect directly to login"
);

assert(
  callback.includes("exchangeCodeForSession(code)"),
  "auth callback must exchange the PKCE code for a session"
);

assert(
  callback.includes('next === "/reset-password"'),
  "callback must allow-list the password recovery destination"
);

assert(
  resetPage.includes("supabase.auth.getUser()"),
  "reset-password page must require a validated Supabase user"
);

assert(
  auth.includes("supabase.auth.updateUser({ password })"),
  "password update action must update the authenticated user's password"
);

assert(
  auth.includes('redirect("/login?password_updated=1")'),
  "successful recovery must return to login"
);

assert(
  resetForm.includes('name="password_confirmation"'),
  "reset form must require password confirmation"
);

assert(
  loginForm.includes('params.get("password_updated") === "1"'),
  "login must acknowledge a successful password update"
);

console.log("AUTH_PASSWORD_RECOVERY_TEST=PASS");
