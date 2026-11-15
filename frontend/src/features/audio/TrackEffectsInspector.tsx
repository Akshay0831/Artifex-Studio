import React from 'react';
import { Sliders, Sparkles, Activity, Waves, Volume2, RotateCcw, Music2 } from 'lucide-react';
import { AudioEffectsChain, DEFAULT_FX_CHAIN } from './types';

interface TrackEffectsInspectorProps {
  fx: AudioEffectsChain;
  trackName: string;
  onFxChange: (newFx: AudioEffectsChain) => void;
}

export const TrackEffectsInspector: React.FC<TrackEffectsInspectorProps> = ({
  fx,
  trackName,
  onFxChange
}) => {
  const updateEq = (field: 'low' | 'mid' | 'high', val: number) => {
    onFxChange({
      ...fx,
      eq: { ...fx.eq, [field]: val }
    });
  };

  const updateReverb = (field: 'decay' | 'wet', val: number) => {
    onFxChange({
      ...fx,
      reverb: { ...fx.reverb, [field]: val }
    });
  };

  const updateDelay = <Field extends keyof AudioEffectsChain['delay']>(
    field: Field,
    val: AudioEffectsChain['delay'][Field],
  ) => {
    onFxChange({
      ...fx,
      delay: { ...fx.delay, [field]: val }
    });
  };

  const updateDistortion = (drive: number) => {
    onFxChange({
      ...fx,
      distortion: { ...fx.distortion, drive }
    });
  };

  const updateChorus = (field: 'frequency' | 'depth' | 'wet', val: number) => {
    onFxChange({
      ...fx,
      chorus: { ...(fx.chorus ?? { frequency: 1.5, depth: 0.5, wet: 0.0, enabled: false }), [field]: val }
    });
  };

  const applyPreset = (presetName: string) => {
    switch (presetName) {
      case 'warm-bass':
        onFxChange({
          eq: { low: 5, mid: -2, high: -4, enabled: true },
          reverb: { decay: 1.0, wet: 0.1, enabled: false },
          delay: { time: '8n', feedback: 0.1, wet: 0.1, enabled: false },
          distortion: { drive: 0.25, enabled: true },
          chorus: { frequency: 1.5, depth: 0.5, wet: 0, enabled: false },
        });
        break;
      case 'lush-space':
        onFxChange({
          eq: { low: -1, mid: 2, high: 3, enabled: true },
          reverb: { decay: 4.5, wet: 0.55, enabled: true },
          delay: { time: '8n', feedback: 0.4, wet: 0.35, enabled: true },
          distortion: { drive: 0.0, enabled: false },
          chorus: { frequency: 1.5, depth: 0.5, wet: 0.2, enabled: true },
        });
        break;
      case 'punchy-drums':
        onFxChange({
          eq: { low: 4, mid: 1, high: 3, enabled: true },
          reverb: { decay: 0.8, wet: 0.15, enabled: true },
          delay: { time: '16n', feedback: 0.1, wet: 0.1, enabled: false },
          distortion: { drive: 0.15, enabled: true },
          chorus: { frequency: 1.5, depth: 0.5, wet: 0, enabled: false },
        });
        break;
      case 'clean-lead':
        onFxChange({
          eq: { low: -3, mid: 2, high: 2, enabled: true },
          reverb: { decay: 2.2, wet: 0.3, enabled: true },
          delay: { time: '16n', feedback: 0.35, wet: 0.25, enabled: true },
          distortion: { drive: 0.05, enabled: false },
          chorus: { frequency: 1.5, depth: 0.5, wet: 0.15, enabled: true },
        });
        break;
      case 'reset':
      default:
        onFxChange(DEFAULT_FX_CHAIN);
        break;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f] text-studio-text p-3 overflow-y-auto custom-scrollbar">
      {/* Top Header & Presets */}
      <div className="flex items-center justify-between pb-2 border-b border-studio-border/50 mb-3">
        <div className="flex items-center gap-2">
          <Sliders size={14} className="text-studio-accent" />
          <span className="text-xs font-bold uppercase tracking-wider text-studio-text">
            Insert Effects Rack: <span className="text-studio-accent">{trackName}</span>
          </span>
        </div>

        {/* Quick Presets */}
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-studio-text-dim uppercase font-bold mr-1">Presets:</span>
          <button
            type="button"
            onClick={() => applyPreset('punchy-drums')}
            className="px-2 py-0.5 rounded bg-black/40 border border-studio-border text-[9px] hover:text-white hover:border-studio-accent"
          >
            Punchy
          </button>
          <button
            type="button"
            onClick={() => applyPreset('warm-bass')}
            className="px-2 py-0.5 rounded bg-black/40 border border-studio-border text-[9px] hover:text-white hover:border-studio-accent"
          >
            Warm Bass
          </button>
          <button
            type="button"
            onClick={() => applyPreset('lush-space')}
            className="px-2 py-0.5 rounded bg-black/40 border border-studio-border text-[9px] hover:text-white hover:border-studio-accent"
          >
            Lush Space
          </button>
          <button
            type="button"
            onClick={() => applyPreset('clean-lead')}
            className="px-2 py-0.5 rounded bg-black/40 border border-studio-border text-[9px] hover:text-white hover:border-studio-accent"
          >
            Clean Lead
          </button>
          <button
            type="button"
            onClick={() => applyPreset('reset')}
            className="p-1 rounded text-studio-text-dim hover:text-white"
            title="Reset FX"
          >
            <RotateCcw size={11} />
          </button>
        </div>
      </div>

      {/* 5 Effects Modules in Responsive Grid */}
      <div className="grid grid-cols-5 gap-2 flex-1 min-h-0">
        {/* Module 1: 3-Band Parametric EQ */}
        <div className="bg-black/40 border border-studio-border/60 rounded-xl p-2.5 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-studio-border/30 pb-1 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-studio-accent flex items-center gap-1">
              <Activity size={11} /> 3-Band EQ
            </span>
            <input
              type="checkbox"
              checked={fx.eq.enabled}
              onChange={e => onFxChange({ ...fx, eq: { ...fx.eq, enabled: e.target.checked } })}
              className="accent-studio-accent w-3 h-3 cursor-pointer"
            />
          </div>

          <div className="flex justify-around items-end gap-2 flex-1 pb-1">
            {/* Low Band */}
            <div className="flex flex-col items-center gap-1 flex-1">
              <span className="text-[9px] font-mono text-studio-text-dim">
                {fx.eq.low > 0 ? `+${fx.eq.low}` : fx.eq.low}dB
              </span>
              <input
                type="range"
                min="-12"
                max="12"
                value={fx.eq.low}
                onChange={e => updateEq('low', Number(e.target.value))}
                className="w-full accent-studio-accent h-1.5 bg-black/60 rounded"
              />
              <span className="text-[9px] uppercase font-bold text-studio-text-dim">Low</span>
            </div>

            {/* Mid Band */}
            <div className="flex flex-col items-center gap-1 flex-1">
              <span className="text-[9px] font-mono text-studio-text-dim">
                {fx.eq.mid > 0 ? `+${fx.eq.mid}` : fx.eq.mid}dB
              </span>
              <input
                type="range"
                min="-12"
                max="12"
                value={fx.eq.mid}
                onChange={e => updateEq('mid', Number(e.target.value))}
                className="w-full accent-studio-accent h-1.5 bg-black/60 rounded"
              />
              <span className="text-[9px] uppercase font-bold text-studio-text-dim">Mid</span>
            </div>

            {/* High Band */}
            <div className="flex flex-col items-center gap-1 flex-1">
              <span className="text-[9px] font-mono text-studio-text-dim">
                {fx.eq.high > 0 ? `+${fx.eq.high}` : fx.eq.high}dB
              </span>
              <input
                type="range"
                min="-12"
                max="12"
                value={fx.eq.high}
                onChange={e => updateEq('high', Number(e.target.value))}
                className="w-full accent-studio-accent h-1.5 bg-black/60 rounded"
              />
              <span className="text-[9px] uppercase font-bold text-studio-text-dim">High</span>
            </div>
          </div>
        </div>

        {/* Module 2: Algorithmic Reverb */}
        <div className="bg-black/40 border border-studio-border/60 rounded-xl p-2.5 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-studio-border/30 pb-1 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1">
              <Waves size={11} /> Reverb
            </span>
            <input
              type="checkbox"
              checked={fx.reverb.enabled}
              onChange={e => onFxChange({ ...fx, reverb: { ...fx.reverb, enabled: e.target.checked } })}
              className="accent-rose-500 w-3 h-3 cursor-pointer"
            />
          </div>

          <div className="flex flex-col gap-2 flex-1 justify-center">
            <div className="flex flex-col gap-0.5">
              <div className="flex justify-between text-[9px] text-studio-text-dim">
                <span>Decay</span>
                <span className="font-mono">{fx.reverb.decay}s</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="8.0"
                step="0.1"
                value={fx.reverb.decay}
                onChange={e => updateReverb('decay', Number(e.target.value))}
                className="w-full accent-rose-500 h-1.5 bg-black/60 rounded"
              />
            </div>

            <div className="flex flex-col gap-0.5">
              <div className="flex justify-between text-[9px] text-studio-text-dim">
                <span>Mix (Wet)</span>
                <span className="font-mono">{Math.round(fx.reverb.wet * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={fx.reverb.wet}
                onChange={e => updateReverb('wet', Number(e.target.value))}
                className="w-full accent-rose-500 h-1.5 bg-black/60 rounded"
              />
            </div>
          </div>
        </div>

        {/* Module 3: Feedback Delay */}
        <div className="bg-black/40 border border-studio-border/60 rounded-xl p-2.5 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-studio-border/30 pb-1 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1">
              <Volume2 size={11} /> Delay / Echo
            </span>
            <input
              type="checkbox"
              checked={fx.delay.enabled}
              onChange={e => onFxChange({ ...fx, delay: { ...fx.delay, enabled: e.target.checked } })}
              className="accent-cyan-500 w-3 h-3 cursor-pointer"
            />
          </div>

          <div className="flex flex-col gap-2 flex-1 justify-center">
            <div className="flex items-center justify-between text-[9px]">
              <span className="text-studio-text-dim">Time:</span>
              <select
                value={fx.delay.time}
                onChange={e => updateDelay('time', e.target.value)}
                className="bg-black/60 border border-studio-border rounded px-1.5 py-0.5 text-[9px] font-mono text-cyan-300"
              >
                <option value="16n">1/16</option>
                <option value="8n">1/8 (Dotted)</option>
                <option value="4n">1/4</option>
                <option value="2n">1/2</option>
              </select>
            </div>

            <div className="flex flex-col gap-0.5">
              <div className="flex justify-between text-[9px] text-studio-text-dim">
                <span>Feedback</span>
                <span className="font-mono">{Math.round(fx.delay.feedback * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="0.8"
                step="0.05"
                value={fx.delay.feedback}
                onChange={e => updateDelay('feedback', Number(e.target.value))}
                className="w-full accent-cyan-500 h-1.5 bg-black/60 rounded"
              />
            </div>

            <div className="flex flex-col gap-0.5">
              <div className="flex justify-between text-[9px] text-studio-text-dim">
                <span>Mix (Wet)</span>
                <span className="font-mono">{Math.round(fx.delay.wet * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={fx.delay.wet}
                onChange={e => updateDelay('wet', Number(e.target.value))}
                className="w-full accent-cyan-500 h-1.5 bg-black/60 rounded"
              />
            </div>
          </div>
        </div>

        {/* Module 4: Warm Distortion / Saturation */}
        <div className="bg-black/40 border border-studio-border/60 rounded-xl p-2.5 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-studio-border/30 pb-1 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
              <Sparkles size={11} /> Saturation / Drive
            </span>
            <input
              type="checkbox"
              checked={fx.distortion.enabled}
              onChange={e => onFxChange({ ...fx, distortion: { ...fx.distortion, enabled: e.target.checked } })}
              className="accent-amber-500 w-3 h-3 cursor-pointer"
            />
          </div>

          <div className="flex flex-col gap-2 flex-1 justify-center">
            <div className="flex flex-col gap-0.5">
              <div className="flex justify-between text-[9px] text-studio-text-dim">
                <span>Drive Amount</span>
                <span className="font-mono">{Math.round(fx.distortion.drive * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="0.9"
                step="0.05"
                value={fx.distortion.drive}
                onChange={e => updateDistortion(Number(e.target.value))}
                className="w-full accent-amber-500 h-1.5 bg-black/60 rounded"
              />
            </div>
            <p className="text-[8px] text-studio-text-dim leading-tight">
              Adds analog tube warmth and harmonics to bass and synths.
            </p>
          </div>
        </div>

        {/* Module 5: Chorus / Vibrato */}
        <div className="bg-black/40 border border-studio-border/60 rounded-xl p-2.5 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-studio-border/30 pb-1 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1">
              <Music2 size={11} /> Chorus / Flanger
            </span>
            <input
              type="checkbox"
              checked={fx.chorus?.enabled ?? false}
              onChange={e => onFxChange({ ...fx, chorus: { ...(fx.chorus ?? { frequency: 1.5, depth: 0.5, wet: 0.0, enabled: false }), enabled: e.target.checked } })}
              className="accent-purple-500 w-3 h-3 cursor-pointer"
            />
          </div>

          <div className="flex flex-col gap-2 flex-1 justify-center">
            <div className="flex flex-col gap-0.5">
              <div className="flex justify-between text-[9px] text-studio-text-dim">
                <span>Rate (Hz)</span>
                <span className="font-mono">{(fx.chorus?.frequency ?? 1.5).toFixed(1)} Hz</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="8"
                step="0.1"
                value={fx.chorus?.frequency ?? 1.5}
                onChange={e => updateChorus('frequency', Number(e.target.value))}
                className="w-full accent-purple-500 h-1.5 bg-black/60 rounded"
              />
            </div>

            <div className="flex flex-col gap-0.5">
              <div className="flex justify-between text-[9px] text-studio-text-dim">
                <span>Depth</span>
                <span className="font-mono">{Math.round((fx.chorus?.depth ?? 0.5) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={fx.chorus?.depth ?? 0.5}
                onChange={e => updateChorus('depth', Number(e.target.value))}
                className="w-full accent-purple-500 h-1.5 bg-black/60 rounded"
              />
            </div>

            <div className="flex flex-col gap-0.5">
              <div className="flex justify-between text-[9px] text-studio-text-dim">
                <span>Mix (Wet)</span>
                <span className="font-mono">{Math.round((fx.chorus?.wet ?? 0) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={fx.chorus?.wet ?? 0}
                onChange={e => updateChorus('wet', Number(e.target.value))}
                className="w-full accent-purple-500 h-1.5 bg-black/60 rounded"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrackEffectsInspector;
