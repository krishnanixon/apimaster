import { toast } from 'sonner'
import { useCodeEditorStore } from '../stores/codeEditor.store'
import { useCodeIndexStore } from '../stores/codeIndex.store'
import { useEditorSettingsStore } from '../stores/editorSettings.store'
import { useGitStore } from '../stores/git.store'
import { useProblemsStore } from '../stores/problems.store'
import { useWorkbenchLayoutStore } from '../stores/workbench.store'
import { toggleWorkbenchTerminal } from './terminal-workbench'

export interface WorkbenchCommand {
  id: string
  title: string
  category: 'File' | 'Edit' | 'View' | 'Go' | 'Git' | 'Terminal' | 'AI' | 'Preferences'
  shortcut?: string
  run: () => void | Promise<void>
}

/** Every command exposed through the workbench palette (`Ctrl+Shift+P`). */
export function workbenchCommands(): WorkbenchCommand[] {
  const editor = useCodeEditorStore.getState()
  const layout = useWorkbenchLayoutStore.getState()
  const settings = useEditorSettingsStore.getState()

  return [
    {
      id: 'file.save',
      title: 'File: Save',
      category: 'File',
      shortcut: 'Ctrl+S',
      run: () => editor.saveActiveTab()
    },
    {
      id: 'file.saveAll',
      title: 'File: Save All',
      category: 'File',
      shortcut: 'Ctrl+Shift+S',
      run: () => editor.saveAllTabs()
    },
    {
      id: 'file.newFile',
      title: 'File: New File…',
      category: 'File',
      run: () => {
        if (!editor.rootPath) return
        layout.setLeftTab('files')
        window.dispatchEvent(new CustomEvent('workbench:new-entry', { detail: { kind: 'file' } }))
      }
    },
    {
      id: 'file.reopenClosed',
      title: 'File: Reopen Closed Editor',
      category: 'File',
      shortcut: 'Ctrl+Shift+T',
      run: () => editor.reopenClosedTab()
    },
    {
      id: 'file.openFolder',
      title: 'File: Open Folder…',
      category: 'File',
      run: () => editor.openFolder()
    },
    {
      id: 'file.closeTab',
      title: 'File: Close Editor',
      category: 'File',
      shortcut: 'Ctrl+W',
      run: () => {
        if (editor.activeTabPath) editor.closeTab(editor.activeTabPath)
      }
    },
    {
      id: 'file.closeOthers',
      title: 'File: Close Other Editors',
      category: 'File',
      run: () => {
        if (editor.activeTabPath) editor.closeOtherTabs(editor.activeTabPath)
      }
    },
    {
      id: 'file.closeAll',
      title: 'File: Close All Editors',
      category: 'File',
      run: () => editor.closeAllTabs()
    },
    {
      id: 'file.revealInExplorer',
      title: 'File: Reveal Active File in Explorer',
      category: 'File',
      run: () => {
        if (!editor.activeTabPath) return
        layout.setLeftTab('files')
        void editor.revealPathInTree(editor.activeTabPath)
      }
    },
    {
      id: 'file.copyPath',
      title: 'File: Copy Path of Active File',
      category: 'File',
      run: async () => {
        if (!editor.activeTabPath) return
        await navigator.clipboard.writeText(editor.activeTabPath)
        toast.success('Path copied')
      }
    },
    {
      id: 'file.copyRelativePath',
      title: 'File: Copy Relative Path of Active File',
      category: 'File',
      run: async () => {
        if (!editor.activeTabPath) return
        const { relativeTo } = await import('./paths')
        await navigator.clipboard.writeText(relativeTo(editor.rootPath, editor.activeTabPath))
        toast.success('Relative path copied')
      }
    },
    {
      id: 'edit.inlineAi',
      title: 'AI: Inline Edit',
      category: 'AI',
      shortcut: 'Ctrl+K',
      run: () => {
        void import('../stores/inlineEdit.store').then(({ useInlineEditStore }) => {
          useInlineEditStore.getState().togglePrompt()
        })
      }
    },
    {
      id: 'edit.format',
      title: 'Format Document',
      category: 'Edit',
      shortcut: 'Shift+Alt+F',
      run: () => editor.formatActiveTab()
    },
    {
      id: 'edit.togglePin',
      title: 'Editor: Toggle Pin',
      category: 'Edit',
      run: () => {
        if (editor.activeTabPath) editor.togglePinTab(editor.activeTabPath)
      }
    },
    {
      id: 'view.splitEditor',
      title: 'View: Split Editor',
      category: 'View',
      shortcut: 'Ctrl+\\',
      run: () => editor.toggleSplit()
    },
    {
      id: 'view.compareWithHead',
      title: 'Git: Compare Active File with HEAD',
      category: 'Git',
      run: () => {
        if (editor.activeTabPath) void editor.openDiff(editor.activeTabPath)
      }
    },
    {
      id: 'view.closeDiff',
      title: 'Git: Close Diff Editor',
      category: 'Git',
      run: () => editor.closeDiff()
    },
    {
      id: 'view.toggleSidebar',
      title: 'View: Toggle Primary Side Bar',
      category: 'View',
      shortcut: 'Ctrl+B',
      run: () => layout.toggleSidebar()
    },
    {
      id: 'view.togglePanel',
      title: 'View: Toggle Panel',
      category: 'View',
      shortcut: 'Ctrl+J',
      run: () => toggleWorkbenchTerminal()
    },
    {
      id: 'view.commandPalette',
      title: 'Show Command Palette',
      category: 'View',
      shortcut: 'Ctrl+Shift+P',
      run: () => layout.openQuickOpen('commands')
    },
    {
      id: 'view.explorer',
      title: 'View: Show Explorer',
      category: 'View',
      shortcut: 'Ctrl+Shift+E',
      run: () => layout.setLeftTab('files')
    },
    {
      id: 'view.search',
      title: 'View: Show Search',
      category: 'View',
      shortcut: 'Ctrl+Shift+F',
      run: () => layout.setLeftTab('search')
    },
    {
      id: 'view.git',
      title: 'View: Show Source Control',
      category: 'View',
      shortcut: 'Ctrl+Shift+G',
      run: () => {
        layout.setLeftTab('git')
        void useGitStore.getState().refresh()
      }
    },
    {
      id: 'view.outline',
      title: 'View: Show Outline',
      category: 'View',
      run: () => layout.setLeftTab('outline')
    },
    {
      id: 'view.seoAudit',
      title: 'SEO: Audit Workspace for Search and LLM Visibility',
      category: 'AI',
      run: async () => {
        layout.setLeftTab('seo')
        const { useSeoAuditStore } = await import('../stores/seoAudit.store')
        await useSeoAuditStore.getState().run()
      }
    },
    {
      id: 'view.problems',
      title: 'View: Show Problems',
      category: 'View',
      shortcut: 'Ctrl+Shift+M',
      run: () => layout.openProblems()
    },
    {
      id: 'view.toggleTerminal',
      title: 'View: Toggle Terminal',
      category: 'Terminal',
      shortcut: 'Ctrl+`',
      run: () => toggleWorkbenchTerminal()
    },
    {
      id: 'view.toggleWordWrap',
      title: 'View: Toggle Word Wrap',
      category: 'View',
      shortcut: 'Alt+Z',
      run: () => settings.set('wordWrap', settings.wordWrap === 'off' ? 'on' : 'off')
    },
    {
      id: 'view.toggleMinimap',
      title: 'View: Toggle Minimap',
      category: 'View',
      run: () => settings.toggle('minimap')
    },
    {
      id: 'view.toggleLineNumbers',
      title: 'View: Toggle Line Numbers',
      category: 'View',
      run: () => settings.toggle('lineNumbers')
    },
    {
      id: 'view.toggleIndentGuides',
      title: 'View: Toggle Indent Guides',
      category: 'View',
      run: () => settings.toggle('indentGuides')
    },
    {
      id: 'view.zoomIn',
      title: 'View: Zoom In Editor Font',
      category: 'View',
      shortcut: 'Ctrl+=',
      run: () => settings.zoomIn()
    },
    {
      id: 'view.zoomOut',
      title: 'View: Zoom Out Editor Font',
      category: 'View',
      shortcut: 'Ctrl+-',
      run: () => settings.zoomOut()
    },
    {
      id: 'view.resetZoom',
      title: 'View: Reset Editor Font Size',
      category: 'View',
      shortcut: 'Ctrl+0',
      run: () => settings.resetZoom()
    },
    {
      id: 'go.file',
      title: 'Go to File…',
      category: 'Go',
      shortcut: 'Ctrl+P',
      run: () => layout.openQuickOpen('files')
    },
    {
      id: 'go.line',
      title: 'Go to Line…',
      category: 'Go',
      shortcut: 'Ctrl+G',
      run: () => layout.openQuickOpen('line')
    },
    {
      id: 'go.symbolInFile',
      title: 'Go to Symbol in Editor…',
      category: 'Go',
      shortcut: 'Ctrl+Shift+O',
      run: () => layout.openQuickOpen('fileSymbols')
    },
    {
      id: 'go.symbolInWorkspace',
      title: 'Go to Symbol in Workspace…',
      category: 'Go',
      shortcut: 'Ctrl+T',
      run: () => layout.openQuickOpen('workspaceSymbols')
    },
    {
      id: 'go.definition',
      title: 'Go to Definition of Selection',
      category: 'Go',
      shortcut: 'F12',
      run: async () => {
        const { goToDefinitionAtCursor } = await import('./navigation')
        await goToDefinitionAtCursor()
      }
    },
    {
      id: 'go.references',
      title: 'Find References of Selection',
      category: 'Go',
      shortcut: 'Shift+F12',
      run: async () => {
        const { findReferencesAtCursor } = await import('./navigation')
        await findReferencesAtCursor()
      }
    },
    {
      id: 'git.fetch',
      title: 'Git: Fetch',
      category: 'Git',
      run: () => useGitStore.getState().fetch()
    },
    {
      id: 'git.pull',
      title: 'Git: Pull',
      category: 'Git',
      run: () => useGitStore.getState().pull()
    },
    {
      id: 'git.push',
      title: 'Git: Push',
      category: 'Git',
      run: () => useGitStore.getState().push()
    },
    {
      id: 'git.stash',
      title: 'Git: Stash',
      category: 'Git',
      run: () => useGitStore.getState().stash()
    },
    {
      id: 'git.stashPop',
      title: 'Git: Pop Stash',
      category: 'Git',
      run: () => useGitStore.getState().stashPop()
    },
    {
      id: 'git.commit',
      title: 'Git: Commit Staged Changes',
      category: 'Git',
      run: () => useGitStore.getState().commit()
    },
    {
      id: 'git.refresh',
      title: 'Git: Refresh Status',
      category: 'Git',
      run: () => useGitStore.getState().refresh()
    },
    {
      id: 'debug.start',
      title: 'Debug: Start Debugging',
      category: 'Terminal',
      shortcut: 'F5',
      run: () => {
        void import('../stores/debug.store').then(({ useDebugStore }) => useDebugStore.getState().start())
      }
    },
    {
      id: 'debug.stop',
      title: 'Debug: Stop',
      category: 'Terminal',
      shortcut: 'Shift+F5',
      run: () => {
        void import('../stores/debug.store').then(({ useDebugStore }) => useDebugStore.getState().stop())
      }
    },
    {
      id: 'debug.stepOver',
      title: 'Debug: Step Over',
      category: 'Terminal',
      shortcut: 'F10',
      run: () => {
        void import('../stores/debug.store').then(({ useDebugStore }) => useDebugStore.getState().stepOver())
      }
    },
    {
      id: 'debug.toggleBreakpoint',
      title: 'Debug: Toggle Breakpoint',
      category: 'Terminal',
      shortcut: 'F9',
      run: () => {
        const path = editor.activeTabPath
        const line = editor.cursor?.line
        if (!path || !line) return
        void import('../stores/debug.store').then(({ useDebugStore }) =>
          useDebugStore.getState().toggleBreakpoint(path, line)
        )
      }
    },
    {
      id: 'view.debug',
      title: 'View: Show Debug Panel',
      category: 'View',
      run: () => layout.openDebug()
    },
    {
      id: 'problems.refresh',
      title: 'Problems: Run TypeScript Diagnostics',
      category: 'View',
      run: () => {
        if (editor.rootPath) void useProblemsStore.getState().refresh(editor.rootPath)
      }
    },
    {
      id: 'index.rebuild',
      title: 'Code Index: Rebuild',
      category: 'View',
      run: () => useCodeIndexStore.getState().start()
    },
    {
      id: 'ai.toggleAgent',
      title: 'AI: Toggle Agent Panel',
      category: 'AI',
      shortcut: 'Ctrl+L',
      run: () => layout.openAgent()
    },
    {
      id: 'ai.toggleTabCompletions',
      title: 'AI: Toggle Tab Completions',
      category: 'AI',
      run: () => {
        settings.toggle('aiTabCompletions')
        toast.success(
          `Tab completions ${useEditorSettingsStore.getState().aiTabCompletions ? 'enabled' : 'disabled'}`
        )
      }
    },
    {
      id: 'preferences.toggleAutoSave',
      title: 'Preferences: Toggle Auto Save',
      category: 'Preferences',
      run: () => {
        const next = settings.autoSave === 'off' ? 'afterDelay' : 'off'
        settings.set('autoSave', next)
        toast.success(`Auto save ${next === 'off' ? 'disabled' : 'enabled'}`)
      }
    },
    {
      id: 'preferences.toggleFormatOnSave',
      title: 'Preferences: Toggle Format on Save',
      category: 'Preferences',
      run: () => {
        settings.toggle('formatOnSave')
        toast.success(`Format on save ${useEditorSettingsStore.getState().formatOnSave ? 'enabled' : 'disabled'}`)
      }
    },
    {
      id: 'preferences.openSettings',
      title: 'Preferences: Open Editor Settings',
      category: 'Preferences',
      run: () => layout.setSettingsOpen(true)
    }
  ]
}
