import { useState, useCallback, useEffect, useRef } from 'react';
import { Canvas } from 'fabric';

export const useActiveImageTool = (yImage: any) => {
  const [activeTool, setActiveToolState] = useState(() => {
    const savedTool = yImage?.get('activeTool');
    return typeof savedTool === 'string' ? savedTool : 'select';
  });

  useEffect(() => {
    if (!yImage) return;
    const updateTool = () => {
      const savedTool = yImage.get('activeTool');
      setActiveToolState(typeof savedTool === 'string' ? savedTool : 'select');
    };
    yImage.observe(updateTool);
    updateTool();
    return () => yImage.unobserve(updateTool);
  }, [yImage]);

  const setActiveTool = useCallback((tool: string) => {
    yImage?.set('activeTool', tool);
    setActiveToolState(tool);
  }, [yImage]);

  return { activeTool, setActiveTool };
};

const MAX_HISTORY_STEPS = 30;

export const useImageEditor = (yImage: any) => {
  const fabricRef = useRef<Canvas | null>(null);
  const { activeTool, setActiveTool } = useActiveImageTool(yImage);

  const historyStackRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const isApplyingHistoryRef = useRef<boolean>(false);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateUndoRedoState = useCallback(() => {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyStackRef.current.length - 1);
  }, []);

  const pushSnapshot = useCallback(() => {
    if (!fabricRef.current || isApplyingHistoryRef.current) return;
    try {
      const jsonStr = JSON.stringify(fabricRef.current.toJSON());
      // Discard any redo states ahead of current index
      const newStack = historyStackRef.current.slice(0, historyIndexRef.current + 1);
      newStack.push(jsonStr);

      if (newStack.length > MAX_HISTORY_STEPS) {
        newStack.shift();
      }

      historyStackRef.current = newStack;
      historyIndexRef.current = newStack.length - 1;
      updateUndoRedoState();
    } catch (e) {
      console.warn('Failed to snapshot canvas state', e);
    }
  }, [updateUndoRedoState]);

  const syncCanvasToYjs = useCallback(() => {
    if (!fabricRef.current) return;
    const canvasJson = fabricRef.current.toJSON();
    const currentYjsData = yImage?.get('canvasData') as string;
    const nextYjsData = JSON.stringify(canvasJson);
    
    if (nextYjsData !== currentYjsData) {
      yImage?.set('canvasData', nextYjsData);
    }
  }, [yImage]);

  const undo = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || historyIndexRef.current <= 0) return;

    isApplyingHistoryRef.current = true;
    historyIndexRef.current -= 1;
    const snapshotJson = historyStackRef.current[historyIndexRef.current];

    try {
      canvas.loadFromJSON(JSON.parse(snapshotJson)).then(() => {
        canvas.renderAll();
        syncCanvasToYjs();
        isApplyingHistoryRef.current = false;
        updateUndoRedoState();
      });
    } catch (e) {
      isApplyingHistoryRef.current = false;
      console.error('Error restoring undo snapshot', e);
    }
  }, [syncCanvasToYjs, updateUndoRedoState]);

  const redo = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || historyIndexRef.current >= historyStackRef.current.length - 1) return;

    isApplyingHistoryRef.current = true;
    historyIndexRef.current += 1;
    const snapshotJson = historyStackRef.current[historyIndexRef.current];

    try {
      canvas.loadFromJSON(JSON.parse(snapshotJson)).then(() => {
        canvas.renderAll();
        syncCanvasToYjs();
        isApplyingHistoryRef.current = false;
        updateUndoRedoState();
      });
    } catch (e) {
      isApplyingHistoryRef.current = false;
      console.error('Error restoring redo snapshot', e);
    }
  }, [syncCanvasToYjs, updateUndoRedoState]);

  return {
    fabricRef,
    activeTool,
    setActiveTool,
    syncCanvasToYjs,
    pushSnapshot,
    undo,
    redo,
    canUndo,
    canRedo,
  };
};
