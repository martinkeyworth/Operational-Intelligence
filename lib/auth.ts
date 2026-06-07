import { betterAuth } from "better-auth"
import { pool } from "@/lib/db"
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
    // Password resets are handled by an admin from /admin/people (no email).
    // See setUserPassword in app/admin/people/actions.ts.
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
