'use client'

import { useActionState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { requestOtpAction, verifyOtpAction } from './actions'

export default function LoginPage() {
  const [requestState, requestAction, requestPending] = useActionState(
    requestOtpAction,
    { error: null, sent: false, email: '' }
  )
  const [verifyState, verifyAction, verifyPending] = useActionState(
    verifyOtpAction,
    { error: null }
  )

  if (requestState.sent) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            We sent a 6-digit code to {requestState.email}.
          </p>
          <form action={verifyAction} className="space-y-4">
            <input type="hidden" name="email" value={requestState.email} />
            <div className="space-y-2">
              <Label htmlFor="token">Code</Label>
              <Input
                id="token"
                name="token"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={6}
                required
              />
            </div>
            {verifyState.error && (
              <p className="text-sm text-destructive">{verifyState.error}</p>
            )}
            <Button type="submit" className="w-full" disabled={verifyPending}>
              {verifyPending ? 'Verifying...' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in to Reeve</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={requestAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>
          {requestState.error && (
            <p className="text-sm text-destructive">{requestState.error}</p>
          )}
          <Button type="submit" className="w-full" disabled={requestPending}>
            {requestPending ? 'Sending code...' : 'Continue'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
