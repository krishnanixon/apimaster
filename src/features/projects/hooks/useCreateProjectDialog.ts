import { useState } from 'react'
import { toast } from 'sonner'
import { useProjectStore } from '@/shared/stores/project.store'
import { openProjectWindow } from '@/shared/lib/windows'

export function useCreateProjectDialog() {
  const { createProject, openProject } = useProjectStore()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) return
    setCreating(true)
    const project = await createProject(name.trim(), description.trim())
    setCreating(false)
    if (project) {
      setOpen(false)
      setName('')
      setDescription('')
      toast.success('Project created')
      await openProject(project.id)
      await openProjectWindow(project.id, 'overview')
    }
  }

  return {
    open,
    setOpen,
    name,
    setName,
    description,
    setDescription,
    creating,
    handleCreate
  }
}
