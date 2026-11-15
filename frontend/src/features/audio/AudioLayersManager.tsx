import React, { useState, useRef } from 'react';
import {
  Plus,
  Trash2,
  Layers,
  Disc,
  Copy,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  AudioTrackLayer,
  SongZone,
  MidiNote,
} from './types';

interface AudioLayersManagerProps {
  layers: AudioTrackLayer[];
  zones: SongZone[];
  activeLayerId: string;
  activeZoneId: string;
  currentStep: number;
  isPlaying: boolean;
  onSelectLayer: (layerId: string) => void;
  onSelectZone: (zoneId: string) => void;
  onUpdateLayer: (layerId: string, updates: Partial<AudioTrackLayer>) => void;
  onAddLayer: (instrumentType: string) => void;
  onDeleteLayer: (layerId: string) => void;
  onAddZone: () => void;
  onRenameZone?: (zoneId: string, newName: string) => void;
}

export const AudioLayersManager: React.FC<AudioLayersManagerProps> = ({
  layers,
  zones,
  activeLayerId,
  activeZoneId,
  currentStep,
  isPlaying,
  onSelectLayer,
  onSelectZone,
  onUpdateLayer,
  onAddLayer,
  onDeleteLayer,
  onAddZone,
  onRenameZone
}) => {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [renamingZoneId, setRenamingZoneId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>('');
  const [copiedClip, setCopiedClip] = useState<{ layerId: string; notes: MidiNote[] } | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const startRename = (zone: SongZone) => {
    setRenamingZoneId(zone.id);
    setRenameValue(zone.name);
    setTimeout(() => renameInputRef.current?.select(), 50);
  };

  const commitRename = () => {
    if (renamingZoneId && renameValue.trim()) {
      onRenameZone?.(renamingZoneId, renameValue.trim());
    }
    setRenamingZoneId(null);
  };

  const handleDuplicateZoneClip = (layerId: string, fromZoneId: string, toZoneId: string) => {
    const layer = layers.find(l => l.id === layerId);
    if (!layer) return;
    const notesToCopy = layer.zoneNotes[fromZoneId] || [];
    onUpdateLayer(layerId, {
      zoneNotes: {
        ...layer.zoneNotes,
        [toZoneId]: notesToCopy.map(n => ({
          ...n,
          id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`
        }))
      }
    });
    toast.success(`Copied clip to target zone`);
  };

  const handleClearZoneClip = (layerId: string, zoneId: string) => {
    const layer = layers.find(l => l.id === layerId);
    if (!layer) return;
    onUpdateLayer(layerId, {
      zoneNotes: {
        ...layer.zoneNotes,
        [zoneId]: []
      }
    });
    toast.success('Cleared zone clip');
  };

  return (
    <div className="flex flex-col h-full bg-[#08080c] border border-studio-border/60 rounded-xl overflow-hidden shadow-2xl">
      {/* Top Song Zones Timeline Header */}
      <div className="h-10 bg-studio-header border-b border-studio-border flex items-center">
        {/* Track Headers Column spacer */}
        <div className="w-64 min-w-[16rem] px-3 flex items-center justify-between border-r border-studio-border">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-studio-text">
            <Layers size={13} className="text-studio-accent" />
            <span>Audio Tracks ({layers.length})</span>
          </div>
          <button
            type="button"
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-studio-accent hover:bg-studio-accent/80 text-white font-bold text-[10px] transition-all shadow-sm"
            title="Add new audio track layer"
          >
            <Plus size={11} />
            <span>Track</span>
          </button>
        </div>

        {/* Zones Timeline Bar */}
        <div className="flex-1 flex items-center px-2 gap-2 overflow-x-auto custom-scrollbar">
          {zones.map((zone, zIdx) => {
            const isSelected = activeZoneId === zone.id;
            const isRenaming = renamingZoneId === zone.id;
            return (
              <div
                key={zone.id}
                onClick={() => onSelectZone(zone.id)}
                onDoubleClick={() => startRename(zone)}
                className={`flex-1 min-w-[8rem] h-7 px-3 rounded-md flex items-center justify-between cursor-pointer transition-all border group ${
                  isSelected
                    ? 'bg-studio-accent/25 border-studio-accent shadow-[0_0_10px_rgba(99,102,241,0.25)] text-white'
                    : 'bg-black/30 border-studio-border/50 text-studio-text-dim hover:text-white hover:border-studio-border'
                }`}
              >
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: zone.color }}
                  />
                  {isRenaming ? (
                    <input
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitRename();
                        if (e.key === 'Escape') setRenamingZoneId(null);
                        e.stopPropagation();
                      }}
                      onClick={e => e.stopPropagation()}
                      className="flex-1 min-w-0 bg-black/60 border border-studio-accent rounded px-1 text-[10px] font-bold text-white focus:outline-none"
                      autoFocus
                    />
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-wider truncate" title="Double-click to rename">
                      {zone.name}
                    </span>
                  )}
                </div>
                <span className="text-[9px] font-mono text-studio-text-dim flex-shrink-0 ml-1">
                  Bars {zIdx * 2 + 1}-{zIdx * 2 + 2}
                </span>
              </div>
            );
          })}
          <button
            type="button"
            onClick={onAddZone}
            className="px-2 py-1 rounded bg-black/40 border border-dashed border-studio-border/60 hover:border-studio-accent text-studio-text-dim hover:text-white text-[10px] flex items-center gap-1"
            title="Add Song Zone (Intro, Verse, Chorus, Drop)"
          >
            <Plus size={11} />
            <span>Zone</span>
          </button>
        </div>
      </div>

      {/* Track List & Timeline Body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
        {layers.map((layer) => {
          const isSelected = activeLayerId === layer.id;

          return (
            <div
              key={layer.id}
              onClick={() => onSelectLayer(layer.id)}
              className={`flex h-16 min-h-[4rem] border-b border-studio-border/40 transition-colors ${
                isSelected ? 'bg-studio-accent/10' : 'hover:bg-white/[0.02]'
              }`}
            >
              {/* Left Column: Track Header Controls */}
              <div className="w-64 min-w-[16rem] px-3 py-2 flex flex-col justify-between border-r border-studio-border/50 bg-[#0c0c12]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: layer.color }}
                    />
                    <span className="text-xs font-bold text-studio-text truncate">
                      {layer.name}
                    </span>
                  </div>

                  {/* Mute, Solo, Delete */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateLayer(layer.id, { muted: !layer.muted });
                      }}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition-all ${
                        layer.muted
                          ? 'bg-red-500/30 text-red-300 border-red-500/50'
                          : 'bg-black/40 text-studio-text-dim border-studio-border/40 hover:text-white'
                      }`}
                    >
                      M
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateLayer(layer.id, { solo: !layer.solo });
                      }}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition-all ${
                        layer.solo
                          ? 'bg-amber-400 text-black border-amber-400'
                          : 'bg-black/40 text-studio-text-dim border-studio-border/40 hover:text-white'
                      }`}
                    >
                      S
                    </button>
                    {layers.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteLayer(layer.id);
                        }}
                        className="p-1 rounded text-studio-text-dim hover:text-red-400"
                        title="Delete Layer"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Volume & Pan Mini Sliders */}
                <div className="flex items-center gap-2 text-[9px] text-studio-text-dim">
                  <div className="flex-1 flex items-center gap-1">
                    <span>Vol</span>
                    <input
                      type="range"
                      min="-40"
                      max="6"
                      value={layer.volume}
                      onClick={e => e.stopPropagation()}
                      onChange={e => onUpdateLayer(layer.id, { volume: Number(e.target.value) })}
                      className="flex-1 accent-studio-accent h-1 bg-black/60 rounded"
                    />
                    <span className="font-mono w-7 text-right">
                      {layer.volume > 0 ? `+${layer.volume}` : layer.volume}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-[8px] bg-studio-accent/20 text-studio-accent px-1 rounded uppercase">
                      {layer.instrument.type}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Column: Zones Timeline Blocks with MIDI Notes Preview */}
              <div className="flex-1 flex items-center px-2 gap-2 relative bg-black/40">
                {zones.map((zone) => {
                  const zoneNotes = layer.zoneNotes[zone.id] || [];
                  const isCurrentZone = activeZoneId === zone.id;

                  return (
                    <div
                      key={zone.id}
                      onClick={() => onSelectZone(zone.id)}
                      className={`flex-1 min-w-[8rem] h-12 rounded-lg border p-1 relative flex flex-col justify-between overflow-hidden cursor-pointer transition-all ${
                        isCurrentZone
                          ? 'border-studio-accent/60 bg-studio-accent/15'
                          : 'border-studio-border/30 bg-black/30 hover:border-studio-border/60'
                      }`}
                    >
                      {/* Mini Note Blocks Rendering */}
                      <div className="flex-1 w-full relative">
                        {zoneNotes.length > 0 ? (
                          <div className="w-full h-full relative">
                            {zoneNotes.map((note) => {
                              const leftPct = (note.step / 32) * 100;
                              return (
                                <div
                                  key={note.id}
                                  className="absolute h-1.5 rounded-sm"
                                  style={{
                                    left: `${leftPct}%`,
                                    width: `${Math.max(4, note.duration * 3)}px`,
                                    top: `${((note.note.charCodeAt(0) % 7) / 7) * 20}px`,
                                    backgroundColor: layer.color,
                                    opacity: 0.8
                                  }}
                                />
                              );
                            })}
                          </div>
                        ) : (
                          <div className="h-full flex items-center justify-center text-[9px] text-studio-text-dim italic">
                            Empty Zone
                          </div>
                        )}
                      </div>

                      {/* Playhead Indicator in Active Zone */}
                      {isCurrentZone && isPlaying && (
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-red-500 shadow-[0_0_6px_#ef4444] z-10 transition-all duration-75"
                          style={{ left: `${(currentStep / 32) * 100}%` }}
                        />
                      )}

                      {/* Zone Clip Footer with Action Icons */}
                      <div className="flex justify-between items-center text-[8px] font-mono text-studio-text-dim px-0.5 z-20">
                        <span className="truncate">{zoneNotes.length > 0 ? `${zoneNotes.length} notes` : 'Empty'}</span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity">
                          {zoneNotes.length > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCopiedClip({ layerId: layer.id, notes: zoneNotes });
                                toast.success(`Copied ${layer.name} clip`);
                              }}
                              className="p-0.5 rounded hover:text-white"
                              title="Copy Clip to Clipboard"
                            >
                              <Copy size={9} />
                            </button>
                          )}
                          {copiedClip && copiedClip.notes.length > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDuplicateZoneClip(layer.id, zone.id, zone.id);
                                onUpdateLayer(layer.id, {
                                  zoneNotes: {
                                    ...layer.zoneNotes,
                                    [zone.id]: copiedClip.notes.map(n => ({
                                      ...n,
                                      id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`
                                    }))
                                  }
                                });
                                toast.success(`Pasted clip into ${zone.name}`);
                              }}
                              className="p-0.5 rounded text-indigo-400 hover:text-white"
                              title="Paste Copied Clip into this Zone"
                            >
                              <Disc size={9} />
                            </button>
                          )}
                          {zoneNotes.length > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleClearZoneClip(layer.id, zone.id);
                              }}
                              className="p-0.5 rounded hover:text-red-400"
                              title="Clear Clip"
                            >
                              <Trash2 size={9} />
                            </button>
                          )}
                        </div>
                        <span className="font-bold">{zone.name}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Track Flyout Modal / Bar */}
      {showAddMenu && (
        <div className="p-3 bg-[#0e0e16] border-t border-studio-border flex items-center justify-between animate-in slide-in-from-bottom duration-150">
          <span className="text-xs font-bold uppercase tracking-wider text-studio-text">
            Select Track Instrument Type:
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { onAddLayer('drums'); setShowAddMenu(false); }}
              className="px-3 py-1 rounded bg-rose-950/60 border border-rose-800 text-rose-200 text-xs font-bold hover:bg-rose-900"
            >
              🥁 Drums & Beats
            </button>
            <button
              type="button"
              onClick={() => { onAddLayer('monosynth'); setShowAddMenu(false); }}
              className="px-3 py-1 rounded bg-indigo-950/60 border border-indigo-800 text-indigo-200 text-xs font-bold hover:bg-indigo-900"
            >
              🎸 808 Sub Bass
            </button>
            <button
              type="button"
              onClick={() => { onAddLayer('polysynth'); setShowAddMenu(false); }}
              className="px-3 py-1 rounded bg-sky-950/60 border border-sky-800 text-sky-200 text-xs font-bold hover:bg-sky-900"
            >
              🎹 Poly Chords / Pad
            </button>
            <button
              type="button"
              onClick={() => { onAddLayer('lead'); setShowAddMenu(false); }}
              className="px-3 py-1 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-200 text-xs font-bold hover:bg-emerald-900"
            >
              🎺 Lead Synth
            </button>
            <button
              type="button"
              onClick={() => setShowAddMenu(false)}
              className="px-2 py-1 rounded border border-studio-border text-studio-text-dim text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AudioLayersManager;
