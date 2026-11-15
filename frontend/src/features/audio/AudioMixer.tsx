import React, { useEffect, useCallback, useState, useRef } from 'react';
import * as Tone from 'tone';
import {
  Play,
  Pause,
  Square,
  Repeat,
  Sliders,
  Music,
  Activity,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

import { useStudioStore } from '../../core/useStudioStore';
import { useAudioEngine } from '../../hooks/useAudioEngine';

import {
  AudioTrackLayer,
  SongZone,
  MidiNote,
  DEFAULT_AUDIO_LAYERS,
  DEFAULT_SONG_ZONES,
  DEFAULT_FX_CHAIN,
  ROOT_NOTES,
  MUSICAL_SCALES,
  normalizeAudioState
} from './types';

import AudioLayersManager from './AudioLayersManager';
import TrackEffectsInspector from './TrackEffectsInspector';
import PianoRoll from './PianoRoll';
import WaveformDisplay from './WaveformDisplay';
import AiSongRecreator from './AiSongRecreator';

const AudioMixer: React.FC = () => {
  const { yAudio } = useStudioStore();

  // Song Parameters
  const [bpm, setBpm] = useState<number>(120);
  const [songKey, setSongKey] = useState<string>('D');
  const [songScale, setScale] = useState<string>('Minor');

  // Layers & Zones State
  const [layers, setLayers] = useState<AudioTrackLayer[]>(DEFAULT_AUDIO_LAYERS);
  const [zones, setZones] = useState<SongZone[]>(DEFAULT_SONG_ZONES);
  const [activeLayerId, setActiveLayerId] = useState<string>(DEFAULT_AUDIO_LAYERS[0].id);
  const [activeZoneId, setActiveZoneId] = useState<string>(DEFAULT_SONG_ZONES[0].id);

  // Layout View Tabs
  const [workspaceView, setWorkspaceView] = useState<'arranger' | 'mixer'>('arranger');
  const [activeBottomTab, setActiveBottomTab] = useState<'piano-roll' | 'fx' | 'waveform'>('piano-roll');
  const [showAiDrawer, setShowAiDrawer] = useState<boolean>(false);
  const [isFocusMode, setIsFocusMode] = useState<boolean>(false);

  // Web Audio Engine Hook
  const {
    isPlaying,
    currentStep,
    loopCurrentZoneOnly,
    setLoopCurrentZoneOnly,
    togglePlay,
    stop,
    playAuditionNote,
    initOrUpdateLayerNodes,
    masterMeter,
    trackNodesMap
  } = useAudioEngine(bpm);

  // Per-track VU meter levels (rAF loop)
  const [vuLevels, setVuLevels] = useState<Record<string, number>>({});
  const [masterLevel, setMasterLevel] = useState<number>(0);
  const vuRafRef = useRef<number | null>(null);
  const hasWarnedAudioRepairRef = useRef(false);

  // Spacebar play/pause shortcut
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay(layers, zones, activeZoneId);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [togglePlay, layers, zones, activeZoneId]);

  // VU meter animation loop — reads Tone.Meter values per track
  useEffect(() => {
    const tick = () => {
      const next: Record<string, number> = {};
      trackNodesMap.forEach((nodes, layerId) => {
        const val = nodes.meter.getValue();
        next[layerId] = typeof val === 'number' ? Math.max(0, Math.min(1, val)) : 0;
      });
      setVuLevels(next);
      // Master meter
      if (masterMeter) {
        const mv = masterMeter.getValue();
        setMasterLevel(typeof mv === 'number' ? Math.max(0, Math.min(1, mv)) : 0);
      }
      vuRafRef.current = requestAnimationFrame(tick);
    };
    vuRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (vuRafRef.current !== null) cancelAnimationFrame(vuRafRef.current);
    };
  }, [trackNodesMap, masterMeter]);

  // Sync state to Yjs
  const syncToYjs = useCallback((newLayers: AudioTrackLayer[], newZones?: SongZone[]) => {
    if (!yAudio) return;
    yAudio.set('layers', newLayers);
    if (newZones) yAudio.set('zones', newZones);
    yAudio.set('bpm', bpm);
    yAudio.set('key', songKey);
    yAudio.set('scale', songScale);
  }, [yAudio, bpm, songKey, songScale]);

  // Sync Yjs to local state on external changes
  useEffect(() => {
    if (!yAudio) return;
    const update = () => {
      const storedBpm = yAudio.get('bpm') as number;
      if (storedBpm && storedBpm !== bpm) {
        setBpm(storedBpm);
        Tone.getTransport().bpm.value = storedBpm;
      }
      const storedKey = yAudio.get('key') as string;
      if (storedKey) setSongKey(storedKey);
      const storedScale = yAudio.get('scale') as string;
      if (storedScale) setScale(storedScale);
      const audioState = normalizeAudioState(yAudio.get('layers'), yAudio.get('zones'));
      setLayers(audioState.layers);
      setZones(audioState.zones);
      if (!audioState.layers.some(layer => layer.id === activeLayerId)) {
        setActiveLayerId(audioState.layers[0].id);
      }
      if (!audioState.zones.some(zone => zone.id === activeZoneId)) {
        setActiveZoneId(audioState.zones[0].id);
      }
      if (audioState.repaired && !hasWarnedAudioRepairRef.current) {
        hasWarnedAudioRepairRef.current = true;
        toast(
          'Saved audio data was incomplete. Defaults were restored for this session; edit the affected tracks to save the repaired version.',
          { icon: '⚠️', duration: 7000 }
        );
      }
    };
    yAudio.observe(update);
    update();
    return () => yAudio.unobserve(update);
  }, [yAudio, bpm, activeLayerId, activeZoneId]);

  // Active layer and zone objects
  const activeLayer = layers.find(l => l.id === activeLayerId) || layers[0];
  const activeZone = zones.find(z => z.id === activeZoneId) || zones[0];

  // Update a specific layer
  const handleUpdateLayer = (layerId: string, updates: Partial<AudioTrackLayer>) => {
    const nextLayers = layers.map(l => {
      if (l.id === layerId) {
        const updated = { ...l, ...updates };
        initOrUpdateLayerNodes(updated);
        return updated;
      }
      return l;
    });
    setLayers(nextLayers);
    syncToYjs(nextLayers);
  };

  // Update notes for active layer and zone
  const handleNotesChange = (newNotes: MidiNote[]) => {
    const nextLayers = layers.map(l => {
      if (l.id === activeLayerId) {
        return {
          ...l,
          zoneNotes: {
            ...l.zoneNotes,
            [activeZoneId]: newNotes
          }
        };
      }
      return l;
    });
    setLayers(nextLayers);
    syncToYjs(nextLayers);
  };

  // Add new Audio Track Layer
  const handleAddLayer = (instrumentType: string) => {
    const id = `layer-${Date.now()}`;
    const colors = ['#f43f5e', '#818cf8', '#38bdf8', '#10b981', '#f59e0b', '#ec4899', '#a855f7'];
    const color = colors[layers.length % colors.length];

    let name = 'New Layer';
    let type: any = 'polysynth';
    if (instrumentType === 'drums') {
      name = 'Percussion Kit';
      type = 'drums';
    } else if (instrumentType === 'monosynth') {
      name = 'Sub Bass Synth';
      type = 'monosynth';
    } else if (instrumentType === 'lead') {
      name = 'Lead Synthesizer';
      type = 'polysynth';
    } else {
      name = 'Poly Harmony';
      type = 'polysynth';
    }

    const newLayer: AudioTrackLayer = {
      id,
      name,
      color,
      muted: false,
      solo: false,
      volume: -3,
      pan: 0,
      instrument: {
        type,
        oscillatorType: 'sawtooth',
        envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.4 }
      },
      fx: DEFAULT_FX_CHAIN,
      zoneNotes: {}
    };

    const nextLayers = [...layers, newLayer];
    setLayers(nextLayers);
    setActiveLayerId(id);
    syncToYjs(nextLayers);
    initOrUpdateLayerNodes(newLayer);
    toast.success(`Created audio track: ${name}`);
  };

  // Delete Audio Track Layer
  const handleDeleteLayer = (layerId: string) => {
    if (layers.length <= 1) {
      toast.error('Cannot delete the last remaining track');
      return;
    }
    const nextLayers = layers.filter(l => l.id !== layerId);
    setLayers(nextLayers);
    if (activeLayerId === layerId) {
      setActiveLayerId(nextLayers[0].id);
    }
    syncToYjs(nextLayers);
    toast.success('Track removed');
  };

  // Add Song Zone
  const handleAddZone = () => {
    const zoneNames = ['Intro', 'Verse', 'Chorus', 'Bridge', 'Drop', 'Outro', 'Solo'];
    const nextIdx = zones.length;
    const name = zoneNames[nextIdx % zoneNames.length] || `Section ${nextIdx + 1}`;
    const colors = ['#38bdf8', '#818cf8', '#f43f5e', '#10b981', '#f59e0b', '#ec4899'];
    const newZone: SongZone = {
      id: `zone-${Date.now()}`,
      name,
      startStep: zones.length * 32,
      lengthSteps: 32,
      color: colors[zones.length % colors.length]
    };
    const nextZones = [...zones, newZone];
    setZones(nextZones);
    setActiveZoneId(newZone.id);
    syncToYjs(layers, nextZones);
    toast.success(`Added song zone: ${name}`);
  };

  // Rename Zone
  const handleRenameZone = (zoneId: string, newName: string) => {
    const nextZones = zones.map(z => z.id === zoneId ? { ...z, name: newName } : z);
    setZones(nextZones);
    syncToYjs(layers, nextZones);
    toast.success(`Zone renamed to "${newName}"`);
  };

  return (
    <div className={`flex flex-col h-full w-full bg-[#07070b] text-studio-text select-none overflow-hidden ${isFocusMode ? 'fixed inset-0 z-50' : ''}`}>
      {/* TOP MASTER TRANSPORT & SETTINGS BAR (44px) */}
      <div className="h-11 bg-studio-header border-b border-studio-border px-3 flex items-center justify-between shrink-0 shadow-sm z-20">
        {/* Left: Transport Controls & Playhead Info */}
        <div className="flex items-center gap-3">
          {/* Play & Stop Buttons */}
          <div className="flex bg-black/60 rounded-lg border border-studio-border p-1 shadow-inner">
            <button
              type="button"
              onClick={() => togglePlay(layers, zones, activeZoneId)}
              className={`p-1.5 rounded-md transition-all ${
                isPlaying ? 'bg-studio-accent text-white shadow-md' : 'text-studio-text-dim hover:text-white'
              }`}
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
            </button>
            <button
              type="button"
              onClick={stop}
              className="p-1.5 rounded-md text-studio-text-dim hover:text-red-400 transition-all"
              title="Stop"
            >
              <Square size={16} fill="currentColor" />
            </button>
          </div>

          {/* Loop Zone Toggle */}
          <button
            type="button"
            onClick={() => setLoopCurrentZoneOnly(!loopCurrentZoneOnly)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold border transition-all ${
              loopCurrentZoneOnly
                ? 'bg-studio-accent/20 border-studio-accent text-studio-accent'
                : 'bg-black/30 border-studio-border text-studio-text-dim hover:text-white'
            }`}
            title="Toggle between looping active zone or playing entire song sequence"
          >
            <Repeat size={12} />
            <span>{loopCurrentZoneOnly ? 'Loop Zone' : 'Play Song'}</span>
          </button>

          {/* Step Indicator + Master VU */}
          <div className="flex flex-col font-mono text-[9px] leading-tight">
            <span className="text-studio-accent font-bold">
              {isPlaying ? `STEP ${currentStep + 1}/32 • ${activeZone.name.toUpperCase()}` : 'TRANSPORT STOPPED'}
            </span>
            <span className="text-studio-text-dim">
              TIME: {Math.floor(currentStep / 16) + 1}.{(Math.floor(currentStep / 4) % 4) + 1}.{(currentStep % 4) + 1}
            </span>
          </div>

          {/* Master VU strip in transport bar */}
          <div className="flex items-center gap-1 ml-1">
            <span className="text-[8px] font-bold uppercase tracking-widest text-studio-text-dim">OUT</span>
            <div className="flex gap-px h-5">
              {Array.from({ length: 12 }).map((_, i) => {
                const threshold = i / 12;
                const lit = masterLevel > threshold;
                const color = i >= 10 ? 'bg-red-500' : i >= 8 ? 'bg-amber-400' : 'bg-emerald-500';
                return (
                  <div
                    key={i}
                    className={`w-1.5 h-full rounded-sm transition-all duration-75 ${lit ? color : 'bg-white/[0.06]'}`}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Center: BPM, Musical Key & Scale */}
        <div className="flex items-center gap-2">
          {/* BPM */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-black/50 border border-studio-border rounded-lg text-xs">
            <span className="text-[10px] text-studio-text-dim font-bold uppercase">BPM</span>
            <input
              type="number"
              min={40}
              max={240}
              value={bpm}
              onChange={e => {
                const b = Math.min(240, Math.max(40, parseInt(e.target.value) || 120));
                setBpm(b);
                Tone.getTransport().bpm.value = b;
                syncToYjs(layers);
              }}
              className="w-11 bg-transparent text-xs font-mono text-studio-accent font-bold text-center focus:outline-none"
            />
          </div>

          {/* Key */}
          <div className="flex items-center gap-1 px-2 py-1 bg-black/50 border border-studio-border rounded-lg text-xs">
            <span className="text-[10px] text-studio-text-dim font-bold uppercase">Key</span>
            <select
              value={songKey}
              onChange={e => {
                setSongKey(e.target.value);
                syncToYjs(layers);
              }}
              className="bg-transparent font-mono text-xs font-bold text-studio-accent focus:outline-none"
            >
              {ROOT_NOTES.map(k => (
                <option key={k} value={k} className="bg-studio-panel text-white">{k}</option>
              ))}
            </select>
          </div>

          {/* Scale */}
          <div className="flex items-center gap-1 px-2 py-1 bg-black/50 border border-studio-border rounded-lg text-xs">
            <span className="text-[10px] text-studio-text-dim font-bold uppercase">Scale</span>
            <select
              value={songScale}
              onChange={e => {
                setScale(e.target.value);
                syncToYjs(layers);
              }}
              className="bg-transparent font-mono text-xs font-bold text-studio-accent focus:outline-none"
            >
              {Object.keys(MUSICAL_SCALES).map(s => (
                <option key={s} value={s} className="bg-studio-panel text-white">{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Right: View Switcher, AI Co-Producer Drawer Toggle & Full-Screen Focus */}
        <div className="flex items-center gap-2">
          {/* Arranger vs Mixer View Toggle */}
          <div className="flex bg-black/50 border border-studio-border rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setWorkspaceView('arranger')}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                workspaceView === 'arranger'
                  ? 'bg-studio-accent text-white shadow-sm'
                  : 'text-studio-text-dim hover:text-white'
              }`}
            >
              Arranger
            </button>
            <button
              type="button"
              onClick={() => setWorkspaceView('mixer')}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                workspaceView === 'mixer'
                  ? 'bg-studio-accent text-white shadow-sm'
                  : 'text-studio-text-dim hover:text-white'
              }`}
            >
              Console Mixer
            </button>
          </div>

          {/* AI Co-Producer Drawer Button */}
          <button
            type="button"
            onClick={() => setShowAiDrawer(!showAiDrawer)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
              showAiDrawer
                ? 'bg-studio-accent-orange text-white border-studio-accent-orange shadow-md'
                : 'bg-black/40 border-studio-border text-studio-text-dim hover:text-white hover:border-studio-accent'
            }`}
          >
            <Music size={13} />
            <span>MIDI Templates</span>
          </button>

          {/* Focus Mode Toggle */}
          <button
            type="button"
            onClick={() => setIsFocusMode(!isFocusMode)}
            className="p-1.5 rounded-lg bg-black/40 border border-studio-border text-studio-text-dim hover:text-white"
            title={isFocusMode ? 'Exit Focus Mode' : 'Maximize Workspace (Focus Mode)'}
          >
            {isFocusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* AI CO-PRODUCER COLLAPSIBLE DRAWER */}
      {showAiDrawer && (
        <div className="border-b border-studio-border bg-[#0a0a12] p-2 animate-in slide-in-from-top duration-200">
          <AiSongRecreator
            layers={layers}
            zones={zones}
            songKey={songKey}
            songScale={songScale}
            bpm={bpm}
            activeLayerId={activeLayerId}
            activeZoneId={activeZoneId}
            onUpdateLayers={nextLayers => {
              setLayers(nextLayers);
              syncToYjs(nextLayers);
            }}
            onKeyChange={(key, scale) => {
              setSongKey(key);
              setScale(scale);
              yAudio?.set('key', key);
              yAudio?.set('scale', scale);
            }}
            onBpmChange={nextBpm => {
              setBpm(nextBpm);
              Tone.getTransport().bpm.value = nextBpm;
              yAudio?.set('bpm', nextBpm);
            }}
          />
        </div>
      )}

      {/* MAIN TOP AREA (55% height): Arranger / Audio Layers Timeline OR Console Mixer */}
      <div className="flex-[55] min-h-0 min-w-0 flex overflow-hidden">
        {workspaceView === 'arranger' ? (
          <AudioLayersManager
            layers={layers}
            zones={zones}
            activeLayerId={activeLayerId}
            activeZoneId={activeZoneId}
            currentStep={currentStep}
            isPlaying={isPlaying}
            onSelectLayer={setActiveLayerId}
            onSelectZone={setActiveZoneId}
            onUpdateLayer={handleUpdateLayer}
            onAddLayer={handleAddLayer}
            onDeleteLayer={handleDeleteLayer}
            onAddZone={handleAddZone}
            onRenameZone={handleRenameZone}
          />
        ) : (
          /* Console Mixer View */
          <div className="flex-1 flex gap-2 p-3 overflow-x-auto custom-scrollbar bg-[#060609] items-stretch">
            {/* Master Channel Strip */}
            <div className="w-20 min-w-[5rem] bg-[#0d0d14] border border-studio-border/80 rounded-xl p-2 flex flex-col gap-2 shadow-xl">
              <div className="text-[8px] font-bold uppercase tracking-widest text-studio-text-dim text-center border-b border-studio-border/40 pb-1">
                MASTER
              </div>
              {/* Master VU */}
              <div className="flex justify-center gap-0.5 flex-1">
                {[0, 1].map(ch => (
                  <div key={ch} className="flex flex-col-reverse gap-px w-2.5">
                    {Array.from({ length: 16 }).map((_, i) => {
                      const threshold = i / 16;
                      const lit = masterLevel > threshold;
                      const color = i >= 14 ? 'bg-red-500' : i >= 11 ? 'bg-amber-400' : 'bg-emerald-500';
                      return (
                        <div
                          key={i}
                          className={`h-1 rounded-sm transition-all duration-75 ${lit ? color : 'bg-white/[0.06]'}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="text-[8px] font-mono text-center text-emerald-400 font-bold">
                {masterLevel > 0 ? `${Math.round(masterLevel * 100)}%` : '—'}
              </div>
            </div>

            {/* Per-Track Channel Strips */}
            {layers.map((layer) => {
              const level = vuLevels[layer.id] || 0;
              const isActive = activeLayerId === layer.id;
              return (
                <div
                  key={layer.id}
                  onClick={() => setActiveLayerId(layer.id)}
                  className={`w-20 min-w-[5rem] bg-[#0d0d14] border rounded-xl p-2 flex flex-col gap-1.5 shadow-xl transition-all cursor-pointer ${
                    isActive
                      ? 'border-studio-accent ring-1 ring-studio-accent/30'
                      : 'border-studio-border/50 hover:border-studio-border'
                  }`}
                >
                  {/* Color Tag + Name */}
                  <div
                    className="h-1 rounded-full"
                    style={{ backgroundColor: layer.color }}
                  />
                  <div className="text-[8px] font-bold text-studio-text truncate text-center leading-tight">
                    {layer.name}
                  </div>

                  {/* Instrument Badge */}
                  <div
                    className="text-[7px] font-mono font-bold uppercase text-center px-1 py-0.5 rounded"
                    style={{ backgroundColor: `${layer.color}25`, color: layer.color }}
                  >
                    {layer.instrument.type}
                  </div>

                  {/* LED VU Meter */}
                  <div className="flex justify-center gap-0.5 flex-1">
                    {[0, 1].map(ch => (
                      <div key={ch} className="flex flex-col-reverse gap-px w-2">
                        {Array.from({ length: 16 }).map((_, i) => {
                          const threshold = i / 16;
                          const lit = level > threshold && !layer.muted;
                          const color = i >= 14 ? 'bg-red-500' : i >= 11 ? 'bg-amber-400' : layer.muted ? 'bg-gray-600' : 'bg-emerald-500';
                          return (
                            <div
                              key={i}
                              className={`h-1 rounded-sm transition-all duration-75 ${lit ? color : 'bg-white/[0.05]'}`}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  {/* Pan Control */}
                  <div className="flex flex-col items-center gap-0.5 px-1 py-0.5 bg-black/30 rounded border border-white/5">
                    <div className="flex justify-between w-full text-[7px] text-studio-text-dim font-mono">
                      <span>L</span>
                      <span className="font-bold text-studio-accent">
                        {layer.pan === 0 ? 'C' : layer.pan > 0 ? `R${Math.round(layer.pan * 100)}` : `L${Math.round(Math.abs(layer.pan) * 100)}`}
                      </span>
                      <span>R</span>
                    </div>
                    <input
                      type="range"
                      min="-1"
                      max="1"
                      step="0.05"
                      value={layer.pan}
                      onChange={e => handleUpdateLayer(layer.id, { pan: Number(e.target.value) })}
                      onClick={e => e.stopPropagation()}
                      className="w-full accent-studio-accent h-1 bg-black/60 rounded cursor-pointer"
                      title={`Pan: ${layer.pan}`}
                    />
                  </div>

                  {/* Vertical Fader */}
                  <div className="flex flex-col items-center gap-1 py-1">
                    <input
                      type="range"
                      min="-40"
                      max="6"
                      value={layer.volume}
                      onChange={e => handleUpdateLayer(layer.id, { volume: Number(e.target.value) })}
                      onClick={e => e.stopPropagation()}
                      className="h-16 accent-studio-accent cursor-pointer"
                      style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                      title={`${layer.volume > 0 ? '+' : ''}${layer.volume} dB`}
                    />
                    <span className="font-mono text-[8px] font-bold text-studio-text-dim">
                      {layer.volume > 0 ? `+${layer.volume}` : layer.volume}
                    </span>
                  </div>

                  {/* Mute & Solo */}
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); handleUpdateLayer(layer.id, { muted: !layer.muted }); }}
                      className={`flex-1 py-0.5 rounded text-[8px] font-bold border transition-all ${
                        layer.muted
                          ? 'bg-red-500/40 text-red-200 border-red-500/60'
                          : 'bg-black/40 text-studio-text-dim border-studio-border/40 hover:text-white'
                      }`}
                    >M</button>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); handleUpdateLayer(layer.id, { solo: !layer.solo }); }}
                      className={`flex-1 py-0.5 rounded text-[8px] font-bold border transition-all ${
                        layer.solo
                          ? 'bg-amber-400 text-black border-amber-400'
                          : 'bg-black/40 text-studio-text-dim border-studio-border/40 hover:text-white'
                      }`}
                    >S</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* LOWER TRACK DETAIL INSPECTOR (45% height): Piano Roll / Effects Rack / Waveform */}
      <div className="flex-[45] min-h-0 min-w-0 border-t border-studio-border flex flex-col bg-[#07070b]">
        {/* Detail Tabs Bar */}
        <div className="h-8 bg-[#0b0b12] border-b border-studio-border px-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-studio-text-dim">
              Track Inspector:
            </span>
            <span className="text-xs font-bold" style={{ color: activeLayer.color }}>
              {activeLayer.name}
            </span>
          </div>

          {/* 3 Inspector Tabs */}
          <div className="flex bg-black/40 border border-studio-border rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setActiveBottomTab('piano-roll')}
              className={`flex items-center gap-1.5 px-3 py-0.5 rounded text-[11px] font-bold transition-all ${
                activeBottomTab === 'piano-roll'
                  ? 'bg-studio-accent text-white shadow-sm'
                  : 'text-studio-text-dim hover:text-white'
              }`}
            >
              <Music size={11} />
              <span>MIDI Piano Roll</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveBottomTab('fx')}
              className={`flex items-center gap-1.5 px-3 py-0.5 rounded text-[11px] font-bold transition-all ${
                activeBottomTab === 'fx'
                  ? 'bg-studio-accent text-white shadow-sm'
                  : 'text-studio-text-dim hover:text-white'
              }`}
            >
              <Sliders size={11} />
              <span>Effects Rack (Insert FX)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveBottomTab('waveform')}
              className={`flex items-center gap-1.5 px-3 py-0.5 rounded text-[11px] font-bold transition-all ${
                activeBottomTab === 'waveform'
                  ? 'bg-studio-accent text-white shadow-sm'
                  : 'text-studio-text-dim hover:text-white'
              }`}
            >
              <Activity size={11} />
              <span>Waveform Audio</span>
            </button>
          </div>
        </div>

        {/* Tab 1: MIDI Piano Roll */}
        {activeBottomTab === 'piano-roll' && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <PianoRoll
              layer={activeLayer}
              zone={activeZone}
              songKey={songKey}
              songScale={songScale}
              currentStep={currentStep}
              isPlaying={isPlaying}
              onNotesChange={handleNotesChange}
              onAudition={(pitch) => playAuditionNote(activeLayer, pitch)}
            />
          </div>
        )}

        {/* Tab 2: Track Effects Rack */}
        {activeBottomTab === 'fx' && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <TrackEffectsInspector
              fx={activeLayer.fx}
              trackName={activeLayer.name}
              onFxChange={(newFx) => handleUpdateLayer(activeLayer.id, { fx: newFx })}
            />
          </div>
        )}

        {/* Tab 3: Waveform Timeline */}
        {activeBottomTab === 'waveform' && (
          <div className="flex-1 min-h-0 overflow-hidden p-2">
            <WaveformDisplay
              currentStep={currentStep}
              isPlaying={isPlaying}
              channelNames={layers.map(l => l.name)}
              channelColors={layers.map(l => l.color)}
              activeChannel={layers.findIndex(l => l.id === activeLayerId)}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default AudioMixer;
