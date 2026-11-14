import React, { useState, useEffect } from 'react';
import { ThumbsUp, Loader2, FlaskConical, Globe, Wand2, Palette, Plus, X, FolderOpen } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useStudioStore } from '../../core/useStudioStore';
import { useArtGeneration } from '../../hooks/useArtGeneration';
import { useWorktree } from '../../core/useWorktree';
import { useProjectConfig } from '../../core/useProjectConfig';

import { StudioSelect, StudioToggle, StudioSlider } from '../../features/common/components/Controls';
import CollapsibleSidebar, { SidebarSection } from '../../components/lookup/CollapsibleSidebar';
import ArtToolLookup from '../../components/lookup/ArtToolLookup';
import type { ImagePaletteSettings, PaletteMode } from '../../types/api';
import { ProjectReferenceLibrary } from '../common/ProjectReferenceLibrary';

export const ArtControls: React.FC = () => {
  const { yPrompt, yImage, yHistory, yExperimental, lastMessage } = useStudioStore();
  const { startReview } = useWorktree();
  const { stylePreset, updateConfig, refinePrompt } = useProjectConfig();
  const { 
    isGenerating, 
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
  const [paletteDither, setPaletteDither] = useState(false);
  const [preserveAlpha, setPreserveAlpha] = useState(true);
  const [targetWorktree, setTargetWorktree] = useState<'main' | 'experimental'>('main');
  const [isRefining, setIsRefining] = useState(false);  const [selectedTool, setSelectedTool] = useState('brush');
  useEffect(() => {
    if (lastMessage?.type === 'prompt_refined') {
      setPrompt(lastMessage.refined);
      yPrompt?.set('currentPrompt', lastMessage.refined);
      setIsRefining(false);
      toast.success('Prompt expanded!');
    }
  }, [lastMessage, yPrompt]);

  useEffect(() => {
    if (!yPrompt) return;
    const update = () => {
      const p = yPrompt.get('currentPrompt');
      if (typeof p === 'string' && p !== prompt) setPrompt(p);
      const s = yPrompt.get('currentSeed');
      if (typeof s === 'number' && s !== seed) setSeed(s);
    };
    yPrompt.observe(update);
    update();
    return () => yPrompt.unobserve(update);
  }, [yPrompt, prompt, seed]);

  useEffect(() => {
    if (!yPrompt) return;
    const update = () => {
      const mode = yPrompt.get('paletteMode');
      if (mode === 'off' || mode === 'extract' || mode === 'fixed' || mode === 'maximum') {
        setPaletteMode(mode);
      }
      const count = yPrompt.get('paletteMaxColors');
      if (typeof count === 'number' && count >= 1 && count <= 256) {
        setMaxColors(count);
      }
      const colors = yPrompt.get('paletteColors');
      if (
        Array.isArray(colors) &&
        colors.length > 0 &&
        colors.length <= 256 &&
        colors.every(color => typeof color === 'string')
      ) {
        setPaletteColors(colors);
      }
      setPaletteDither(yPrompt.get('paletteDither') === true);
      setPreserveAlpha(yPrompt.get('palettePreserveAlpha') !== false);
    };
    yPrompt.observe(update);
    update();
    return () => yPrompt.unobserve(update);
  }, [yPrompt]);

  const handleRefine = () => {
    setIsRefining(true);
    refinePrompt(prompt);
  };

  const paletteSettings = (): ImagePaletteSettings => ({
    mode: paletteMode,
    colors: paletteMode === 'fixed' ? paletteColors : [],
    max_colors: paletteMode === 'maximum' || paletteMode === 'extract' ? maxColors : null,
    dither: paletteDither,
    preserve_alpha: preserveAlpha,
  });

  const updatePaletteColors = (colors: string[]) => {
    setPaletteColors(colors);
    yPrompt?.set('paletteColors', colors);
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


  const models = [
    { id: 'sdxl', name: 'Stable Diffusion XL', description: 'Fast, high quality' },
    { id: 'flux', name: 'FLUX.2-Klein', description: 'State-of-the-art detail' },
  ];

  return (
    <div className="flex flex-col h-full bg-studio-panel overflow-hidden">
      {/* Main Collapsible Sidebar */}
      <CollapsibleSidebar
        title="Art Studio"
        icon={Wand2}
        defaultCollapsed={false}
        minWidth={180}
        maxWidth={280}
        className="flex-shrink-0"
      >
        <div className="p-3 space-y-4">
          {/* Tool Selection Section */}
          <SidebarSection title="Tools" icon={Wand2}>
            <ArtToolLookup
              activeTool={selectedTool}
              onToolSelect={setSelectedTool}
              showCompact={false}
            />
          </SidebarSection>

          <SidebarSection title="Project References" icon={FolderOpen}>
            <ProjectReferenceLibrary />
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
                    title="Enhance prompt details"
                  >
                    {isRefining ? <Loader2 size={10} className="animate-spin" /> : <Wand2 size={10} />}
                    <span>ENHANCE</span>
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
                      }}
                      className="bg-black/40 border border-studio-border rounded px-2 py-1 text-xs normal-case"
                    >
                      <option value="off">Unrestricted</option>
                      <option value="maximum">Maximum colors</option>
                      <option value="extract">Extract from generated image</option>
                      <option value="fixed">Fixed palette</option>
                    </select>
                  </label>

                  {(paletteMode === 'maximum' || paletteMode === 'extract') && (
                    <label className="flex flex-col gap-1 text-[10px] font-bold text-studio-text-dim uppercase tracking-wider">
                      Maximum colors (1-256)
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
                    Limits are enforced on the exported image after generation.
                  </p>
                </div>
              </SidebarSection>

              {/* Generate Button */}
              <button 
                onClick={handleGenerate}
                disabled={!prompt.trim() && !isGenerating}
                className={`py-2 rounded font-bold text-xs transition-all ${isGenerating ? 'bg-red-900/50 text-red-200 border border-red-800' : 'bg-studio-accent text-white hover:bg-studio-accent/80'}`}
              >
                {isGenerating ? 'STOP' : 'GENERATE'}
              </button>
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
        </div>
      </CollapsibleSidebar>
    </div>
  );
};
