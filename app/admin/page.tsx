import { redirect } from "next/navigation"

// The Admin entry lands on People & Access; the tab strip handles the rest.
export default function AdminIndexPage() {
  redirect("/admin/people")
}
