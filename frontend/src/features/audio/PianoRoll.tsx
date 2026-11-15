import React, { useState, useMemo, useRef } from 'react';
import {
  Trash2,
  Wand2,
  Music,
  ArrowUp,
  ArrowDown,
  Activity,
  CheckCircle2,
  Download,
  Upload,
  Scissors,
  Copy,
  ClipboardPaste,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  MidiNote,
  AudioTrackLayer,
  SongZone,
  CHROMATIC_NOTES,
  MUSICAL_SCALES,
  ROOT_NOTES
} from './types';

const DRUM_LANES = [
  { name: 'Crash Cymbal', pitch: 'C#3', icon: '💥' },
  { name: 'High Tom', pitch: 'A2', icon: '🪘' },
  { name: 'Mid Tom', pitch: 'G2', icon: '🪘' },
  { name: 'Open Hi-Hat', pitch: 'A#2', icon: '🔔' },
  { name: 'Closed Hi-Hat', pitch: 'F#2', icon: '🔊' },
  { name: 'Hand Clap', pitch: 'D#2', icon: '👏' },
  { name: 'Snare Drum', pitch: 'D2', icon: '💥' },
  { name: '808 Kick', pitch: 'C2', icon: '🥁' },
];

interface PianoRollProps {
  layer: AudioTrackLayer;
  zone: SongZone;
  songKey?: string;
  songScale?: string;
  currentStep?: number;
  isPlaying?: boolean;
  onNotesChange: (notes: MidiNote[]) => void;
  onAudition: (pitch: string) => void;
}

const STEPS = 32;

