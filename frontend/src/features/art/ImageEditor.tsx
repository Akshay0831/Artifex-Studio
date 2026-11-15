import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Canvas, PencilBrush, FabricImage, Point } from 'fabric';
import { 
  Download, 
  Undo2, 
  Redo2, 
  Layers, 
  SlidersHorizontal, 
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Hand,
  Paintbrush
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useStudioStore } from '../../core/useStudioStore';
import { useWorktree } from '../../core/useWorktree';
import { useImageEditor } from '../../hooks/useImageEditor';
import { DockWorkspace } from '../../components/layout/DockWorkspace';
import LayerManager from './LayerManager';
import EditingTools from './EditingTools';
import { ToolType, ToolSettings } from './types';

const ImageEditor: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { yImage, yExperimental } = useStudioStore();
  const { isReviewMode, activeProposalId, proposals } = useWorktree();

  const { 
    fabricRef, 
    activeTool, 
    syncCanvasToYjs, 
    pushSnapshot,
    undo, 
    redo,
    canUndo,
    canRedo
  } = useImageEditor(yImage);

  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const [selectedLayer, setSelectedLayer] = useState<number | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isSpacePanning, setIsSpacePanning] = useState<boolean>(false);
  const [isMaskMode, setIsMaskMode] = useState<boolean>(false);
  const activeToolRef = useRef(activeTool);
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);

  const [toolSettings, setToolSettings] = useState<ToolSettings>({
    brushSize: 8,
    brushColor: '#ffffff',
    eraserSize: 24,
    fillColor: '#4f46e5',
    maskColor: 'rgba(239, 68, 68, 0.45)',
    strokeColor: '#000000',
    strokeWidth: 2,
    opacity: 1,
    blendMode: 'source-over'
  });

  const handleSettingsChange = (newSettings: Partial<ToolSettings>) => {
    setToolSettings(prev => ({ ...prev, ...newSettings }));
    
    if (fabricRef.current && (activeTool === ToolType.BRUSH || isMaskMode) && fabricRef.current.freeDrawingBrush) {
      fabricRef.current.freeDrawingBrush.width = newSettings.brushSize || toolSettings.brushSize;
      fabricRef.current.freeDrawingBrush.color = isMaskMode 
        ? (newSettings.maskColor || toolSettings.maskColor) 
        : (newSettings.brushColor || toolSettings.brushColor);
    }
    
    if (fabricRef.current && activeTool === ToolType.ERASER && fabricRef.current.freeDrawingBrush) {
      fabricRef.current.freeDrawingBrush.width = newSettings.eraserSize || toolSettings.eraserSize;
    }
  };

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current) return;
    
    const c = new Canvas(canvasRef.current, { 
      width: 512, 
      height: 512, 
      backgroundColor: '#0a0a0a',
      preserveObjectStacking: true,
      selection: true,
      defaultCursor: 'crosshair',
      hoverCursor: 'crosshair'
    });
    
    fabricRef.current = c;
    setCanvas(c);
    
    const pencilBrush = new PencilBrush(c);
    c.freeDrawingBrush = pencilBrush;
    c.isDrawingMode = false;
    
    // History & Sync events
    const handleMutation = () => {
      syncCanvasToYjs();
      pushSnapshot();
    };

    const handleSelection = (e: any) => {
      const activeObject = e.target;
      if (activeObject) {
        const objects = c.getObjects();
        const layerIndex = objects.indexOf(activeObject);
        setSelectedLayer(layerIndex !== -1 ? layerIndex : null);
      }
    };
    
    c.on('object:modified', handleMutation);
    c.on('object:added', handleMutation);
    c.on('object:removed', handleMutation);
    c.on('selection:created', handleSelection);
    c.on('selection:updated', handleSelection);
    c.on('selection:cleared', () => setSelectedLayer(null));

    // Wheel Zoom centered at cursor
    c.on('mouse:wheel', (opt: any) => {
      const delta = opt.e.deltaY;
      let zoom = c.getZoom() * (0.999 ** delta);
      zoom = Math.min(Math.max(0.1, zoom), 10);
      c.zoomToPoint(new Point(opt.e.offsetX, opt.e.offsetY), zoom);
      setZoomLevel(Math.round(zoom * 100));
      opt.e.preventDefault();
      opt.e.stopPropagation();
    });

    // Panning with drag
    let isDragging = false;
    let lastPosX = 0;
    let lastPosY = 0;

    // Marquee selection dragging
    let isSelectingMarquee = false;
    let marqueeRect: fabric.Rect | null = null;
    let marqueeStartX = 0;
    let marqueeStartY = 0;

    c.on('mouse:down', (opt: any) => {
      const evt = opt.e;
      // Middle click (button === 1) or Spacebar held down
      if (evt.button === 1 || evt.altKey || isSpacePanning) {
        isDragging = true;
        c.selection = false;
        lastPosX = evt.clientX;
        lastPosY = evt.clientY;
        return;
      }

      if (activeToolRef.current === ToolType.SELECTION && evt.button === 0) {
        isSelectingMarquee = true;
        c.selection = false;
        c.getObjects().filter((o: any) => o.isMarquee).forEach(o => c.remove(o));

        const pointer = c.getPointer(opt.e);
        marqueeStartX = pointer.x;
        marqueeStartY = pointer.y;

        marqueeRect = new fabric.Rect({
          left: marqueeStartX,
          top: marqueeStartY,
          width: 0,
          height: 0,
          fill: 'rgba(99, 102, 241, 0.15)',
          stroke: '#6366f1',
          strokeWidth: 1.5,
          strokeDashArray: [4, 4],
          selectable: true,
          hasRotatingPoint: false,
        });
        (marqueeRect as any).isMarquee = true;
        (marqueeRect as any).layerName = 'Marquee Selection';
        c.add(marqueeRect);
        c.renderAll();
      }
    });

    c.on('mouse:move', (opt: any) => {
      if (isDragging) {
        const evt = opt.e;
        const vpt = c.viewportTransform;
        if (vpt) {
          vpt[4] += evt.clientX - lastPosX;
          vpt[5] += evt.clientY - lastPosY;
          c.requestRenderAll();
        }
        lastPosX = evt.clientX;
        lastPosY = evt.clientY;
        return;
      }

      if (isSelectingMarquee && marqueeRect) {
        const pointer = c.getPointer(opt.e);
        const left = Math.min(marqueeStartX, pointer.x);
        const top = Math.min(marqueeStartY, pointer.y);
        const width = Math.abs(pointer.x - marqueeStartX);
        const height = Math.abs(pointer.y - marqueeStartY);
        marqueeRect.set({ left, top, width, height });
        c.renderAll();
      }
    });

    c.on('mouse:up', () => {
      if (isDragging) {
        isDragging = false;
        c.selection = activeToolRef.current === ToolType.SELECT;
      }

      if (isSelectingMarquee) {
        isSelectingMarquee = false;
        if (marqueeRect && ((marqueeRect.width || 0) < 5 || (marqueeRect.height || 0) < 5)) {
          c.remove(marqueeRect);
          marqueeRect = null;
        } else if (marqueeRect) {
          c.setActiveObject(marqueeRect);
        }
        c.renderAll();
      }
    });
    
    // Initial snapshot
    setTimeout(() => pushSnapshot(), 200);

    return () => {
      c.dispose();
    };
  }, [syncCanvasToYjs, pushSnapshot, fabricRef]);

  // Spacebar panning listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        setIsSpacePanning(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePanning(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Update canvas tool state
  useEffect(() => {
    const c = fabricRef.current;
    if (!c) return;
    
    if (isMaskMode) {
      c.isDrawingMode = true;
      if (c.freeDrawingBrush) {
        c.freeDrawingBrush.width = toolSettings.brushSize;
        c.freeDrawingBrush.color = toolSettings.maskColor;
      }
      return;
    }

    switch (activeTool) {
      case ToolType.BRUSH:
        c.isDrawingMode = true;
        c.selection = false;
        if (c.freeDrawingBrush) {
          c.freeDrawingBrush.width = toolSettings.brushSize;
          c.freeDrawingBrush.color = toolSettings.brushColor;
        }
        break;
        
      case ToolType.ERASER:
        c.isDrawingMode = true;
        c.selection = false;
        if (c.freeDrawingBrush) {
          c.freeDrawingBrush.width = toolSettings.eraserSize;
          c.freeDrawingBrush.color = '#0a0a0a';
        }
        break;
        
      case ToolType.SELECT:
        c.isDrawingMode = false;
        c.selection = true;
        c.defaultCursor = 'default';
        break;
        
      case ToolType.SELECTION:
        c.isDrawingMode = false;
        c.selection = false;
        c.defaultCursor = 'crosshair';
        break;
        
      case ToolType.SHAPE:
      case ToolType.TEXT:
      case ToolType.CROP:
      default:
        c.isDrawingMode = false;
        c.selection = false;
        c.defaultCursor = 'crosshair';
        break;
    }
  }, [activeTool, toolSettings, isMaskMode, fabricRef]);

  // Synchronize base image and Yjs
  useEffect(() => {
    const c = fabricRef.current;
    if (!c) return;
    
    const update = () => {
      let activeImageData = yImage?.get('baseImageData');
      let isProposalPreview = false;

      if (isReviewMode && activeProposalId) {
        const proposal = (proposals as any)?.get(activeProposalId);
        if (proposal && (proposal.type === 'image_generate' || proposal.type === 'image_inpaint')) {
          activeImageData = proposal.data;
          isProposalPreview = true;
        }
      }

      if (activeImageData) {
        FabricImage.fromURL(`data:image/png;base64,${activeImageData}`).then(loaded => {
          c.getObjects('image').forEach(o => c.remove(o));
          loaded.set({ 
            selectable: false, 
            evented: false,
            opacity: isProposalPreview ? 0.85 : 1.0
          });
          (loaded as any).layerName = 'Base Background';
          c.add(loaded);
          c.sendObjectToBack(loaded);
          c.renderAll();
        });
      }
    };

    yImage?.observe(update);
    if (yExperimental) yExperimental.observe(update);
    update();

    return () => { 
      yImage?.unobserve(update); 
      if (yExperimental) yExperimental.unobserve(update);
    };
  }, [yImage, yExperimental, isReviewMode, activeProposalId, proposals, fabricRef]);

  // Zoom helpers
  const handleZoomIn = () => {
    const c = fabricRef.current;
    if (!c) return;
    let nextZoom = c.getZoom() * 1.25;
    nextZoom = Math.min(nextZoom, 10);
    c.setZoom(nextZoom);
    setZoomLevel(Math.round(nextZoom * 100));
    c.renderAll();
  };

  const handleZoomOut = () => {
    const c = fabricRef.current;
    if (!c) return;
    let nextZoom = c.getZoom() / 1.25;
    nextZoom = Math.max(nextZoom, 0.1);
    c.setZoom(nextZoom);
    setZoomLevel(Math.round(nextZoom * 100));
    c.renderAll();
  };

  const handleResetZoom = () => {
    const c = fabricRef.current;
    if (!c) return;
    c.setZoom(1);
    c.setViewportTransform([1, 0, 0, 1, 0, 0]);
    setZoomLevel(100);
    c.renderAll();
  };

  // Export current canvas or mask
  const handleExportImage = () => {
    const c = fabricRef.current;
    if (!c) return;
    const dataURL = c.toDataURL({ format: 'png', quality: 1 });
    const link = document.createElement('a');
    link.download = `artifex-export-${Date.now()}.png`;
    link.href = dataURL;
    link.click();
    toast.success('Image exported successfully');
  };

  return (
    <div className="h-full min-h-0 min-w-0 overflow-hidden bg-studio-background">
      <DockWorkspace
        storageKey="studio-art-editor-layout:v2"
        panels={[
          {
            id: 'layers',
            title: 'Layers',
            icon: Layers,
            defaultZone: 'left',
            content: (
              <LayerManager
                canvas={canvas}
                onLayerSelect={layer => {
                  if (layer) setSelectedLayer(parseInt(layer.id.replace('layer-', ''), 10));
                  else setSelectedLayer(null);
                }}
              />
            ),
          },
          {
            id: 'canvas',
            title: 'Canvas Workspace',
            icon: ImageIcon,
            defaultZone: 'center',
            content: (
              <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-studio-background">
                {/* Canvas Control Toolbar */}
                <div className="flex h-11 shrink-0 items-center justify-between border-b border-studio-border bg-studio-header px-3">
                  {/* Left: Undo/Redo & Mask Toggle */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={undo}
                      disabled={!canUndo}
                      className="rounded p-1.5 text-studio-text hover:bg-studio-hover disabled:opacity-30 transition-all"
                      aria-label="Undo"
                      title="Undo (Ctrl+Z)"
                    >
                      <Undo2 size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={redo}
                      disabled={!canRedo}
                      className="rounded p-1.5 text-studio-text hover:bg-studio-hover disabled:opacity-30 transition-all"
                      aria-label="Redo"
                      title="Redo (Ctrl+Y)"
                    >
                      <Redo2 size={15} />
                    </button>

                    <div className="w-px h-5 bg-studio-border mx-1" />

                    {/* Mask Inpaint mode button */}
                    <button
                      type="button"
                      onClick={() => {
                        const next = !isMaskMode;
                        setIsMaskMode(next);
                        if (next) toast('Inpaint Mask Brush active', { icon: '🖌️' });
                      }}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold transition-all border ${
                        isMaskMode 
                          ? 'bg-red-500 text-white border-red-400 shadow-sm' 
                          : 'bg-black/30 text-studio-text-dim border-studio-border hover:bg-studio-hover hover:text-white'
                      }`}
                      title="Paint an inpainting mask for AI generation"
                    >
                      <Paintbrush size={13} />
                      <span>{isMaskMode ? 'Masking ON' : 'Inpaint Mask'}</span>
                    </button>
                  </div>

                  {/* Right: Zoom controls & Export */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center bg-black/40 border border-studio-border rounded px-1.5 py-0.5 text-xs text-studio-text font-mono">
                      <button
                        type="button"
                        onClick={handleZoomOut}
                        className="p-1 hover:text-studio-accent transition-colors"
                        title="Zoom Out"
                      >
                        <ZoomOut size={13} />
                      </button>
                      <span className="w-12 text-center text-[11px] font-bold">{zoomLevel}%</span>
                      <button
                        type="button"
                        onClick={handleZoomIn}
                        className="p-1 hover:text-studio-accent transition-colors"
                        title="Zoom In"
                      >
                        <ZoomIn size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={handleResetZoom}
                        className="p-1 text-studio-text-dim hover:text-white transition-colors ml-1"
                        title="Reset View"
                      >
                        <RotateCcw size={12} />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleExportImage}
                      className="flex items-center gap-1 bg-studio-accent hover:bg-studio-accent/80 text-white font-bold text-xs px-3 py-1.5 rounded transition-all shadow-sm"
                      aria-label="Export image"
                      title="Export PNG to disk"
                    >
                      <Download size={14} />
                      <span>Export</span>
                    </button>
                  </div>
                </div>

                {/* Viewport Canvas Center */}
                <div 
                  ref={containerRef}
                  className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden bg-studio-panel p-4 relative"
                >
                  <div className="relative flex max-h-full max-w-full items-center justify-center shadow-2xl">
                    <canvas
                      ref={canvasRef}
                      width={512}
                      height={512}
                      className="rounded-lg border border-studio-border bg-black shadow-inner"
                    />

                    {/* Active Layer Pill */}
                    <div className="absolute left-3 top-3 pointer-events-none rounded bg-black/70 backdrop-blur-sm px-2.5 py-1 text-[11px] font-medium text-studio-text border border-white/10 shadow-md">
                      {isMaskMode ? (
                        <span className="text-red-400 font-bold uppercase">Drawing Inpainting Mask</span>
                      ) : selectedLayer !== null ? (
                        `Active: Layer ${selectedLayer + 1}`
                      ) : (
                        'No layer selected (Select tool)'
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ),
          },
          {
            id: 'tool-options',
            title: 'Tool Options & Filters',
            icon: SlidersHorizontal,
            defaultZone: 'right',
            content: (
              <EditingTools
                canvas={canvas}
                activeTool={activeTool as ToolType}
                toolSettings={toolSettings}
                onSettingsChange={handleSettingsChange}
              />
            ),
          },
        ]}
      />
    </div>
  );
};

export default ImageEditor;
