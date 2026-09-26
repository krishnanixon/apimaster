import { cn } from '@/shared/lib/utils'
import { PRODUCT_NAME } from '@shared/constants/product'

const APP_LOGO_SRC = `${import.meta.env.BASE_URL}tess.png`

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
      className={cn('object-cover', className)}
    />
  )
}
