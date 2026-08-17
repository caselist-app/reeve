import { signOutAction } from '@/lib/actions/account'
import { Button } from '@/components/ui/button'

// REE-173: the only way to end a session from the UI. Lives on account
// settings, the account holder's own page, rather than the global nav.
export function SignOutButton() {
  return (
    <div className="p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">Sign out</h2>
        <p className="text-sm text-muted-foreground">Sign out of Reeve on this device.</p>
      </div>

      <form action={signOutAction} className="mt-4">
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </div>
  )
}
