import { redirect } from "next/navigation"

export default function ActionsRedirect() {
  redirect("/governance?tab=actions")
}
