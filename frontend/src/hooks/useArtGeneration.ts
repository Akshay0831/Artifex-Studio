import { useState, useCallback, useEffect } from 'react';
import { useStudioStore } from '../core/useStudioStore';
import type { ImagePaletteSettings } from '../types/api';

export const useArtGeneration = () => {
  const { sendMessage, lastMessage, yPrompt } = useStudioStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [variations, setVariations] = useState<string[]>([]);
  const [numVariations, setNumVariations] = useState(4);
  const [model, setModel] = useState('sdxl');
  const [variationSettings, setVariationSettings] = useState<ImagePaletteSettings[]>([]);

  const [progress, setProgress] = useState(0);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const generate = useCallback((
    prompt: string,
    seed: number,
    steps: number,
    count: number,
    palette: ImagePaletteSettings,
    worktree: string = 'main',
  ) => {
    setIsGenerating(true);
    setProgress(0);
    setGenerationError(null);
    setVariations(new Array(count).fill(''));
    setVariationSettings(new Array(count).fill(palette));

    // Extract all config from yPrompt
    const config: any = { steps, model };
    const paletteStateKeys = new Set([
      'paletteMode',
      'paletteMaxColors',
      'paletteColors',
      'paletteDither',
      'palettePreserveAlpha',
      'paletteSourceReference',
    ]);
    if (yPrompt) {
      yPrompt.forEach((val, key) => {
        if (!['currentPrompt', 'currentSeed'].includes(key) && !paletteStateKeys.has(key)) {
          config[key] = val;
        }
      });
    }
    config.palette = palette;

    try {
      sendMessage({
        type: 'generate_image',
        prompt,
        seed,
        num_variations: count,
        config,
        worktree
      });
    } catch (error) {
      setIsGenerating(false);
      setProgress(0);
      setGenerationError(
        error instanceof Error ? error.message : 'Could not start image generation.',
      );
    }
  }, [sendMessage, model, yPrompt]);

  // Update variations and progress when chunks or complete results arrive
  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.type === 'generation_progress') {
      setProgress(lastMessage.progress);
      // Optional: partial image preview if backend supports sending it
      if (lastMessage.preview_base64 && lastMessage.variation_index !== undefined) {
        const newVars = [...variations];
        newVars[lastMessage.variation_index] = lastMessage.preview_base64;
        setVariations(newVars);
      }
    } else if (lastMessage.type === 'generation_complete') {
      const idx = lastMessage.variation_index ?? 0;
      const imageBase64 = lastMessage.result?.image_base64;
      if (typeof imageBase64 !== 'string' || !imageBase64) {
        setIsGenerating(false);
        setProgress(0);
        setGenerationError('The image service returned no image data.');
        return;
      }
      const newVars = [...variations];
      newVars[idx] = imageBase64;
      setVariations(newVars);
      
      // If it was a single image or all variations are done, stop loading
      if (variations.filter(v => v !== '').length + 1 >= numVariations) {
        setIsGenerating(false);
        setProgress(100);
      }
    } else if (lastMessage.type === 'error' && lastMessage.operation === 'generate_image') {
      setIsGenerating(false);
      setProgress(0);
      setGenerationError(
        typeof lastMessage.message === 'string'
          ? lastMessage.message
          : 'Image generation failed.',
      );
    }
  }, [lastMessage, variations, numVariations]);

  const cancel = useCallback(() => {
    setIsGenerating(false);
    setGenerationError('Generation cannot be cancelled yet; the server may continue processing.');
  }, []);

  return {
    isGenerating,
    progress,
    generationError,
    variations,
    variationSettings,
    generate,
    cancel,
    numVariations,
    setNumVariations,
    model,
    setModel
  };
};
