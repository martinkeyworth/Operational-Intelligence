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
    // Self-serve reset: Better Auth emails a link (below). Admins can also set a
    // password directly from /admin/people (setUserPassword).
    resetPasswordTokenExpiresIn: 3600, // 1 hour
    sendResetPassword: async ({ user, url }) => {
      const html = emailShell(
        "Reset your password",
        `<p style="font-size:14px;line-height:1.6">Hi ${user.name || "there"},</p>
         <p style="font-size:14px;line-height:1.6">We received a request to reset your LTZ Group
           password. Click below to choose a new one — this link expires in 1 hour.</p>
         <p style="margin:16px 0"><a href="${url}" style="display:inline-block;padding:10px 18px;background:#111827;color:#ffffff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none">Reset password</a></p>
         <p style="font-size:12px;color:#888">If you didn't request this, you can safely ignore this email.</p>`,
      )
      await sendEmail({
        to: user.email,
        subject: "Reset your LTZ Group password",
        html,
        kind: "password-reset",
      })
    },
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
    // The live domain (no trailing slash) — required so self-serve reset is
    // trusted in production. Plus any extra comma-separated origins.
    ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL.replace(/\/+$/, "")] : []),
    ...(process.env.ADDITIONAL_TRUSTED_ORIGINS
      ? process.env.ADDITIONAL_TRUSTED_ORIGINS.split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean)
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
