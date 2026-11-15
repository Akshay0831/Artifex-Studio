import { COMMON_SHORTCUTS, type Shortcut } from './KeyboardShortcuts';

export function KeyboardShortcutsHelp() {
  const categories = COMMON_SHORTCUTS.reduce((acc, shortcut) => {
    if (!shortcut.category) return acc
    if (!acc[shortcut.category]) acc[shortcut.category] = []
    acc[shortcut.category].push(shortcut)
    return acc
  }, {} as Record<string, Shortcut[]>)

  return (
    <div className="bg-studio-card rounded-lg border border-studio-border p-6 max-h-96 overflow-y-auto">
      <h3 className="text-lg font-bold text-studio-text mb-4">Keyboard Shortcuts</h3>

      <div className="space-y-6">
        {Object.entries(categories).map(([category, shortcuts]) => (
          <div key={category}>
            <h4 className="font-medium text-studio-text-dim mb-2">{category}</h4>
            <div className="space-y-1">
              {shortcuts.map((shortcut, index) => {
                const modifierKeys = [
                  shortcut.ctrl && 'Ctrl',
                  shortcut.shift && 'Shift',
                  shortcut.alt && 'Alt',
                  shortcut.meta && 'Cmd'
                ].filter(Boolean).join('+')

                return (
                  <div key={index} className="flex justify-between items-center py-1">
                    <span className="text-sm text-studio-text">
                      {modifierKeys && (
                        <span className="text-studio-secondary font-mono mr-2">
                          {modifierKeys}+
                        </span>
                      )}
                      <span className="font-mono text-studio-accent">
                        {shortcut.key.toUpperCase()}
                      </span>
                    </span>
                    <span className="text-xs text-studio-text-dim text-right">
                      {shortcut.description}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
