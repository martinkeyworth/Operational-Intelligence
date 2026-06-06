"use client"

import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { LogOut } from "lucide-react"

export function SignOutButton() {
  const router = useRouter()
  const handleSignOut = async () => {
    await authClient.signOut()
    router.push("/sign-in")
    router.refresh()
  }
  return (
    <Button variant="outline" className="h-11 text-base" onClick={handleSignOut}>
      <LogOut className="mr-2 h-4 w-4" />
      Sign out
    </Button>
  )
}
