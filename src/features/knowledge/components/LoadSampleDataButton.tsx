import { useState } from 'react'
import { Database, Loader2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/shared/components/ui/dialog'
import { toast } from 'sonner'

interface LoadSampleDataButtonProps {
  hasExistingData: boolean
  isSeeding: boolean
  onSeed: (force?: boolean) => Promise<{ skipped: boolean; message: string; itemsCreated: number } | null>
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm'
}

export function LoadSampleDataButton({
  hasExistingData,
  isSeeding,
  onSeed,
  variant = 'outline',
  size = 'sm'
}: LoadSampleDataButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)

  const runSeed = async (force: boolean) => {
    const result = await onSeed(force)
    setConfirmOpen(false)
    if (!result) {
      toast.error('Failed to load sample data')
      return
    }
    if (result.skipped) {
      setConfirmOpen(true)
      return
    }
    toast.success(result.message)
  }

  const handleClick = () => {
    if (hasExistingData) {
      setConfirmOpen(true)
    } else {
      void runSeed(false)
    }
  }

  return (
    <>
      <Button
        size={size}
        variant={variant}
        className="gap-1.5"
        onClick={handleClick}
        disabled={isSeeding}
      >
        {isSeeding ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Database className="h-3.5 w-3.5" />
        )}
        Load Sample Data
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Load sample knowledge?</DialogTitle>
            <DialogDescription>
              This project already has knowledge entries. You can add sample data alongside existing
              content, or replace by loading sample modules first.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => runSeed(true)}>
              Add sample data anyway
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
