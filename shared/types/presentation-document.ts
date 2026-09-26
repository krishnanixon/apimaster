import type { PresentationCard, PresentationThemeOverrides } from './presentation'

export const PRESENTATION_SCHEMA_VERSION = 1 as const
export const PRESENTATION_SLIDE_WIDTH = 1920
export const PRESENTATION_SLIDE_HEIGHT = 1080

export type SlideElementType =
  | 'text'
  | 'image'
  | 'shape'
  | 'icon'
  | 'table'
  | 'code'
  | 'diagram'
  | 'project-reference'

export interface SlidePoint {
  x: number
  y: number
}

export interface SlideSize {
  width: number
  height: number
}

export interface BaseSlideElement extends SlidePoint, SlideSize {
  id: string
  type: SlideElementType
  rotation: number
  opacity: number
  zIndex: number
  locked: boolean
  hidden?: boolean
  name?: string
}

export type TextAlign = 'left' | 'center' | 'right' | 'justify'
export type VerticalAlign = 'top' | 'middle' | 'bottom'

export interface TextElement extends BaseSlideElement {
  type: 'text'
  content: string
  richText?: Record<string, unknown>
  fontFamily: string
  fontSize: number
  fontWeight: number
  fontStyle: 'normal' | 'italic'
  textDecoration: 'none' | 'underline' | 'line-through'
  textColor: string
  backgroundColor?: string
  textAlign: TextAlign
  verticalAlign: VerticalAlign
  lineHeight: number
  letterSpacing: number
}

export interface ImageCrop {
  x: number
  y: number
  width: number
  height: number
}

export interface ImageElement extends BaseSlideElement {
  type: 'image'
  assetId?: string
  src?: string
  alt: string
  objectFit: 'cover' | 'contain' | 'fill'
  crop?: ImageCrop
  borderColor?: string
  borderWidth: number
  borderRadius: number
  shadow?: string
}

export type PresentationShapeKind =
  | 'rectangle'
  | 'rounded-rectangle'
  | 'circle'
  | 'line'
  | 'arrow'
  | 'triangle'

export interface ShapeElement extends BaseSlideElement {
  type: 'shape'
  shape: PresentationShapeKind
  fill: string
  stroke: string
  strokeWidth: number
  borderRadius?: number
}

export interface IconElement extends BaseSlideElement {
  type: 'icon'
  icon: string
  color: string
  strokeWidth: number
}

export interface TableElement extends BaseSlideElement {
  type: 'table'
  rows: string[][]
  headerRow: boolean
  borderColor: string
  headerBackground: string
  cellBackground: string
  textColor: string
  fontSize: number
}

export type CodeLanguage =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'sql'
  | 'json'
  | 'html'
  | 'css'
  | 'shell'
  | 'java'
  | 'csharp'
  | 'yaml'

export interface CodeElement extends BaseSlideElement {
  type: 'code'
  language: CodeLanguage
  code: string
  showLineNumbers: boolean
  theme: 'light' | 'dark'
  fileName?: string
  highlightedLines: number[]
}

export interface DiagramElement extends BaseSlideElement {
  type: 'diagram'
  diagramType: 'flow' | 'architecture' | 'custom'
  model: Record<string, unknown>
  sourceId?: string
  snapshot?: Record<string, unknown>
}

export type ProjectReferenceKind =
  | 'requirement'
  | 'document'
  | 'api'
  | 'database'
  | 'flow'
  | 'code'
  | 'task'
  | 'architecture'

export interface ProjectReferenceElement extends BaseSlideElement {
  type: 'project-reference'
  referenceType: ProjectReferenceKind
  projectId: string
  referenceId: string
  snapshot: Record<string, unknown>
}

export type SlideElement =
  | TextElement
  | ImageElement
  | ShapeElement
  | IconElement
  | TableElement
  | CodeElement
  | DiagramElement
  | ProjectReferenceElement

export interface SlideBackground {
  type: 'solid' | 'gradient' | 'image'
  color?: string
  gradient?: string
  assetId?: string
  src?: string
}

export interface PresentationSlide {
  id: string
  order: number
  title?: string
  layout?: string
  background: SlideBackground
  hidden?: boolean
  locked?: boolean
  speakerNotes?: string
  sectionId?: string
  elements: SlideElement[]
}

export interface PresentationDocumentMetadata {
  description?: string
  audience?: string
  objective?: string
  durationMinutes?: number
  createdBy?: string
  sourceKinds?: ProjectReferenceKind[]
  legacyCards?: PresentationCard[]
}

export interface PresentationDocument {
  schemaVersion: typeof PRESENTATION_SCHEMA_VERSION
  id: string
  projectId?: string
  title: string
  description?: string
  themeId: string
  templateId?: string
  logicalSize: SlideSize
  slides: PresentationSlide[]
  themeOverrides?: PresentationThemeOverrides
  metadata: PresentationDocumentMetadata
  createdAt: string
  updatedAt: string
}

export interface PresentationAsset {
  id: string
  presentationId: string
  type: 'image'
  path: string
  mimeType: string
  width?: number
  height?: number
  createdAt: string
}
