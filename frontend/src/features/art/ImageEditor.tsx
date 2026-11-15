import React, { useEffect, useRef, useState } from 'react';
import { Canvas, PencilBrush, FabricImage, Point, Rect } from 'fabric';
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
  Paintbrush,
  Maximize2,
  Minimize2
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
  const isSpacePanningRef = useRef(isSpacePanning);
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { isSpacePanningRef.current = isSpacePanning; }, [isSpacePanning]);
  const [isFocusMode, setIsFocusMode] = useState<boolean>(false);

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
    let marqueeRect: Rect | null = null;
    let marqueeStartX = 0;
    let marqueeStartY = 0;

    c.on('mouse:down', (opt: any) => {
      const evt = opt.e;
      // Middle click (button === 1) or Spacebar held down
      if (evt.button === 1 || evt.altKey || isSpacePanningRef.current) {
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

        const pointer = c.getScenePoint(opt.e);
        marqueeStartX = pointer.x;
        marqueeStartY = pointer.y;

        marqueeRect = new Rect({
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
        const pointer = c.getScenePoint(opt.e);
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
    const dataURL = c.toDataURL({ format: 'png', quality: 1, multiplier: 1 });
    const link = document.createElement('a');
    link.download = `artifex-export-${Date.now()}.png`;
    link.href = dataURL;
    link.click();
    toast.success('Image exported successfully');
  };

  return (
    <div className={`h-full w-full min-h-0 min-w-0 overflow-hidden bg-studio-background ${isFocusMode ? 'fixed inset-0 z-50' : ''}`}>
      <DockWorkspace
        storageKey="studio-art-editor-panels:v1"
        minCenterWidth={512}
        panels={[
          {
            id: 'layers',
            title: 'Layers',
            icon: Layers,
            defaultZone: 'left',
            content: (
              <div className="h-full min-h-0 overflow-hidden">
                <LayerManager
                  canvas={canvas}
                  onLayerSelect={layer => {
                    if (layer) setSelectedLayer(parseInt(layer.id.replace('layer-', ''), 10));
                    else setSelectedLayer(null);
                  }}
                />
              </div>
            ),
          },
          {
            id: 'canvas',
            title: 'Canvas',
            icon: ImageIcon,
            defaultZone: 'center',
            content: (
              <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-studio-background">
                <div className="z-10 flex h-11 shrink-0 items-center justify-between border-b border-studio-border bg-studio-header px-3 shadow-sm">
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
                    <div className="mx-1 h-5 w-px bg-studio-border" />
                    <button
                      type="button"
                      disabled
                      onClick={() => {
                        const next = !isMaskMode;
                        setIsMaskMode(next);
                        if (next) toast('Inpaint Mask Brush active', { icon: '🖌️' });
                      }}
                      className={`flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-bold transition-all ${
                        isMaskMode
                          ? 'border-red-400 bg-red-500 text-white shadow-sm'
                          : 'border-studio-border bg-black/30 text-studio-text-dim hover:bg-studio-hover hover:text-white'
                      }`}
                      title="Image inpainting is not implemented for the configured backends."
                    >
                      <Paintbrush size={13} />
                      <span>Inpaint Mask - Unavailable</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center rounded border border-studio-border bg-black/40 px-1.5 py-0.5 font-mono text-xs text-studio-text">
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
                        className="ml-1 p-1 text-studio-text-dim hover:text-white transition-colors"
                        title="Reset View"
                      >
                        <RotateCcw size={12} />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsFocusMode(!isFocusMode)}
                      className="rounded-lg border border-studio-border bg-black/40 p-1.5 text-studio-text-dim hover:text-white transition-colors"
                      title={isFocusMode ? 'Exit Canvas Focus Mode' : 'Maximize Canvas (Focus Mode)'}
                    >
                      {isFocusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </button>
                    <button
                      type="button"
                      onClick={handleExportImage}
                      className="flex items-center gap-1 rounded bg-studio-accent px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-studio-accent/80"
                      aria-label="Export image"
                      title="Export PNG to disk"
                    >
                      <Download size={14} />
                      <span>Export</span>
                    </button>
                  </div>
                </div>

                <div
                  ref={containerRef}
                  className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden bg-[#0c0c14] p-4"
                >
                  <div className="relative flex max-h-full max-w-full items-center justify-center shadow-2xl">
                    <canvas
                      ref={canvasRef}
                      width={512}
                      height={512}
                      className="rounded-lg border border-studio-border bg-black shadow-inner"
                    />
                    <div className="pointer-events-none absolute left-3 top-3 rounded border border-white/10 bg-black/70 px-2.5 py-1 text-[11px] font-medium text-studio-text shadow-md backdrop-blur-sm">
                      {isMaskMode ? (
                        <span className="font-bold uppercase text-red-400">Drawing Inpainting Mask</span>
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
            title: 'Tool Options',
            icon: SlidersHorizontal,
            defaultZone: 'right',
            content: (
              <div className="h-full min-h-0 overflow-y-auto">
                <EditingTools
                  canvas={canvas}
                  activeTool={activeTool as ToolType}
                  toolSettings={toolSettings}
                  onSettingsChange={handleSettingsChange}
                />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
};

export default ImageEditor;
