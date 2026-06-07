"use client"

import { useState } from "react"
import { Check, KeyRound, Loader2, Eye, EyeOff, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { setUserPassword } from "@/app/admin/people/actions"

/** Generate a readable, reasonably strong temporary password. */
function generatePassword(): string {
  const adjectives = ["Brisk", "Sharp", "Bold", "Swift", "Clear", "Prime", "Solid", "Bright"]
  const nouns = ["Fade", "Comb", "Razor", "Chair", "Clipper", "Brush", "Shave", "Style"]
  const a = adjectives[Math.floor(Math.random() * adjectives.length)]
  const n = nouns[Math.floor(Math.random() * nouns.length)]
  const num = Math.floor(1000 + Math.random() * 9000)
  return `${a}-${n}-${num}`
}

export function SetPasswordForm({
  userId,
  userName,
}: {
  userId: string
  userName: string
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")
  const [show, setShow] = useState(true)
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function submit() {
    setError(null)
    if (value.trim().length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    setPending(true)
    try {
      const fd = new FormData()
      fd.set("userId", userId)
      fd.set("newPassword", value.trim())
      const res = await setUserPassword(fd)
      if (res.ok) {
        setDone(true)
      } else {
        setError(res.error ?? "Could not set password.")
      }
    } finally {
      setPending(false)
    }
  }

  function reset() {
    setOpen(false)
    setValue("")
    setDone(false)
    setError(null)
    setCopied(false)
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard may be unavailable; the password is visible on screen anyway.
    }
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 gap-1.5"
        onClick={() => {
          setValue(generatePassword())
          setOpen(true)
        }}
      >
        <KeyRound className="h-4 w-4" />
        Set password
      </Button>
    )
  }

  if (done) {
    return (
      <div className="rounded-md border border-border bg-secondary/40 p-3">
        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Check className="h-4 w-4" /> Password updated
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Share this with {userName.split(" ")[0]}. They&apos;ll use it to sign
          in and can keep it or change it later. Their old sessions have been
          signed out.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 rounded bg-background px-2 py-1.5 font-mono text-sm text-foreground">
            {value}
          </code>
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={copy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <Button type="button" variant="ghost" size="sm" className="mt-2 h-8" onClick={reset}>
          Done
        </Button>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-border p-3">
      <p className="mb-2 text-xs font-medium text-foreground">
        Set a new password for {userName.split(" ")[0]}
      </p>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="New password"
            className="h-10 pr-9 font-mono text-base"
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10"
          onClick={() => setValue(generatePassword())}
        >
          Generate
        </Button>
      </div>

      {error ? (
        <p className="mt-2 text-xs font-medium text-destructive">{error}</p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Minimum 8 characters. This takes effect immediately and signs the
          user out of any existing sessions.
        </p>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" className="h-9" onClick={reset} disabled={pending}>
          Cancel
        </Button>
        <Button type="button" size="sm" className="h-9 gap-1.5" onClick={submit} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending ? "Saving…" : "Set password"}
        </Button>
      </div>
    </div>
  )
}
