"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { deactivateBarberAdmin } from "@/app/admin/barbers/actions"
import type { AdminBarber } from "@/lib/data"

export function BarberAdminRow({ barber }: { barber: AdminBarber }) {
  const router = useRouter()
  const [removing, setRemoving] = useState(false)

  async function remove() {
    setRemoving(true)
    try {
      const fd = new FormData()
      fd.set("id", String(barber.id))
      await deactivateBarberAdmin(fd)
      router.refresh()
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">
            {barber.name}
          </p>
          {barber.hasData && (
            <Badge variant="secondary" className="text-[10px]">
              Has history
            </Badge>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{barber.role}</p>
      </div>

      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={removing}
              aria-label={`Remove ${barber.name}`}
              className="h-9 w-9 shrink-0 text-muted-foreground hover:text-rag-red"
            />
          }
        >
          {removing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {barber.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {barber.name} will be removed from data entry, headcount tallies
              and the splits list.
              {barber.hasData
                ? " Their past takings stay in reporting history, and this can be reversed later if needed."
                : " This can be reversed later if needed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={remove}
              className="bg-rag-red text-white hover:bg-rag-red/90"
            >
              Remove barber
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
