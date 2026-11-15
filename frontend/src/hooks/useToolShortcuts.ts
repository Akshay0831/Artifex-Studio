import { useCallback, useEffect, useState } from 'react'

export type ToolShortcutMap = Record<string, string>

function readShortcuts(storageKey: string, defaults: ToolShortcutMap): ToolShortcutMap {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(storageKey) || 'null')
    if (typeof saved !== 'object' || saved === null) return defaults

    const values = saved as Record<string, unknown>
    const shortcuts = { ...defaults }
    const assignedKeys = new Set<string>()
    Object.keys(defaults).forEach(toolId => {
      const value = values[toolId]
      const key = typeof value === 'string' ? value.toLowerCase() : defaults[toolId]
      if (/^[a-z0-9]$/.test(key) && !assignedKeys.has(key)) {
        shortcuts[toolId] = key
        assignedKeys.add(key)
      } else {
        assignedKeys.add(shortcuts[toolId])
      }
    })
    return shortcuts
  } catch {
    return defaults
  }
}

export function useToolShortcuts(
  storageKey: string,
  defaults: ToolShortcutMap,
  onToolSelect: (toolId: string) => void,
) {
  const [shortcuts, setShortcuts] = useState(() => readShortcuts(storageKey, defaults))

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        event.key.length !== 1 ||
        (event.target instanceof Element &&
          event.target.closest('input, textarea, select, [contenteditable="true"]'))
      ) {
        return
      }

      const toolId = Object.keys(shortcuts).find(
        id => shortcuts[id] === event.key.toLowerCase(),
      )
      if (!toolId) return
      event.preventDefault()
      onToolSelect(toolId)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onToolSelect, shortcuts])

  const updateShortcut = useCallback((toolId: string, value: string): string | null => {
    const key = value.trim().toLowerCase()
    if (!Object.prototype.hasOwnProperty.call(shortcuts, toolId)) {
      return 'That tool does not support a keyboard shortcut.'
    }
    if (!/^[a-z0-9]$/.test(key)) {
      return 'Use one letter or number for a tool shortcut.'
    }
    const conflictingTool = Object.keys(shortcuts).find(
      id => id !== toolId && shortcuts[id] === key,
    )
    if (conflictingTool) {
      return `That key is already assigned to ${conflictingTool}.`
    }

    const nextShortcuts = { ...shortcuts, [toolId]: key }
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(nextShortcuts))
    } catch {
      return 'Could not save tool shortcuts in this browser.'
    }
    setShortcuts(nextShortcuts)
    return null
  }, [shortcuts, storageKey])

  return { shortcuts, updateShortcut }
}
