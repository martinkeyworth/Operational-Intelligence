import { redirect } from "next/navigation"

export default function CadenceRedirect() {
  redirect("/governance?tab=cadence")
}
