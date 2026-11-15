import React, { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import { TruncatedText } from '../common/TruncatedText'
import { ResizableDivider } from '../common/ResizableDivider'
import { usePersistentPanelWidth } from './usePersistentPanelWidth'

export type DockZone = 'left' | 'center' | 'right'

export interface DockWorkspacePanel {
  id: string
  title: string
  icon: React.ComponentType<{ size?: string | number; className?: string }>
  defaultZone: DockZone
  content: React.ReactNode
}

interface DockLayout {
  zones: Record<DockZone, string[]>
  active: Record<DockZone, string>
  collapsed: Record<DockZone, boolean>
}

interface DockWorkspaceProps {
  panels: DockWorkspacePanel[]
  storageKey?: string
}

const ZONES: DockZone[] = ['left', 'center', 'right']
const DEFAULT_STORAGE_KEY = 'studio-dock-layout:v1'

function createDefaultLayout(panels: DockWorkspacePanel[]): DockLayout {
  const zones: DockLayout['zones'] = { left: [], center: [], right: [] }
  panels.forEach(panel => zones[panel.defaultZone].push(panel.id))
  return {
    zones,
    active: {
      left: zones.left[0] || '',
      center: zones.center[0] || '',
      right: zones.right[0] || '',
    },
    collapsed: { left: false, center: false, right: false },
  }
}

function readLayout(storageKey: string, panels: DockWorkspacePanel[]): DockLayout {
  const defaults = createDefaultLayout(panels)
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) || 'null')
    if (typeof parsed !== 'object' || parsed === null) return defaults
    const saved = parsed as Partial<DockLayout>
    const panelIds = new Set(panels.map(panel => panel.id))
    const zones: DockLayout['zones'] = { left: [], center: [], right: [] }
    const assigned = new Set<string>()

    ZONES.forEach(zone => {
      const savedIds = saved.zones?.[zone]
      if (!Array.isArray(savedIds)) return
      savedIds.forEach(id => {
        if (typeof id === 'string' && panelIds.has(id) && !assigned.has(id)) {
          zones[zone].push(id)
          assigned.add(id)
        }
      })
    })
    panels.forEach(panel => {
      if (!assigned.has(panel.id)) zones[panel.defaultZone].push(panel.id)
    })

    const active: DockLayout['active'] = { left: '', center: '', right: '' }
    ZONES.forEach(zone => {
      const savedActive = saved.active?.[zone]
      active[zone] = typeof savedActive === 'string' && zones[zone].includes(savedActive)
        ? savedActive
        : zones[zone][0] || ''
    })
    const collapsed: DockLayout['collapsed'] = { left: false, center: false, right: false }
    ZONES.forEach(zone => {
      collapsed[zone] = saved.collapsed?.[zone] === true
    })
    return { zones, active, collapsed }
  } catch {
    return defaults
  }
}

