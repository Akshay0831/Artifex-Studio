import React, { useEffect, useRef, useState } from 'react'
import { Brush, Eraser, MousePointer2, Search, Square, Type, Crop, BoxSelect } from 'lucide-react'
import { ToolType } from '../../features/art/types'
import type { ToolShortcutMap } from '../../hooks/useToolShortcuts'
import ToolLookup, { type Tool } from './ToolLookup'

const artTools: Tool[] = [
  {
    id: ToolType.SELECT,
    name: 'Select',
    description: 'Select, move, and transform objects on the canvas.',
    category: 'Selection',
    icon: MousePointer2,
    keywords: ['select', 'move', 'transform', 'pointer'],
  },
  {
    id: ToolType.SELECTION,
    name: 'Marquee',
    description: 'Draw rectangular marquee selection for cropping or AI masking.',
    category: 'Selection',
    icon: BoxSelect,
    keywords: ['marquee', 'box', 'select', 'bounding', 'area'],
  },
  {
    id: ToolType.BRUSH,
    name: 'Brush',
    description: 'Draw freehand paths with the configured brush.',
    category: 'Drawing',
    icon: Brush,
    keywords: ['draw', 'paint', 'freehand'],
  },
  {
    id: ToolType.ERASER,
    name: 'Eraser',
    description: 'Erase using the configured eraser size.',
    category: 'Editing',
    icon: Eraser,
    keywords: ['erase', 'remove'],
  },
  {
    id: ToolType.SHAPE,
    name: 'Shape',
    description: 'Draw geometric shapes (rectangle, circle, triangle).',
    category: 'Shapes',
    icon: Square,
    keywords: ['shape', 'rectangle', 'circle', 'triangle', 'geometry'],
  },
  {
    id: ToolType.TEXT,
    name: 'Text',
    description: 'Add vector typography and editable text.',
    category: 'Typography',
    icon: Type,
    keywords: ['text', 'type', 'typography', 'font'],
  },
  {
    id: ToolType.CROP,
    name: 'Crop',
    description: 'Resize canvas dimensions or crop visible region.',
    category: 'Canvas',
    icon: Crop,
    keywords: ['crop', 'resize', 'dimensions', 'canvas'],
  },
]

interface ArtToolLookupProps {
  activeTool: string
  onToolSelect: (toolId: string) => void
  toolShortcuts: ToolShortcutMap
  onShortcutChange: (toolId: string, value: string) => void
}

const ArtToolLookup: React.FC<ArtToolLookupProps> = ({
  activeTool,
  onToolSelect,
  toolShortcuts,
  onShortcutChange,
}) => {
  const [recentToolIds, setRecentToolIds] = useState<string[]>([])
  const previousActiveTool = useRef(activeTool)

  useEffect(() => {
    if (previousActiveTool.current === activeTool) return
    previousActiveTool.current = activeTool
    if (!artTools.some(tool => tool.id === activeTool)) return
    setRecentToolIds(current => [activeTool, ...current.filter(id => id !== activeTool)].slice(0, 4))
  }, [activeTool])

  const selectTool = (toolId: string) => {
    if (!artTools.some(tool => tool.id === toolId)) return
    onToolSelect(toolId)
    setRecentToolIds(current => [toolId, ...current.filter(id => id !== toolId)].slice(0, 4))
  }

  return (
    <div className="space-y-3">
      <div role="toolbar" aria-label="Art tools" className="grid grid-cols-7 gap-1">
        {artTools.map(tool => {
          const Icon = tool.icon
          const shortcut = toolShortcuts[tool.id]
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => selectTool(tool.id)}
              aria-label={`${tool.name}${shortcut ? `, shortcut ${shortcut.toUpperCase()}` : ''}`}
              aria-pressed={activeTool === tool.id}
              title={`${tool.name}${shortcut ? ` (${shortcut.toUpperCase()})` : ''}`}
              className={`flex min-w-0 items-center justify-center rounded border p-2 transition-colors ${
                activeTool === tool.id
                  ? 'border-studio-accent bg-studio-panel-selected text-studio-text'
                  : 'border-studio-border text-studio-text-dim hover:bg-studio-hover hover:text-studio-text'
              }`}
            >
              <Icon size={16} aria-hidden="true" />
              <span className="sr-only">{tool.name}</span>
            </button>
          )
        })}
      </div>

      {recentToolIds.length > 0 && (
        <div className="flex items-center gap-1" role="toolbar" aria-label="Recent tools">
          <span className="mr-1 text-[10px] text-studio-text-dim">Recent</span>
          {recentToolIds.map(toolId => {
            const tool = artTools.find(item => item.id === toolId)
            if (!tool) return null
            const Icon = tool.icon
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => selectTool(tool.id)}
                aria-label={`Recent tool: ${tool.name}`}
                title={`${tool.name}${toolShortcuts[tool.id] ? ` (${toolShortcuts[tool.id].toUpperCase()})` : ''}`}
                className="rounded p-1.5 text-studio-text-dim hover:bg-studio-hover hover:text-studio-text"
              >
                <Icon size={14} aria-hidden="true" />
              </button>
            )
          })}
        </div>
      )}

      <details className="rounded border border-studio-border">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-1.5 text-xs text-studio-text-dim hover:bg-studio-hover">
          <Search size={14} aria-hidden="true" />
          <span>Browse tools</span>
        </summary>
        <div className="border-t border-studio-border p-2">
          <ToolLookup
            tools={artTools}
            selectedTool={activeTool}
            onToolSelect={selectTool}
            placeholder="Search art tools..."
            showPopular={false}
            showCategories
          />
        </div>
      </details>

      <details className="rounded border border-studio-border">
        <summary className="cursor-pointer list-none px-2 py-1.5 text-xs text-studio-text-dim hover:bg-studio-hover">
          Tool shortcuts
        </summary>
        <div className="space-y-2 border-t border-studio-border p-2">
          {artTools.map(tool => (
            <label key={tool.id} className="flex min-w-0 items-center justify-between gap-2 text-xs">
              <span className="min-w-0 flex-1">{tool.name}</span>
              <input
                aria-label={`${tool.name} shortcut`}
                title={`Set the keyboard shortcut for ${tool.name}`}
                value={(toolShortcuts[tool.id] || '').toUpperCase()}
                onChange={event => onShortcutChange(tool.id, event.target.value)}
                maxLength={1}
                className="h-7 w-9 rounded border border-studio-border bg-studio-input-bg text-center text-studio-text"
              />
            </label>
          ))}
          <p className="text-[10px] text-studio-text-dim">
            Single letters and numbers activate tools when you are not typing in a field.
          </p>
        </div>
      </details>
    </div>
  )
}

export default ArtToolLookup
