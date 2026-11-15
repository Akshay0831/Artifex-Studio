import React, { useState, useEffect } from 'react';
import { ThumbsUp, Loader2, FlaskConical, Globe, Wand2, Palette, Plus, X, FolderOpen } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useStudioStore } from '../../core/useStudioStore';
import { useArtGeneration } from '../../hooks/useArtGeneration';
import { useWorktree } from '../../core/useWorktree';
import { useProjectConfig } from '../../core/useProjectConfig';
import { useApiKey } from '../../components/ApiKeyManager/ApiKeyContextValue';
import { textGenerationApi } from '../../services/api';
import { useActiveImageTool } from '../../hooks/useImageEditor';
import { useToolShortcuts } from '../../hooks/useToolShortcuts';
import { ApiErrorHandler } from '../../utils/apiErrorHandler';

import { StudioSelect, StudioToggle, StudioSlider } from '../../features/common/components/Controls';
import { SidebarSection } from '../../components/lookup/CollapsibleSidebar';
import { DockSectionStack } from '../../components/layout/DockSectionStack';
import ArtToolLookup from '../../components/lookup/ArtToolLookup';
import type {
  ImagePaletteSettings,
  ImagePaletteSourceReference,
  PaletteMode,
  ProjectReference,
} from '../../types/api';
import { ProjectReferenceLibrary } from '../common/ProjectReferenceLibrary';
import { projectsApi } from '../../services/api';

const ART_TOOL_SHORTCUTS = {
  select: 'v',
  selection: 'm',
  brush: 'b',
  eraser: 'e',
  shape: 'u',
  text: 't',
  crop: 'c',
};

const isImagePaletteSourceReference = (
  value: unknown,
): value is ImagePaletteSourceReference => {
  if (!value || typeof value !== 'object') return false;
  return (
    'project_id' in value &&
    typeof value.project_id === 'string' &&
    'reference_id' in value &&
    typeof value.reference_id === 'string' &&
    'sha256' in value &&
    typeof value.sha256 === 'string' &&
    /^[a-f0-9]{64}$/i.test(value.sha256) &&
    'original_filename' in value &&
    typeof value.original_filename === 'string'
  );
};

