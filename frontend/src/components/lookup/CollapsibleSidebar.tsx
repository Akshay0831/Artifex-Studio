import React, { useState, useCallback, useContext } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, GripVertical } from 'lucide-react';
import { cn } from '../../lib/utils';
import { MaterialButton } from '../common/MaterialButton';
import { ResizableDivider } from '../common/ResizableDivider';
import { TruncatedText } from '../common/TruncatedText';
import { usePersistentPanelWidth } from '../layout/usePersistentPanelWidth';
import { DockSectionContext } from '../layout/DockSectionContext';

interface CollapsibleSidebarProps {
  children: React.ReactNode;
  title: string;
  icon?: React.ComponentType<any>;
  defaultCollapsed?: boolean;
  minWidth?: number;
  maxWidth?: number;
  defaultWidth?: number;
  storageKey?: string;
  className?: string;
  onCollapse?: (collapsed: boolean) => void;
}

const CollapsibleSidebar: React.FC<CollapsibleSidebarProps> = ({
  children,
  title,
  icon: Icon,
  defaultCollapsed = false,
  minWidth = 200,
  maxWidth = 400,
  defaultWidth = 320,
  storageKey,
  className = '',
  onCollapse,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [width, resize] = usePersistentPanelWidth(
    storageKey || `studio-sidebar:${title}`,
    defaultWidth,
    minWidth,
    maxWidth,
  );

  const handleCollapse = useCallback(() => {
    const newCollapsedState = !isCollapsed;
    setIsCollapsed(newCollapsedState);
    onCollapse?.(newCollapsedState);
  }, [isCollapsed, onCollapse]);

  const sidebarStyle = {
    width: isCollapsed ? '48px' : `${width}px`,
    minWidth: isCollapsed ? '48px' : `${minWidth}px`,
    maxWidth: isCollapsed ? '48px' : `${maxWidth}px`,
  };

  return (
    <div
      className={cn(
        "group relative flex shrink-0 flex-col bg-studio-panel border-r border-studio-border shadow-lg",
        "transition-[width] duration-200 ease-in-out",
        className
      )}
      style={sidebarStyle}
    >
      {/* Header */}
      <div className="flex min-w-0 items-center justify-between gap-2 p-3 border-b border-studio-border bg-studio-header">
        {!isCollapsed && (
          <div className="flex min-w-0 items-center gap-2">
            {Icon && <Icon size={16} />}
            <TruncatedText text={title} className="text-sm font-bold text-studio-text" />
          </div>
        )}
        <MaterialButton
          variant="ghost"
          size="icon"
          onClick={handleCollapse}
          className="p-1"
        >
          {isCollapsed ? (
            <ChevronRight size={16} />
          ) : (
            <ChevronLeft size={16} />
          )}
        </MaterialButton>
      </div>

      {!isCollapsed && (
        <ResizableDivider
          label={`Resize ${title} panel`}
          size={width}
          minSize={minWidth}
          maxSize={maxWidth}
          side="right"
          onResize={resize}
        />
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {!isCollapsed && (
          <div className="h-full overflow-y-auto custom-scrollbar">
            {children}
          </div>
        )}
      </div>

    </div>
  );
};

interface SidebarSectionProps {
  id?: string;
  title: string;
  icon?: React.ComponentType<any>;
  children: React.ReactNode;
  collapsed?: boolean;
  onToggle?: () => void;
}

export const SidebarSection: React.FC<SidebarSectionProps> = ({
  id,
  title,
  icon: Icon,
  children,
  collapsed,
  onToggle
}) => {
  const sectionId = id || title;
  const dockSections = useContext(DockSectionContext);
  const [localCollapsed, setLocalCollapsed] = useState(collapsed ?? false);
  const isCollapsed = dockSections?.collapsed(sectionId) ?? localCollapsed;
  const toggle = () => {
    if (dockSections) dockSections.toggleCollapsed(sectionId);
    else setLocalCollapsed(value => !value);
    onToggle?.();
  };

  return (
    <section
      className="min-w-0 border-b border-studio-border/30"
      onDragOver={event => {
        if (dockSections) event.preventDefault();
      }}
      onDrop={event => dockSections?.dropOn(sectionId, event)}
    >
      <div
        className="flex min-w-0 items-center gap-1 px-2 py-2"
        draggable={dockSections?.canMove(sectionId) ?? false}
        onDragStart={event => dockSections?.startDragging(sectionId, event)}
        title={`${title} — drag to reorder`}
      >
        {dockSections?.canMove(sectionId) && <GripVertical size={12} className="shrink-0 cursor-grab text-studio-text-dim" aria-hidden="true" />}
        {Icon && <Icon size={14} className="shrink-0 text-studio-accent" aria-hidden="true" />}
        <TruncatedText
          text={title}
          className="flex-1 text-xs font-bold uppercase tracking-wider text-studio-text-dim"
        />
        {dockSections?.canMove(sectionId) && (
          <>
            <button
              type="button"
              onClick={() => dockSections.move(sectionId, -1)}
              className="rounded p-1 text-studio-text-dim hover:bg-studio-hover hover:text-studio-text"
              aria-label={`Move ${title} up`}
              title="Move up"
            >
              <ChevronUp size={12} />
            </button>
            <button
              type="button"
              onClick={() => dockSections.move(sectionId, 1)}
              className="rounded p-1 text-studio-text-dim hover:bg-studio-hover hover:text-studio-text"
              aria-label={`Move ${title} down`}
              title="Move down"
            >
              <ChevronDown size={12} />
            </button>
          </>
        )}
        <button
          type="button"
          onClick={toggle}
          className="rounded p-1 text-studio-text-dim hover:bg-studio-hover hover:text-studio-text"
          aria-expanded={!isCollapsed}
          aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${title}`}
          title={`${isCollapsed ? 'Expand' : 'Collapse'} ${title}`}
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
      {!isCollapsed && (
        <div className="space-y-2 px-3 pb-3">
          {children}
        </div>
      )}
    </section>
  );
};

export default CollapsibleSidebar;