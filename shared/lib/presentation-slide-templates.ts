import {
  PRESENTATION_SCHEMA_VERSION,
  PRESENTATION_SLIDE_HEIGHT,
  PRESENTATION_SLIDE_WIDTH,
  type PresentationDocument,
  type PresentationSlide,
  type SlideElement
} from '@shared/types/presentation-document'
import { getSlideElements } from '@shared/lib/presentation-schema'

export interface PresentationSlideTemplatePreview {
  gradient: string
  accent: string
}

export type PresentationTemplateCategory = 'business' | 'product' | 'education' | 'creative' | 'marketing'

export type PresentationTemplateStyle =
  | 'minimal'
  | 'bold'
  | 'dark'
  | 'gradient'
  | 'editorial'
  | 'glass'
  | 'corporate'
  | 'warm'

export interface PresentationSlideTemplate {
  id: string
  title: string
  description: string
  themeId: string
  category: PresentationTemplateCategory
  style: PresentationTemplateStyle
  preview: PresentationSlideTemplatePreview
  build: () => PresentationSlide[]
}

function text(
  content: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
  fontWeight = 400,
  textColor = '#111827',
  textAlign: 'left' | 'center' | 'right' = 'left'
): SlideElement {
  return {
    id: crypto.randomUUID(),
    type: 'text',
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    zIndex: y,
    locked: false,
    content,
    fontFamily: 'Inter',
    fontSize,
    fontWeight,
    fontStyle: 'normal',
    textDecoration: 'none',
    textColor,
    textAlign,
    verticalAlign: 'middle',
    lineHeight: 1.2,
    letterSpacing: 0
  }
}

function shape(
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  shapeType: 'rectangle' | 'rounded-rectangle' | 'circle' = 'rounded-rectangle',
  zOffset = 1
): SlideElement {
  return {
    id: crypto.randomUUID(),
    type: 'shape',
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    zIndex: y - zOffset,
    locked: false,
    shape: shapeType,
    fill,
    stroke: 'transparent',
    strokeWidth: 0,
    borderRadius: shapeType === 'rounded-rectangle' ? 24 : 0
  }
}

function slide(
  order: number,
  layout: string,
  background: string,
  elements: SlideElement[],
  title?: string,
  notes?: string
): PresentationSlide {
  return {
    id: crypto.randomUUID(),
    order,
    title,
    layout,
    background: { type: 'solid', color: background },
    speakerNotes: notes,
    elements
  }
}

