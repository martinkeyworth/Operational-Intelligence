import { betterAuth } from "better-auth"
import { pool } from "@/lib/db"
import { sendEmail, emailShell } from "@/lib/email"
// Better Auth server configuration (email + password)

export const auth = betterAuth({
  database: pool,
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    // Email the user a secure link to reset their password. Better Auth
    // generates the token and points `url` at our /reset-password page.
    sendResetPassword: async ({ user, url }) => {
      const result = await sendEmail({
        to: user.email,
        subject: "Reset your LTZ Group password",
        kind: "password-reset",
        html: emailShell(
          "Password reset",
          `<p style="margin:0 0 12px;">Hi ${user.name || "there"},</p>
           <p style="margin:0 0 16px;">We received a request to reset the password for your LTZ Group account. Click the button below to choose a new password. This link expires in 1 hour.</p>
           <p style="margin:0 0 20px;">
             <a href="${url}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px;">Reset password</a>
           </p>
           <p style="margin:0 0 8px;color:#6b7280;font-size:12px;">If the button doesn't work, paste this link into your browser:</p>
           <p style="margin:0 0 16px;word-break:break-all;font-size:12px;color:#6b7280;">${url}</p>
           <p style="margin:0;color:#6b7280;font-size:12px;">If you didn't request this, you can safely ignore this email — your password won't change.</p>`,
        ),
      })
      // Better Auth swallows send failures (to avoid leaking which addresses
      // exist). Surface them in the server logs so an admin can diagnose — e.g.
      // a missing GMAIL_USER / GMAIL_APP_PASSWORD or an SMTP auth error. The
      // failure is also recorded in the emailLog table.
      if (!result.ok) {
        console.error(
          `[v0] Password reset email to ${user.email} failed: ${result.error}`,
        )
      }
    },
    // Token lifetime in seconds (1 hour).
    resetPasswordTokenExpiresIn: 3600,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "viewer",
        input: false,
      },
      canViewDashboard: { type: "boolean", required: false, input: false, fieldName: "can_view_dashboard" },
      isBarber: { type: "boolean", required: false, input: false, fieldName: "is_barber" },
      isTrainingLead: { type: "boolean", required: false, input: false, fieldName: "is_training_lead" },
      isHrLead: { type: "boolean", required: false, input: false, fieldName: "is_hr_lead" },
      isSocialMedia: { type: "boolean", required: false, input: false, fieldName: "is_social_media" },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Assign default access on sign-up based on email domain:
        //  - @lessthanzerobarbers.com  -> dashboard access
        //  - everyone else             -> barber (weekly data input only)
        before: async (newUser) => {
          const isCompany = (newUser.email ?? "")
            .toLowerCase()
            .endsWith("@lessthanzerobarbers.com")
          return {
            data: {
              ...newUser,
              canViewDashboard: isCompany,
              isBarber: !isCompany,
            },
          }
        },
      },
    },
  },
  trustedOrigins: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
      : []),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  ...(process.env.NODE_ENV === "development"
    ? {
        advanced: {
          defaultCookieAttributes: {
            sameSite: "none" as const,
            secure: true,
          },
        },
      }
    : {}),
})