export function DockWorkspace({ panels, storageKey = DEFAULT_STORAGE_KEY }: DockWorkspaceProps) {
  const [layout, setLayout] = useState(() => readLayout(storageKey, panels))
  const [leftWidth, resizeLeft] = usePersistentPanelWidth('studio-dock-left-width', 320, 200, 520)
  const [rightWidth, resizeRight] = usePersistentPanelWidth('studio-dock-right-width', 280, 200, 520)

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(layout))
    } catch {
      // Dock changes remain available for the current session.
    }
  }, [layout, storageKey])

  const movePanel = (panelId: string, targetZone: DockZone, targetId?: string) => {
    setLayout(current => {
      if (panelId === targetId) return current
      const sourceZone = ZONES.find(zone => current.zones[zone].includes(panelId))
      if (!sourceZone) return current
      const zones = {
        left: [...current.zones.left],
        center: [...current.zones.center],
        right: [...current.zones.right],
      }
      zones[sourceZone] = zones[sourceZone].filter(id => id !== panelId)
      const destination = zones[targetZone]
      const targetIndex = targetId ? destination.indexOf(targetId) : -1
      destination.splice(targetIndex < 0 ? destination.length : targetIndex, 0, panelId)

      const active = { ...current.active }
      active[targetZone] = panelId
      if (active[sourceZone] === panelId) active[sourceZone] = zones[sourceZone][0] || ''
      return {
        ...current,
        zones,
        active,
        collapsed: { ...current.collapsed, [targetZone]: false },
      }
    })
  }

  const handleDrop = (event: React.DragEvent<HTMLElement>, zone: DockZone, targetId?: string) => {
    event.preventDefault()
    event.stopPropagation()
    const panelId = event.dataTransfer.getData('text/plain')
    if (panelId) movePanel(panelId, zone, targetId)
  }

  const toggleCollapsed = (zone: DockZone) => {
    setLayout(current => ({
      ...current,
      collapsed: { ...current.collapsed, [zone]: !current.collapsed[zone] },
    }))
  }

  const activatePanel = (zone: DockZone, panelId: string) => {
    setLayout(current => ({
      ...current,
      active: { ...current.active, [zone]: panelId },
      collapsed: { ...current.collapsed, [zone]: false },
    }))
  }

  const moveWithKeyboard = (panelId: string, zone: DockZone, offset: number) => {
    const currentIndex = ZONES.indexOf(zone)
    const targetZone = ZONES[currentIndex + offset]
    if (targetZone) movePanel(panelId, targetZone)
  }

  const resetLayout = () => setLayout(createDefaultLayout(panels))
  const leftTrack = layout.collapsed.left ? 48 : leftWidth
  const rightTrack = layout.collapsed.right ? 48 : rightWidth
  const centerTrack = layout.collapsed.center ? '48px' : 'minmax(0, 1fr)'
  const gridTemplateColumns = `${leftTrack}px ${centerTrack} ${rightTrack}px`

  const renderZoneHeader = (zone: DockZone, index: number) => {
    const panelIds = layout.zones[zone]
    const isCollapsed = layout.collapsed[zone]
    const zoneTitle = `${zone[0].toUpperCase()}${zone.slice(1)} dock`
    return (
      <div
        key={`${zone}-header`}
        role="tablist"
        aria-label={`${zoneTitle} panels`}
        className={`dock-panel-header flex min-w-0 items-center gap-1 border border-studio-border bg-studio-header p-1 ${isCollapsed ? 'dock-panel-header-collapsed flex-col' : ''}`}
        data-collapsed={isCollapsed}
        style={{
          gridColumn: index + 1,
          gridRow: 1,
          containerType: 'inline-size',
          maxHeight: isCollapsed ? '50vh' : undefined,
          overflowY: isCollapsed ? 'auto' : 'hidden',
        }}
        onDragOver={event => event.preventDefault()}
        onDrop={event => handleDrop(event, zone)}
      >
        {panelIds.map(panelId => {
          const panel = panels.find(item => item.id === panelId)
          if (!panel) return null
          const Icon = panel.icon
          const selected = layout.active[zone] === panel.id
          return (
            <button
              key={panel.id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`studio-panel-${panel.id}`}
              aria-label={panel.title}
              title={`${panel.title} — drag to move; Alt+Arrow keys move between docks`}
              draggable
              onDragStart={event => {
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', panel.id)
              }}
              onDragOver={event => event.preventDefault()}
              onDrop={event => handleDrop(event, zone, panel.id)}
              onClick={() => activatePanel(zone, panel.id)}
              onKeyDown={event => {
                if (!event.altKey) return
                if (event.key === 'ArrowLeft') {
                  event.preventDefault()
                  moveWithKeyboard(panel.id, zone, -1)
                } else if (event.key === 'ArrowRight') {
                  event.preventDefault()
                  moveWithKeyboard(panel.id, zone, 1)
                }
              }}
              className={`dock-panel-tab flex min-w-0 items-center justify-center gap-2 rounded-sm px-2 py-1 text-xs transition-colors ${
                selected
                  ? 'bg-studio-panel-selected text-studio-text'
                  : 'text-studio-text-dim hover:bg-studio-hover hover:text-studio-text'
              }`}
              style={{ maxWidth: isCollapsed ? 40 : 160 }}
            >
              <Icon size={14} className="shrink-0" />
              <TruncatedText text={panel.title} className="dock-panel-label text-xs font-medium" />
            </button>
          )
        })}
        {panelIds.length === 0 && !isCollapsed && (
          <span className="dock-panel-label min-w-0 flex-1 truncate px-2 text-xs text-studio-text-dim">
            Drop a panel here
          </span>
        )}
        {zone === 'center' && (
          <button
            type="button"
            onClick={resetLayout}
            className="ml-auto shrink-0 rounded p-1 text-studio-text-dim hover:bg-studio-hover hover:text-studio-text"
            aria-label="Reset panel layout"
            title="Reset panel layout"
          >
            <RotateCcw size={14} />
          </button>
        )}
        <button
          type="button"
          onClick={() => toggleCollapsed(zone)}
          className={`${zone === 'center' ? '' : 'ml-auto'} shrink-0 rounded p-1 text-studio-text-dim hover:bg-studio-hover hover:text-studio-text`}
          aria-expanded={!isCollapsed}
          aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${zoneTitle}`}
          title={`${isCollapsed ? 'Expand' : 'Collapse'} ${zoneTitle}`}
        >
          {zone === 'right'
            ? <ChevronRight size={14} className={isCollapsed ? 'rotate-180' : ''} />
            : <ChevronLeft size={14} className={isCollapsed ? 'rotate-180' : ''} />}
        </button>
      </div>
    )
  }

  return (
    <div
      className="relative grid min-h-0 min-w-0 flex-1 overflow-hidden bg-studio-background"
      style={{
        gridTemplateColumns,
        gridTemplateRows: 'auto minmax(0, 1fr)',
        gap: 'var(--spacing-xs)',
      }}
    >
      {ZONES.map(renderZoneHeader)}
      {panels.map(panel => {
        const zone = ZONES.find(item => layout.zones[item].includes(panel.id)) || panel.defaultZone
        const zoneIndex = ZONES.indexOf(zone)
        const isVisible = layout.active[zone] === panel.id && !layout.collapsed[zone]
        return (
          <div
            key={panel.id}
            id={`studio-panel-${panel.id}`}
            role="tabpanel"
            aria-hidden={!isVisible}
            className="dock-panel-content min-h-0 min-w-0 overflow-hidden rounded-sm border border-studio-border bg-studio-panel text-studio-text"
            style={{
              gridColumn: zoneIndex + 1,
              gridRow: 2,
              visibility: isVisible ? 'visible' : 'hidden',
              pointerEvents: isVisible ? 'auto' : 'none',
              zIndex: isVisible ? 1 : 0,
            }}
          >
            {panel.content}
          </div>
        )
      })}
      {layout.zones.center.length === 0 && !layout.collapsed.center && (
        <div
          className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center text-sm text-studio-text-dim"
          style={{ gridColumn: 2, gridRow: 2 }}
        >
          <span>Drop a panel in this area</span>
        </div>
      )}
      {!layout.collapsed.left && (
        <div
          className="pointer-events-none relative z-20"
          style={{ gridColumn: 1, gridRow: '1 / 3' }}
        >
          <ResizableDivider
            label="Resize left dock"
            size={leftWidth}
            minSize={200}
            maxSize={520}
            side="right"
            onResize={resizeLeft}
          />
        </div>
      )}
      {!layout.collapsed.right && (
        <div
          className="pointer-events-none relative z-20"
          style={{ gridColumn: 3, gridRow: '1 / 3' }}
        >
          <ResizableDivider
            label="Resize right dock"
            size={rightWidth}
            minSize={200}
            maxSize={520}
            side="left"
            onResize={resizeRight}
          />
        </div>
      )}
    </div>
  )
}
