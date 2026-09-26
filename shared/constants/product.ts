/** Central product identity — update here for global rebrand. */

export const PRODUCT_NAME = 'Tessarok'
export const PRODUCT_NAME_SHORT = 'Tessarok'
/** Voice and chat assistant persona */
export const ASSISTANT_NAME = 'Tess'

export function stripAssistantAddress(text: string): string {
  const name = ASSISTANT_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text
    .replace(new RegExp(`\\b(?:hey|hi|ok|okay|yo)\\s+${name}\\b`, 'gi'), ' ')
    .replace(new RegExp(`\\b${name}\\b`, 'gi'), ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export const PRODUCT_TAGLINE = 'AI-powered developer workbench'
export const PRODUCT_DESCRIPTION =
  'An all-in-one AI-powered desktop workspace for software engineers, architects, and development teams.'

/** npm package name — kept for backward compatibility */
export const PACKAGE_NAME = 'ai-requirement-studio'

/** Electron userData directory — kept for backward compatibility */
export const USER_DATA_DIR = 'ai-requirement-studio'

/** Electron appId — kept for backward compatibility with installed builds */
export const APP_ID = 'com.airequirementstudio.app'

/** Document export schema — new writes use v2; v1 remains readable */
export const EXPORT_SCHEMA_V1 = 'ai-requirement-studio/document@1'
export const EXPORT_SCHEMA_V2 = 'ai-workbench-studio/document@1'