export const PRESENTATION_SLIDE_TEMPLATES: PresentationSlideTemplate[] = [
  {
    id: 'pitch-deck',
    title: 'Startup pitch',
    description: 'Problem, solution, market, traction, team, ask',
    themeId: 'bold',
    category: 'business',
    style: 'bold',
    preview: { gradient: 'linear-gradient(135deg, #312e81 0%, #6366f1 100%)', accent: '#6366f1' },
    build: () => [
      slide(0, 'title', '#0f172a', [
        shape(0, 0, 1920, 1080, '#6366f1', 'rectangle'),
        shape(1200, -120, 900, 900, '#818cf8', 'circle', 2),
        shape(-80, 680, 420, 420, '#4f46e5', 'circle', 2),
        text('Your product name', 160, 320, 1600, 140, 88, 700, '#ffffff', 'center'),
        text('One-line value proposition', 200, 480, 1520, 80, 36, 400, '#e0e7ff', 'center')
      ], 'Cover'),
      slide(1, 'title-content', '#ffffff', [
        shape(0, 0, 12, 1080, '#6366f1', 'rectangle'),
        text('The problem', 140, 90, 1640, 100, 56, 700),
        text('Describe the pain point your audience feels today.', 140, 220, 900, 500, 32),
        shape(1100, 220, 680, 500, '#eef2ff', 'rounded-rectangle'),
        shape(1120, 240, 640, 460, '#fef3c7', 'rounded-rectangle', 2)
      ], 'Problem'),
      slide(2, 'two-column', '#ffffff', [
        shape(140, 170, 780, 8, '#6366f1', 'rounded-rectangle'),
        text('Our solution', 140, 80, 1640, 100, 56, 700),
        text('How you solve it\n\nKey differentiator', 140, 260, 780, 620, 30),
        text('Benefits\n\n• Faster\n• Cheaper\n• Better', 1000, 260, 780, 620, 30)
      ], 'Solution'),
      slide(3, 'metrics', '#f8fafc', [
        shape(140, 200, 1640, 520, '#ffffff', 'rounded-rectangle'),
        text('Traction', 140, 80, 1640, 100, 56, 700),
        text('10K+', 140, 280, 500, 120, 72, 700, '#6366f1', 'center'),
        text('Active users', 140, 410, 500, 60, 24, 400, '#64748b', 'center'),
        text('$2M', 710, 280, 500, 120, 72, 700, '#6366f1', 'center'),
        text('ARR', 710, 410, 500, 60, 24, 400, '#64748b', 'center'),
        text('40%', 1280, 280, 500, 120, 72, 700, '#6366f1', 'center'),
        text('MoM growth', 1280, 410, 500, 60, 24, 400, '#64748b', 'center')
      ], 'Traction'),
      slide(4, 'closing', '#0f172a', [
        shape(760, 120, 400, 400, '#4338ca', 'circle', 2),
        text('Thank you', 220, 360, 1480, 140, 88, 700, '#ffffff', 'center'),
        text('contact@company.com', 220, 520, 1480, 80, 32, 400, '#94a3b8', 'center')
      ], 'Closing')
    ]
  },
  {
    id: 'product-launch',
    title: 'Product launch',
    description: 'Announce features, demo flow, and rollout plan',
    themeId: 'modern',
    category: 'product',
    style: 'gradient',
    preview: { gradient: 'linear-gradient(135deg, #eef2ff 0%, #c7d2fe 100%)', accent: '#6366f1' },
    build: () => [
      slide(0, 'title', '#ffffff', [
        shape(140, 140, 1640, 800, '#eef2ff', 'rounded-rectangle'),
        shape(1500, 80, 280, 280, '#6366f1', 'circle', 2),
        text('Product launch', 200, 380, 1520, 120, 80, 700),
        text('Release date · Version 2.0', 200, 520, 1520, 60, 32, 400, '#6366f1')
      ], 'Launch'),
      slide(1, 'title-content', '#ffffff', [
        shape(140, 200, 80, 80, '#6366f1', 'rounded-rectangle'),
        text("What's new", 240, 90, 1540, 100, 56, 700),
        text('• Feature one — headline benefit\n• Feature two — headline benefit\n• Feature three — headline benefit', 140, 240, 1200, 500, 34)
      ], 'Features'),
      slide(2, 'image-right', '#ffffff', [
        text('Live demo', 140, 90, 700, 100, 56, 700),
        text('Walk through the core workflow in under 2 minutes.', 140, 240, 700, 400, 30),
        shape(960, 180, 820, 720, '#f1f5f9', 'rounded-rectangle'),
        shape(980, 200, 780, 680, '#e0e7ff', 'rounded-rectangle', 2)
      ], 'Demo'),
      slide(3, 'closing', '#6366f1', [
        shape(0, 780, 1920, 300, '#4f46e5', 'rectangle', 2),
        text('Rollout plan', 140, 120, 1640, 100, 56, 700, '#ffffff'),
        text('Phase 1: Beta users\nPhase 2: All customers\nPhase 3: Public launch', 140, 280, 800, 400, 32, 400, '#e0e7ff')
      ], 'Rollout')
    ]
  },
  {
    id: 'quarterly-review',
    title: 'Quarterly review',
    description: 'KPIs, wins, challenges, and next-quarter goals',
    themeId: 'professional',
    category: 'business',
    style: 'corporate',
    preview: { gradient: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)', accent: '#2563eb' },
    build: () => [
      slide(0, 'title', '#ffffff', [
        shape(0, 0, 1920, 12, '#2563eb', 'rectangle'),
        text('Q3 Business Review', 180, 340, 1560, 120, 72, 700, '#111827', 'center'),
        text('Team · Date', 180, 480, 1560, 60, 28, 400, '#64748b', 'center')
      ], 'Cover'),
      slide(1, 'metrics', '#f8fafc', [
        text('Key metrics', 140, 80, 1640, 100, 56, 700),
        shape(140, 260, 500, 220, '#ffffff', 'rounded-rectangle'),
        shape(710, 260, 500, 220, '#ffffff', 'rounded-rectangle'),
        shape(1280, 260, 500, 220, '#ffffff', 'rounded-rectangle'),
        text('92%', 140, 280, 500, 100, 64, 700, '#059669', 'center'),
        text('On-time delivery', 140, 390, 500, 50, 22, 400, '#64748b', 'center'),
        text('$4.2M', 710, 280, 500, 100, 64, 700, '#2563eb', 'center'),
        text('Revenue', 710, 390, 500, 50, 22, 400, '#64748b', 'center'),
        text('18', 1280, 280, 500, 100, 64, 700, '#7c3aed', 'center'),
        text('New customers', 1280, 390, 500, 50, 22, 400, '#64748b', 'center')
      ], 'KPIs'),
      slide(2, 'two-column', '#ffffff', [
        text('Wins & challenges', 140, 80, 1640, 100, 56, 700),
        shape(140, 240, 780, 580, '#ecfdf5', 'rounded-rectangle'),
        shape(1000, 240, 780, 580, '#fef2f2', 'rounded-rectangle'),
        text('Wins\n\n• Shipped v2\n• Closed enterprise deal\n• Reduced churn', 180, 280, 700, 520, 28),
        text('Challenges\n\n• Hiring bottleneck\n• Integration delays\n• Support backlog', 1040, 280, 700, 520, 28)
      ], 'Review'),
      slide(3, 'title-content', '#ffffff', [
        shape(140, 220, 1640, 4, '#2563eb', 'rounded-rectangle'),
        text('Next quarter goals', 140, 90, 1640, 100, 56, 700),
        text('1. Launch mobile app\n2. Expand to 3 new markets\n3. Hit $5M ARR', 140, 280, 1200, 500, 34)
      ], 'Goals')
    ]
  },
  {
    id: 'training-workshop',
    title: 'Training workshop',
    description: 'Agenda, modules, exercises, and takeaways',
    themeId: 'warm',
    category: 'education',
    style: 'warm',
    preview: { gradient: 'linear-gradient(135deg, #fffbeb 0%, #fde68a 100%)', accent: '#b45309' },
    build: () => [
      slide(0, 'title', '#fffbeb', [
        shape(200, 180, 1520, 720, '#ffffff', 'rounded-rectangle'),
        text('Workshop title', 180, 340, 1560, 120, 72, 700, '#92400e', 'center'),
        text('Duration · Audience', 180, 480, 1560, 60, 28, 400, '#b45309', 'center')
      ], 'Workshop'),
      slide(1, 'agenda', '#ffffff', [
        shape(140, 200, 8, 560, '#f59e0b', 'rectangle'),
        text('Agenda', 140, 80, 1640, 100, 56, 700),
        text('09:00 — Introduction\n09:30 — Module 1\n10:30 — Break\n10:45 — Module 2\n12:00 — Q&A', 180, 220, 900, 560, 32)
      ], 'Agenda'),
      slide(2, 'title-content', '#ffffff', [
        shape(140, 80, 120, 120, '#fef3c7', 'rounded-rectangle'),
        text('Module 1: Core concepts', 280, 90, 1500, 100, 52, 700),
        text('Explain the foundational ideas participants need.', 140, 240, 1200, 500, 30)
      ], 'Module 1'),
      slide(3, 'closing', '#fffbeb', [
        shape(140, 240, 1640, 520, '#ffffff', 'rounded-rectangle'),
        text('Key takeaways', 180, 120, 1560, 100, 56, 700, '#92400e'),
        text('• Takeaway one\n• Takeaway two\n• Takeaway three', 180, 280, 1000, 400, 32, 400, '#78350f')
      ], 'Takeaways')
    ]
  },
  {
    id: 'minimal-portfolio',
    title: 'Minimal portfolio',
    description: 'Clean showcase for projects and contact',
    themeId: 'minimal',
    category: 'creative',
    style: 'minimal',
    preview: { gradient: 'linear-gradient(135deg, #fafafa 0%, #e5e5e5 100%)', accent: '#171717' },
    build: () => [
      slide(0, 'title', '#fafafa', [
        text('Your Name', 180, 380, 1560, 120, 96, 300, '#171717', 'center'),
        text('Designer · Developer · Creator', 180, 520, 1560, 60, 28, 400, '#737373', 'center')
      ], 'Intro'),
      slide(1, 'two-column', '#ffffff', [
        text('Selected work', 140, 80, 1640, 100, 48, 600),
        shape(140, 260, 780, 420, '#f5f5f5', 'rounded-rectangle'),
        shape(1000, 260, 780, 420, '#f5f5f5', 'rounded-rectangle'),
        text('Project A', 160, 700, 740, 50, 24, 600),
        text('Project B', 1020, 700, 740, 50, 24, 600)
      ], 'Work'),
      slide(2, 'closing', '#171717', [
        shape(860, 200, 200, 200, '#262626', 'circle', 2),
        text("Let's connect", 220, 400, 1480, 120, 72, 600, '#ffffff', 'center'),
        text('hello@email.com', 220, 540, 1480, 60, 28, 400, '#a3a3a3', 'center')
      ], 'Contact')
    ]
  },
  {
    id: 'requirements-brief',
    title: 'Requirements brief',
    description: 'Scope, stakeholders, functional needs, and timeline',
    themeId: 'professional',
    category: 'business',
    style: 'corporate',
    preview: { gradient: 'linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%)', accent: '#0f172a' },
    build: () => [
      slide(0, 'title', '#ffffff', [
        shape(140, 280, 80, 80, '#0f172a', 'rounded-rectangle'),
        text('Requirements brief', 240, 340, 1500, 120, 72, 700, '#111827'),
        text('Project name · Version 1.0', 240, 480, 1500, 60, 28, 400, '#64748b')
      ], 'Brief'),
      slide(1, 'title-content', '#ffffff', [
        text('Background & objectives', 140, 90, 1640, 100, 52, 700),
        shape(140, 240, 1640, 560, '#f8fafc', 'rounded-rectangle'),
        text('Describe the business context and what success looks like.', 180, 280, 1560, 480, 30)
      ], 'Context'),
      slide(2, 'two-column', '#ffffff', [
        text('Scope', 140, 80, 1640, 100, 52, 700),
        shape(140, 240, 780, 580, '#f0fdf4', 'rounded-rectangle'),
        shape(1000, 240, 780, 580, '#fef2f2', 'rounded-rectangle'),
        text('In scope\n\n• Requirement A\n• Requirement B\n• Requirement C', 180, 280, 700, 520, 28),
        text('Out of scope\n\n• Excluded item\n• Future phase', 1040, 280, 700, 520, 28)
      ], 'Scope'),
      slide(3, 'title-content', '#f8fafc', [
        text('Timeline & milestones', 140, 90, 1640, 100, 52, 700),
        text('Phase 1 — Discovery (Week 1-2)\nPhase 2 — Design (Week 3-4)\nPhase 3 — Delivery (Week 5-8)', 140, 280, 1000, 500, 30)
      ], 'Timeline')
    ]
  },
  {
    id: 'dark-tech',
    title: 'Dark tech keynote',
    description: 'Bold dark slides for product demos and developer talks',
    themeId: 'bold',
    category: 'product',
    style: 'dark',
    preview: { gradient: 'linear-gradient(135deg, #020617 0%, #0ea5e9 100%)', accent: '#22d3ee' },
    build: () => [
      slide(0, 'title', '#020617', [
        shape(1400, -200, 700, 700, '#0c4a6e', 'circle', 2),
        shape(-100, 600, 500, 500, '#164e63', 'circle', 2),
        text('Build the future', 180, 340, 1560, 140, 88, 700, '#f8fafc', 'center'),
        text('Developer keynote · 2026', 180, 500, 1560, 60, 32, 400, '#22d3ee', 'center')
      ], 'Keynote'),
      slide(1, 'title-content', '#0f172a', [
        shape(0, 0, 8, 1080, '#22d3ee', 'rectangle'),
        text('Architecture overview', 140, 90, 1640, 100, 56, 700, '#f8fafc'),
        text('Explain the core system design and how components connect.', 140, 240, 1200, 500, 32, 400, '#cbd5e1')
      ], 'Architecture'),
      slide(2, 'metrics', '#020617', [
        shape(140, 240, 1640, 520, '#0f172a', 'rounded-rectangle'),
        text('Performance', 140, 80, 1640, 100, 56, 700, '#f8fafc'),
        text('99.9%', 140, 300, 500, 100, 72, 700, '#22d3ee', 'center'),
        text('Uptime', 140, 410, 500, 50, 22, 400, '#94a3b8', 'center'),
        text('<50ms', 710, 300, 500, 100, 72, 700, '#22d3ee', 'center'),
        text('Latency', 710, 410, 500, 50, 22, 400, '#94a3b8', 'center'),
        text('10x', 1280, 300, 500, 100, 72, 700, '#22d3ee', 'center'),
        text('Throughput', 1280, 410, 500, 50, 22, 400, '#94a3b8', 'center')
      ], 'Metrics'),
      slide(3, 'closing', '#020617', [
        shape(760, 180, 400, 400, '#0e7490', 'circle', 2),
        text('Ship it.', 220, 400, 1480, 140, 96, 700, '#f8fafc', 'center'),
        text('github.com/your-org', 220, 560, 1480, 60, 28, 400, '#64748b', 'center')
      ], 'Closing')
    ]
  },
  {
    id: 'brand-story',
    title: 'Brand story',
    description: 'Narrative arc from mission to vision with visual rhythm',
    themeId: 'warm',
    category: 'creative',
    style: 'editorial',
    preview: { gradient: 'linear-gradient(135deg, #fdf2f8 0%, #fbcfe8 100%)', accent: '#db2777' },
    build: () => [
      slide(0, 'title', '#fdf2f8', [
        shape(120, 120, 1680, 840, '#ffffff', 'rounded-rectangle'),
        shape(1500, 80, 320, 320, '#fce7f3', 'circle', 2),
        text('Our story', 200, 380, 1520, 120, 88, 700, '#831843', 'center'),
        text('Mission · Values · Vision', 200, 520, 1520, 60, 32, 400, '#be185d', 'center')
      ], 'Story'),
      slide(1, 'section-header', '#ffffff', [
        shape(140, 300, 1640, 480, '#fdf2f8', 'rounded-rectangle'),
        text('Chapter 1', 220, 360, 1480, 80, 48, 600, '#831843', 'center'),
        text('Where we started and why it matters', 220, 460, 1480, 80, 32, 400, '#9d174d', 'center')
      ], 'Chapter 1'),
      slide(2, 'quote', '#ffffff', [
        shape(140, 200, 1640, 680, '#fce7f3', 'rounded-rectangle'),
        text('"We believe design should feel human, intentional, and joyful."', 220, 360, 1480, 280, 44, 500, '#831843', 'center'),
        text('— Brand manifesto', 220, 660, 1480, 60, 24, 400, '#be185d', 'center')
      ], 'Manifesto'),
      slide(3, 'closing', '#831843', [
        shape(0, 760, 1920, 320, '#9d174d', 'rectangle', 2),
        text('Join the journey', 220, 380, 1480, 120, 72, 700, '#fdf2f8', 'center'),
        text('brand@company.com', 220, 520, 1480, 60, 28, 400, '#fbcfe8', 'center')
      ], 'Closing')
    ]
  },
  {
    id: 'saas-growth',
    title: 'SaaS growth deck',
    description: 'Modern bento metrics, growth story, and product-led narrative',
    themeId: 'modern',
    category: 'product',
    style: 'gradient',
    preview: { gradient: 'linear-gradient(145deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)', accent: '#8b5cf6' },
    build: () => [
      slide(0, 'title', '#fafafa', [
        shape(0, 0, 1920, 1080, '#6366f1', 'rectangle'),
        shape(1200, -160, 820, 820, '#8b5cf6', 'circle', 2),
        shape(-120, 640, 480, 480, '#a855f7', 'circle', 2),
        text('Scale with confidence', 160, 300, 1600, 160, 96, 700, '#ffffff', 'center'),
        text('Product-led growth · Series B narrative', 160, 480, 1600, 72, 32, 400, '#e0e7ff', 'center')
      ], 'Cover'),
      slide(1, 'metrics', '#ffffff', [
        text('Growth at a glance', 140, 72, 1640, 100, 56, 700),
        shape(140, 220, 520, 280, '#eef2ff', 'rounded-rectangle'),
        shape(680, 220, 520, 280, '#f5f3ff', 'rounded-rectangle'),
        shape(1220, 220, 560, 280, '#fdf4ff', 'rounded-rectangle'),
        shape(140, 520, 780, 380, '#fafafa', 'rounded-rectangle'),
        shape(940, 520, 840, 380, '#6366f1', 'rounded-rectangle'),
        text('3.2x', 140, 260, 520, 120, 80, 700, '#4f46e5', 'center'),
        text('YoY revenue', 140, 390, 520, 50, 22, 400, '#64748b', 'center'),
        text('128%', 680, 260, 520, 120, 80, 700, '#7c3aed', 'center'),
        text('Net retention', 680, 390, 520, 50, 22, 400, '#64748b', 'center'),
        text('$48M', 1220, 260, 560, 120, 80, 700, '#db2777', 'center'),
        text('ARR', 1220, 390, 560, 50, 22, 400, '#64748b', 'center'),
        text('Product velocity\n\nShip weekly. Measure daily. Iterate relentlessly.', 180, 560, 700, 300, 28, 400, '#334155'),
        text('Next milestone\n\n$60M ARR by Q4', 980, 560, 760, 300, 36, 600, '#ffffff', 'center')
      ], 'Metrics'),
      slide(2, 'two-column', '#f8fafc', [
        shape(140, 200, 780, 640, '#ffffff', 'rounded-rectangle'),
        shape(1000, 200, 780, 640, '#ffffff', 'rounded-rectangle'),
        text('Why we win', 140, 80, 1640, 100, 56, 700),
        text('PLG motion\n\nSelf-serve signup\nIn-product expansion\nViral collaboration loops', 180, 260, 700, 540, 28),
        text('Enterprise wedge\n\nSecurity & compliance\nDedicated success\nCustom integrations', 1040, 260, 700, 540, 28)
      ], 'Strategy'),
      slide(3, 'closing', '#0f172a', [
        shape(760, 140, 400, 400, '#6366f1', 'circle', 2),
        text('Build the category', 200, 380, 1520, 140, 88, 700, '#f8fafc', 'center'),
        text('invest@company.com', 200, 540, 1520, 60, 28, 400, '#94a3b8', 'center')
      ], 'Closing')
    ]
  },
  {
    id: 'glass-product',
    title: 'Glass product reveal',
    description: 'Frosted panels, soft gradients, and premium product storytelling',
    themeId: 'modern',
    category: 'product',
    style: 'glass',
    preview: { gradient: 'linear-gradient(160deg, #e0f2fe 0%, #f0f9ff 40%, #ede9fe 100%)', accent: '#0ea5e9' },
    build: () => [
      slide(0, 'title', '#f0f9ff', [
        shape(160, 160, 1600, 760, '#ffffff', 'rounded-rectangle'),
        shape(200, 200, 1520, 680, '#e0f2fe', 'rounded-rectangle', 2),
        shape(1400, 80, 360, 360, '#bae6fd', 'circle', 2),
        text('Introducing Nova', 220, 360, 1480, 140, 88, 700, '#0c4a6e', 'center'),
        text('The next generation of your workflow', 220, 510, 1480, 60, 32, 400, '#0369a1', 'center')
      ], 'Reveal'),
      slide(1, 'image-right', '#ffffff', [
        shape(140, 180, 720, 720, '#f0f9ff', 'rounded-rectangle'),
        shape(160, 200, 680, 680, '#e0f2fe', 'rounded-rectangle', 2),
        text('Designed for focus', 920, 120, 860, 100, 56, 700, '#0c4a6e'),
        text('Every interaction is intentional.\nEvery surface feels calm.\nEvery detail earns its place.', 920, 260, 860, 480, 30, 400, '#334155')
      ], 'Focus'),
      slide(2, 'metrics', '#f8fafc', [
        text('Built different', 140, 80, 1640, 100, 56, 700),
        shape(140, 240, 500, 520, '#ffffff', 'rounded-rectangle'),
        shape(660, 240, 500, 520, '#ffffff', 'rounded-rectangle'),
        shape(1180, 240, 600, 520, '#0ea5e9', 'rounded-rectangle'),
        text('2×', 140, 320, 500, 120, 72, 700, '#0284c7', 'center'),
        text('Faster setup', 140, 450, 500, 50, 22, 400, '#64748b', 'center'),
        text('40%', 660, 320, 500, 120, 72, 700, '#0284c7', 'center'),
        text('Less context switching', 660, 450, 500, 50, 22, 400, '#64748b', 'center'),
        text('Ship day one', 1180, 360, 600, 200, 48, 600, '#ffffff', 'center')
      ], 'Proof'),
      slide(3, 'closing', '#0c4a6e', [
        shape(0, 720, 1920, 360, '#0369a1', 'rectangle', 2),
        text('Available now', 200, 360, 1520, 120, 72, 700, '#f0f9ff', 'center'),
        text('nova.app/early-access', 200, 500, 1520, 60, 28, 400, '#bae6fd', 'center')
      ], 'Launch')
    ]
  },
  {
    id: 'editorial-magazine',
    title: 'Editorial magazine',
    description: 'Oversized type, asymmetric layouts, and editorial rhythm',
    themeId: 'minimal',
    category: 'creative',
    style: 'editorial',
    preview: { gradient: 'linear-gradient(180deg, #fafafa 0%, #d4d4d4 100%)', accent: '#171717' },
    build: () => [
      slide(0, 'title', '#fafafa', [
        text('ISSUE 01', 140, 120, 400, 60, 24, 500, '#737373'),
        text('The Future\nof Work', 140, 280, 1200, 360, 120, 700, '#171717'),
        shape(1280, 180, 500, 720, '#e5e5e5', 'rectangle'),
        text('A visual essay on how teams create, collaborate, and ship in 2026.', 140, 680, 900, 200, 28, 400, '#525252')
      ], 'Cover'),
      slide(1, 'section-header', '#ffffff', [
        shape(140, 280, 8, 520, '#171717', 'rectangle'),
        text('01', 180, 280, 200, 120, 96, 300, '#d4d4d4'),
        text('Remote by design', 180, 400, 1400, 120, 72, 700, '#171717'),
        text('Distributed teams are no longer an exception — they are the operating system.', 180, 540, 1100, 200, 32, 400, '#525252')
      ], 'Chapter'),
      slide(2, 'quote', '#171717', [
        text('"Great work happens when constraints meet craft."', 200, 320, 1520, 320, 56, 500, '#fafafa', 'center'),
        text('Editorial note — Spring 2026', 200, 680, 1520, 60, 22, 400, '#a3a3a3', 'center')
      ], 'Quote'),
      slide(3, 'closing', '#fafafa', [
        text('Read more', 140, 380, 1640, 140, 96, 700, '#171717', 'center'),
        text('studio@magazine.co', 140, 540, 1640, 60, 28, 400, '#737373', 'center')
      ], 'Closing')
    ]
  },
  {
    id: 'neon-startup',
    title: 'Neon startup',
    description: 'Dark canvas with electric accents for bold founder pitches',
    themeId: 'bold',
    category: 'marketing',
    style: 'dark',
    preview: { gradient: 'linear-gradient(135deg, #09090b 0%, #18181b 50%, #22d3ee 100%)', accent: '#22d3ee' },
    build: () => [
      slide(0, 'title', '#09090b', [
        shape(1000, -100, 600, 600, '#164e63', 'circle', 2),
        shape(-80, 500, 400, 400, '#312e81', 'circle', 2),
        text('DISRUPT', 140, 300, 1640, 180, 120, 800, '#fafafa', 'center'),
        text('The category is broken. We fix it.', 140, 500, 1640, 72, 36, 400, '#22d3ee', 'center')
      ], 'Hook'),
      slide(1, 'two-column', '#18181b', [
        text('The shift', 140, 80, 1640, 100, 56, 700, '#fafafa'),
        shape(140, 240, 780, 580, '#27272a', 'rounded-rectangle'),
        shape(1000, 240, 780, 580, '#27272a', 'rounded-rectangle'),
        text('Before\n\nSlow workflows\nFragmented tools\nManual everything', 180, 300, 700, 480, 28, 400, '#a1a1aa'),
        text('After\n\nInstant sync\nUnified platform\nAutonomous ops', 1040, 300, 700, 480, 28, 600, '#22d3ee')
      ], 'Shift'),
      slide(2, 'metrics', '#09090b', [
        shape(140, 220, 1640, 520, '#18181b', 'rounded-rectangle'),
        text('Traction', 140, 80, 1640, 100, 56, 700, '#fafafa'),
        text('$8M', 140, 300, 500, 120, 80, 700, '#22d3ee', 'center'),
        text('Seed raised', 140, 430, 500, 50, 22, 400, '#71717a', 'center'),
        text('50K', 710, 300, 500, 120, 80, 700, '#22d3ee', 'center'),
        text('Waitlist', 710, 430, 500, 50, 22, 400, '#71717a', 'center'),
        text('12', 1280, 300, 500, 120, 80, 700, '#22d3ee', 'center'),
        text('Design partners', 1280, 430, 500, 50, 22, 400, '#71717a', 'center')
      ], 'Traction'),
      slide(3, 'closing', '#22d3ee', [
        text('Join the revolution', 200, 380, 1520, 140, 88, 800, '#09090b', 'center'),
        text('hello@startup.io', 200, 540, 1520, 60, 28, 400, '#0e7490', 'center')
      ], 'Closing')
    ]
  },
  {
    id: 'marketing-campaign',
    title: 'Marketing campaign',
    description: 'Launch narrative, audience hooks, channels, and CTA flow',
    themeId: 'coral',
    category: 'marketing',
    style: 'bold',
    preview: { gradient: 'linear-gradient(135deg, #fff1f2 0%, #fecdd3 50%, #fb7185 100%)', accent: '#e11d48' },
    build: () => [
      slide(0, 'title', '#fff1f2', [
        shape(140, 140, 1640, 800, '#ffffff', 'rounded-rectangle'),
        shape(1500, 60, 320, 320, '#fecdd3', 'circle', 2),
        text('Campaign launch', 200, 360, 1520, 120, 80, 700, '#881337', 'center'),
        text('Spring 2026 · Brand awareness push', 200, 500, 1520, 60, 28, 400, '#be123c', 'center')
      ], 'Campaign'),
      slide(1, 'title-content', '#ffffff', [
        shape(140, 80, 6, 120, '#e11d48', 'rectangle'),
        text('Target audience', 180, 90, 1600, 100, 56, 700),
        text('Primary: Growth-minded professionals 25–40\nSecondary: Early adopters in tech & design\nPain: Too many tools, not enough results', 140, 260, 1200, 520, 30)
      ], 'Audience'),
      slide(2, 'two-column', '#ffffff', [
        text('Channel mix', 140, 80, 1640, 100, 56, 700),
        shape(140, 240, 780, 580, '#fff1f2', 'rounded-rectangle'),
        shape(1000, 240, 780, 580, '#ffe4e6', 'rounded-rectangle'),
        text('Paid\n\n• Social ads\n• Search\n• Retargeting', 180, 300, 700, 480, 28),
        text('Organic\n\n• Content series\n• Influencer collabs\n• Community events', 1040, 300, 700, 480, 28)
      ], 'Channels'),
      slide(3, 'closing', '#881337', [
        text('Launch March 15', 200, 380, 1520, 120, 72, 700, '#fff1f2', 'center'),
        text('#SpringLaunch', 200, 520, 1520, 60, 32, 600, '#fecdd3', 'center')
      ], 'CTA')
    ]
  },
  {
    id: 'investor-update',
    title: 'Investor update',
    description: 'Monthly metrics, highlights, risks, and capital ask',
    themeId: 'professional',
    category: 'business',
    style: 'corporate',
    preview: { gradient: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 50%, #059669 100%)', accent: '#059669' },
    build: () => [
      slide(0, 'title', '#ffffff', [
        shape(0, 0, 1920, 8, '#059669', 'rectangle'),
        text('Investor Update', 180, 340, 1560, 120, 72, 700, '#111827', 'center'),
        text('March 2026 · Confidential', 180, 480, 1560, 60, 28, 400, '#64748b', 'center')
      ], 'Update'),
      slide(1, 'metrics', '#f0fdf4', [
        text('March snapshot', 140, 80, 1640, 100, 56, 700),
        shape(140, 260, 500, 220, '#ffffff', 'rounded-rectangle'),
        shape(710, 260, 500, 220, '#ffffff', 'rounded-rectangle'),
        shape(1280, 260, 500, 220, '#ffffff', 'rounded-rectangle'),
        text('$5.1M', 140, 280, 500, 100, 64, 700, '#059669', 'center'),
        text('MRR', 140, 390, 500, 50, 22, 400, '#64748b', 'center'),
        text('18 mo', 710, 280, 500, 100, 64, 700, '#059669', 'center'),
        text('Runway', 710, 390, 500, 50, 22, 400, '#64748b', 'center'),
        text('NPS 72', 1280, 280, 500, 100, 64, 700, '#059669', 'center'),
        text('Customer love', 1280, 390, 500, 50, 22, 400, '#64748b', 'center')
      ], 'Snapshot'),
      slide(2, 'two-column', '#ffffff', [
        text('Highlights & risks', 140, 80, 1640, 100, 56, 700),
        shape(140, 240, 780, 580, '#ecfdf5', 'rounded-rectangle'),
        shape(1000, 240, 780, 580, '#fef2f2', 'rounded-rectangle'),
        text('Highlights\n\n• Closed 3 enterprise deals\n• Shipped AI assistant\n• Team grew to 24', 180, 300, 700, 480, 28),
        text('Risks\n\n• Longer sales cycles\n• Hiring senior eng\n• Infra costs rising', 1040, 300, 700, 480, 28)
      ], 'Review'),
      slide(3, 'title-content', '#ffffff', [
        text('The ask', 140, 90, 1640, 100, 56, 700),
        text('Raising $4M extension to accelerate GTM and reach profitability by Q2 2027.', 140, 280, 1200, 400, 32)
      ], 'Ask')
    ]
  },
  {
    id: 'design-system-deck',
    title: 'Design system',
    description: 'Tokens, components, patterns, and adoption roadmap',
    themeId: 'midnight',
    category: 'product',
    style: 'minimal',
    preview: { gradient: 'linear-gradient(135deg, #fafafa 0%, #e4e4e7 100%)', accent: '#18181b' },
    build: () => [
      slide(0, 'title', '#fafafa', [
        shape(140, 280, 80, 80, '#18181b', 'rounded-rectangle'),
        text('Design System v2', 240, 320, 1500, 120, 80, 700, '#18181b'),
        text('Unified tokens · Components · Patterns', 240, 460, 1500, 60, 28, 400, '#71717a')
      ], 'System'),
      slide(1, 'two-column', '#ffffff', [
        text('Foundation', 140, 80, 1640, 100, 52, 700),
        shape(140, 240, 780, 580, '#fafafa', 'rounded-rectangle'),
        shape(1000, 240, 780, 580, '#fafafa', 'rounded-rectangle'),
        text('Tokens\n\nColor · Type · Space\nRadius · Shadow\nMotion curves', 180, 300, 700, 480, 28),
        text('Components\n\nButtons · Inputs\nCards · Modals\nNavigation', 1040, 300, 700, 480, 28)
      ], 'Foundation'),
      slide(2, 'title-content', '#ffffff', [
        shape(140, 220, 1640, 560, '#f4f4f5', 'rounded-rectangle'),
        text('Adoption roadmap', 140, 90, 1640, 100, 52, 700),
        text('Q1 — Audit & token migration\nQ2 — Core component library\nQ3 — Full product rollout\nQ4 — Governance & docs', 180, 280, 1000, 480, 30)
      ], 'Roadmap'),
      slide(3, 'closing', '#18181b', [
        text('One system. Every surface.', 200, 400, 1520, 120, 72, 600, '#fafafa', 'center'),
        text('design.company.com/system', 200, 540, 1520, 60, 28, 400, '#a1a1aa', 'center')
      ], 'Closing')
    ]
  },
  {
    id: 'masterclass-course',
    title: 'Masterclass course',
    description: 'Module structure, learning outcomes, and instructor intro',
    themeId: 'forest',
    category: 'education',
    style: 'warm',
    preview: { gradient: 'linear-gradient(135deg, #ecfdf5 0%, #a7f3d0 50%, #059669 100%)', accent: '#059669' },
    build: () => [
      slide(0, 'title', '#ecfdf5', [
        shape(160, 160, 1600, 760, '#ffffff', 'rounded-rectangle'),
        text('Masterclass', 200, 340, 1520, 80, 48, 500, '#059669', 'center'),
        text('Advanced Product Strategy', 200, 420, 1520, 120, 72, 700, '#064e3b', 'center'),
        text('8 modules · 12 hours · Certificate included', 200, 560, 1520, 60, 28, 400, '#047857', 'center')
      ], 'Course'),
      slide(1, 'agenda', '#ffffff', [
        shape(140, 200, 6, 560, '#059669', 'rectangle'),
        text('Curriculum', 140, 80, 1640, 100, 56, 700),
        text('1. Discovery & research\n2. Strategy frameworks\n3. Roadmap prioritization\n4. Stakeholder alignment\n5. Metrics & iteration', 180, 220, 900, 560, 30)
      ], 'Curriculum'),
      slide(2, 'title-content', '#ffffff', [
        shape(140, 80, 100, 100, '#d1fae5', 'rounded-rectangle'),
        text('What you will learn', 260, 90, 1520, 100, 52, 700),
        text('Build conviction in product bets.\nRun discovery that surfaces real insights.\nCommunicate strategy with clarity and data.', 140, 260, 1200, 480, 30)
      ], 'Outcomes'),
      slide(3, 'closing', '#064e3b', [
        text('Enroll today', 200, 380, 1520, 120, 72, 700, '#ecfdf5', 'center'),
        text('learn@platform.com', 200, 520, 1520, 60, 28, 400, '#a7f3d0', 'center')
      ], 'Enroll')
    ]
  },
  {
    id: 'social-impact',
    title: 'Social impact story',
    description: 'Mission-driven narrative with human-centered visuals',
    themeId: 'warm',
    category: 'creative',
    style: 'editorial',
    preview: { gradient: 'linear-gradient(135deg, #fff7ed 0%, #fed7aa 50%, #ea580c 100%)', accent: '#ea580c' },
    build: () => [
      slide(0, 'title', '#fff7ed', [
        shape(-100, 400, 500, 500, '#fed7aa', 'circle', 2),
        shape(1300, 80, 500, 500, '#fdba74', 'circle', 2),
        text('Impact that lasts', 180, 340, 1560, 140, 88, 700, '#7c2d12', 'center'),
        text('Stories from the communities we serve', 180, 500, 1560, 60, 32, 400, '#c2410c', 'center')
      ], 'Mission'),
      slide(1, 'title-content', '#ffffff', [
        text('The challenge', 140, 90, 1640, 100, 56, 700, '#7c2d12'),
        shape(140, 240, 1640, 560, '#fff7ed', 'rounded-rectangle'),
        text('Millions lack access to essential resources. Our programs bridge the gap with local partners and measurable outcomes.', 180, 300, 1560, 440, 32, 400, '#431407')
      ], 'Challenge'),
      slide(2, 'metrics', '#fff7ed', [
        text('Our impact', 140, 80, 1640, 100, 56, 700, '#7c2d12'),
        shape(140, 260, 500, 220, '#ffffff', 'rounded-rectangle'),
        shape(710, 260, 500, 220, '#ffffff', 'rounded-rectangle'),
        shape(1280, 260, 500, 220, '#ffffff', 'rounded-rectangle'),
        text('12K+', 140, 280, 500, 100, 64, 700, '#ea580c', 'center'),
        text('Lives reached', 140, 390, 500, 50, 22, 400, '#78716c', 'center'),
        text('48', 710, 280, 500, 100, 64, 700, '#ea580c', 'center'),
        text('Partner orgs', 710, 390, 500, 50, 22, 400, '#78716c', 'center'),
        text('92%', 1280, 280, 500, 100, 64, 700, '#ea580c', 'center'),
        text('Program completion', 1280, 390, 500, 50, 22, 400, '#78716c', 'center')
      ], 'Impact'),
      slide(3, 'closing', '#7c2d12', [
        text('Partner with us', 200, 380, 1520, 120, 72, 700, '#fff7ed', 'center'),
        text('impact@nonprofit.org', 200, 520, 1520, 60, 28, 400, '#fed7aa', 'center')
      ], 'Closing')
    ]
  },
  {
    id: 'agency-pitch',
    title: 'Agency pitch',
    description: 'Capabilities, case studies, process, and partnership CTA',
    themeId: 'canvas',
    category: 'marketing',
    style: 'minimal',
    preview: { gradient: 'linear-gradient(135deg, #fefce8 0%, #fef08a 100%)', accent: '#ca8a04' },
    build: () => [
      slide(0, 'title', '#fefce8', [
        text('Studio North', 180, 360, 1560, 120, 96, 700, '#422006', 'center'),
        text('Brand · Product · Campaign', 180, 500, 1560, 60, 28, 400, '#a16207', 'center')
      ], 'Agency'),
      slide(1, 'two-column', '#ffffff', [
        text('What we do', 140, 80, 1640, 100, 56, 700),
        shape(140, 240, 780, 580, '#fefce8', 'rounded-rectangle'),
        shape(1000, 240, 780, 580, '#fef9c3', 'rounded-rectangle'),
        text('Brand identity\n\nStrategy & positioning\nVisual systems\nGuidelines & rollout', 180, 300, 700, 480, 28),
        text('Digital product\n\nUX research\nInterface design\nDesign systems', 1040, 300, 700, 480, 28)
      ], 'Capabilities'),
      slide(2, 'title-content', '#ffffff', [
        text('Selected work', 140, 90, 1640, 100, 56, 700),
        shape(140, 240, 780, 420, '#f5f5f4', 'rounded-rectangle'),
        shape(1000, 240, 780, 420, '#f5f5f4', 'rounded-rectangle'),
        text('Fintech rebrand — 3× conversion lift', 160, 680, 740, 50, 24, 600),
        text('Health app — 500K downloads', 1020, 680, 740, 50, 24, 600)
      ], 'Work'),
      slide(3, 'closing', '#422006', [
        text("Let's create together", 200, 400, 1520, 120, 72, 600, '#fefce8', 'center'),
        text('hello@studionorth.co', 200, 540, 1520, 60, 28, 400, '#fde047', 'center')
      ], 'Contact')
    ]
  }
]

export function getTemplateSlideCount(templateId: string): number {
  const template = PRESENTATION_SLIDE_TEMPLATES.find((item) => item.id === templateId)
  return template?.build().length ?? 0
}

export function getTemplatePreviewSlide(templateId: string): PresentationSlide | null {
  const template = PRESENTATION_SLIDE_TEMPLATES.find((item) => item.id === templateId)
  if (!template) return null
  return template.build()[0] ?? null
}

export function cloneSlidesWithNewIds(slides: PresentationSlide[], startOrder: number): PresentationSlide[] {
  return slides
    .filter((slide): slide is PresentationSlide => Boolean(slide && typeof slide === 'object'))
    .map((slide, index) => ({
      ...structuredClone(slide),
      id: crypto.randomUUID(),
      order: startOrder + index,
      elements: getSlideElements(slide).map((element) => ({
        ...structuredClone(element),
        id: crypto.randomUUID()
      }))
    }))
}

export function buildDocumentFromSlideTemplate(
  templateId: string,
  input: { id: string; projectId?: string; title?: string }
): PresentationDocument | null {
  const template = PRESENTATION_SLIDE_TEMPLATES.find((item) => item.id === templateId)
  if (!template) return null
  const now = new Date().toISOString()
  const slides = cloneSlidesWithNewIds(template.build(), 0)
  return {
    schemaVersion: PRESENTATION_SCHEMA_VERSION,
    id: input.id,
    projectId: input.projectId,
    title: input.title ?? template.title,
    description: template.description,
    themeId: template.themeId,
    templateId: template.id,
    logicalSize: { width: PRESENTATION_SLIDE_WIDTH, height: PRESENTATION_SLIDE_HEIGHT },
    slides,
    metadata: { description: template.description },
    createdAt: now,
    updatedAt: now
  }
}
