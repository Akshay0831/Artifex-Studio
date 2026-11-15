import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Music, Globe, RefreshCw, Sparkles, Sliders, FolderOpen } from 'lucide-react';
import { useStudioStore } from '../../core/useStudioStore';
import { StudioSelect, StudioToggle } from '../../features/common/components/Controls';
import { useAudioComposition } from '../../hooks/useAudioComposition';
import { useProjectConfig } from '../../core/useProjectConfig';

import { SidebarSection } from '../../components/lookup/CollapsibleSidebar';
import { DockSectionStack } from '../../components/layout/DockSectionStack';
import AudioToolLookup from '../../components/lookup/AudioToolLookup';
import { ProjectReferenceLibrary } from '../common/ProjectReferenceLibrary';

export const AudioControls: React.FC = () => {
  const { yAudio, activateProject, flushPersistence } = useStudioStore();
  const { isComposing, compositionError, compose } = useAudioComposition();
  const {
    autoSyncAudio,
    sceneMetadata,
    isAnalyzingScene,
    sceneAnalysisError,
    updateConfig,
    analyzeScene,
  } = useProjectConfig();
  const [targetWorktree, setTargetWorktree] = useState<'main' | 'experimental'>('main');
  const [selectedTool, setSelectedTool] = useState('mixer');

  const handleAnalyze = () => {
    analyzeScene();
  };

  const composers = [
    { id: 'standard', name: 'Standard MIDI', description: 'Rule-based composition' },
    { id: 'transformer', name: 'Transformer Engine', description: 'Neural sequence gen' },
    { id: 'ambient', name: 'Ambient Texture', description: 'Generative soundscapes' },
  ];

  const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map(k => ({ id: k, name: k }));
  const moods = ['Tense', 'Epic', 'Calm', 'Neutral', 'Energetic', 'Dark'].map(m => ({ id: m, name: m }));

  const handleRecomposeAll = () => {
    [0, 1, 2, 3].forEach(idx => {
      compose(idx, Math.floor(Math.random() * 1000000), { 
        bpm: yAudio?.get('bpm') || 120, 
        key: yAudio?.get('key') || 'C', 
        scale: yAudio?.get('scale') || 'Major', 
        mood: yAudio?.get('mood') || 'Neutral', 
        composer: yAudio?.get('composer') || 'standard' 
      }, targetWorktree);
    });
  };

  const effectKeys = ['eq', 'reverb', 'delay', 'compression'];

  return (
    <div className="h-full min-h-0 overflow-y-auto custom-scrollbar bg-studio-panel">
      <DockSectionStack storageKey="studio-audio-sections:v1" className="space-y-2">
          <SidebarSection title="Project References" icon={FolderOpen}>
            <ProjectReferenceLibrary
              onProjectChange={activateProject}
              onBeforeExport={flushPersistence}
            />
          </SidebarSection>

          {/* Tool Selection Section */}
          <SidebarSection title="Audio Tools" icon={Sliders}>
            <AudioToolLookup
              activeTool={selectedTool}
              onToolSelect={(tool) => { setSelectedTool(tool); toast.success(`Selected audio tool: ${tool}`); }}
              showCompact={false}
            />
          </SidebarSection>

          {/* Composer Selection Section */}
          <SidebarSection title="Composer" icon={Music}>
            <StudioSelect 
              label="Composer Engine"
              yMap={yAudio}
              stateKey="composer"
              options={composers}
            />
          </SidebarSection>

          {/* Composition Parameters Section */}
          <SidebarSection title="Composition" icon={Globe}>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] text-studio-text-dim uppercase">Key</span>
                  <select 
                    value={yAudio?.get('key') || 'C'}
                    onChange={(e) => yAudio?.set('key', e.target.value)}
                    className="bg-black/40 border border-studio-border rounded px-2 py-1 text-xs focus:outline-none focus:border-studio-accent appearance-none"
                  >
                    {keys.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] text-studio-text-dim uppercase">Mood</span>
                  <select 
                    value={yAudio?.get('mood') || 'Neutral'}
                    onChange={(e) => yAudio?.set('mood', e.target.value)}
                    className="bg-black/40 border border-studio-border rounded px-2 py-1 text-xs focus:outline-none focus:border-studio-accent appearance-none"
                  >
                    {moods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </SidebarSection>

          {/* Effects Section */}
          <SidebarSection title="Effects" icon={Sliders}>
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-studio-text-dim uppercase tracking-wider">Master FX Chain</label>
              <div className="flex flex-col gap-1">
                {effectKeys.map(name => {
                  const effectsVal = yAudio?.get('effects');
                  const effectsMap = effectsVal && typeof effectsVal.observe === 'function' ? effectsVal : undefined;
                  return (
                    <StudioToggle key={name} label={name} yMap={effectsMap} stateKey={name} />
                  );
                })}
              </div>
            </div>
          </SidebarSection>

          {/* Analysis Section */}
          <SidebarSection title="Analysis" icon={Sparkles}>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-studio-text-dim uppercase tracking-wider">Sync State</label>
                <button 
                  onClick={() => updateConfig('autoSyncAudio', !autoSyncAudio)}
                  className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-all ${autoSyncAudio ? 'bg-studio-accent border-studio-accent text-white' : 'bg-black/20 border-studio-border text-studio-text-dim'}`}
                >
                  {autoSyncAudio ? 'SYNC ON' : 'SYNC OFF'}
                </button>
              </div>
              
              <div className="bg-black/20 p-3 rounded border border-studio-border/30 flex flex-col gap-3">
                <button 
                  onClick={handleAnalyze}
                  disabled={isAnalyzingScene}
                  className={`w-full py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-2 border transition-all ${isAnalyzingScene ? 'bg-purple-900/20 border-purple-900/50 text-purple-400' : 'bg-purple-900/10 border-purple-900/30 text-purple-400 hover:bg-purple-900/20'}`}
                >
                  {isAnalyzingScene ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  <span>{isAnalyzingScene ? 'ANALYZING...' : 'EXTRACT SCENE CONTEXT'}</span>
                </button>
                {sceneAnalysisError && (
                  <p role="alert" className="text-xs text-red-400">
                    {sceneAnalysisError}
                  </p>
                )}

                {sceneMetadata && sceneMetadata.mood && (
                  <div className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-1 duration-500">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-studio-text-dim uppercase tracking-tighter">Detected Mood</span>
                      <span className="text-studio-accent font-bold uppercase">{sceneMetadata.mood}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {sceneMetadata.keywords?.map((kw: string) => (
                        <span key={kw} className="px-1.5 py-0.5 bg-white/5 rounded text-[8px] text-studio-text-dim border border-white/5 uppercase font-mono">{kw}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </SidebarSection>

          {/* Action Section */}
          <SidebarSection title="Actions" icon={Music}>
            <label className="flex items-center justify-between text-[9px] font-bold uppercase text-studio-text-dim">
              Output target
              <select
                value={targetWorktree}
                onChange={event => setTargetWorktree(event.target.value as 'main' | 'experimental')}
                className="bg-black/40 border border-studio-border rounded px-2 py-1 text-xs normal-case"
              >
                <option value="main">Main project</option>
                <option value="experimental">Experimental review</option>
              </select>
            </label>
            <button 
              onClick={handleRecomposeAll}
              disabled={isComposing}
              className="w-full py-3 rounded bg-studio-accent text-white font-bold text-xs hover:bg-studio-accent/80 shadow-lg shadow-studio-accent/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Music size={14} className={isComposing ? 'animate-spin' : ''} />
              <span>{isComposing ? 'COMPOSING...' : 'RECOMPOSE ALL'}</span>
            </button>
            {compositionError && (
              <p role="alert" className="mt-2 text-xs text-red-400">
                {compositionError}
              </p>
            )}
          </SidebarSection>
      </DockSectionStack>
    </div>
  );
};
