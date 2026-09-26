const PROJECT_HINT =
  /\b(projects?|requirements?|features?|modules?|apis?|endpoints?|stakeholders?|scope|databases?|schemas?|risks?|workflows?|decisions?|documents?|user stor(?:y|ies)|knowledge)\b/i
const APP_HINT = /\b(this|the|our)\s+(app|system|product|software)\b/i

/** True when a spoken turn is likely about studio project knowledge. */
export function looksLikeProjectQuestion(text: string): boolean {
  const raw = text.trim()
  return PROJECT_HINT.test(raw) || APP_HINT.test(raw)
}