export const PianoRoll: React.FC<PianoRollProps> = ({
  layer,
  zone,
  songKey = 'C',
  songScale = 'Minor',
  currentStep = 0,
  isPlaying = false,
  onNotesChange,
  onAudition
}) => {
  const notes = layer.zoneNotes[zone.id] || [];
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [octaveFilter, setOctaveFilter] = useState<'all' | 'high' | 'mid' | 'low'>('all');
  const [showVelocityLane, setShowVelocityLane] = useState<boolean>(true);
  const [clipboardNotes, setClipboardNotes] = useState<MidiNote[] | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  // Compute in-scale notes for scale highlighting
  const inScaleNotes = useMemo(() => {
    const scaleIntervals = MUSICAL_SCALES[songScale] || MUSICAL_SCALES['Minor'];
    const rootIndex = ROOT_NOTES.indexOf(songKey);
    const validPitchClasses = new Set<string>();
    scaleIntervals.forEach(interval => {
      const pitchIdx = (rootIndex + interval) % 12;
      validPitchClasses.add(ROOT_NOTES[pitchIdx]);
    });
    return validPitchClasses;
  }, [songKey, songScale]);

  const isDrums = layer.instrument.type === 'drums';

  // Filter notes to display based on octave filter or drum kit
  const displayedNotes = useMemo(() => {
    if (isDrums) return DRUM_LANES.map(d => d.pitch);
    if (octaveFilter === 'high') return CHROMATIC_NOTES.slice(0, 13); // C5 to C4
    if (octaveFilter === 'mid') return CHROMATIC_NOTES.slice(12, 25); // C4 to C3
    if (octaveFilter === 'low') return CHROMATIC_NOTES.slice(24, 37); // C3 to C2
    return CHROMATIC_NOTES.slice(12, 37); // Default 2 octaves
  }, [octaveFilter, isDrums]);

  const isBlackKey = (note: string) => note.includes('#');

  const getPitchClass = (noteStr: string) => noteStr.replace(/[0-9]/g, '');

  const isInScale = (noteStr: string) => {
    const pc = getPitchClass(noteStr);
    return inScaleNotes.has(pc);
  };

  // Toggle or add note on grid
  const handleCellClick = (note: string, stepIndex: number) => {
    const existingIndex = notes.findIndex(n => n.note === note && n.step === stepIndex);
    if (existingIndex !== -1) {
      // Remove note
      const next = notes.filter((_, i) => i !== existingIndex);
      onNotesChange(next);
      setSelectedNoteId(null);
    } else {
      // Add note
      const newNote: MidiNote = {
        id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        note,
        step: stepIndex,
        duration: 1,
        velocity: 0.8
      };
      onNotesChange([...notes, newNote]);
      setSelectedNoteId(newNote.id);
      onAudition(note);
    }
  };

  // Note modifications: Transpose
  const handleTranspose = (semitones: number) => {
    if (notes.length === 0) return;
    const next = notes.map(n => {
      const idx = CHROMATIC_NOTES.indexOf(n.note);
      if (idx === -1) return n;
      const targetIdx = Math.max(0, Math.min(CHROMATIC_NOTES.length - 1, idx - semitones));
      return { ...n, note: CHROMATIC_NOTES[targetIdx] };
    });
    onNotesChange(next);
    toast.success(`Transposed ${semitones > 0 ? `+${semitones}` : semitones} semitones`);
    if (next.length > 0) onAudition(next[0].note);
  };

  // Note modifications: Scale Quantize
  const handleScaleQuantize = () => {
    if (notes.length === 0) return;
    let modifiedCount = 0;
    const next = notes.map(n => {
      if (isInScale(n.note)) return n;
      // Find nearest in-scale note
      const currentIdx = CHROMATIC_NOTES.indexOf(n.note);
      for (let offset = 1; offset <= 3; offset++) {
        if (currentIdx - offset >= 0 && isInScale(CHROMATIC_NOTES[currentIdx - offset])) {
          modifiedCount++;
          return { ...n, note: CHROMATIC_NOTES[currentIdx - offset] };
        }
        if (currentIdx + offset < CHROMATIC_NOTES.length && isInScale(CHROMATIC_NOTES[currentIdx + offset])) {
          modifiedCount++;
          return { ...n, note: CHROMATIC_NOTES[currentIdx + offset] };
        }
      }
      return n;
    });
    onNotesChange(next);
    toast.success(`Quantized ${modifiedCount} off-key notes to ${songKey} ${songScale}`);
  };

  // Note modifications: Humanize Velocity
  const handleHumanize = () => {
    if (notes.length === 0) return;
    const next = notes.map(n => {
      const delta = (Math.random() - 0.5) * 0.25;
      const vel = Math.max(0.3, Math.min(1.0, (n.velocity || 0.8) + delta));
      return { ...n, velocity: Number(vel.toFixed(2)) };
    });
    onNotesChange(next);
    toast.success('Humanized note velocities for organic groove');
  };

  // Preset Generator
  const handleGeneratePreset = () => {
    const presetNotes: MidiNote[] = [];
    const root = songKey;
    const isDrums = layer.instrument.type === 'drums';
    const isBass = layer.instrument.type === 'monosynth';

    if (isDrums) {
      // 4-on-the-floor beat
      for (let s = 0; s < 32; s += 4) {
        presetNotes.push({ id: `kick-${s}`, note: 'C2', step: s, duration: 1, velocity: 0.95 });
        if (s % 8 === 4) {
          presetNotes.push({ id: `snare-${s}`, note: 'D2', step: s, duration: 1, velocity: 0.85 });
        }
      }
      for (let s = 2; s < 32; s += 4) {
        presetNotes.push({ id: `hat-${s}`, note: 'F#2', step: s, duration: 1, velocity: 0.7 });
      }
    } else if (isBass) {
      // Syncopated root-note bassline
      const bassSteps = [0, 3, 6, 10, 12, 16, 19, 22, 26, 28];
      bassSteps.forEach(s => {
        presetNotes.push({ id: `bass-${s}`, note: `${root}2`, step: s, duration: 2, velocity: 0.9 });
      });
    } else {
      // Melodic arpeggio in key
      const rootIndex = ROOT_NOTES.indexOf(root);
      const scaleIntervals = MUSICAL_SCALES[songScale] || MUSICAL_SCALES.Minor;
      const scaleDegrees = [0, 2, 4, 6, 4, 2, 1, 0];
      for (let i = 0; i < scaleDegrees.length; i++) {
        const step = i * 4;
        const degree = scaleDegrees[i];
        const interval = scaleIntervals[degree % scaleIntervals.length];
        const semitone = rootIndex + interval;
        const octave = 3 + Math.floor(semitone / 12) + Math.floor(degree / scaleIntervals.length);
        const targetNote = `${ROOT_NOTES[semitone % 12]}${octave}`;
        presetNotes.push({ id: `lead-${i}`, note: targetNote, step, duration: 2, velocity: 0.85 });
      }
    }
    onNotesChange(presetNotes);
    toast.success(`Generated ${layer.instrument.type} pattern in ${songKey} ${songScale}`);
  };

  const handleExportPattern = () => {
    const data = JSON.stringify({ layer: layer.name, zone: zone.name, notes }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${layer.name.toLowerCase().replace(/\s+/g, '-')}-${zone.name.toLowerCase()}-pattern.json`;
    a.click();
    toast.success('Pattern exported to disk');
  };

  const handleImportPattern = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target?.result as string);
        if (Array.isArray(parsed.notes)) {
          onNotesChange(parsed.notes as MidiNote[]);
          toast.success(`Imported ${parsed.notes.length} notes from ${file.name}`);
        } else {
          toast.error('Invalid pattern file: missing notes array');
        }
      } catch {
        toast.error('Failed to parse pattern JSON');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Cut Note (delete + store in clipboard)
  const handleCutNote = () => {
    if (!selectedNoteId) return;
    const note = notes.find(n => n.id === selectedNoteId);
    if (!note) return;
    setClipboardNotes([{ ...note }]);
    onNotesChange(notes.filter(n => n.id !== selectedNoteId));
    setSelectedNoteId(null);
    toast.success(`Cut note ${note.note}`);
  };

  // Copy Note to clipboard
  const handleCopyNote = () => {
    if (!selectedNoteId) return;
    const note = notes.find(n => n.id === selectedNoteId);
    if (!note) return;
    setClipboardNotes([{ ...note }]);
    toast.success(`Copied note ${note.note}`);
  };

  // Paste Note at current or offset step
  const handlePasteNote = () => {
    if (!clipboardNotes || clipboardNotes.length === 0) {
      toast.error('Clipboard is empty');
      return;
    }
    const noteToPaste = clipboardNotes[0];
    const newStep = Math.min(31, noteToPaste.step + 1);
    const newNote: MidiNote = {
      ...noteToPaste,
      id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      step: newStep
    };
    onNotesChange([...notes, newNote]);
    setSelectedNoteId(newNote.id);
    onAudition(newNote.note);
    toast.success(`Pasted note ${newNote.note} at step ${newStep + 1}`);
  };

  // Split / Snip note into two equal halves
  const handleSplitNote = () => {
    if (!selectedNoteId) return;
    const note = notes.find(n => n.id === selectedNoteId);
    if (!note || (note.duration || 1) <= 1) {
      toast.error('Note duration is 1 step; cannot be split further');
      return;
    }
    const halfDur = Math.max(1, Math.floor((note.duration || 2) / 2));
    const firstHalf: MidiNote = { ...note, duration: halfDur };
    const secondHalf: MidiNote = {
      ...note,
      id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      step: Math.min(31, note.step + halfDur),
      duration: Math.max(1, (note.duration || 2) - halfDur)
    };
    const next = notes.map(n => n.id === note.id ? firstHalf : n).concat(secondHalf);
    onNotesChange(next);
    setSelectedNoteId(secondHalf.id);
    toast.success(`Snipped note ${note.note} into two parts`);
  };

  // Move note left/right by steps
  const handleNudgeNote = (deltaSteps: number) => {
    if (!selectedNoteId) return;
    const next = notes.map(n => {
      if (n.id === selectedNoteId) {
        const nextStep = Math.max(0, Math.min(31, n.step + deltaSteps));
        return { ...n, step: nextStep };
      }
      return n;
    });
    onNotesChange(next);
  };

  const selectedNote = notes.find(n => n.id === selectedNoteId);

  return (
    <div className="flex flex-col h-full bg-[#06060a] text-studio-text overflow-hidden select-none">
      {/* Hidden file input for pattern import */}
      <input
        ref={importRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleImportPattern}
      />
      {/* Top Piano Roll Toolbar */}
      <div className="h-9 bg-studio-panel border-b border-studio-border px-3 flex items-center justify-between">
        {/* Left: Active info & Octave filter */}
        <div className="flex items-center gap-2">
          <Music size={13} className="text-studio-accent" />
          <span className="text-xs font-bold uppercase tracking-wider text-studio-text">
            Piano Roll: <span style={{ color: layer.color }}>{layer.name}</span>
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/40 border border-studio-border text-studio-text-dim">
            Zone: <strong className="text-white">{zone.name}</strong> • Key: <strong className="text-studio-accent">{songKey} {songScale}</strong>
          </span>

          <div className="flex bg-black/50 border border-studio-border rounded p-0.5 ml-2">
            {(['all', 'high', 'mid', 'low'] as const).map(oct => (
              <button
                key={oct}
                type="button"
                onClick={() => setOctaveFilter(oct)}
                className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase transition-all ${
                  octaveFilter === oct
                    ? 'bg-studio-accent text-white shadow-sm'
                    : 'text-studio-text-dim hover:text-white'
                }`}
              >
                {oct}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Musical Operations (Transpose, Quantize, Humanize, Presets) */}
        <div className="flex items-center gap-1.5">
          {/* Transpose */}
          <div className="flex items-center bg-black/40 border border-studio-border rounded px-1">
            <span className="text-[9px] text-studio-text-dim uppercase font-bold mr-1">Pitch:</span>
            <button
              type="button"
              onClick={() => handleTranspose(-1)}
              className="p-1 hover:text-white"
              title="Transpose -1 Semitone"
            >
              <ArrowDown size={11} />
            </button>
            <button
              type="button"
              onClick={() => handleTranspose(1)}
              className="p-1 hover:text-white"
              title="Transpose +1 Semitone"
            >
              <ArrowUp size={11} />
            </button>
            <button
              type="button"
              onClick={() => handleTranspose(12)}
              className="text-[9px] font-bold px-1 hover:text-white"
              title="Transpose +1 Octave"
            >
              +8va
            </button>
          </div>

          {/* Scale Quantize */}
          <button
            type="button"
            onClick={handleScaleQuantize}
            className="flex items-center gap-1 px-2 py-1 rounded bg-black/40 border border-studio-border text-studio-text-dim hover:text-white hover:border-studio-accent text-[9px] font-bold"
            title="Snap off-key notes to current key and scale"
          >
            <CheckCircle2 size={11} className="text-emerald-400" />
            <span>Snap Scale</span>
          </button>

          {/* Humanize */}
          <button
            type="button"
            onClick={handleHumanize}
            className="flex items-center gap-1 px-2 py-1 rounded bg-black/40 border border-studio-border text-studio-text-dim hover:text-white hover:border-studio-accent text-[9px] font-bold"
            title="Randomize note velocities for natural groove"
          >
            <Activity size={11} className="text-amber-400" />
            <span>Humanize</span>
          </button>

          {/* Pattern Preset */}
          <button
            type="button"
            onClick={handleGeneratePreset}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-studio-accent hover:bg-studio-accent/90 text-white text-[9px] font-bold shadow-sm"
          >
            <Wand2 size={11} />
            <span>Preset</span>
          </button>

          {/* Clipboard / Paste Button */}
          {clipboardNotes && clipboardNotes.length > 0 && (
            <button
              type="button"
              onClick={handlePasteNote}
              className="flex items-center gap-1 px-2 py-1 rounded bg-indigo-950/60 border border-indigo-700 text-indigo-300 hover:text-white text-[9px] font-bold"
              title={`Paste note (${clipboardNotes[0].note})`}
            >
              <ClipboardPaste size={11} />
              <span>Paste</span>
            </button>
          )}

          {/* Export Pattern */}
          <button
            type="button"
            onClick={handleExportPattern}
            className="p-1 rounded text-studio-text-dim hover:text-white"
            title="Export Pattern to JSON"
          >
            <Download size={12} />
          </button>

          {/* Import Pattern */}
          <button
            type="button"
            onClick={() => importRef.current?.click()}
            className="p-1 rounded text-studio-text-dim hover:text-emerald-400"
            title="Import Pattern from JSON"
          >
            <Upload size={12} />
          </button>

          {/* Velocity Lane Toggle */}
          <button
            type="button"
            onClick={() => setShowVelocityLane(v => !v)}
            className={`p-1 rounded transition-all ${showVelocityLane ? 'text-studio-accent' : 'text-studio-text-dim hover:text-white'}`}
            title="Toggle Velocity Lane"
          >
            <Activity size={12} />
          </button>

          {/* Clear */}
          <button
            type="button"
            onClick={() => onNotesChange([])}
            className="p-1 text-studio-text-dim hover:text-red-400"
            title="Clear all notes in this zone"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Main Piano Roll Grid Viewport */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Piano Keyboard / Drum Kit (Audition Keys) */}
        <div className="w-24 min-w-[6rem] bg-[#0c0c12] border-r border-studio-border overflow-y-auto custom-scrollbar">
          {displayedNotes.map((note) => {
            const isBlack = isBlackKey(note);
            const inScale = isInScale(note);
            const drumLane = isDrums ? DRUM_LANES.find(d => d.pitch === note) : null;

            return (
              <button
                key={note}
                type="button"
                onClick={() => onAudition(note)}
                className={`w-full h-5 flex items-center justify-between px-1.5 text-[9px] font-mono border-b border-black/30 transition-all ${
                  isBlack
                    ? 'bg-[#181822] text-studio-text-dim hover:bg-studio-accent hover:text-white'
                    : 'bg-[#252533] text-studio-text hover:bg-studio-accent hover:text-white'
                } ${!isDrums && inScale ? 'border-l-2 border-l-studio-accent' : ''}`}
                title={`Audition ${drumLane ? drumLane.name : note}`}
              >
                {drumLane ? (
                  <span className="truncate flex items-center gap-1 text-[8px] font-bold">
                    <span>{drumLane.icon}</span>
                    <span className="truncate">{drumLane.name}</span>
                  </span>
                ) : (
                  <>
                    <span>{note}</span>
                    {inScale && <span className="w-1 h-1 rounded-full bg-studio-accent" />}
                  </>
                )}
              </button>
            );
          })}
        </div>

        {/* Right 32-Step Grid Canvas */}
        <div className="flex-1 flex flex-col overflow-x-auto overflow-y-auto custom-scrollbar bg-[#08080c] relative">
          {/* Step Timeline Header */}
          <div className="h-4 bg-black/60 border-b border-studio-border flex sticky top-0 z-20">
            {Array.from({ length: STEPS }).map((_, stepIdx) => {
              const isBarStart = stepIdx % 16 === 0;
              const isBeatStart = stepIdx % 4 === 0;
              return (
                <div
                  key={stepIdx}
                  className={`flex-1 min-w-[20px] text-[8px] font-mono flex items-center justify-center border-r ${
                    isBarStart
                      ? 'border-white/30 text-white font-bold bg-white/5'
                      : isBeatStart
                        ? 'border-white/10 text-studio-text-dim'
                        : 'border-white/5 text-transparent'
                  }`}
                >
                  {isBeatStart ? `${Math.floor(stepIdx / 4) + 1}` : ''}
                </div>
              );
            })}
          </div>

          {/* Grid Rows for each pitch */}
          {displayedNotes.map((note) => {
            const inScale = isInScale(note);
            const isBlack = isBlackKey(note);

            return (
              <div
                key={note}
                className={`flex h-5 border-b relative ${
                  isBlack ? 'bg-black/50 border-white/[0.03]' : 'bg-black/20 border-white/[0.04]'
                } ${inScale ? '' : 'opacity-60'}`}
              >
                {Array.from({ length: STEPS }).map((_, stepIdx) => {
                  const isBeat = stepIdx % 4 === 0;
                  const activeNote = notes.find(n => n.note === note && n.step === stepIdx);
                  const isSelected = activeNote && activeNote.id === selectedNoteId;

                  return (
                    <div
                      key={stepIdx}
                      onClick={() => handleCellClick(note, stepIdx)}
                      className={`flex-1 min-w-[20px] border-r cursor-pointer transition-colors relative ${
                        isBeat ? 'border-white/10' : 'border-white/[0.03]'
                      } hover:bg-studio-accent/20`}
                    >
                      {activeNote && (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedNoteId(activeNote.id);
                            onAudition(activeNote.note);
                          }}
                          className={`absolute top-0.5 bottom-0.5 left-0.5 rounded-sm shadow-md flex items-center justify-between px-1 text-[7px] font-bold text-white transition-all z-10 cursor-pointer ${
                            isSelected ? 'ring-2 ring-white scale-95 shadow-[0_0_8px_rgba(255,255,255,0.5)]' : ''
                          }`}
                          style={{
                            width: `calc(${Math.min(32 - stepIdx, (activeNote.duration || 1)) * 100}% - 2px)`,
                            backgroundColor: layer.color,
                            opacity: activeNote.velocity ? Math.max(0.4, activeNote.velocity) : 0.8
                          }}
                        >
                          <span>{activeNote.velocity && Math.round(activeNote.velocity * 100)}</span>
                          {activeNote.duration > 1 && (
                            <span className="text-[6px] font-mono opacity-80">{activeNote.duration}x</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Playhead Tracking Line */}
          {isPlaying && (
            <div
              className="absolute top-4 bottom-0 w-0.5 bg-red-500 shadow-[0_0_8px_#ef4444] z-30 pointer-events-none transition-all duration-75"
              style={{ left: `${(currentStep / STEPS) * 100}%` }}
            />
          )}
        </div>
      </div>

      {/* Velocity Lane — bar chart of per-step note velocities */}
      {showVelocityLane && (
        <div className="h-16 bg-[#06060a] border-t border-studio-border/60 flex shrink-0">
          {/* Spacer matching piano key column width */}
          <div className="w-24 min-w-[6rem] bg-[#0a0a10] border-r border-studio-border/50 flex items-center justify-center">
            <span className="text-[8px] font-bold uppercase tracking-wider text-studio-text-dim rotate-[-90deg] whitespace-nowrap">
              Velocity
            </span>
          </div>
          {/* Velocity bars for each step */}
          <div className="flex-1 flex overflow-x-auto custom-scrollbar relative bg-black/40">
            <div className="flex h-full items-end" style={{ minWidth: `${STEPS * 20}px` }}>
              {Array.from({ length: STEPS }).map((_, stepIdx) => {
                const isBeat = stepIdx % 4 === 0;
                const isBarStart = stepIdx % 16 === 0;
                // Find notes that start on this step
                const stepNotes = notes.filter(n => n.step === stepIdx);
                const maxVel = stepNotes.reduce((mx, n) => Math.max(mx, n.velocity || 0), 0);
                const isSelected = stepNotes.some(n => n.id === selectedNoteId);

                return (
                  <div
                    key={stepIdx}
                    className={`flex-1 min-w-[20px] h-full flex flex-col items-center justify-end px-px border-r ${
                      isBarStart ? 'border-white/15' : isBeat ? 'border-white/8' : 'border-white/[0.03]'
                    } relative group cursor-pointer`}
                    onClick={() => {
                      const firstNote = stepNotes[0];
                      if (firstNote) setSelectedNoteId(firstNote.id);
                    }}
                    title={stepNotes.length > 0 ? `Step ${stepIdx + 1}: ${stepNotes.length} note(s), vel ${Math.round(maxVel * 100)}%` : `Step ${stepIdx + 1}: empty`}
                  >
                    {maxVel > 0 && (
                      <div
                        className={`w-full rounded-t-sm transition-all ${
                          isSelected ? 'opacity-100' : 'opacity-70 group-hover:opacity-90'
                        }`}
                        style={{
                          height: `${maxVel * 100}%`,
                          backgroundColor: isSelected ? '#fff' : layer.color,
                          minHeight: 2
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            {/* Playhead in velocity lane */}
            {isPlaying && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-red-500/70 z-10 pointer-events-none"
                style={{ left: `${(currentStep / STEPS) * 100}%` }}
              />
            )}
          </div>
        </div>
      )}

      {/* Bottom Selected Note Detail Toolbar */}
      {selectedNote && (
        <div className="h-7 bg-studio-panel-darker border-t border-studio-border px-3 flex items-center justify-between text-xs animate-in slide-in-from-bottom duration-150">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-studio-accent">
              Selected Note: <strong>{selectedNote.note}</strong> (Step {selectedNote.step + 1})
            </span>
            <div className="flex items-center gap-1 text-[10px]">
              <span className="text-studio-text-dim">Velocity:</span>
              <input
                type="range"
                min="0.2"
                max="1.0"
                step="0.05"
                value={selectedNote.velocity}
                onChange={e => {
                  const vel = Number(e.target.value);
                  const next = notes.map(n => n.id === selectedNote.id ? { ...n, velocity: vel } : n);
                  onNotesChange(next);
                }}
                className="w-20 accent-studio-accent h-1.5 bg-black/60 rounded"
              />
              <span className="font-mono text-studio-text w-8 text-right">
                {Math.round(selectedNote.velocity * 100)}%
              </span>
            </div>

            {/* Note Duration Selector */}
            <div className="flex items-center gap-1 text-[10px] ml-2">
              <span className="text-studio-text-dim">Length:</span>
              {[1, 2, 4, 8, 16].map(dur => (
                <button
                  key={dur}
                  type="button"
                  onClick={() => {
                    const next = notes.map(n => n.id === selectedNote.id ? { ...n, duration: dur } : n);
                    onNotesChange(next);
                  }}
                  className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold transition-all ${
                    (selectedNote.duration || 1) === dur
                      ? 'bg-studio-accent text-white'
                      : 'bg-black/50 text-studio-text-dim hover:text-white'
                  }`}
                >
                  {dur === 1 ? '1/16' : dur === 2 ? '1/8' : dur === 4 ? '1/4' : dur === 8 ? '1/2' : '1 Bar'}
                </button>
              ))}
            </div>
          </div>

          {/* Nudge, Split, Cut, Copy, Delete Toolbar Controls */}
          <div className="flex items-center gap-1.5 ml-2">
            {/* Nudge Left/Right */}
            <div className="flex items-center bg-black/50 border border-studio-border rounded px-1">
              <span className="text-[8px] text-studio-text-dim uppercase font-bold mr-1">Move:</span>
              <button
                type="button"
                onClick={() => handleNudgeNote(-1)}
                className="p-1 hover:text-white"
                title="Nudge Note Left 1 Step"
              >
                <ChevronLeft size={11} />
              </button>
              <button
                type="button"
                onClick={() => handleNudgeNote(1)}
                className="p-1 hover:text-white"
                title="Nudge Note Right 1 Step"
              >
                <ChevronRight size={11} />
              </button>
            </div>

            {/* Split / Snip */}
            <button
              type="button"
              onClick={handleSplitNote}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/40 border border-studio-border text-studio-text-dim hover:text-amber-300 text-[9px] font-bold"
              title="Snip / Split note into two shorter segments"
            >
              <Scissors size={10} />
              <span>Snip</span>
            </button>

            {/* Copy */}
            <button
              type="button"
              onClick={handleCopyNote}
              className="p-1 rounded text-studio-text-dim hover:text-white"
              title="Copy Note"
            >
              <Copy size={11} />
            </button>

            {/* Cut */}
            <button
              type="button"
              onClick={handleCutNote}
              className="p-1 rounded text-studio-text-dim hover:text-amber-400"
              title="Cut Note"
            >
              <Scissors size={11} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              const next = notes.filter(n => n.id !== selectedNote.id);
              onNotesChange(next);
              setSelectedNoteId(null);
            }}
            className="text-[9px] text-red-400 hover:text-red-300 font-bold"
          >
            Delete Note
          </button>
        </div>
      )}
    </div>
  );
};

export default PianoRoll;
