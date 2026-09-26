/**
 * Presentation Studio — domain model (Gamma-like card decks).
 *
 * Cards are the source of truth. Each card holds typed blocks the editor
 * renders and the AI can patch without free-form HTML.
 */

/* ------------------------------------------------------------------ taxonomy */

export type PresentationLayoutId =
  | 'title'
  | 'content'
  | 'split'
  | 'bullets'
  | 'metrics'
  | 'quote'
  | 'closing'
  | 'image-focus'
  | 'media-left'
  | 'media-right'

export type PresentationBlockType =
  'heading' | 'text' | 'bullets' | 'columns' | 'image' | 'callout' | 'divider' | 'metric'

export type PresentationThemeId =
  | 'professional'
  | 'modern'
  | 'bold'
  | 'minimal'
  | 'warm'
  | 'dark'
  | 'coral'
  | 'forest'
  | 'midnight'
  | 'canvas'

export type PresentationDensity = 'compact' | 'comfortable' | 'spacious'
export type PresentationAspectRatio = '16:9' | '4:3' | '16:10'

/* ---------------------------------------------------------------- structures */

export interface PresentationThemeColors {
  background: string
  surface: string
  text: string
  muted: string
  accent: string
  accentText: string
  border: string
}

export interface PresentationThemeFonts {
  heading: string
  body: string
}

export interface PresentationThemeOverrides {
  colors?: Partial<PresentationThemeColors>
  fonts?: Partial<PresentationThemeFonts>
  density?: PresentationDensity
}

export interface PresentationTheme {
  id: PresentationThemeId
  name: string
  description: string
  colors: PresentationThemeColors
  fonts: PresentationThemeFonts
  density: PresentationDensity
}

export interface PresentationHeadingBlock {
  id: string
  type: 'heading'
  text: string
  level?: 1 | 2 | 3
}

export interface PresentationTextBlock {
  id: string
  type: 'text'
  text: string
}

export interface PresentationBulletsBlock {
  id: string
  type: 'bullets'
  items: string[]
}

export interface PresentationColumnsBlock {
  id: string
  type: 'columns'
  columns: Array<{ title?: string; body: string }>
}

export interface PresentationImageBlock {
  id: string
  type: 'image'
  src?: string
  alt?: string
  caption?: string
}

export interface PresentationCalloutBlock {
  id: string
  type: 'callout'
  text: string
  tone?: 'info' | 'success' | 'warning' | 'neutral'
}

export interface PresentationDividerBlock {
  id: string
  type: 'divider'
}

export interface PresentationMetricBlock {
  id: string
  type: 'metric'
  metrics: Array<{ label: string; value: string; hint?: string }>
}

export type PresentationBlock =
  | PresentationHeadingBlock
  | PresentationTextBlock
  | PresentationBulletsBlock
  | PresentationColumnsBlock
  | PresentationImageBlock
  | PresentationCalloutBlock
  | PresentationDividerBlock
  | PresentationMetricBlock

export interface PresentationCard {
  id: string
  layout: PresentationLayoutId
  blocks: PresentationBlock[]
  notes?: string
}

export interface PresentationViewState {
  selectedCardId?: string | null
  scrollTop?: number
  presentIndex?: number
  /** Project document ids this deck is grounded on. */
  linkedDocumentIds?: string[]
  includeKnowledge?: boolean
  lastSources?: string[]
  /** User color / font / density overrides on top of a preset theme. */
  themeOverrides?: PresentationThemeOverrides
  aspectRatio?: PresentationAspectRatio
  includeBranding?: boolean
}

export interface PresentationVersion {
  id: string
  label: string
  createdAt: string
  summary: string
  cards: PresentationCard[]
  themeId: PresentationThemeId
}

/* --------------------------------------------------------------- persistence */

export interface Presentation {
  id: string
  projectId: string
  title: string
  description: string
  themeId: string
  /** Serialized `PresentationCard[]`. */
  cards: string
  /** Serialized `PresentationViewState`. */
  viewState: string
  /** Serialized `PresentationVersion[]`. */
  versions: string
  /** Versioned fixed-coordinate presentation document. Empty for legacy card decks. */
  documentJson: string
  schemaVersion: number
  templateId: string
  isFavorite: boolean
  deletedAt: string | null
  isPinned: boolean
  createdAt: string
  updatedAt: string
}

export interface CreatePresentationInput {
  projectId: string
  title?: string
  description?: string
  themeId?: string
  cards?: string
  documentJson?: string
  schemaVersion?: number
  templateId?: string
}

export interface UpdatePresentationInput {
  title?: string
  description?: string
  themeId?: string
  cards?: string
  viewState?: string
  versions?: string
  documentJson?: string
  schemaVersion?: number
  templateId?: string
  isFavorite?: boolean
  deletedAt?: string | null
  isPinned?: boolean
}

/* ------------------------------------------------------------ action system */

export type PresentationAction =
  | { type: 'REPLACE_CARDS'; cards: PresentationCard[] }
  | { type: 'UPDATE_CARD'; cardId: string; patch: Partial<Omit<PresentationCard, 'id'>> }
  | { type: 'INSERT_CARD'; index?: number; card: PresentationCard }
  | { type: 'DELETE_CARD'; cardId: string }
  | { type: 'MOVE_CARD'; cardId: string; toIndex: number }
  | { type: 'RESTYLE'; themeId: PresentationThemeId }
  | { type: 'UPDATE_BLOCK'; cardId: string; blockId: string; patch: Partial<PresentationBlock> }
  | { type: 'UPDATE_META'; patch: { title?: string; description?: string } }

export type PresentationActionType = PresentationAction['type']

export interface PresentationActionProposal {
  id: string
  summary: string
  rationale: string
  actions: PresentationAction[]
}

/* ------------------------------------------------------------------- AI I/O */

export interface GeneratePresentationInput {
  projectId: string
  prompt: string
  themeId?: PresentationThemeId
  tone?: string
  cardCount?: number
  /** Project documents to read as source material. */
  documentIds?: string[]
  /** Pull the project knowledge base in alongside the documents. */
  includeKnowledge?: boolean
}

export interface GeneratedPresentationResult {
  title: string
  themeId: PresentationThemeId
  /** Serialized `PresentationCard[]`. */
  cards: string
  summary: string
  /** Titles of the documents that were actually read, for display. */
  sources: string[]
}

export interface PresentationAssistantInput {
  projectId: string
  instruction: string
  /** Serialized `PresentationCard[]` the AI should reason about. */
  cards: string
  themeId?: string
  title?: string
  selectedCardIds?: string[]
  documentIds?: string[]
  includeKnowledge?: boolean
}

export interface PresentationAssistantResult {
  summary: string
  rationale: string
  /** Serialized `PresentationAction[]` awaiting user approval. */
  actions: string
}

export interface ExportPresentationPdfInput {
  presentationId: string
  outputPath?: string
}

export interface ExportPresentationPptxInput {
  presentationId: string
  outputPath?: string
}
