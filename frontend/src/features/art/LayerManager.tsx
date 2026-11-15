import React, { useEffect, useState, useCallback } from 'react';
import { Canvas } from 'fabric';
import * as fabric from 'fabric';
import { 
  Folder, 
  FolderOpen, 
  Lock, 
  Unlock, 
  Eye, 
  EyeOff, 
  Trash2,
  ArrowUp,
  ArrowDown,
  Plus,
  Copy,
  Sliders
} from 'lucide-react';
import { Layer, ToolType } from './types';

interface LayerManagerProps {
  canvas: Canvas | null;
  onLayerSelect?: (layer: Layer | null) => void;
  selectedTool?: ToolType;
  toolSettings?: any;
}

const BLEND_MODES: { label: string; value: GlobalCompositeOperation }[] = [
  { label: 'Normal', value: 'source-over' },
  { label: 'Multiply', value: 'multiply' },
  { label: 'Screen', value: 'screen' },
  { label: 'Overlay', value: 'overlay' },
  { label: 'Darken', value: 'darken' },
  { label: 'Lighten', value: 'lighten' },
  { label: 'Color Dodge', value: 'color-dodge' },
  { label: 'Color Burn', value: 'color-burn' },
  { label: 'Hard Light', value: 'hard-light' },
  { label: 'Soft Light', value: 'soft-light' },
  { label: 'Difference', value: 'difference' },
  { label: 'Exclusion', value: 'exclusion' },
];

