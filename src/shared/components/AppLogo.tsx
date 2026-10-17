import { cn } from '@/shared/lib/utils'
import { PRODUCT_LOGO_FILE, PRODUCT_NAME } from '@shared/constants/product'

const APP_LOGO_SRC = `${import.meta.env.BASE_URL}${PRODUCT_LOGO_FILE}`

interface AppLogoProps {
  className?: string
  alt?: string
}

export function AppLogo({ className, alt = PRODUCT_NAME }: AppLogoProps) {
  return (
    <img
      src={APP_LOGO_SRC}
      alt={alt}
      decoding="async"
      draggable={false}
      // The PNG carries its own rounded corners and transparency — don't clip it with CSS radii.
      className={cn('select-none object-contain', className)}
    />
  )
}
