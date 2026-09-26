/** End-user Terms & Conditions — bump TERMS_VERSION when the legal text changes. */

import { PRODUCT_NAME } from './product'

export const TERMS_VERSION = '1.0.0'

export const TERMS_TITLE = 'Terms & Conditions'

export const TERMS_LAST_UPDATED = 'August 21, 2026'

export interface TermsSection {
  heading: string
  body: string
}

export const TERMS_SECTIONS: TermsSection[] = [
  {
    heading: '1. Acceptance of terms',
    body: `By installing, downloading, or using ${PRODUCT_NAME} (“the Software”), you agree to these Terms & Conditions. If you do not agree, do not install or use the Software.`
  },
  {
    heading: '2. License',
    body: 'Subject to these terms, you are granted a personal, non-exclusive, non-transferable license to install and use the Software on devices you own or control for your own projects and team work. You may not reverse engineer, redistribute, or sell the Software except as permitted by applicable open-source licenses that accompany specific components.'
  },
  {
    heading: '3. Local-first data',
    body: 'The Software is designed to store projects, documents, conversations, settings, and related data locally on your device. You are responsible for backing up that data. We do not operate a cloud account for your workspace content.'
  },
  {
    heading: '4. AI providers and API keys',
    body: 'Optional AI features require you to supply your own API keys or connect a local model provider (such as Ollama). Keys are stored on your device using the operating system’s secure storage when available. AI requests are sent only when you trigger an AI action, and only to the providers you configure. You are responsible for compliance with those providers’ terms and for any usage charges.'
  },
  {
    heading: '5. Acceptable use',
    body: 'You agree not to use the Software for unlawful purposes, to generate or process content you do not have rights to, or in any way that harms others or violates third-party rights. You are solely responsible for content you create, import, or export.'
  },
  {
    heading: '6. Disclaimer of warranties',
    body: 'The Software is provided “as is” without warranties of any kind, express or implied, including merchantability, fitness for a particular purpose, and non-infringement. AI-generated output may be inaccurate; you must review it before relying on it.'
  },
  {
    heading: '7. Limitation of liability',
    body: 'To the maximum extent permitted by law, the authors and distributors of the Software are not liable for any indirect, incidental, special, consequential, or punitive damages, or for loss of data, profits, or business, arising from your use of the Software.'
  },
  {
    heading: '8. Changes',
    body: 'These terms may be updated when the Software is updated. Continued use after an update that presents a new terms version constitutes acceptance of the revised terms. The version shown during setup is the version you accepted.'
  },
  {
    heading: '9. Contact',
    body: 'For questions about these terms or the Software, refer to the project documentation bundled with the application or the repository maintainers.'
  }
]

/** Plain-text form for NSIS / offline license display. */
export function formatTermsPlainText(): string {
  const lines = [
    PRODUCT_NAME,
    TERMS_TITLE,
    `Version ${TERMS_VERSION} · Last updated ${TERMS_LAST_UPDATED}`,
    '',
    ...TERMS_SECTIONS.flatMap((s) => [s.heading, s.body, ''])
  ]
  return lines.join('\n').trim() + '\n'
}
