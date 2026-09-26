import { SectionShell, SectionEmpty } from './SectionShell'

/**
 * Honest placeholder for sections whose behaviour depends on a later phase.
 * It states what will appear and what already works, rather than showing a
 * fake preview.
 */
export function UpcomingSection({
  title,
  description,
  detail
}: {
  title: string
  description: string
  detail: string
}) {
  return (
    <SectionShell title={title} description={description}>
      <SectionEmpty title="Not available yet" description={detail} />
    </SectionShell>
  )
}
