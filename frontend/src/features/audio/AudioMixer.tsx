import React, { useEffect, useCallback, useState, useRef } from 'react';
import * as Tone from 'tone';
import { 
  Settings2, 
  Play, 
  Pause, 
  Square, 
  ChevronRight, 
  RefreshCw,
  Upload,
  Volume2,
  VolumeX
} from 'lucide-react';
import { toast } from 'react-hot-toast';

import { useStudioStore } from '../../core/useStudioStore';
import { useAudioComposition } from '../../hooks/useAudioComposition';
import { useAudioPlayback } from '../../hooks/useAudioPlayback';
import { useWorktree } from '../../core/useWorktree';
import PianoRoll from './PianoRoll';
import WaveformDisplay from './WaveformDisplay';

interface LayerState {
  name: string;
  volume: number;
  pan: number;
  active: boolean;
  solo?: boolean;
  progress: number;
  fileName?: string;
}

const AudioMixer: React.FC = () => {
  const { yAudio, yHistory } = useStudioStore();
  const { isComposing, composingLayerIndex, compositionProgress, lastOutputUrl, compose } = useAudioComposition();
  const { isPlaying, currentStep, togglePlay, stop, loadResult, meter } = useAudioPlayback();
  const { isReviewMode, activeProposalId, proposals } = useWorktree();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedChannelForImport, setSelectedChannelForImport] = useState<number | null>(null);

  const [layers, setLayers] = useState<LayerState[]>([
    { name: 'Bass Synth', volume: 0, pan: 0, active: true, solo: false, progress: 0 },
    { name: 'Lead Melody', volume: 0, pan: 0, active: true, solo: false, progress: 0 },
    { name: 'Percussion', volume: 0, pan: 0, active: true, solo: false, progress: 0 },
    { name: 'Atmosphere', volume: -6, pan: 0, active: false, solo: false, progress: 0 },
  ]);

  const [bpm, setBpm] = useState(120);
  const [bottomView, setBottomView] = useState<'piano-roll' | 'waveform' | 'none'>('piano-roll');
  const [meterLevels, setMeterLevels] = useState<number[]>([0, 0, 0, 0]);

  // Load audio result when AI returns output
  useEffect(() => { 
    if (lastOutputUrl) {
      loadResult(lastOutputUrl);
      if (yHistory && composingLayerIndex !== null) {
        yHistory.push([{
          type: 'audio',
          label: `Layer: ${layers[composingLayerIndex].name} (Seed: ${Math.floor(Math.random() * 1000)})`,
          preview: null,
          timestamp: Date.now(),
          url: lastOutputUrl
        }]);
      }
    } 
  }, [lastOutputUrl, loadResult, yHistory, composingLayerIndex, layers]);

  // Load audio data from active proposal in review mode
  useEffect(() => {
    if (isReviewMode && activeProposalId) {
      const proposal = (proposals as any)?.get(activeProposalId);
      if (proposal?.type === 'audio_layer' && proposal.data) {
        loadResult(proposal.data);
      }
    }
  }, [isReviewMode, activeProposalId, proposals, loadResult]);

  const [composer, setComposer] = useState('standard');
  const [key, setKey] = useState('C');
  const [scale, setScale] = useState('Major');
  const [mood, setMood] = useState('Neutral');

  useEffect(() => {
    if (!yAudio) return;
    const update = () => {
      const b = yAudio.get('bpm') as number;
      if (b && b !== bpm) { 
        setBpm(b); 
        Tone.getTransport().bpm.value = b; 
      }
      const l = yAudio.get('layers') as LayerState[];
      if (l) setLayers(l);
      setComposer(yAudio.get('composer') || 'standard');
      setKey(yAudio.get('key') || 'C');
      setScale(yAudio.get('scale') || 'Major');
      setMood(yAudio.get('mood') || 'Neutral');
    };
    yAudio.observe(update);
    return () => yAudio.unobserve(update);
  }, [yAudio, bpm]);

  // Measure VU meter signal levels during playback
  useEffect(() => {
    let animId: number;
    const pollMeter = () => {
      if (isPlaying && meter) {
        const val = meter.getValue();
        const numVal = typeof val === 'number' ? Math.max(0, Math.min(1, val)) : 0;
        setMeterLevels([
          numVal * (layers[0]?.active ? 1 : 0),
          numVal * 0.85 * (layers[1]?.active ? 1 : 0),
          numVal * 0.9 * (layers[2]?.active ? 1 : 0),
          numVal * 0.6 * (layers[3]?.active ? 1 : 0)
        ]);
      } else {
        setMeterLevels([0, 0, 0, 0]);
      }
      animId = requestAnimationFrame(pollMeter);
    };

    pollMeter();
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, meter, layers]);

  const updateYjs = useCallback((l: LayerState[]) => { 
    yAudio?.set('layers', l); 
  }, [yAudio]);

  const handleTogglePlay = async () => {
    // Gather active notes from yAudio
    const activeMap: Record<string, boolean> = {};
    if (yAudio) {
      const NOTES = ['C4', 'B3', 'A#3', 'A3', 'G#3', 'G3', 'F#3', 'F3', 'E3', 'D#3', 'D3', 'C#3', 'C3'];
      NOTES.forEach(note => {
        for (let s = 0; s < 32; s++) {
          const k = `note_${note}_${s}`;
          if (yAudio.get(k)) activeMap[k] = true;
        }
      });
    }
    await togglePlay(activeMap);
  };

  const handleStop = () => {
    stop();
  };

  const toggleMute = (index: number) => {
    const next = [...layers];
    next[index] = { ...next[index], active: !next[index].active };
    setLayers(next);
    updateYjs(next);
  };

  const toggleSolo = (index: number) => {
    const next = [...layers];
    const currentSolo = !next[index].solo;
    next[index] = { ...next[index], solo: currentSolo };
    
    // If any track is soloed, mute others
    const anySolo = next.some(l => l.solo);
    next.forEach((l, i) => {
      l.active = anySolo ? (l.solo === true) : true;
    });

    setLayers(next);
    updateYjs(next);
  };

  const handleAudioFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || selectedChannelForImport === null) return;
    const file = files[0];
    const objectUrl = URL.createObjectURL(file);
    
    loadResult(objectUrl);
    
    const next = [...layers];
    next[selectedChannelForImport] = {
      ...next[selectedChannelForImport],
      fileName: file.name,
      active: true
    };
    setLayers(next);
    updateYjs(next);
    toast.success(`Loaded audio clip: ${file.name}`);
  };

  return (
    <div className="flex-1 flex flex-col bg-studio-background overflow-hidden text-studio-text select-none">
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleAudioFileImport}
      />

      {/* Top Transport Bar */}
      <div className="h-12 border-b border-studio-border flex items-center px-4 bg-studio-header justify-between shadow-sm z-10">
        <div className="flex items-center gap-4">
          <div className="flex bg-black/40 rounded-lg border border-studio-border p-1 shadow-inner">
            <button 
              type="button"
              onClick={handleTogglePlay} 
              className={`p-1.5 hover:bg-studio-accent/20 rounded-md transition-all ${
                isPlaying ? 'text-studio-accent' : 'text-studio-text-dim hover:text-white'
              }`}
              title={isPlaying ? 'Pause' : 'Play (Space)'}
            >
              {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
            </button>
            <button 
              type="button"
              onClick={handleStop} 
              className="p-1.5 hover:bg-studio-accent/20 rounded-md text-studio-text-dim hover:text-red-400 transition-all"
              title="Stop"
            >
              <Square size={18} fill="currentColor" />
            </button>
          </div>
          <div className="flex flex-col">
            <div className="text-[10px] font-mono text-studio-accent font-bold">
              MASTER AUDIO OUTPUT
            </div>
            <div className="text-[9px] font-mono text-studio-text-dim tracking-wider">
              {isPlaying ? `STEP ${currentStep + 1}/32 • PLAYING` : 'TRANSPORT STOPPED'}
            </div>
          </div>
        </div>

        {/* BPM & Settings */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 px-3 py-1 bg-black/40 rounded-full border border-studio-border">
            <span className="text-[10px] text-studio-text-dim font-bold tracking-wider uppercase">BPM</span>
            <input 
              type="number" 
              min={40}
              max={240}
              value={bpm} 
              onChange={(e) => { 
                const b = parseInt(e.target.value) || 120; 
                setBpm(b); 
                Tone.getTransport().bpm.value = b; 
                yAudio?.set('bpm', b); 
              }}
              className="w-12 bg-transparent text-xs font-mono text-studio-accent text-center focus:outline-none" 
            />
          </div>

          <div className="w-px h-6 bg-studio-border" />
          
          <div className="flex bg-black/40 rounded-lg border border-studio-border p-1">
            <button 
              type="button"
              onClick={() => setBottomView(bottomView === 'piano-roll' ? 'none' : 'piano-roll')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold transition-all ${
                bottomView === 'piano-roll' 
                  ? 'bg-studio-accent text-white shadow-sm' 
                  : 'text-studio-text-dim hover:text-white'
              }`}
            >
              <span>Piano Roll</span>
            </button>
            <button 
              type="button"
              onClick={() => setBottomView(bottomView === 'waveform' ? 'none' : 'waveform')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold transition-all ${
                bottomView === 'waveform' 
                  ? 'bg-studio-accent text-white shadow-sm' 
                  : 'text-studio-text-dim hover:text-white'
              }`}
            >
              <span>Waveform</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Mixer Section */}
      <div className="flex-1 flex flex-col overflow-hidden bg-studio-background">
        <div className="flex-1 flex p-6 gap-4 overflow-x-auto custom-scrollbar items-start">
          {layers.map((layer, index) => {
            const level = meterLevels[index] || 0;
            const activeLeds = Math.round(level * 16);

            return (
              <div 
                key={layer.name} 
                className={`w-52 min-w-[13rem] flex-shrink-0 bg-studio-panel border rounded-xl p-4 flex flex-col shadow-xl transition-all ${
                  !layer.active 
                    ? 'opacity-40 grayscale-[0.6] border-studio-border' 
                    : layer.solo 
                      ? 'border-amber-400/80 ring-1 ring-amber-400/30' 
                      : 'border-studio-border hover:border-studio-accent/50'
                }`}
              >
                {/* Channel Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold uppercase tracking-tight text-studio-text truncate">
                      {layer.name}
                    </span>
                    <span className="text-[9px] text-studio-accent font-mono">CHANNEL {index + 1}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button 
                      type="button"
                      onClick={() => {
                        setSelectedChannelForImport(index);
                        fileInputRef.current?.click();
                      }}
                      className="p-1 rounded bg-black/40 text-studio-text-dim hover:text-white border border-studio-border"
                      title="Import audio file into channel"
                    >
                      <Upload size={12} />
                    </button>
                    <button 
                      type="button"
                      onClick={() => compose(index, Math.floor(Math.random() * 1000000), { bpm, composer, key, scale, mood })} 
                      disabled={isComposing} 
                      className={`p-1 rounded transition-all ${
                        composingLayerIndex === index 
                          ? 'animate-spin bg-studio-accent text-white' 
                          : 'bg-black/40 text-studio-text-dim hover:text-studio-accent hover:bg-studio-accent/10 border border-studio-border'
                      }`}
                      title="AI Compose Layer"
                    >
                      <RefreshCw size={12} />
                    </button>
                  </div>
                </div>

                {layer.fileName && (
                  <div className="text-[9px] text-studio-text-dim font-mono truncate mb-2 bg-black/30 px-1.5 py-0.5 rounded border border-studio-border">
                    🎵 {layer.fileName}
                  </div>
                )}

                {/* Fader & LED Meter Section */}
                <div className="flex-1 flex gap-4 mb-4 h-44 min-h-[11rem]">
                  {/* Vertical Volume Fader */}
                  <div className="w-9 bg-black/60 rounded-lg relative overflow-hidden flex flex-col justify-end p-1 border border-studio-border/60 group">
                    <input 
                      type="range" 
                      min="-60" 
                      max="6" 
                      value={layer.volume} 
                      onChange={(e) => { 
                        const next = [...layers]; 
                        next[index].volume = parseInt(e.target.value); 
                        setLayers(next); 
                        updateYjs(next); 
                      }} 
                      className="absolute inset-0 opacity-0 cursor-pointer -rotate-90 origin-center z-10" 
                      style={{ width: '160px', left: '-62px', top: '70px' }} 
                    />
                    <div 
                      className="w-full bg-studio-accent rounded shadow-[0_0_8px_rgba(99,102,241,0.5)] transition-all duration-75" 
                      style={{ height: `${((layer.volume + 60) / 66) * 100}%` }} 
                    />
                  </div>

                  {/* 16-Segment LED VU Meter */}
                  <div className="flex-1 flex flex-col gap-1 justify-between py-1 bg-black/30 p-1.5 rounded border border-studio-border/30">
                    {[...Array(16)].map((_, i) => {
                      const segIndex = 15 - i;
                      const isLit = isPlaying && activeLeds > segIndex;
                      const isPeak = segIndex >= 13;
                      const isWarning = segIndex >= 10 && segIndex < 13;

                      return (
                        <div 
                          key={i} 
                          className={`h-1 rounded-full transition-all duration-75 ${
                            isLit 
                              ? isPeak 
                                ? 'bg-red-500 shadow-[0_0_6px_#ef4444]' 
                                : isWarning 
                                  ? 'bg-amber-400 shadow-[0_0_5px_#f59e0b]' 
                                  : 'bg-studio-accent shadow-[0_0_4px_#6366f1]' 
                              : 'bg-white/5'
                          }`} 
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Channel Fader Decibel label */}
                <div className="text-[10px] font-mono text-center text-studio-text-dim mb-3">
                  {layer.volume > 0 ? `+${layer.volume}` : layer.volume} dB
                </div>

                {/* Mute & Solo Buttons */}
                <div className="flex items-center justify-between gap-2 mt-auto pt-3 border-t border-studio-border/40">
                  <button 
                    type="button"
                    onClick={() => toggleMute(index)}
                    className={`flex-1 py-1 rounded text-[10px] font-bold border transition-all ${
                      !layer.active 
                        ? 'bg-red-500/20 border-red-500 text-red-400 shadow-sm' 
                        : 'bg-black/40 border-studio-border text-studio-text-dim hover:text-white'
                    }`}
                  >
                    MUTE
                  </button>
                  <button 
                    type="button"
                    onClick={() => toggleSolo(index)}
                    className={`flex-1 py-1 rounded text-[10px] font-bold border transition-all ${
                      layer.solo 
                        ? 'bg-amber-400 text-black border-amber-400 shadow-sm' 
                        : 'bg-black/40 border-studio-border text-studio-text-dim hover:text-white'
                    }`}
                  >
                    SOLO
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Docked Audio Editor Section (Piano Roll or Waveform Timeline) */}
        {bottomView === 'piano-roll' && (
          <div className="h-64 min-h-[16rem] border-t border-studio-border bg-studio-panel p-3 overflow-hidden shadow-2xl z-20">
            <PianoRoll currentStep={currentStep} isPlaying={isPlaying} />
          </div>
        )}
        {bottomView === 'waveform' && (
          <div className="h-64 min-h-[16rem] border-t border-studio-border bg-studio-panel p-3 overflow-hidden shadow-2xl z-20">
            <WaveformDisplay 
              currentStep={currentStep} 
              isPlaying={isPlaying} 
              channelNames={layers.map(l => l.name)}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default AudioMixer;
