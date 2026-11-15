import React, { useState, useEffect } from 'react';
import { Bot, Play, RefreshCw, CheckCircle, AlertTriangle, Sparkles, Layers, Sliders } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { toolsApi } from '../../services/api';
import { useWorktree } from '../../core/useWorktree';

interface ToolDef {
  name: string;
  extension_id: string;
  description: string;
  parameters: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
  requires_review?: boolean;
}

export const AiToolAssistant: React.FC = () => {
  const [tools, setTools] = useState<ToolDef[]>([]);
  const [selectedTool, setSelectedTool] = useState<string>('image.generate');
  const [params, setParams] = useState<Record<string, any>>({
    prompt: 'A futuristic cybernetic artisan studio in isometric view, highly detailed',
    seed: 42,
    steps: 25,
    bpm: 120,
    key: 'C',
    scale: 'Minor',
    mood: 'Cyberpunk'
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const { createProposal } = useWorktree();

  // Load tools manifest
  const loadManifest = async () => {
    try {
      const resp: any = await toolsApi.getManifest();
      if (resp && resp.tools) {
        setTools(resp.tools);
      }
    } catch (e) {
      // Fallback offline mock tools
      setTools([
        {
          name: 'image.generate',
          extension_id: 'art',
          description: 'Generates a new image or sprite from text prompt.',
          parameters: {
            type: 'object',
            properties: {
              prompt: { type: 'string', description: 'Text prompt' },
              seed: { type: 'integer', default: 42 },
              steps: { type: 'integer', default: 20 }
            }
          }
        },
        {
          name: 'image.inpaint',
          extension_id: 'art',
          description: 'Fills a designated mask area on the current image canvas.',
          parameters: {
            type: 'object',
            properties: {
              prompt: { type: 'string', description: 'Text guidance' },
              seed: { type: 'integer', default: 42 }
            }
          }
        },
        {
          name: 'audio.compose',
          extension_id: 'audio',
          description: 'Generates multi-track music sequence conforming to BPM, key, and mood.',
          parameters: {
            type: 'object',
            properties: {
              bpm: { type: 'integer', default: 120 },
              key: { type: 'string', default: 'C' },
              mood: { type: 'string', default: 'Neutral' }
            }
          }
        }
      ]);
    }
  };

  useEffect(() => {
    loadManifest();
  }, []);

  const handleParamChange = (field: string, value: any) => {
    setParams(prev => ({ ...prev, [field]: value }));
  };

  const handleExecuteTool = async () => {
    setIsLoading(true);
    setLastResult(null);
    try {
      const resp: any = await toolsApi.callTool(selectedTool, params);
      if (resp && resp.status === 'success') {
        setLastResult(resp.result);
        
        // Post output to Worktree proposal for non-destructive review
        if (selectedTool.startsWith('image.')) {
          const base64Data = resp.result?.image_base64 || resp.result?.data;
          if (base64Data) {
            createProposal('image_layer', base64Data);
            toast.success('Generated proposal added to review queue!');
          }
        } else if (selectedTool.startsWith('audio.')) {
          const audioUrl = resp.result?.output_url || resp.result?.url;
          if (audioUrl) {
            createProposal('audio_layer', audioUrl);
            toast.success('Generated audio proposal added to review queue!');
          }
        }
      } else {
        toast.error(resp?.error || 'Tool execution failed');
      }
    } catch (err: any) {
      toast.error('Tool call failed: ' + (err?.message || 'Server error'));
    } finally {
      setIsLoading(false);
    }
  };

  const activeDef = tools.find(t => t.name === selectedTool);

  return (
    <div className="flex flex-col gap-2 p-2 bg-studio-panel-darker rounded border border-studio-border/60">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Bot size={13} className="text-studio-accent" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-studio-text">
            AI Agent Tools
          </span>
        </div>
        <button
          type="button"
          onClick={loadManifest}
          className="p-1 rounded text-studio-text-dim hover:text-white"
          title="Refresh tools manifest"
        >
          <RefreshCw size={10} />
        </button>
      </div>

      {/* Tool Selector */}
      <select
        value={selectedTool}
        onChange={e => setSelectedTool(e.target.value)}
        className="w-full bg-black/50 border border-studio-border rounded px-2 py-1 text-xs text-studio-text font-mono focus:outline-none"
      >
        {tools.map(t => (
          <option key={t.name} value={t.name}>
            {t.name} ({t.extension_id})
          </option>
        ))}
      </select>

      {activeDef && (
        <p className="text-[9px] text-studio-text-dim leading-snug">
          {activeDef.description}
        </p>
      )}

      {/* Parameters */}
      <div className="flex flex-col gap-1.5 mt-1 border-t border-studio-border/30 pt-2">
        {selectedTool.startsWith('image.') && (
          <>
            <label className="flex flex-col gap-1 text-[9px] text-studio-text-dim uppercase font-bold">
              Prompt
              <textarea
                value={params.prompt || ''}
                onChange={e => handleParamChange('prompt', e.target.value)}
                rows={2}
                className="w-full bg-black/40 border border-studio-border rounded p-1.5 text-xs text-studio-text focus:outline-none focus:border-studio-accent"
              />
            </label>
            <div className="flex gap-2">
              <label className="flex-1 flex flex-col gap-1 text-[9px] text-studio-text-dim uppercase font-bold">
                Steps
                <input
                  type="number"
                  min={5}
                  max={50}
                  value={params.steps || 20}
                  onChange={e => handleParamChange('steps', parseInt(e.target.value) || 20)}
                  className="bg-black/40 border border-studio-border rounded px-1.5 py-1 text-xs font-mono"
                />
              </label>
              <label className="flex-1 flex flex-col gap-1 text-[9px] text-studio-text-dim uppercase font-bold">
                Seed
                <input
                  type="number"
                  value={params.seed || 42}
                  onChange={e => handleParamChange('seed', parseInt(e.target.value) || 0)}
                  className="bg-black/40 border border-studio-border rounded px-1.5 py-1 text-xs font-mono"
                />
              </label>
            </div>
          </>
        )}

        {selectedTool.startsWith('audio.') && (
          <div className="flex gap-2">
            <label className="flex-1 flex flex-col gap-1 text-[9px] text-studio-text-dim uppercase font-bold">
              BPM
              <input
                type="number"
                min={60}
                max={200}
                value={params.bpm || 120}
                onChange={e => handleParamChange('bpm', parseInt(e.target.value) || 120)}
                className="bg-black/40 border border-studio-border rounded px-1.5 py-1 text-xs font-mono"
              />
            </label>
            <label className="flex-1 flex flex-col gap-1 text-[9px] text-studio-text-dim uppercase font-bold">
              Key
              <input
                type="text"
                value={params.key || 'C'}
                onChange={e => handleParamChange('key', e.target.value)}
                className="bg-black/40 border border-studio-border rounded px-1.5 py-1 text-xs font-mono"
              />
            </label>
          </div>
        )}

        <button
          type="button"
          onClick={handleExecuteTool}
          disabled={isLoading}
          className="mt-2 w-full py-1.5 rounded bg-studio-accent hover:bg-studio-accent/90 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow"
        >
          {isLoading ? (
            <RefreshCw size={12} className="animate-spin" />
          ) : (
            <Play size={12} fill="currentColor" />
          )}
          <span>{isLoading ? 'Executing Tool...' : 'Dispatch AI Tool'}</span>
        </button>
      </div>
    </div>
  );
};

export default AiToolAssistant;
