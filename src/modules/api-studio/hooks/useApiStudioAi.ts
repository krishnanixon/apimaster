import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { toast } from 'sonner'
import { useParams } from 'react-router-dom'
import { useApiStudioStore } from '../stores/apiStudioStore'
import { applyGeneratedRequest } from '../services/aiApply'
import { createEmptyKeyValue } from '../services/requestBuilder'
import { buildDescriptionFromPayload } from '../services/requestDescription'
import type { EnhanceApiRequestResult, GeneratedApiRequestResult } from '@shared/types/api-studio'
import type { ApiStudioEnhanceAction } from '@shared/types/api-studio'

export function useApiStudioAi(tabId: string) {
  const tab = useApiStudioStore((s) => s.tabs.find((t) => t.id === tabId))
  const updateDraft = useApiStudioStore((s) => s.updateDraft)
  const setRequestView = useApiStudioStore((s) => s.setRequestView)
  const openScratchTab = useApiStudioStore((s) => s.openScratchTab)
  const environments = useApiStudioStore((s) => s.environments)
  const activeEnvironmentId = useApiStudioStore((s) => s.activeEnvironmentId)
  const updateEnvironmentVariables = useApiStudioStore((s) => s.updateEnvironmentVariables)
  const { projectId } = useParams<{ projectId: string }>()
  const [busy, setBusy] = useState(false)

  const env = environments.find((e) => e.id === activeEnvironmentId) ?? null
  const environmentKeys = env?.variables.filter((v) => v.enabled && v.key.trim()).map((v) => v.key) ?? []

  function applyToTab(result: GeneratedApiRequestResult, asNewTab: boolean) {
    const patch = applyGeneratedRequest(result)
    if (asNewTab) {
      openScratchTab(patch)
      return
    }
    updateDraft(tabId, patch)
  }

  async function generateFromText(prompt: string, asNewTab: boolean) {
    if (!tab) return
    setBusy(true)
    try {
      const res = await window.electronAPI.apiStudio.ai.generateRequest({
        prompt,
        projectId: projectId ?? null,
        currentRequest: tab.request,
        environmentKeys
      })
      if (!res.success || !res.data) throw new Error(res.error)
      applyToTab(res.data, asNewTab)
      toast.success(asNewTab ? 'Request generated in a new tab' : 'Request updated')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate request')
    } finally {
      setBusy(false)
    }
  }

  async function enhance(action: ApiStudioEnhanceAction, prompt?: string): Promise<EnhanceApiRequestResult | null> {
    if (!tab) return null
    setBusy(true)
    try {
      const res = await window.electronAPI.apiStudio.ai.enhance({
        action,
        request: tab.request,
        response: tab.response ?? undefined,
        prompt,
        environmentName: env?.name,
        environmentKeys,
        projectId: projectId ?? null
      })
      if (!res.success || !res.data) throw new Error(res.error)
      return res.data
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI action failed')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function completeRequest() {
    const data = await enhance('complete')
    if (!data?.request) return
    applyToTab({ request: data.request, notes: data.notes }, false)
    toast.success('Request completed with AI')
  }

  async function fillBody() {
    const data = await enhance('body')
    if (!data?.body) return
    updateDraft(tabId, { body: data.body })
    setRequestView(tabId, 'body')
    toast.success('Body filled with AI')
  }

  async function fillScript() {
    const data = await enhance('script')
    if (!data?.script) return
    updateDraft(tabId, { preRequestScript: data.script })
    setRequestView(tabId, 'pre-request')
    toast.success('Pre-request script added')
  }

  async function reviewRequest(): Promise<string | null> {
    const data = await enhance('review')
    return data?.review ?? null
  }

  async function suggestVariables() {
    const data = await enhance('variables')
    if (!data) return
    if (data.request) applyToTab({ request: data.request, notes: data.notes }, false)
    if (data.variables && data.variables.length > 0) {
      if (!env) {
        toast.message('No active environment', {
          description: 'Request was updated with {{variables}}. Create an environment to store values.'
        })
      } else {
        const existingKeys = new Set(env.variables.map((v) => v.key))
        const merged = [...env.variables]
        for (const variable of data.variables) {
          const key = variable.key.trim()
          if (!key || existingKeys.has(key)) continue
          existingKeys.add(key)
          merged.push({ id: uuidv4(), key, value: variable.value, enabled: true })
        }
        if (merged[merged.length - 1]?.key.trim()) merged.push(createEmptyKeyValue())
        updateEnvironmentVariables(env.id, merged)
        toast.success(`Added ${data.variables.length} variable${data.variables.length === 1 ? '' : 's'} to ${env.name}`)
      }
    } else {
      toast.message('No new variables suggested')
    }
  }

  async function describeNotes() {
    if (!tab) return
    setBusy(true)
    try {
      const res = await window.electronAPI.apiStudio.ai.describeRequest({
        request: tab.request,
        projectId: projectId ?? null
      })
      const text = res.success ? res.data?.trim() : ''
      if (text) {
        updateDraft(tabId, { description: text })
        setRequestView(tabId, 'notes')
        toast.success('Notes generated')
        return
      }
      updateDraft(tabId, { description: buildDescriptionFromPayload(tab.request) })
      setRequestView(tabId, 'notes')
      toast.message('Used local summary', { description: res.error })
    } catch {
      updateDraft(tabId, { description: buildDescriptionFromPayload(tab.request) })
      setRequestView(tabId, 'notes')
      toast.success('Notes generated from payload')
    } finally {
      setBusy(false)
    }
  }

  async function explainResponse(): Promise<string | null> {
    if (!tab?.response) {
      toast.error('Send a request first')
      return null
    }
    setBusy(true)
    try {
      const res = await window.electronAPI.apiStudio.ai.explainResponse({
        request: tab.request,
        response: tab.response,
        projectId: projectId ?? null
      })
      if (!res.success || !res.data) throw new Error(res.error)
      return res.data
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to explain response')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function generateTests() {
    if (!tab?.response) {
      toast.error('Send a request first')
      return
    }
    setBusy(true)
    try {
      const res = await window.electronAPI.apiStudio.ai.generateTests({
        request: tab.request,
        response: tab.response,
        projectId: projectId ?? null
      })
      if (!res.success || !res.data) throw new Error(res.error)
      updateDraft(tabId, { tests: res.data })
      setRequestView(tabId, 'tests')
      toast.success('Tests added to the Tests tab')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate tests')
    } finally {
      setBusy(false)
    }
  }

  async function fixRequest() {
    if (!tab) return
    setBusy(true)
    try {
      const res = await window.electronAPI.apiStudio.ai.fixRequest({
        request: tab.request,
        response: tab.response ?? undefined,
        errorMessage: tab.response?.error,
        environmentKeys,
        projectId: projectId ?? null
      })
      if (!res.success || !res.data) throw new Error(res.error)
      applyToTab(res.data, false)
      toast.success('Request updated with AI suggestions')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to fix request')
    } finally {
      setBusy(false)
    }
  }

  return {
    tab,
    busy,
    generateFromText,
    completeRequest,
    fillBody,
    fillScript,
    reviewRequest,
    suggestVariables,
    describeNotes,
    explainResponse,
    generateTests,
    fixRequest
  }
}
