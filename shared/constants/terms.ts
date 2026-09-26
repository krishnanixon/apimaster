/** End-user Terms & Conditions — bump TERMS_VERSION when the legal text changes. */

import { PRODUCT_NAME } from './product'

/** Changing this asks every existing user to review and accept the new terms on next launch. */
export const TERMS_VERSION = '1.1.0'

export const TERMS_TITLE = 'Terms & Conditions'

export const TERMS_LAST_UPDATED = 'September 27, 2026'

export interface TermsSection {
  /** Stable anchor id for deep links and the table of contents. */
  id: string
  heading: string
  body: string
}

/** Plain-language highlights shown above the full text. Not a substitute for the sections. */
export const TERMS_SUMMARY: string[] = [
  `${PRODUCT_NAME} is open-source software provided “as is”, without warranty.`,
  'Your collections, environments, history, and settings stay on this device. There is no account and no telemetry.',
  'Requests go straight from your machine to the endpoints you choose. Only call systems you are authorized to use.',
  'AI is optional. When you run an AI action, the relevant request details are sent to the provider you configured.'
]

export const TERMS_SECTIONS: TermsSection[] = [
  {
    id: 'acceptance',
    heading: '1. Acceptance of terms',
    body: `By installing, downloading, or using ${PRODUCT_NAME} (“the Software”), you agree to these Terms & Conditions. If you do not agree, do not install or use the Software.`
  },
  {
    id: 'license',
    heading: '2. Open-source license',
    body: 'The Software is distributed under the MIT License. These terms describe how the application behaves and your responsibilities when using it; they do not restrict the rights the MIT License grants you to use, copy, modify, and distribute the source code. If these terms conflict with the MIT License, the MIT License governs.'
  },
  {
    id: 'local-data',
    heading: '3. Local-first data',
    body: 'Collections, requests, environments, history, and settings are stored locally on your device. The Software does not provide a cloud account or sync service, and does not collect analytics or telemetry. Logs and bug reports are written to your local app data folder and are never uploaded automatically. You are responsible for backing up your data.'
  },
  {
    id: 'requests',
    heading: '4. Requests you send',
    body: 'HTTP and WebSocket requests, collection runs, and OAuth flows are sent directly from your device to the addresses you enter. You must only send requests to systems you own or are authorized to access and test. Do not use the Software to gain unauthorized access, disrupt services, or exceed the rate limits or terms of the APIs you call. You are responsible for the traffic you generate and its effects.'
  },
  {
    id: 'credentials',
    heading: '5. Credentials and secrets',
    body: 'Tokens, passwords, API keys, and environment variables you enter are stored on this device. Keep your device and user account secure. Collection and environment exports are plain files: review them before sharing or committing them to version control so you do not publish secrets.'
  },
  {
    id: 'scripts',
    heading: '6. Scripts',
    body: 'Pre-request and test scripts run on your device when you send a request or run a collection. Only run scripts you wrote or obtained from sources you trust, especially in collections you import from others.'
  },
  {
    id: 'ai',
    heading: '7. AI features',
    body: 'AI features are optional and require your own API key or a local model provider such as Ollama. Provider keys are stored using the operating system’s secure storage when available. Nothing is sent to an AI provider until you trigger an AI action; when you do, the details needed for that action, such as the URL, headers, body, and response excerpts, are sent to the provider you configured. These may contain credentials, so review a request before using AI on it. You are responsible for complying with your provider’s terms and for any usage charges. AI output can be wrong: review generated requests, tests, and explanations before relying on them.'
  },
  {
    id: 'imports',
    heading: '8. Imported content',
    body: 'You may import Postman collections, OpenAPI documents, and cURL commands. You are responsible for having the right to use content you import, create, or export with the Software.'
  },
  {
    id: 'warranty',
    heading: '9. Disclaimer of warranties',
    body: 'The Software is provided “as is” without warranties of any kind, express or implied, including merchantability, fitness for a particular purpose, and non-infringement.'
  },
  {
    id: 'liability',
    heading: '10. Limitation of liability',
    body: 'To the maximum extent permitted by law, the authors and distributors of the Software are not liable for any indirect, incidental, special, consequential, or punitive damages, or for loss of data, profits, or business, arising from your use of the Software or from requests sent with it.'
  },
  {
    id: 'changes',
    heading: '11. Changes to these terms',
    body: 'These terms may change when the Software is updated. When they do, the Software shows the new version on launch and asks you to accept it before you continue. The version and date you accepted are shown under Settings → About.'
  },
  {
    id: 'contact',
    heading: '12. Contact',
    body: 'For questions about these terms or the Software, refer to the project documentation bundled with the application or contact the repository maintainers.'
  }
]

/** Plain-text form for NSIS / offline license display (build/license.txt). */
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
