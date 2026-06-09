import { redirect } from "next/navigation"

// Barber management now lives in the consolidated Team Area.
export default function BarbersRedirect() {
  redirect("/admin/team")
}