export const ArtControls: React.FC = () => {
  const {
    yPrompt,
    yImage,
    yHistory,
    yExperimental,
    lastMessage,
    activateProject,
    flushPersistence,
  } = useStudioStore();
  const { activeTool, setActiveTool } = useActiveImageTool(yImage);
  const { shortcuts: toolShortcuts, updateShortcut } = useToolShortcuts(
    'studio-art-tool-shortcuts:v1',
    ART_TOOL_SHORTCUTS,
    setActiveTool,
  );
  const { startReview } = useWorktree();
  const { stylePreset, updateConfig, refinePrompt } = useProjectConfig();
  const { state: apiKeyState } = useApiKey();
  const selectedProfile = apiKeyState.currentProfile
    ? apiKeyState.profiles[apiKeyState.currentProfile]
    : undefined;
  const localTextProfile = selectedProfile &&
    (selectedProfile.api_type === 'ollama' || selectedProfile.api_type === 'lm_studio')
    ? selectedProfile
    : undefined;
  const { 
    isGenerating, 
    generationError,
    variations, 
    variationSettings,
    generate, 
    cancel, 
    numVariations, 
    setNumVariations,
    model
  } = useArtGeneration();

  const [prompt, setPrompt] = useState('');
  const [seed, setSeed] = useState(0);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>('off');
  const [maxColors, setMaxColors] = useState(16);
  const [paletteColors, setPaletteColors] = useState(['#1B1B1B', '#F4F4F4']);
  const [paletteSourceReference, setPaletteSourceReference] =
    useState<ImagePaletteSourceReference | null>(null);
  const [paletteDither, setPaletteDither] = useState(false);
  const [preserveAlpha, setPreserveAlpha] = useState(true);
  const [targetWorktree, setTargetWorktree] = useState<'main' | 'experimental'>('main');
  const [isRefining, setIsRefining] = useState(false);
  const handleShortcutChange = (toolId: string, value: string) => {
    const error = updateShortcut(toolId, value);
    if (error) toast.error(error);
  };
  useEffect(() => {
    if (lastMessage?.type === 'prompt_refined') {
      setPrompt(lastMessage.refined);
      yPrompt?.set('currentPrompt', lastMessage.refined);
      setIsRefining(false);
      toast.success('Prompt expanded!');
    } else if (lastMessage?.type === 'error' && lastMessage.operation === 'refine_prompt') {
      setIsRefining(false);
      toast.error(
        typeof lastMessage.message === 'string'
          ? lastMessage.message
          : 'Prompt enhancement failed.',
      );
    }
  }, [lastMessage, yPrompt]);

  useEffect(() => {
    if (!yPrompt) return;
    const update = () => {
      const p = yPrompt.get('currentPrompt');
      const currentPrompt = typeof p === 'string' ? p : '';
      if (currentPrompt !== prompt) setPrompt(currentPrompt);
      const s = yPrompt.get('currentSeed');
      const currentSeed = typeof s === 'number' ? s : 0;
      if (currentSeed !== seed) setSeed(currentSeed);
    };
    yPrompt.observe(update);
    update();
    return () => yPrompt.unobserve(update);
  }, [yPrompt, prompt, seed]);

  useEffect(() => {
    if (!yPrompt) return;
    const update = () => {
      const mode = yPrompt.get('paletteMode');
      setPaletteMode(
        mode === 'extract' || mode === 'fixed' || mode === 'maximum' ? mode : 'off',
      );
      const count = yPrompt.get('paletteMaxColors');
      setMaxColors(typeof count === 'number' && count >= 1 && count <= 256 ? count : 16);
      const colors = yPrompt.get('paletteColors');
      if (
        Array.isArray(colors) &&
        colors.length > 0 &&
        colors.length <= 256 &&
        colors.every(color => typeof color === 'string')
      ) {
        setPaletteColors(colors);
      } else {
        setPaletteColors(['#1B1B1B', '#F4F4F4']);
      }
      setPaletteDither(yPrompt.get('paletteDither') === true);
      setPreserveAlpha(yPrompt.get('palettePreserveAlpha') !== false);
      const sourceReference = yPrompt.get('paletteSourceReference');
      setPaletteSourceReference(
        isImagePaletteSourceReference(sourceReference) ? sourceReference : null,
      );
    };
    yPrompt.observe(update);
    update();
    return () => yPrompt.unobserve(update);
  }, [yPrompt]);

  const handleRefine = () => {
    setIsRefining(true);
    if (localTextProfile) {
      const model = localTextProfile.default_model || localTextProfile.models[0];
      if (!model) {
        setIsRefining(false);
        toast.error('The selected local profile has no model. Discover and select a model first.');
        return;
      }

      void textGenerationApi.generate({
        prompt,
        system_prompt: [
          'Rewrite the following as a clear, detailed image-generation prompt.',
          'Preserve the subject and intent. Return only the rewritten prompt.',
          `Style preset: ${stylePreset || 'none'}`,
        ].join('\n'),
        model,
        api_profile_id: localTextProfile.id,
        generation_type: 'text',
        temperature: localTextProfile.temperature ?? 0.3,
      }).then(response => {
        const refined = response.result?.trim();
        if (!refined) throw new Error('The local model returned no text.')
        setPrompt(refined);
        yPrompt?.set('currentPrompt', refined);
        toast.success(`Prompt refined with ${model}.`);
      }).catch(error => {
        const response = typeof error === 'object' && error !== null && 'response' in error
          ? (error as { response?: { data?: { detail?: unknown } } }).response
          : undefined;
        const detail = response?.data?.detail;
        toast.error(
          typeof detail === 'string'
            ? detail
            : ApiErrorHandler.handleError(error),
        );
      }).finally(() => setIsRefining(false));
      return;
    }

    try {
      refinePrompt(prompt);
    } catch (error) {
      setIsRefining(false);
      toast.error(error instanceof Error ? error.message : 'Could not enhance the prompt.');
    }
  };

  const paletteSettings = (): ImagePaletteSettings => ({
    mode: paletteMode,
    colors: paletteMode === 'fixed' ? paletteColors : [],
    max_colors: paletteMode === 'maximum' || paletteMode === 'extract' ? maxColors : null,
    dither: paletteDither,
    preserve_alpha: preserveAlpha,
    source_reference: paletteMode === 'fixed' ? paletteSourceReference : null,
  });

  const updatePaletteColors = (colors: string[]) => {
    setPaletteColors(colors);
    yPrompt?.set('paletteColors', colors);
  };

  const extractImagePalette = async (reference: ProjectReference): Promise<number> => {
    const extracted = await projectsApi.extractReferencePalette(
      reference.project_id,
      reference.id,
      maxColors,
    );
    setPaletteMode('fixed');
    yPrompt?.set('paletteMode', 'fixed');
    updatePaletteColors(extracted.colors);
    setPaletteSourceReference(extracted.source_reference);
    yPrompt?.set('paletteSourceReference', extracted.source_reference);
    return extracted.colors.length;
  };

  const promote = (data: string, settings: ImagePaletteSettings) => {
    if (targetWorktree === 'experimental') {
      const proposalId = `art-${Date.now()}`;
      const proposals = yExperimental.get('proposals') as any;
      proposals.set(proposalId, {
        type: 'image_generate',
        data: data,
        confidence: 1.0,
        timestamp: Date.now(),
        source: 'user_experiment',
        generation_settings: { palette: settings },
      });
      toast.success('Added to Experimental Worktree');
      startReview(proposalId);
      return;
    }

    if (!yImage) return;
    yImage.set('baseImageData', data);
    // Clear canvas objects when promoting new base image
    yImage.set('canvasData', JSON.stringify({ version: "5.3.0", objects: [] }));
    toast.success('Promoted to canvas');

    if (yHistory) {
      yHistory.push([{
        type: 'art',
        label: prompt || 'Generated Image',
        preview: `data:image/png;base64,${data}`,
        timestamp: Date.now(),
        generation_settings: { palette: settings },
      }]);
    }
  };

  const handleGenerate = () => {
    if (isGenerating) {
      cancel();
    } else {
      generate(
        prompt,
        seed,
        (yPrompt?.get('steps') as number) || 20,
        numVariations,
        paletteSettings(),
        targetWorktree,
      );
    }
  };

  const openImageReference = async (reference: ProjectReference): Promise<boolean> => {
    if (!yImage) throw new Error('The image canvas is not available.');
    let hasCanvasObjects = false;
    const canvasData = yImage.get('canvasData');
    if (typeof canvasData === 'string') {
      try {
        const savedCanvas: { objects?: unknown } = JSON.parse(canvasData);
        hasCanvasObjects = Array.isArray(savedCanvas.objects) && savedCanvas.objects.length > 0;
      } catch {
        hasCanvasObjects = true;
      }
    }
    if (
      (yImage.get('baseImageData') || hasCanvasObjects) &&
      !window.confirm('Replace the current canvas base image with this reference?')
    ) {
      return false;
    }

    const imageBlob = await projectsApi.getReferenceContent(
      reference.project_id,
      reference.id,
    );
    const bitmap = await createImageBitmap(imageBlob);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not create an image canvas.');

      const scale = Math.min(512 / bitmap.width, 512 / bitmap.height);
      const width = Math.round(bitmap.width * scale);
      const height = Math.round(bitmap.height * scale);
      context.drawImage(
        bitmap,
        Math.floor((512 - width) / 2),
        Math.floor((512 - height) / 2),
        width,
        height,
      );
      const imageBase64 = canvas.toDataURL('image/png').split(',')[1];
      if (!imageBase64) throw new Error('Could not encode the reference image.');
      yImage.set('baseImageData', imageBase64);
      yImage.set('canvasData', JSON.stringify({ version: '5.3.0', objects: [] }));
      yHistory?.push([{
        type: 'reference',
        label: reference.original_filename,
        preview: `data:image/png;base64,${imageBase64}`,
        timestamp: Date.now(),
        project_id: reference.project_id,
        reference_id: reference.id,
      }]);
    } finally {
      bitmap.close();
    }
    return true;
  };

  const models = [
    { id: 'sdxl', name: 'Stable Diffusion XL', description: 'Fast, high quality' },
    { id: 'flux', name: 'FLUX.2-Klein', description: 'State-of-the-art detail' },
  ];

  return (
    <div className="h-full min-h-0 overflow-y-auto custom-scrollbar bg-studio-panel">
      <DockSectionStack storageKey="studio-art-sections:v1" className="space-y-2">
          {/* Tool Selection Section */}
          <SidebarSection title="Tools" icon={Wand2}>
            <ArtToolLookup
              activeTool={activeTool}
              onToolSelect={setActiveTool}
              toolShortcuts={toolShortcuts}
              onShortcutChange={handleShortcutChange}
            />
          </SidebarSection>

          <SidebarSection title="Project References" icon={FolderOpen}>
            <ProjectReferenceLibrary
              onProjectChange={activateProject}
              onBeforeExport={flushPersistence}
              onUseImageReference={openImageReference}
              onExtractImagePalette={extractImagePalette}
            />
          </SidebarSection>

          {/* Model Selection Section */}
          <SidebarSection title="Models" icon={Globe}>
            <StudioSelect 
              label="Active Model"
              yMap={yPrompt}
              stateKey="model"
              options={models}
            />
          </SidebarSection>

          {/* Model-Specific Tools */}
          {model === 'flux' && (
            <SidebarSection title="Flux Tools" icon={Globe}>
              <div className="bg-blue-900/10 border border-blue-900/30 rounded p-3 flex flex-col gap-2">
                <label className="text-[9px] font-bold text-blue-400 uppercase tracking-widest">Flux Tools</label>
                <StudioToggle label="Ultra Detail" yMap={yPrompt} stateKey="ultra_detail" />
                <StudioToggle label="Pro Refiner" yMap={yPrompt} stateKey="pro_refiner" />
              </div>
            </SidebarSection>
          )}

          {model === 'sdxl' && (
            <SidebarSection title="SDXL Optimizers" icon={FlaskConical}>
              <div className="bg-orange-900/10 border border-orange-900/30 rounded p-3 flex flex-col gap-2">
                <label className="text-[9px] font-bold text-orange-400 uppercase tracking-widest">SDXL Optimizers</label>
                <StudioToggle label="Fast Mode" yMap={yPrompt} stateKey="fast_mode" />
                <StudioToggle label="High VRAM" yMap={yPrompt} stateKey="high_vram" />
              </div>
            </SidebarSection>
          )}

          {/* Generation Controls Section */}
          <SidebarSection title="Generation" icon={Wand2}>
            <div className="flex flex-col gap-3">
              {/* Prompt Enhancement */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-studio-text-dim uppercase tracking-wider">Prompt</label>
                  <button 
                    onClick={handleRefine}
                    disabled={!prompt.trim() || isRefining}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-[9px] font-bold transition-all ${isRefining ? 'bg-studio-accent/20 text-studio-accent animate-pulse' : 'bg-studio-accent/10 text-studio-accent hover:bg-studio-accent hover:text-white'}`}
                    title={localTextProfile
                      ? `Refine with ${localTextProfile.name}`
                      : 'Expand using built-in preset terms; no AI model is called'}
                  >
                    {isRefining ? <Loader2 size={10} className="animate-spin" /> : <Wand2 size={10} />}
                    <span>{localTextProfile ? 'AI ENHANCE' : 'EXPAND'}</span>
                  </button>
                </div>
                <textarea 
                  value={prompt}
                  onChange={(e) => { setPrompt(e.target.value); yPrompt?.set('currentPrompt', e.target.value); }}
                  placeholder="Art style, details, mood..."
                  className="w-full h-16 bg-black/40 border border-studio-border rounded p-2 text-xs focus:outline-none focus:border-studio-accent resize-none placeholder:italic placeholder:opacity-30"
                />
              </div>

              {/* Style Presets */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold text-studio-text-dim uppercase tracking-wider">Style Preset</label>
                <div className="grid grid-cols-2 gap-2">
                  {['fantasy', 'cyberpunk', 'retro', 'dark_souls'].map(preset => (
                    <button 
                      key={preset}
                      onClick={() => updateConfig('stylePreset', preset)}
                      className={`py-1.5 rounded text-[9px] font-bold border transition-all uppercase tracking-tighter ${stylePreset === preset ? 'bg-studio-accent border-studio-accent text-white shadow-lg shadow-studio-accent/20' : 'bg-black/20 border-studio-border text-studio-text-dim hover:bg-black/40'}`}
                    >
                      {preset.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generation Parameters */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-studio-text-dim uppercase tracking-wider">Seed</label>
                  <input 
                    type="number" 
                    value={seed}
                    onChange={(e) => { const v = parseInt(e.target.value) || 0; setSeed(v); yPrompt?.set('currentSeed', v); }}
                    className="w-full bg-black/40 border border-studio-border rounded px-2 py-1 text-xs focus:outline-none focus:border-studio-accent"
                  />
                </div>
                <StudioSlider label="Steps" yMap={yPrompt} stateKey="steps" min={10} max={50} className="flex-1" />
              </div>

              <SidebarSection title="Palette / Color Limit" icon={Palette}>
                <div className="flex flex-col gap-3">
                  <label className="flex flex-col gap-1 text-[10px] font-bold text-studio-text-dim uppercase tracking-wider">
                    Palette mode
                    <select
                      value={paletteMode}
                      onChange={(event) => {
                        const mode = event.target.value as PaletteMode;
                        setPaletteMode(mode);
                        yPrompt?.set('paletteMode', mode);
                        if (mode !== 'fixed') {
                          setPaletteSourceReference(null);
                          yPrompt?.delete('paletteSourceReference');
                        }
                      }}
                      className="bg-black/40 border border-studio-border rounded px-2 py-1 text-xs normal-case"
                    >
                      <option value="off">Unrestricted</option>
                      <option value="maximum">Maximum colors</option>
                      <option value="extract">Extract a palette from the generated image</option>
                      <option value="fixed">Fixed palette</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-[10px] font-bold text-studio-text-dim uppercase tracking-wider">
                    {paletteMode === 'maximum' || paletteMode === 'extract'
                      ? 'Maximum colors (1-256)'
                      : 'Colors to extract from reference (1-256)'}
                    <input
                      type="number"
                      min={1}
                      max={256}
                      value={maxColors}
                      onChange={(event) => {
                        const count = Math.min(256, Math.max(1, Number(event.target.value) || 1));
                        setMaxColors(count);
                        yPrompt?.set('paletteMaxColors', count);
                      }}
                      className="bg-black/40 border border-studio-border rounded px-2 py-1 text-xs"
                    />
                  </label>

                  {paletteSourceReference && paletteMode === 'fixed' && (
                    <p className="text-[9px] leading-relaxed text-studio-text-dim">
                      Extracted from {paletteSourceReference.original_filename}; applied as fixed output colors. The reference image is not sent to generation.
                    </p>
                  )}

                  {paletteMode === 'fixed' && (
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-bold text-studio-text-dim uppercase tracking-wider">
                        Fixed colors
                      </label>
                      {paletteColors.map((color, index) => (
                        <div key={`${index}-${color}`} className="flex items-center gap-2">
                          <input
                            type="color"
                            value={color}
                            aria-label={`Palette color ${index + 1}`}
                            onChange={(event) => {
                              const colors = [...paletteColors];
                              colors[index] = event.target.value.toUpperCase();
                              updatePaletteColors(colors);
                            }}
                            className="h-7 w-10 bg-transparent"
                          />
                          <span className="flex-1 text-[10px] font-mono">{color}</span>
                          <button
                            type="button"
                            aria-label={`Remove palette color ${index + 1}`}
                            disabled={paletteColors.length <= 1}
                            onClick={() => updatePaletteColors(paletteColors.filter((_, item) => item !== index))}
                            className="p-1 text-studio-text-dim hover:text-white disabled:opacity-30"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        disabled={paletteColors.length >= 256}
                        onClick={() => updatePaletteColors([...paletteColors, '#FFFFFF'])}
                        className="flex items-center justify-center gap-1 rounded border border-studio-border py-1 text-[10px] disabled:opacity-30"
                      >
                        <Plus size={12} />
                        Add color
                      </button>
                    </div>
                  )}

                  {paletteMode !== 'off' && (
                    <>
                      <label className="flex items-center gap-2 text-[10px] text-studio-text-dim">
                        <input
                          type="checkbox"
                          checked={paletteDither}
                          onChange={(event) => {
                            setPaletteDither(event.target.checked);
                            yPrompt?.set('paletteDither', event.target.checked);
                          }}
                        />
                        Dither
                      </label>
                      <label className="flex items-center gap-2 text-[10px] text-studio-text-dim">
                        <input
                          type="checkbox"
                          checked={preserveAlpha}
                          onChange={(event) => {
                            setPreserveAlpha(event.target.checked);
                            yPrompt?.set('palettePreserveAlpha', event.target.checked);
                          }}
                        />
                        Preserve transparency
                      </label>
                    </>
                  )}
                  <p className="text-[9px] leading-relaxed text-studio-text-dim">
                    Image references are only sampled when you choose “Use palette” in the reference library. Output color constraints are applied after generation.
                  </p>
                </div>
              </SidebarSection>

              {/* Generate and unavailable feature controls */}
              <button 
                onClick={handleGenerate}
                disabled={!prompt.trim() && !isGenerating}
                className={`py-2 rounded font-bold text-xs transition-all ${isGenerating ? 'bg-red-900/50 text-red-200 border border-red-800' : 'bg-studio-accent text-white hover:bg-studio-accent/80'}`}
              >
                {isGenerating ? 'STOP' : 'GENERATE'}
              </button>
              <button
                type="button"
                disabled
                className="w-full py-2 rounded border border-studio-border bg-black/20 text-xs font-bold text-studio-text-dim opacity-60 cursor-not-allowed"
                title="Image inpainting is not implemented for the configured backends."
              >
                INPAINT MASK AREA - UNAVAILABLE
              </button>
              {generationError && (
                <p role="alert" className="text-xs text-red-400">
                  {generationError}
                </p>
              )}
              <label className="flex items-center justify-between text-[9px] font-bold uppercase text-studio-text-dim">
                Output target
                <select
                  value={targetWorktree}
                  onChange={event => setTargetWorktree(event.target.value as 'main' | 'experimental')}
                  className="bg-black/40 border border-studio-border rounded px-2 py-1 text-xs normal-case"
                >
                  <option value="main">Main canvas</option>
                  <option value="experimental">Experimental review</option>
                </select>
              </label>
            </div>
          </SidebarSection>

          {/* Variations Section */}
          <SidebarSection title="Variations" icon={ThumbsUp}>
            <div className="flex flex-col gap-2 flex-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-studio-text-dim uppercase tracking-wider">Variations</label>
                <div className="flex gap-1">
                  {[1, 4, 9].map(n => (
                    <button key={n} onClick={() => setNumVariations(n)} className={`px-2 py-0.5 text-[9px] rounded ${numVariations === n ? 'bg-studio-accent text-white' : 'bg-black/20 text-studio-text-dim'}`}>{n}</button>
                  ))}
                </div>
              </div>
              <div className={`grid gap-2 flex-1 overflow-y-auto content-start ${numVariations === 1 ? 'grid-cols-1' : numVariations <= 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {new Array(numVariations).fill(0).map((_, i) => (
                  <div key={i} className="aspect-square bg-black/40 rounded border border-studio-border relative overflow-hidden flex items-center justify-center">
                    {variations[i] ? (
                      <>
                        <img src={`data:image/png;base64,${variations[i]}`} className="w-full h-full object-contain" alt="" />
                        <button onClick={() => promote(variations[i], variationSettings[i] || paletteSettings())} className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                          <ThumbsUp size={14} className="text-white" />
                        </button>
                      </>
                    ) : isGenerating && <Loader2 size={12} className="animate-spin text-studio-accent" />}
                  </div>
                ))}
              </div>
            </div>
          </SidebarSection>
      </DockSectionStack>
    </div>
  );
};
