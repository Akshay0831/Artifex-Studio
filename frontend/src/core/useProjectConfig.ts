import { useCallback, useEffect, useState } from 'react';
import * as Y from 'yjs';
import { useStudioStore } from './useStudioStore';

/**
 * Hook for managing project settings and cross-modal state.
 */
export const useProjectConfig = () => {
  const { 
    yProjectConfig, 
    yImage, 
    yAudio, 
    sendMessage, 
    lastMessage 
  } = useStudioStore();

  const [stylePreset, setStylePreset] = useState(yProjectConfig.get('stylePreset') as string);
  const [autoSyncAudio, setAutoSyncAudio] = useState(yProjectConfig.get('autoSyncAudio') as boolean);
  const [sceneMetadata, setSceneMetadata] = useState<any>((yProjectConfig.get('sceneMetadata') as Y.Map<any>)?.toJSON() || {});
  const [isAnalyzingScene, setIsAnalyzingScene] = useState(false);
  const [sceneAnalysisError, setSceneAnalysisError] = useState<string | null>(null);

  useEffect(() => {
    const update = () => {
      setStylePreset(yProjectConfig.get('stylePreset') as string);
      setAutoSyncAudio(yProjectConfig.get('autoSyncAudio') as boolean);
      setSceneMetadata((yProjectConfig.get('sceneMetadata') as Y.Map<any>)?.toJSON() || {});
    };
    yProjectConfig.observeDeep(update);
    return () => yProjectConfig.unobserveDeep(update);
  }, [yProjectConfig]);

  const updateConfig = useCallback((key: string, value: any) => {
    yProjectConfig.set(key, value);
  }, [yProjectConfig]);

  const refinePrompt = useCallback((prompt: string) => {
    sendMessage({
      type: 'refine_prompt',
      prompt,
      style_preset: stylePreset
    });
  }, [sendMessage, stylePreset]);

  const analyzeScene = useCallback(() => {
    const baseImage = yImage.get('baseImageData');
    if (typeof baseImage !== 'string' || !baseImage) {
      setSceneAnalysisError('Add an image to the canvas before requesting scene analysis.');
      return;
    }

    try {
      sendMessage({
        type: 'analyze_scene',
        image_b64: baseImage
      });
      setSceneAnalysisError(null);
      setIsAnalyzingScene(true);
    } catch (error) {
      setSceneAnalysisError(
        error instanceof Error ? error.message : 'Could not send the scene analysis request.',
      );
      setIsAnalyzingScene(false);
    }
  }, [sendMessage, yImage]);

  // Handle incoming analysis results
  useEffect(() => {
    if (lastMessage?.type === 'scene_analysis_complete') {
      setIsAnalyzingScene(false);
      setSceneAnalysisError(null);
      const { analysis } = lastMessage;
      
      const metadataMap = yProjectConfig.get('sceneMetadata') as any;
      Object.entries(analysis).forEach(([key, val]) => {
        metadataMap.set(key, val);
      });

      // If auto-sync is on, update audio settings
      if (autoSyncAudio && analysis.suggested_audio_config) {
        const audioConfig = analysis.suggested_audio_config;
        if (audioConfig.mood) yAudio.set('mood', audioConfig.mood);
        if (audioConfig.composer) yAudio.set('composer', audioConfig.composer);
        if (audioConfig.bpm) yAudio.set('bpm', audioConfig.bpm);
      }
    } else if (lastMessage?.type === 'error' && lastMessage.operation === 'analyze_scene') {
      setIsAnalyzingScene(false);
      setSceneAnalysisError(
        typeof lastMessage.message === 'string'
          ? lastMessage.message
          : 'Scene analysis failed.',
      );
    }
  }, [lastMessage, autoSyncAudio, yProjectConfig, yAudio]);

  return {
    stylePreset,
    autoSyncAudio,
    sceneMetadata,
    isAnalyzingScene,
    sceneAnalysisError,
    updateConfig,
    refinePrompt,
    analyzeScene
  };
};
