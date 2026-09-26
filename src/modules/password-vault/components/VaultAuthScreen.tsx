import { useState } from 'react'
import { Lock, Shield, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Card } from '@/shared/components/ui/card'

interface VaultAuthScreenProps {
  mode: 'setup' | 'unlock'
  isLoading: boolean
  onSubmit: (password: string, hint?: string) => void
}

export function VaultAuthScreen({ mode, isLoading, onSubmit }: VaultAuthScreenProps) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [hint, setHint] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const isSetup = mode === 'setup'
  const valid = isSetup ? password.length >= 8 && password === confirm : password.length > 0

  return (
    <div className="flex h-full items-center justify-center p-8">
      <Card className="w-full max-w-md border-border/60 bg-card/80 p-8 shadow-float backdrop-blur-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            {isSetup ? <Shield className="h-6 w-6 text-primary" /> : <Lock className="h-6 w-6 text-primary" />}
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {isSetup ? 'Create Password Vault' : 'Unlock Vault'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isSetup
                ? 'Set a master password. It is never stored in plaintext.'
                : 'Enter your master password to access credentials.'}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="Master password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && valid && onSubmit(password, hint)}
              autoFocus
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {isSetup && (
            <>
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Confirm master password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              <Input
                placeholder="Password hint (optional)"
                value={hint}
                onChange={(e) => setHint(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Uses Argon2id hashing and AES-256-GCM encryption. Minimum 8 characters.
              </p>
            </>
          )}

          <Button
            className="w-full"
            disabled={!valid || isLoading}
            onClick={() => onSubmit(password, hint)}
          >
            {isLoading ? 'Please wait…' : isSetup ? 'Create Vault' : 'Unlock'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
