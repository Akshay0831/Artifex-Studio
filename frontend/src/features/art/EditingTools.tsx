import React, { useState, useEffect } from 'react';
import * as fabric from 'fabric';
import { Canvas, IText, Point } from 'fabric';
import { 
  Brush, 
  Eraser, 
  MousePointer2, 
  Square, 
  Type, 
  Crop, 
  Sliders, 
  Sparkles,
  Circle,
  Triangle,
  BoxSelect
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { ToolType, ToolSettings, ShapeType } from './types';

interface EditingToolsProps {
  canvas: Canvas | null;
  activeTool: ToolType;
  toolSettings: ToolSettings;
  onSettingsChange: (settings: Partial<ToolSettings>) => void;
}

const EditingTools: React.FC<EditingToolsProps> = ({ 
  canvas, 
  activeTool, 
  toolSettings,
  onSettingsChange 
}) => {
  const [selectedShape, setSelectedShape] = useState<ShapeType>(ShapeType.RECTANGLE);
  const [fontSize, setFontSize] = useState<number>(24);
  const [fontFamily, setFontFamily] = useState<string>('sans-serif');
  const [cropWidth, setCropWidth] = useState<number>(512);
  const [cropHeight, setCropHeight] = useState<number>(512);

  // Adjustment values for active object or base image
  const [brightness, setBrightness] = useState<number>(0);
  const [contrast, setContrast] = useState<number>(0);
  const [saturation, setSaturation] = useState<number>(0);
  const [blur, setBlur] = useState<number>(0);

  // Bind mouse click for text placement when TEXT tool is active
  useEffect(() => {
    if (!canvas || activeTool !== ToolType.TEXT) return;

    const handleCanvasClick = (opt: any) => {
      if (!opt.pointer) return;
      const text = new IText('Double-click to edit', {
        left: opt.pointer.x,
        top: opt.pointer.y,
        fontSize: fontSize,
        fontFamily: fontFamily,
        fill: toolSettings.brushColor,
        selectable: true,
        editable: true,
      });
      (text as any).layerName = `Text: ${text.text?.slice(0, 10)}...`;
      canvas.add(text);
      canvas.setActiveObject(text);
      canvas.renderAll();
      toast.success('Text placed. Double-click to type.');
    };

    canvas.on('mouse:down', handleCanvasClick);
    return () => {
      canvas.off('mouse:down', handleCanvasClick);
    };
  }, [canvas, activeTool, fontSize, fontFamily, toolSettings.brushColor]);

  // Handle shape placement
  const addShapeToCanvas = (type: ShapeType) => {
    if (!canvas) return;
    let shapeObj: fabric.Object;

    const commonProps = {
      left: 150,
      top: 150,
      fill: toolSettings.fillColor || '#4f46e5',
      stroke: toolSettings.strokeColor || '#ffffff',
      strokeWidth: toolSettings.strokeWidth || 2,
      opacity: toolSettings.opacity ?? 1,
    };

    switch (type) {
      case ShapeType.CIRCLE:
        shapeObj = new fabric.Circle({ ...commonProps, radius: 50 });
        (shapeObj as any).layerName = 'Circle';
        break;
      case ShapeType.TRIANGLE:
        shapeObj = new fabric.Triangle({ ...commonProps, width: 100, height: 100 });
        (shapeObj as any).layerName = 'Triangle';
        break;
      case ShapeType.RECTANGLE:
      default:
        shapeObj = new fabric.Rect({ ...commonProps, width: 100, height: 100 });
        (shapeObj as any).layerName = 'Rectangle';
        break;
    }

    canvas.add(shapeObj);
    canvas.setActiveObject(shapeObj);
    canvas.renderAll();
    toast.success(`${type} added to canvas`);
  };

  // Apply real Fabric filters to active image object
  const applyImageFilters = (b: number, c: number, s: number, bl: number) => {
    if (!canvas) return;
    const activeObj = canvas.getActiveObject() || canvas.getObjects().find(o => o.type === 'image');
    if (!activeObj || !(activeObj as any).applyFilters) {
      toast.error('Select an image layer to apply filters');
      return;
    }

    const filters: any[] = [];
    if (b !== 0 && (fabric as any).filters?.Brightness) {
      filters.push(new (fabric as any).filters.Brightness({ brightness: b }));
    }
    if (c !== 0 && (fabric as any).filters?.Contrast) {
      filters.push(new (fabric as any).filters.Contrast({ contrast: c }));
    }
    if (s !== 0 && (fabric as any).filters?.Saturation) {
      filters.push(new (fabric as any).filters.Saturation({ saturation: s }));
    }
    if (bl > 0 && (fabric as any).filters?.Blur) {
      filters.push(new (fabric as any).filters.Blur({ blur: bl }));
    }

    (activeObj as any).filters = filters;
    (activeObj as any).applyFilters();
    canvas.renderAll();
  };

  // Canvas Crop Execution
  const applyCanvasCrop = () => {
    if (!canvas) return;
    canvas.setDimensions({ width: cropWidth, height: cropHeight });
    canvas.renderAll();
    toast.success(`Canvas resized to ${cropWidth}x${cropHeight}`);
  };

  // Marquee Selection Operations
  const cropToMarquee = () => {
    if (!canvas) return;
    const marqueeObj = canvas.getObjects().find(o => (o as any).isMarquee);
    if (!marqueeObj) {
      toast.error('Draw a marquee selection first');
      return;
    }
    const left = marqueeObj.left || 0;
    const top = marqueeObj.top || 0;
    const width = Math.round(marqueeObj.getScaledWidth());
    const height = Math.round(marqueeObj.getScaledHeight());

    if (width < 10 || height < 10) {
      toast.error('Marquee selection is too small to crop');
      return;
    }

    // Offset all objects
    canvas.getObjects().forEach(o => {
      if (o !== marqueeObj) {
        o.left = (o.left || 0) - left;
        o.top = (o.top || 0) - top;
        o.setCoords();
      }
    });

    canvas.remove(marqueeObj);
    canvas.setDimensions({ width, height });
    canvas.renderAll();
    toast.success(`Canvas cropped to ${width}x${height}`);
  };

  const fillMaskMarquee = () => {
    if (!canvas) return;
    const marqueeObj = canvas.getObjects().find(o => (o as any).isMarquee);
    if (!marqueeObj) {
      toast.error('Draw a marquee selection first');
      return;
    }
    const left = marqueeObj.left || 0;
    const top = marqueeObj.top || 0;
    const width = marqueeObj.getScaledWidth();
    const height = marqueeObj.getScaledHeight();

    canvas.remove(marqueeObj);

    const maskRect = new fabric.Rect({
      left,
      top,
      width,
      height,
      fill: toolSettings.maskColor,
      opacity: 0.8,
      selectable: true,
    });
    (maskRect as any).isMask = true;
    (maskRect as any).layerName = 'Mask Region';
    canvas.add(maskRect);
    canvas.setActiveObject(maskRect);
    canvas.renderAll();
    toast.success('Inpaint mask region created from selection!');
  };

  const clearMarquee = () => {
    if (!canvas) return;
    const marqueeObjs = canvas.getObjects().filter(o => (o as any).isMarquee);
    marqueeObjs.forEach(o => canvas.remove(o));
    canvas.renderAll();
    toast.success('Selection cleared');
  };

  const handleSettingsChange = <K extends keyof ToolSettings>(
    key: K,
    value: ToolSettings[K],
  ) => {
    onSettingsChange({ [key]: value } as Pick<ToolSettings, K>);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-3 text-studio-text custom-scrollbar">
      {/* Title */}
      <div className="flex items-center gap-2 border-b border-studio-border pb-2.5">
        {activeTool === ToolType.BRUSH || activeTool === ToolType.PENCIL ? (
          <Brush size={16} className="text-studio-accent" />
        ) : activeTool === ToolType.ERASER ? (
          <Eraser size={16} className="text-studio-accent" />
        ) : activeTool === ToolType.SHAPE ? (
          <Square size={16} className="text-studio-accent" />
        ) : activeTool === ToolType.TEXT ? (
          <Type size={16} className="text-studio-accent" />
        ) : activeTool === ToolType.CROP ? (
          <Crop size={16} className="text-studio-accent" />
        ) : activeTool === ToolType.SELECTION ? (
          <BoxSelect size={16} className="text-studio-accent" />
        ) : (
          <MousePointer2 size={16} className="text-studio-accent" />
        )}
        <h2 className="text-xs font-bold uppercase tracking-wider text-studio-text">
          {activeTool.charAt(0).toUpperCase() + activeTool.slice(1)} Settings
        </h2>
      </div>

      {/* SELECTION MARQUEE CONTROLS */}
      {activeTool === ToolType.SELECTION && (
        <div className="space-y-3">
          <p className="text-[11px] text-studio-text-dim">
            Click and drag on the canvas to draw a rectangular selection marquee.
          </p>

          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={cropToMarquee}
              className="w-full py-1.5 rounded bg-studio-accent text-white font-bold text-xs hover:bg-studio-accent/90 transition-all flex items-center justify-center gap-1.5"
            >
              <Crop size={13} />
              <span>Crop Canvas to Selection</span>
            </button>

            <button
              type="button"
              onClick={fillMaskMarquee}
              className="w-full py-1.5 rounded bg-amber-900/40 border border-amber-800 text-amber-200 font-bold text-xs hover:bg-amber-900/60 transition-all flex items-center justify-center gap-1.5"
            >
              <Sparkles size={13} />
              <span>Create Inpaint Mask Area</span>
            </button>

            <button
              type="button"
              onClick={clearMarquee}
              className="w-full py-1 text-[10px] text-studio-text-dim border border-studio-border rounded hover:bg-studio-hover"
            >
              Clear Marquee
            </button>
          </div>
        </div>
      )}

      {/* BRUSH & PENCIL CONTROLS */}
      {(activeTool === ToolType.BRUSH || activeTool === ToolType.PENCIL) && (
        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-[10px] text-studio-text-dim uppercase">Brush Size</span>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={1}
                max={100}
                value={toolSettings.brushSize}
                onChange={e => handleSettingsChange('brushSize', Number(e.target.value))}
                className="flex-1 accent-studio-accent h-1.5 bg-black/40 rounded appearance-none"
              />
              <output className="w-8 text-right font-mono text-xs">{toolSettings.brushSize}px</output>
            </div>
          </label>

          <label className="flex items-center justify-between text-xs">
            <span className="text-[10px] text-studio-text-dim uppercase">Brush Color</span>
            <input
              type="color"
              value={toolSettings.brushColor}
              onChange={e => handleSettingsChange('brushColor', e.target.value)}
              className="h-7 w-12 rounded border border-studio-border bg-transparent cursor-pointer"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs">
            <span className="text-[10px] text-studio-text-dim uppercase">Opacity</span>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={toolSettings.opacity}
                onChange={e => handleSettingsChange('opacity', Number(e.target.value))}
                className="flex-1 accent-studio-accent h-1.5 bg-black/40 rounded appearance-none"
              />
              <output className="w-8 text-right font-mono text-xs">{Math.round(toolSettings.opacity * 100)}%</output>
            </div>
          </label>
        </div>
      )}

      {/* ERASER CONTROLS */}
      {activeTool === ToolType.ERASER && (
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[10px] text-studio-text-dim uppercase">Eraser Size</span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={150}
              value={toolSettings.eraserSize}
              onChange={e => handleSettingsChange('eraserSize', Number(e.target.value))}
              className="flex-1 accent-studio-accent h-1.5 bg-black/40 rounded appearance-none"
            />
            <output className="w-8 text-right font-mono text-xs">{toolSettings.eraserSize}px</output>
          </div>
        </label>
      )}

      {/* TEXT TOOL CONTROLS */}
      {activeTool === ToolType.TEXT && (
        <div className="space-y-3">
          <p className="text-[11px] text-studio-accent font-medium">Click anywhere on canvas to place text.</p>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-[10px] text-studio-text-dim uppercase">Font Size</span>
            <input
              type="number"
              min={8}
              max={120}
              value={fontSize}
              onChange={e => setFontSize(Number(e.target.value))}
              className="bg-black/40 border border-studio-border rounded px-2 py-1 text-xs text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-[10px] text-studio-text-dim uppercase">Font Family</span>
            <select
              value={fontFamily}
              onChange={e => setFontFamily(e.target.value)}
              className="bg-black/40 border border-studio-border rounded px-2 py-1 text-xs text-white"
            >
              <option value="sans-serif">Sans Serif</option>
              <option value="serif">Serif</option>
              <option value="monospace">Monospace</option>
              <option value="cursive">Cursive</option>
              <option value="impact">Impact</option>
            </select>
          </label>
          <label className="flex items-center justify-between text-xs">
            <span className="text-[10px] text-studio-text-dim uppercase">Text Color</span>
            <input
              type="color"
              value={toolSettings.brushColor}
              onChange={e => handleSettingsChange('brushColor', e.target.value)}
              className="h-7 w-12 rounded border border-studio-border bg-transparent cursor-pointer"
            />
          </label>
        </div>
      )}

      {/* SHAPE TOOL CONTROLS */}
      {activeTool === ToolType.SHAPE && (
        <div className="space-y-3">
          <span className="text-[10px] text-studio-text-dim uppercase font-bold">Select Shape to Add</span>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => { setSelectedShape(ShapeType.RECTANGLE); addShapeToCanvas(ShapeType.RECTANGLE); }}
              className={`p-2 border rounded flex flex-col items-center gap-1 text-xs ${
                selectedShape === ShapeType.RECTANGLE ? 'bg-studio-accent text-white border-studio-accent' : 'bg-black/30 border-studio-border hover:bg-studio-hover'
              }`}
            >
              <Square size={16} />
              <span className="text-[10px]">Rect</span>
            </button>
            <button
              type="button"
              onClick={() => { setSelectedShape(ShapeType.CIRCLE); addShapeToCanvas(ShapeType.CIRCLE); }}
              className={`p-2 border rounded flex flex-col items-center gap-1 text-xs ${
                selectedShape === ShapeType.CIRCLE ? 'bg-studio-accent text-white border-studio-accent' : 'bg-black/30 border-studio-border hover:bg-studio-hover'
              }`}
            >
              <Circle size={16} />
              <span className="text-[10px]">Circle</span>
            </button>
            <button
              type="button"
              onClick={() => { setSelectedShape(ShapeType.TRIANGLE); addShapeToCanvas(ShapeType.TRIANGLE); }}
              className={`p-2 border rounded flex flex-col items-center gap-1 text-xs ${
                selectedShape === ShapeType.TRIANGLE ? 'bg-studio-accent text-white border-studio-accent' : 'bg-black/30 border-studio-border hover:bg-studio-hover'
              }`}
            >
              <Triangle size={16} />
              <span className="text-[10px]">Triangle</span>
            </button>
          </div>

          <label className="flex items-center justify-between text-xs">
            <span className="text-[10px] text-studio-text-dim uppercase">Fill Color</span>
            <input
              type="color"
              value={toolSettings.fillColor}
              onChange={e => handleSettingsChange('fillColor', e.target.value)}
              className="h-7 w-12 rounded border border-studio-border bg-transparent cursor-pointer"
            />
          </label>
          <label className="flex items-center justify-between text-xs">
            <span className="text-[10px] text-studio-text-dim uppercase">Stroke Color</span>
            <input
              type="color"
              value={toolSettings.strokeColor}
              onChange={e => handleSettingsChange('strokeColor', e.target.value)}
              className="h-7 w-12 rounded border border-studio-border bg-transparent cursor-pointer"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-[10px] text-studio-text-dim uppercase">Stroke Width ({toolSettings.strokeWidth}px)</span>
            <input
              type="range"
              min={0}
              max={20}
              value={toolSettings.strokeWidth}
              onChange={e => handleSettingsChange('strokeWidth', Number(e.target.value))}
              className="accent-studio-accent h-1.5 bg-black/40 rounded appearance-none"
            />
          </label>
        </div>
      )}

      {/* CROP TOOL CONTROLS */}
      {activeTool === ToolType.CROP && (
        <div className="space-y-3">
          <span className="text-[10px] text-studio-text-dim uppercase font-bold">Resize / Crop Canvas</span>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-[10px] text-studio-text-dim">Width (px)</span>
              <input
                type="number"
                min={64}
                max={2048}
                value={cropWidth}
                onChange={e => setCropWidth(Number(e.target.value))}
                className="bg-black/40 border border-studio-border rounded px-2 py-1 text-xs text-white"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-[10px] text-studio-text-dim">Height (px)</span>
              <input
                type="number"
                min={64}
                max={2048}
                value={cropHeight}
                onChange={e => setCropHeight(Number(e.target.value))}
                className="bg-black/40 border border-studio-border rounded px-2 py-1 text-xs text-white"
              />
            </label>
          </div>
          <div className="flex gap-2">
            {[512, 768, 1024].map(size => (
              <button
                key={size}
                type="button"
                onClick={() => { setCropWidth(size); setCropHeight(size); }}
                className="flex-1 py-1 bg-black/30 border border-studio-border rounded text-[10px] hover:bg-studio-hover"
              >
                {size}x{size}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={applyCanvasCrop}
            className="w-full py-1.5 bg-studio-accent text-white font-bold text-xs rounded hover:bg-studio-accent/80 transition-all shadow-sm"
          >
            Apply Canvas Dimensions
          </button>
        </div>
      )}

      {/* IMAGE ADJUSTMENTS SECTION */}
      <div className="border-t border-studio-border pt-3 space-y-3">
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-studio-text-dim uppercase tracking-wider">
          <Sliders size={13} className="text-studio-accent" />
          <span>Color & Filter Adjustments</span>
        </div>

        <label className="flex flex-col gap-1 text-xs">
          <div className="flex justify-between text-[10px]">
            <span className="text-studio-text-dim uppercase">Brightness</span>
            <span className="font-mono">{brightness}</span>
          </div>
          <input
            type="range"
            min={-1}
            max={1}
            step={0.05}
            value={brightness}
            onChange={e => {
              const val = Number(e.target.value);
              setBrightness(val);
              applyImageFilters(val, contrast, saturation, blur);
            }}
            className="accent-studio-accent h-1.5 bg-black/40 rounded appearance-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <div className="flex justify-between text-[10px]">
            <span className="text-studio-text-dim uppercase">Contrast</span>
            <span className="font-mono">{contrast}</span>
          </div>
          <input
            type="range"
            min={-1}
            max={1}
            step={0.05}
            value={contrast}
            onChange={e => {
              const val = Number(e.target.value);
              setContrast(val);
              applyImageFilters(brightness, val, saturation, blur);
            }}
            className="accent-studio-accent h-1.5 bg-black/40 rounded appearance-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <div className="flex justify-between text-[10px]">
            <span className="text-studio-text-dim uppercase">Saturation</span>
            <span className="font-mono">{saturation}</span>
          </div>
          <input
            type="range"
            min={-1}
            max={1}
            step={0.05}
            value={saturation}
            onChange={e => {
              const val = Number(e.target.value);
              setSaturation(val);
              applyImageFilters(brightness, contrast, val, blur);
            }}
            className="accent-studio-accent h-1.5 bg-black/40 rounded appearance-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <div className="flex justify-between text-[10px]">
            <span className="text-studio-text-dim uppercase">Blur</span>
            <span className="font-mono">{blur}</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={blur}
            onChange={e => {
              const val = Number(e.target.value);
              setBlur(val);
              applyImageFilters(brightness, contrast, saturation, val);
            }}
            className="accent-studio-accent h-1.5 bg-black/40 rounded appearance-none"
          />
        </label>

        <button
          type="button"
          onClick={() => {
            setBrightness(0);
            setContrast(0);
            setSaturation(0);
            setBlur(0);
            applyImageFilters(0, 0, 0, 0);
          }}
          className="w-full py-1 text-[10px] text-studio-text-dim border border-studio-border rounded hover:bg-studio-hover"
        >
          Reset All Adjustments
        </button>
      </div>
    </div>
  );
};

export default EditingTools;
