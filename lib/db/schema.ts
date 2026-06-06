import {
  pgTable,
  text,
  timestamp,
  boolean,
  serial,
  integer,
  numeric,
  date,
} from "drizzle-orm/pg-core"

// --- Better Auth required tables -------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  role: text("role").notNull().default("viewer"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
})

// --- LTZ Group governance tables -------------------------------------------

export const sites = pgTable("sites", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location").notNull(),
  region: text("region"),
  managerName: text("manager_name"),
  openedDate: date("opened_date"),
  monthlyTarget: numeric("monthly_target").notNull().default("0"),
  rag: text("rag").notNull().default("green"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const barbers = pgTable("barbers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  siteId: integer("site_id").notNull(),
  role: text("role").notNull().default("Barber"),
  targetRevenuePerDay: numeric("target_revenue_per_day").notNull().default("250"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const revenueEntries = pgTable("revenue_entries", {
  id: serial("id").primaryKey(),
  barberId: integer("barber_id").notNull(),
  siteId: integer("site_id").notNull(),
  entryDate: date("entry_date").notNull(),
  revenue: numeric("revenue").notNull().default("0"),
  servicesCount: integer("services_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const kpis = pgTable("kpis", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  functionArea: text("function_area").notNull(),
  unit: text("unit").notNull().default(""),
  greenThreshold: numeric("green_threshold"),
  amberThreshold: numeric("amber_threshold"),
  direction: text("direction").notNull().default("higher_better"),
  frequency: text("frequency").notNull().default("Weekly"),
  ownerRole: text("owner_role").notNull(),
  escalationRule: text("escalation_rule"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const kpiValues = pgTable("kpi_values", {
  id: serial("id").primaryKey(),
  kpiId: integer("kpi_id").notNull(),
  siteId: integer("site_id"),
  period: text("period").notNull(),
  value: numeric("value").notNull().default("0"),
  rag: text("rag").notNull().default("green"),
  commentary: text("commentary"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const actions = pgTable("actions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  functionArea: text("function_area").notNull(),
  siteId: integer("site_id"),
  owner: text("owner").notNull(),
  priority: text("priority").notNull().default("Medium"),
  status: text("status").notNull().default("Open"),
  rag: text("rag").notNull().default("amber"),
  dueDate: date("due_date"),
  escalated: boolean("escalated").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})
