import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  Rocket,
  Workflow,
  Brain,
  MessageSquare,
  Sparkles,
  FileText,
  GitBranch,
  Settings,
  Layers,
  BrainCircuit,
  Keyboard,
  HelpCircle,
  Mic,
  Presentation
} from 'lucide-react'
import { PRODUCT_NAME, ASSISTANT_NAME } from '@shared/constants/product'

/**
 * Rich content model for the in-app documentation module.
 * Sections are grouped in the navigation and rendered by DocumentationPage.
 */
export type DocBlock =
  | { kind: 'text'; text: string }
  | { kind: 'subheading'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'steps'; items: { title: string; detail?: string }[] }
  | { kind: 'callout'; tone: 'info' | 'tip' | 'warning'; title?: string; text: string }
  | { kind: 'table'; caption?: string; rows: { label: string; value: string }[] }

export interface DocSection {
  id: string
  title: string
  /** Short label used in the "on this page" navigation. */
  navLabel?: string
  icon: LucideIcon
  group: string
  summary: string
  blocks: DocBlock[]
}

export const DOC_GROUP_ORDER = ['Introduction', 'Modules', 'Under the hood', 'Reference'] as const

export const DOC_SECTIONS: DocSection[] = [
  // ─────────────────────────────── Introduction ───────────────────────────────
  {
    id: 'overview',
    title: 'Overview',
    icon: BookOpen,
    group: 'Introduction',
    summary: `What ${PRODUCT_NAME} is and what it helps you do.`,
    blocks: [
      {
        kind: 'text',
        text: `${PRODUCT_NAME} is an all-in-one AI-powered desktop workspace for software engineers and development teams. It runs fully on your machine as an Electron app, stores everything in a local database, and combines project-scoped requirements engineering with global developer tools — API Studio, Terminal, Vault, VPS Manager, and more.`
      },
      {
        kind: 'text',
        text: 'Work is organized into Projects. Each project is a self-contained workspace with its own knowledge base, conversations, diagrams, and documents. You move a project from a blank idea to a delivery-ready specification without leaving the app.'
      },
      { kind: 'subheading', text: 'What you can do' },
      {
        kind: 'list',
        items: [
          'Capture structured project context in a Knowledge Base that powers every AI feature.',
          'Add a training corpus and model profile in RAG Studio so assistants follow your domain and style.',
          'Chat with an AI assistant that retrieves relevant knowledge via LiteChroma RAG.',
          'Generate professional requirement documents with a guided wizard.',
          'Author and edit rich documents with AI assistance, then export to PDF or DOCX.',
          'Build Gamma-style presentations from prompts and project documents in Presentation Studio.',
          'Model processes and architecture visually in the Flow Designer.',
          'Export finished documents to PDF or DOCX from the document editor.'
        ]
      },
      {
        kind: 'callout',
        tone: 'info',
        title: 'Local-first',
        text: 'All project data lives in a local SQLite database on your computer. AI calls are the only requests that leave your machine, and only when you trigger an AI action with a configured provider.'
      }
    ]
  },
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: Rocket,
    group: 'Introduction',
    summary: 'Set up AI access and create your first project in minutes.',
    blocks: [
      {
        kind: 'steps',
        items: [
          {
            title: 'Connect an AI provider',
            detail:
              'Open App Settings from the sidebar. Under the AI tab, add your OpenAI API key or connect a local Ollama server. The Home screen shows a reminder banner until a provider is configured.'
          },
          {
            title: 'Create a project',
            detail:
              'From Home or Projects, click New Project, give it a name and short description, and open it. This becomes your active workspace.'
          },
          {
            title: 'Build your Knowledge Base',
            detail:
              'Add the core context — goals, scope, stakeholders, modules, decisions, and constraints. This is what makes AI output accurate and specific to your project.'
          },
          {
            title: 'Generate or draft requirements',
            detail:
              'Use the Requirement Wizard to generate a full document, or chat with the assistant to draft sections interactively.'
          },
          {
            title: 'Model and deliver',
            detail:
              'Diagram flows in Flow Designer, then export polished documents as PDF or DOCX from the editor.'
          }
        ]
      },
      {
        kind: 'callout',
        tone: 'tip',
        title: 'Press Ctrl/⌘ + K anywhere',
        text: 'The command palette lets you jump to any screen and search across your project without touching the mouse.'
      }
    ]
  },
  {
    id: 'workflow',
    title: 'The End-to-End Workflow',
    navLabel: 'Workflow',
    icon: Workflow,
    group: 'Introduction',
    summary: 'The recommended flow from idea to delivery, and how modules connect.',
    blocks: [
      {
        kind: 'text',
        text: 'The modules are designed to be used in a natural sequence. Each stage feeds the next, and the Knowledge Base sits at the center — its context flows into chat, generation, and documents.'
      },
      { kind: 'subheading', text: 'Recommended flow' },
      {
        kind: 'steps',
        items: [
          {
            title: '1. Context — Knowledge Base',
            detail: 'Define the problem, scope, stakeholders, modules, and decisions.'
          },
          {
            title: '2. Explore — Chat',
            detail: 'Ask questions, brainstorm, and refine understanding with the AI assistant.'
          },
          {
            title: '3. Author — Generate & Documents',
            detail: 'Produce the requirements document, then edit and expand it with AI assistance.'
          },
          {
            title: '4. Model — Flow Designer',
            detail: 'Visualize processes and architecture with diagrams.'
          },
          {
            title: '5. Deliver — Documents',
            detail: 'Export print-ready PDF or editable DOCX from the document editor.'
          }
        ]
      },
      {
        kind: 'callout',
        tone: 'info',
        title: 'Non-linear by design',
        text: 'You can jump between modules at any time. The workflow is a guide, not a wizard you must complete in order.'
      }
    ]
  },

  // ───────────────────────────────── Modules ─────────────────────────────────
  {
    id: 'knowledge-base',
    title: 'Knowledge Base',
    icon: Brain,
    group: 'Modules',
    summary: 'Structured project context that powers AI chat, documents, and generation.',
    blocks: [
      {
        kind: 'text',
        text: 'The Knowledge Base is the single source of truth for a project. It stores structured context — goals, scope, stakeholders, modules, features, decisions, assumptions, risks, and constraints — in organized sections. Everything you add here becomes available to the AI as grounding context.'
      },
      { kind: 'subheading', text: 'How to use it' },
      {
        kind: 'list',
        items: [
          'Navigate sections from the left panel and add or edit entries inline.',
          'Keep entries concise and specific — they are injected into AI prompts.',
          'Capture decisions and assumptions early so generated documents stay consistent.',
          'Return here whenever scope changes; downstream AI output improves immediately.',
          'Use Index for RAG to embed the knowledge base (and project training docs) into LiteChroma.'
        ]
      },
      {
        kind: 'callout',
        tone: 'tip',
        title: 'Garbage in, garbage out',
        text: 'The quality of generated requirements is directly tied to the quality of your Knowledge Base. Invest here first.'
      },
      {
        kind: 'callout',
        tone: 'info',
        title: 'RAG indexing',
        text: 'Enable RAG under Settings → Vector DB, start LiteChroma, then click Index for RAG. Project AI, document generate/edit, and flow generation will retrieve relevant chunks instead of dumping the entire knowledge base when possible.'
      }
    ]
  },
  {
    id: 'chat',
    title: 'Chat',
    icon: MessageSquare,
    group: 'Modules',
    summary: 'A project-aware AI assistant for brainstorming and drafting.',
    blocks: [
      {
        kind: 'text',
        text: 'Chat is a conversational AI assistant scoped to the current project. With RAG enabled it retrieves the most relevant Knowledge Base chunks and RAG Studio training docs for each turn. The global Assistant also uses your model profile and global training corpus.'
      },
      { kind: 'subheading', text: 'How to use it' },
      {
        kind: 'list',
        items: [
          'Ask clarifying questions, explore trade-offs, or draft requirement sections.',
          'Reference project modules and decisions directly — the assistant already knows them.',
          'Keep multiple conversations to separate different threads of work.',
          'Use it to interrogate the specification: "What is missing from the checkout flow?"',
          'Re-index Knowledge and RAG Studio after large context changes so retrieval stays fresh.'
        ]
      }
    ]
  },
  {
    id: 'voice-assistant',
    title: `${ASSISTANT_NAME} & voice`,
    icon: Mic,
    group: 'Modules',
    summary: `${ASSISTANT_NAME}, the app-wide voice assistant, plus dictation and voice conversations in Chat.`,
    blocks: [
      {
        kind: 'text',
        text: `${ASSISTANT_NAME} lives in the bottom-right corner of every page. Turn her on and she listens in the background: say “${ASSISTANT_NAME}, …” to ask something, or switch to Just ask so every question is answered. Chat has the same voice built in — dictate a message, talk back and forth hands-free, or have any reply read aloud.`
      },
      { kind: 'subheading', text: `Using ${ASSISTANT_NAME}` },
      {
        kind: 'list',
        items: [
          `Click the ${ASSISTANT_NAME} button to open her panel. The switch turns listening on or off and is remembered next time the app opens.`,
          `Pick Say “${ASSISTANT_NAME}” (wake word) or Just ask (every utterance is a question).`,
          'Press Ctrl/⌘ + Space anywhere to start or stop listening. You can also type a question in the panel.',
          'Write tools such as create note or copy to clipboard ask before running. Destructive tools always confirm.'
        ]
      },
      { kind: 'subheading', text: 'Voice in Chat' },
      {
        kind: 'list',
        items: [
          'Mic button: click to dictate, click again to insert the text into the message box.',
          'Voice conversation button: speak, it sends when you pause, reads the answer aloud, then listens again.',
          'Read aloud on any reply. Voice settings (microphone, models, voices) live in Settings → Voice.'
        ]
      },
      {
        kind: 'callout',
        tone: 'info',
        title: 'Cloud vs local',
        text: 'On-device Whisper and Kokoro keep audio on this machine. OpenAI Whisper or OpenAI TTS send audio to the cloud. Audio is not stored unless you enable Store raw audio.'
      }
    ]
  },
  {
    id: 'rag-studio',
    title: 'RAG Studio',
    icon: BrainCircuit,
    group: 'Modules',
    summary: 'Training corpus and model profile that ground every assistant via vector retrieval.',
    blocks: [
      {
        kind: 'text',
        text: 'RAG Studio lets you teach the assistants how to behave. Add training documents (guidelines, examples, domain notes, style rules, FAQs) and a model profile (persona, domain, tone, standing instructions). Documents can be global or project-scoped.'
      },
      { kind: 'subheading', text: 'Workflow' },
      {
        kind: 'steps',
        items: [
          {
            title: 'Configure Vector DB',
            detail: 'Start LiteChroma, add a connection in Settings → Vector DB, and enable RAG.'
          },
          {
            title: 'Add training data',
            detail: 'In RAG Studio, create documents with title, purpose, category, tags, and content.'
          },
          {
            title: 'Set model profile',
            detail: 'Define persona, domain, tone, and standing instructions on the Model profile tab.'
          },
          {
            title: 'Index corpus',
            detail: 'Click Index corpus. Global scope writes rs-train-global; project scope writes rs-train-{projectId}.'
          },
          {
            title: 'Use any chatbot',
            detail: 'Project AI, Global Assistant, Generate, Edit, and Flow AI pull matching training chunks automatically.'
          }
        ]
      },
      {
        kind: 'table',
        caption: 'Collections',
        rows: [
          { label: 'rs-kb-{projectId}', value: 'Project Knowledge Base chunks' },
          { label: 'rs-train-global', value: 'Global training documents' },
          { label: 'rs-train-{projectId}', value: 'Project-scoped training documents' }
        ]
      },
      {
        kind: 'callout',
        tone: 'tip',
        title: 'Pair with Vector Studio',
        text: 'Use Vector Studio to inspect collections and run manual similarity search. Use RAG Studio to author the corpus that chatbots consume.'
      }
    ]
  },
  {
    id: 'generate',
    title: 'Requirement Wizard',
    navLabel: 'Generate',
    icon: Sparkles,
    group: 'Modules',
    summary: 'Step through project context and generate a full requirements document with AI.',
    blocks: [
      {
        kind: 'text',
        text: 'The Requirement Wizard walks you through your project context step by step and generates a professional, well-structured requirements document in one pass. It uses the Knowledge Base plus the choices you make in the wizard. Optional custom rules from Settings → General and from Edit project also apply; leave them empty to keep the default generation style. Project rules override workspace rules when they conflict.'
      },
      { kind: 'subheading', text: 'How to use it' },
      {
        kind: 'steps',
        items: [
          { title: 'Review context', detail: 'Confirm the project details the wizard has gathered.' },
          { title: 'Choose document type and options', detail: 'Select the kind of document and the sections to include.' },
          { title: 'Generate', detail: 'The AI produces a complete draft ready for editing in Documents.' }
        ]
      },
      {
        kind: 'callout',
        tone: 'tip',
        title: 'Custom generation rules',
        text: 'Add workspace rules in Settings → General, or project rules in Edit project. Empty fields keep the built-in default. When both are set, project rules win on conflict.'
      },
      {
        kind: 'callout',
        tone: 'tip',
        title: 'Generate, then refine',
        text: 'Treat generation as a strong first draft. Move to Documents to polish wording, add detail, and validate.'
      }
    ]
  },
  {
    id: 'documents',
    title: 'Documents',
    icon: FileText,
    group: 'Modules',
    summary: 'Specs, contracts, and deliverables with AI-assisted authoring and export.',
    blocks: [
      {
        kind: 'text',
        text: 'Documents lives under the selected project. Open a project, then use Documents in the project sidebar to author specs, drafts, and deliverables for that project only. It includes a rich text editor with tables, lists, code blocks, images, and inline AI assistance.'
      },
      { kind: 'subheading', text: 'How to use it' },
      {
        kind: 'list',
        items: [
          'Open a project first — Documents is scoped to the selected project.',
          'Create documents from scratch or from generated drafts.',
          'Edit with a full rich-text editor and structured formatting.',
          'Use the AI edit panel to rewrite, summarize, or expand selected content.',
          'Export any document to print-ready PDF or editable DOCX from the editor toolbar.',
          'Link finished specs into Presentation Studio so decks are generated from the same source documents.'
        ]
      }
    ]
  },
  {
    id: 'flow-designer',
    title: 'Flow Designer',
    icon: GitBranch,
    group: 'Modules',
    summary: 'Visualize business processes, system architecture, API flows, and user journeys.',
    blocks: [
      {
        kind: 'text',
        text: 'The Flow Designer is a visual canvas for modeling how your system works. Build diagrams of business processes, system architecture, API interactions, and user journeys using drag-and-drop nodes and connections.'
      },
      { kind: 'subheading', text: 'How to use it' },
      {
        kind: 'list',
        items: [
          'Add nodes from the palette and connect them to describe a flow.',
          'Use auto-layout to tidy complex diagrams.',
          'Validate a diagram to catch structural issues.',
          'Let AI suggest or draft flows from your project context.'
        ]
      }
    ]
  },
  {
    id: 'presentation-studio',
    title: 'Presentation Studio',
    icon: Presentation,
    group: 'Modules',
    summary: 'Gamma-style card decks grounded in project documents, with AI generate, assist, present, and PDF export.',
    blocks: [
      {
        kind: 'text',
        text: 'Presentation Studio builds stakeholder-ready card decks inside a project. Cards are flexible content blocks (not fixed PowerPoint slides): edit them as a scrollable stack, then present one card at a time or export to PDF. AI generation and assist can read the same requirement documents you author in Documents.'
      },
      { kind: 'subheading', text: 'Core workflow' },
      {
        kind: 'steps',
        items: [
          {
            title: 'Open Presentation Studio',
            detail: 'From a project sidebar, open Presentation Studio. Create a blank deck, start from a template, or launch AI Generate.'
          },
          {
            title: 'Link project documents',
            detail: 'In Properties → Document references, search and link BRDs, PRDs, or other specs. Linked docs persist on the deck and ground generate, assist, and refresh.'
          },
          {
            title: 'Generate or import',
            detail: 'Use AI Generate with a prompt/outline plus linked docs, Import structure from docs for a deterministic heading-based draft, or AI regenerate from linked docs to rebuild the narrative.'
          },
          {
            title: 'Edit cards',
            detail: 'Use the outline to jump between cards. Edit headings, bullets, columns, metrics, and speaker notes. Change themes anytime.'
          },
          {
            title: 'Refine with AI Assist',
            detail: 'Ask for tone, length, or structure changes. Assist uses linked documents and optional knowledge base, then shows a proposal you apply or dismiss.'
          },
          {
            title: 'Present or export',
            detail: 'Press F5 or Present for fullscreen navigation. Export PDF for sharing outside the app.'
          }
        ]
      },
      { kind: 'subheading', text: 'Document integration' },
      {
        kind: 'list',
        items: [
          'Linked document ids are stored with the presentation (view state) so they survive reloads.',
          'Generate Wizard search-selects documents and keeps them linked after generation.',
          'Import structure splits document HTML by headings/sections into cards without calling AI.',
          'AI regenerate rebuilds the deck from the current linked set and knowledge toggle.',
          'Assist passes the same linked document ids so refinements stay consistent with the specs.',
          'A banner shows which document titles were last read as sources.'
        ]
      },
      { kind: 'subheading', text: 'Features at a glance' },
      {
        kind: 'table',
        rows: [
          { label: 'Themes', value: 'Professional, Modern, Bold, Minimal, Warm, Dark, Coral Pop, Forest, Midnight, Canvas Soft — plus custom colors, fonts, and density.' },
          { label: 'Layouts', value: 'Title, content, split, bullets, metrics, quote, closing, image focus, media left/right.' },
          { label: 'Outline', value: 'Canva-style Design rail with 16:9 page thumbnails, page numbers, and Add page.' },
          { label: 'Images', value: 'Import PNG/JPEG/WebP/SVG from the toolbar, Properties, or image block placeholder.' },
          { label: 'Templates', value: 'Stakeholder update, Requirements walkthrough, Pitch (lite).' },
          { label: 'Present', value: 'Immersive fullscreen editor (like Documents) and browser fullscreen Present mode (F5).' },
          { label: 'AI', value: 'Generate from prompt/docs; assist with approve/apply; regenerate from linked docs.' },
          { label: 'Export', value: 'Landscape PDF via print pipeline.' }
        ]
      },
      {
        kind: 'callout',
        tone: 'tip',
        title: 'Best results',
        text: 'Author or generate requirement documents first, link the ones that matter, then generate the deck. Treat AI output as a draft — edit cards and re-run assist against the same linked sources.'
      },
      {
        kind: 'callout',
        tone: 'info',
        title: 'Not in v1',
        text: 'PPTX / Google Slides export, live share links, and AI image generation are deferred. Presentations stay local to the project database.'
      }
    ]
  },
  {
    id: 'settings',
    title: 'App Settings',
    navLabel: 'Settings',
    icon: Settings,
    group: 'Modules',
    summary: 'Configure AI, appearance, editor behavior, and export defaults.',
    blocks: [
      {
        kind: 'text',
        text: 'App Settings controls global configuration for the whole application. Open it from the sidebar under App Settings. Per-project context — summary, requirements, APIs, and branding — is managed inside each project under Knowledge Base → Overview.'
      },
      { kind: 'subheading', text: 'Settings tabs' },
      {
        kind: 'table',
        rows: [
          { label: 'General', value: 'Document workflow, auto-save, and optional custom generation rules applied to every AI document.' },
          { label: 'AI', value: 'Unified AI setup — defaults, routing, OpenAI API key, and Ollama connection.' },
          { label: 'Usage', value: 'Token usage and estimated cost across features and models.' },
          { label: 'Appearance', value: 'Color mode (light/dark/system), visual theme, and layout density.' },
          { label: 'Export', value: 'Default PDF/DOCX format and formatting options (cover, TOC, page numbers, headers).' },
          { label: 'Vector DB', value: 'LiteChroma connections, RAG toggles, embedding models, and score threshold.' },
          { label: 'About', value: 'App version and local storage information.' }
        ]
      },
      { kind: 'subheading', text: 'AI tab' },
      {
        kind: 'list',
        items: [
          'Defaults — model, temperature, and max tokens for chat, documents, and flows. Changes save automatically.',
          'Routing — automatic fallback between providers and prompt cache for repeated short tasks.',
          'OpenAI — API key (encrypted with Electron safeStorage), connection status, and cloud model settings.',
          'Ollama — local server URL, connection test, and model selection for offline AI.',
          'Choose OpenAI, Ollama, or Hybrid routing anytime in Settings → AI — no restart required.',
          'RAG Studio — add training data and a model profile; enable RAG under Vector DB so every chatbot can retrieve it.'
        ]
      },
      {
        kind: 'callout',
        tone: 'warning',
        title: 'Keep your API key private',
        text: 'Your API key is stored locally and used only to call your chosen provider. Never share it or commit it to source control.'
      }
    ]
  },

  // ──────────────────────────────── Under the hood ────────────────────────────────
  {
    id: 'architecture',
    title: 'Design & Structure',
    navLabel: 'Architecture',
    icon: Layers,
    group: 'Under the hood',
    summary: 'How the application is built and how the code is organized.',
    blocks: [
      {
        kind: 'text',
        text: `${PRODUCT_NAME} is an Electron desktop application. It is split into a main process (Node.js), a preload bridge, and a renderer (the React UI you interact with). Data is persisted locally with SQLite via Prisma.`
      },
      { kind: 'subheading', text: 'Process architecture' },
      {
        kind: 'table',
        rows: [
          { label: 'Main process', value: 'Node.js backend — database access, IPC handlers, repositories, and services (including AI).' },
          { label: 'Preload', value: 'A secure bridge that exposes a typed API to the renderer without leaking Node internals.' },
          { label: 'Renderer', value: 'The React 19 UI, routed with React Router and organized by feature.' },
          { label: 'Database', value: 'Local SQLite accessed through Prisma with a better-sqlite3 adapter.' }
        ]
      },
      { kind: 'subheading', text: 'AI subsystem' },
      {
        kind: 'list',
        items: [
          'Providers — OpenAI and Ollama implementations behind a common interface.',
          'Router — selects the active provider and routes requests.',
          'Prompt cache — avoids repeat work for identical prompts.',
          'Metrics & usage tracking — records token and request usage.'
        ]
      },
      { kind: 'subheading', text: 'Renderer structure' },
      {
        kind: 'text',
        text: 'The UI is organized by feature under src/features (e.g. knowledge, chat, documents, flow-designer, settings). Shared building blocks — layout, UI primitives, stores, and utilities — live under src/shared. State is managed with Zustand stores and styled with Tailwind CSS.'
      },
      {
        kind: 'table',
        caption: 'Key directories',
        rows: [
          { label: 'electron/main', value: 'Backend: database, IPC handlers, repositories, services, AI subsystem.' },
          { label: 'electron/preload', value: 'Secure bridge exposing the API to the renderer.' },
          { label: 'src/features', value: 'Feature modules, each with its own pages, components, and stores.' },
          { label: 'src/shared', value: 'Shared layout, UI components, stores, hooks, and utilities.' },
          { label: 'prisma / generated', value: 'Database schema and the generated Prisma client.' }
        ]
      }
    ]
  },

  // ──────────────────────────────── Reference ────────────────────────────────
  {
    id: 'shortcuts',
    title: 'Tips & Shortcuts',
    navLabel: 'Shortcuts',
    icon: Keyboard,
    group: 'Reference',
    summary: 'Keyboard shortcuts and workflow tips to move faster.',
    blocks: [
      { kind: 'subheading', text: 'Keyboard shortcuts' },
      {
        kind: 'table',
        rows: [
          { label: 'Ctrl / ⌘ + K', value: 'Open the command palette to navigate and search.' },
          { label: 'Ctrl / ⌘ + Space', value: `Turn ${ASSISTANT_NAME} listening on or off.` },
          { label: 'Esc', value: 'Close the command palette or cancel an active voice request.' }
        ]
      },
      { kind: 'subheading', text: 'Workflow tips' },
      {
        kind: 'list',
        items: [
          'Invest in the Knowledge Base first — it improves every AI feature.',
          'Generate a draft, then refine in Documents rather than writing from scratch.',
          'Export PDF or DOCX from the document editor when a deliverable is ready.',
          'Collapse the sidebar to focus on canvas-heavy work in Flow Designer.'
        ]
      }
    ]
  },
  {
    id: 'faq',
    title: 'FAQ',
    icon: HelpCircle,
    group: 'Reference',
    summary: 'Common questions about data, AI, and offline use.',
    blocks: [
      { kind: 'subheading', text: 'Where is my data stored?' },
      {
        kind: 'text',
        text: 'All project data is stored locally in a SQLite database on your computer. Nothing is uploaded except the prompts you explicitly send to your configured AI provider.'
      },
      { kind: 'subheading', text: 'Do I need an internet connection?' },
      {
        kind: 'text',
        text: 'Only AI features require network access, and only when using a hosted provider such as OpenAI. With a local Ollama provider you can run AI features fully offline. All non-AI features work without internet.'
      },
      { kind: 'subheading', text: 'Why is AI output generic?' },
      {
        kind: 'text',
        text: 'The AI grounds its answers in your Knowledge Base. If output feels generic, add more specific context — goals, constraints, modules, and decisions — and try again.'
      },
      { kind: 'subheading', text: 'Can I switch AI providers?' },
      {
        kind: 'text',
        text: 'Yes. Open App Settings → AI to configure OpenAI and Ollama, choose routing mode, and update models. The AI router handles routing, fallback, and usage tracking.'
      }
    ]
  }
]
