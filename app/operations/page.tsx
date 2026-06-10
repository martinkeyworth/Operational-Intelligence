import { redirect } from "next/navigation"

export default function OperationsRedirect() {
  redirect("/governance?tab=actions")
}