const LayerManager: React.FC<LayerManagerProps> = ({ canvas, onLayerSelect }) => {
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedLayerIndex, setSelectedLayerIndex] = useState<number | null>(null);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [tempLayerName, setTempLayerName] = useState('');

  // Sync state from Fabric canvas objects
  const updateLayersFromCanvas = useCallback(() => {
    if (!canvas) return;
    const canvasLayers: Layer[] = [];
    const objects = canvas.getObjects();

    objects.forEach((obj, index) => {
      const isSelected = canvas.getActiveObject() === obj;
      canvasLayers.push({
        id: `layer-${index}`,
        name: (obj as any).layerName || `Layer ${index + 1}`,
        visible: obj.visible !== false,
        locked: !obj.selectable,
        opacity: typeof obj.opacity === 'number' ? obj.opacity : 1,
        blendMode: (obj.globalCompositeOperation as string) || 'source-over',
        selected: isSelected,
      });
    });

    setLayers(canvasLayers);

    const activeObj = canvas.getActiveObject();
    if (activeObj) {
      const idx = objects.indexOf(activeObj);
      if (idx !== -1) setSelectedLayerIndex(idx);
    }
  }, [canvas]);

  useEffect(() => {
    if (!canvas) return;

    updateLayersFromCanvas();
    canvas.on('object:added', updateLayersFromCanvas);
    canvas.on('object:modified', updateLayersFromCanvas);
    canvas.on('object:removed', updateLayersFromCanvas);
    canvas.on('selection:created', updateLayersFromCanvas);
    canvas.on('selection:updated', updateLayersFromCanvas);
    canvas.on('selection:cleared', updateLayersFromCanvas);

    return () => {
      canvas.off('object:added', updateLayersFromCanvas);
      canvas.off('object:modified', updateLayersFromCanvas);
      canvas.off('object:removed', updateLayersFromCanvas);
      canvas.off('selection:created', updateLayersFromCanvas);
      canvas.off('selection:updated', updateLayersFromCanvas);
      canvas.off('selection:cleared', updateLayersFromCanvas);
    };
  }, [canvas, updateLayersFromCanvas]);

  // Create a new blank vector rectangle layer
  const createLayer = () => {
    if (!canvas) return;
    const rect = new fabric.Rect({
      width: 120,
      height: 120,
      fill: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`,
      left: 100,
      top: 100,
      opacity: 1,
    });
    (rect as any).layerName = `Layer ${canvas.getObjects().length + 1}`;
    canvas.add(rect);
    canvas.setActiveObject(rect);
    canvas.renderAll();
  };

  const selectLayerByIndex = (index: number) => {
    if (!canvas) return;
    const objects = canvas.getObjects();
    const targetObj = objects[index];
    if (targetObj) {
      canvas.setActiveObject(targetObj);
      canvas.renderAll();
      setSelectedLayerIndex(index);
      if (onLayerSelect) {
        onLayerSelect(layers[index] || null);
      }
    }
  };

  const toggleLayerVisibility = (index: number) => {
    if (!canvas) return;
    const objects = canvas.getObjects();
    const obj = objects[index];
    if (obj) {
      obj.set({ visible: !obj.visible });
      canvas.renderAll();
      updateLayersFromCanvas();
    }
  };

  const toggleLayerLock = (index: number) => {
    if (!canvas) return;
    const objects = canvas.getObjects();
    const obj = objects[index];
    if (obj) {
      const isLocked = !obj.selectable;
      obj.set({ selectable: isLocked, evented: isLocked });
      canvas.renderAll();
      updateLayersFromCanvas();
    }
  };

  const deleteLayerByIndex = (index: number) => {
    if (!canvas) return;
    const objects = canvas.getObjects();
    const obj = objects[index];
    if (obj) {
      canvas.remove(obj);
      canvas.renderAll();
      setSelectedLayerIndex(null);
      if (onLayerSelect) onLayerSelect(null);
      updateLayersFromCanvas();
    }
  };

  const duplicateLayerByIndex = async (index: number) => {
    if (!canvas) return;
    const objects = canvas.getObjects();
    const obj = objects[index];
    if (!obj) return;

    try {
      const cloned = await obj.clone();
      cloned.set({
        left: (cloned.left || 0) + 20,
        top: (cloned.top || 0) + 20,
        evented: true,
      });
      (cloned as any).layerName = `${(obj as any).layerName || `Layer ${index + 1}`} Copy`;
      canvas.add(cloned);
      canvas.setActiveObject(cloned);
      canvas.renderAll();
      updateLayersFromCanvas();
    } catch (e) {
      console.warn('Layer duplicate error', e);
    }
  };

  const moveLayer = (index: number, direction: 'up' | 'down') => {
    if (!canvas) return;
    const objects = canvas.getObjects();
    const obj = objects[index];
    if (!obj) return;

    if (direction === 'up' && index < objects.length - 1) {
      obj.bringForward();
    } else if (direction === 'down' && index > 0) {
      obj.sendBackwards();
    }
    canvas.renderAll();
    updateLayersFromCanvas();
  };

  const setLayerOpacity = (index: number, opacityVal: number) => {
    if (!canvas) return;
    const objects = canvas.getObjects();
    const obj = objects[index];
    if (obj) {
      obj.set({ opacity: opacityVal });
      canvas.renderAll();
      updateLayersFromCanvas();
    }
  };

  const setLayerBlendMode = (index: number, mode: GlobalCompositeOperation) => {
    if (!canvas) return;
    const objects = canvas.getObjects();
    const obj = objects[index];
    if (obj) {
      obj.set({ globalCompositeOperation: mode });
      canvas.renderAll();
      updateLayersFromCanvas();
    }
  };

  const saveLayerName = (index: number) => {
    if (!canvas || !editingLayerId) return;
    const objects = canvas.getObjects();
    const obj = objects[index];
    if (obj && tempLayerName.trim()) {
      (obj as any).layerName = tempLayerName.trim();
      setEditingLayerId(null);
      updateLayersFromCanvas();
    } else {
      setEditingLayerId(null);
    }
  };

  const activeLayer = selectedLayerIndex !== null ? layers[selectedLayerIndex] : null;

  return (
    <div className="w-full h-full bg-studio-background flex flex-col text-studio-text select-none">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-studio-border bg-studio-header">
        <div className="flex items-center gap-2">
          <FolderOpen size={16} className="text-studio-accent" />
          <span className="text-xs font-bold uppercase tracking-wider text-studio-text">Layers</span>
          <span className="text-[10px] text-studio-text-dim bg-studio-panel px-1.5 py-0.5 rounded-full border border-studio-border">
            {layers.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={createLayer}
            className="p-1 hover:bg-studio-hover rounded text-studio-accent transition-colors"
            title="Create new layer"
            type="button"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Layer List - rendered in reverse stack order (top layer at top) */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-1 space-y-1">
        {layers.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-xs text-studio-text-dim">
            <span>No layers on canvas</span>
            <button
              onClick={createLayer}
              className="mt-2 text-[11px] text-studio-accent hover:underline"
              type="button"
            >
              Add a layer to start
            </button>
          </div>
        ) : (
          layers
            .map((layer, index) => ({ layer, index }))
            .reverse()
            .map(({ layer, index }) => {
              const isSelected = selectedLayerIndex === index;
              return (
                <div
                  key={layer.id}
                  onClick={() => selectLayerByIndex(index)}
                  className={`flex items-center justify-between p-2 rounded border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-studio-panel-selected border-studio-accent shadow-sm'
                      : 'bg-studio-panel border-studio-border hover:bg-studio-hover'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {/* Visibility */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLayerVisibility(index);
                      }}
                      className="p-1 text-studio-text-dim hover:text-studio-text rounded"
                      title={layer.visible ? 'Hide layer' : 'Show layer'}
                    >
                      {layer.visible ? <Eye size={13} /> : <EyeOff size={13} className="text-red-400" />}
                    </button>

                    {/* Lock */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLayerLock(index);
                      }}
                      className="p-1 text-studio-text-dim hover:text-studio-text rounded"
                      title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                    >
                      {layer.locked ? <Lock size={13} className="text-amber-400" /> : <Unlock size={13} />}
                    </button>

                    {/* Name */}
                    {editingLayerId === layer.id ? (
                      <input
                        type="text"
                        value={tempLayerName}
                        onChange={(e) => setTempLayerName(e.target.value)}
                        onBlur={() => saveLayerName(index)}
                        onKeyDown={(e) => e.key === 'Enter' && saveLayerName(index)}
                        className="flex-1 bg-black/50 border border-studio-accent rounded px-1.5 py-0.5 text-xs text-white outline-none"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span
                        className="text-xs font-medium truncate flex-1 hover:underline"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setEditingLayerId(layer.id);
                          setTempLayerName(layer.name);
                        }}
                        title="Double-click to rename"
                      >
                        {layer.name}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        moveLayer(index, 'up');
                      }}
                      disabled={index === layers.length - 1}
                      className="p-1 text-studio-text-dim hover:text-studio-text disabled:opacity-20"
                      title="Move up"
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        moveLayer(index, 'down');
                      }}
                      disabled={index === 0}
                      className="p-1 text-studio-text-dim hover:text-studio-text disabled:opacity-20"
                      title="Move down"
                    >
                      <ArrowDown size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicateLayerByIndex(index);
                      }}
                      className="p-1 text-studio-text-dim hover:text-studio-text"
                      title="Duplicate layer"
                    >
                      <Copy size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteLayerByIndex(index);
                      }}
                      className="p-1 text-studio-text-dim hover:text-red-400"
                      title="Delete layer"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })
        )}
      </div>

      {/* Selected Layer Properties Inspector */}
      {activeLayer && selectedLayerIndex !== null && (
        <div className="border-t border-studio-border bg-studio-panel p-3 flex flex-col gap-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-studio-text-dim uppercase tracking-wider">
            <Sliders size={12} />
            <span>Layer Properties: {activeLayer.name}</span>
          </div>

          {/* Opacity slider */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-studio-text-dim uppercase">Opacity</span>
              <span className="font-mono">{Math.round(activeLayer.opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(activeLayer.opacity * 100)}
              onChange={(e) => setLayerOpacity(selectedLayerIndex, Number(e.target.value) / 100)}
              className="w-full accent-studio-accent h-1.5 bg-black/40 rounded appearance-none cursor-pointer"
            />
          </div>

          {/* Blend Mode dropdown */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-studio-text-dim uppercase">Blend Mode</span>
            <select
              value={activeLayer.blendMode}
              onChange={(e) => setLayerBlendMode(selectedLayerIndex, e.target.value as GlobalCompositeOperation)}
              className="w-full bg-black/40 border border-studio-border rounded px-2 py-1 text-xs text-studio-text focus:outline-none focus:border-studio-accent"
            >
              {BLEND_MODES.map((bm) => (
                <option key={bm.value} value={bm.value}>
                  {bm.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
};

export default LayerManager;
