import React, { useState, useEffect } from 'react';
import * as Tone from 'tone';
import { Trash2, Wand2, Music, Volume2 } from 'lucide-react';
import { useStudioStore } from '../../core/useStudioStore';

interface PianoRollProps {
  currentStep?: number;
  isPlaying?: boolean;
}

const NOTES = ['C4', 'B3', 'A#3', 'A3', 'G#3', 'G3', 'F#3', 'F3', 'E3', 'D#3', 'D3', 'C#3', 'C3'];
const STEPS = 32;

const PianoRoll: React.FC<PianoRollProps> = ({ currentStep = 0, isPlaying = false }) => {
  const { yAudio } = useStudioStore();
  const [hoveredNote, setHoveredNote] = useState<string | null>(null);
  const [synth, setSynth] = useState<Tone.PolySynth | null>(null);

  useEffect(() => {
    const s = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.1, sustain: 0.2, release: 0.3 }
    }).toDestination();
    setSynth(s);

    return () => {
      s.dispose();
    };
  }, []);

  const isBlackKey = (note: string) => note.includes('#');

  const playAudition = (note: string) => {
    if (Tone.getContext().state !== 'running') {
      Tone.start();
    }
    synth?.triggerAttackRelease(note, '16n');
  };

  const handleCellClick = (note: string, stepIndex: number) => {
    const key = `note_${note}_${stepIndex}`;
    const current = yAudio?.get(key) || false;
    const next = !current;
    yAudio?.set(key, next);

    if (next) {
      playAudition(note);
    }
  };

  const clearAllNotes = () => {
    NOTES.forEach(note => {
      for (let i = 0; i < STEPS; i++) {
        yAudio?.delete(`note_${note}_${i}`);
      }
    });
  };

  const generatePresetPattern = () => {
    clearAllNotes();
    // Generate a simple electronic bassline / melody
    const bassline = [
      { note: 'C3', step: 0 },
      { note: 'C3', step: 2 },
      { note: 'G3', step: 4 },
      { note: 'C3', step: 6 },
      { note: 'A#3', step: 8 },
      { note: 'C3', step: 10 },
      { note: 'F3', step: 12 },
      { note: 'G3', step: 14 },
      { note: 'C4', step: 16 },
      { note: 'G3', step: 18 },
      { note: 'E3', step: 20 },
      { note: 'C3', step: 22 },
      { note: 'F3', step: 24 },
      { note: 'D3', step: 26 },
      { note: 'D#3', step: 28 },
      { note: 'G3', step: 30 }
    ];
    bassline.forEach(item => {
      yAudio?.set(`note_${item.note}_${item.step}`, true);
    });
    playAudition('C3');
  };

  return (
    <div className="flex flex-col h-full bg-[#050505] rounded-xl border border-studio-border overflow-hidden shadow-inner">
      {/* Top mini-bar */}
      <div className="h-7 bg-studio-panel border-b border-studio-border px-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Music size={12} className="text-studio-accent" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-studio-text">
            Interactive Piano Roll Sequencer
          </span>
          {isPlaying && (
            <span className="text-[9px] bg-green-500/20 text-green-400 font-mono px-1.5 py-0.2 rounded border border-green-500/30">
              PLAYING (STEP {currentStep + 1}/32)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={generatePresetPattern}
            className="flex items-center gap-1 text-[9px] font-bold text-studio-accent bg-studio-accent/10 border border-studio-accent/30 rounded px-2 py-0.5 hover:bg-studio-accent hover:text-white transition-all"
            title="Generate a 2-bar electronic pattern"
          >
            <Wand2 size={10} />
            <span>Pattern Preset</span>
          </button>
          <button
            type="button"
            onClick={clearAllNotes}
            className="flex items-center gap-1 text-[9px] font-bold text-studio-text-dim hover:text-red-400 bg-black/40 border border-studio-border rounded px-2 py-0.5 transition-colors"
            title="Clear all active notes"
          >
            <Trash2 size={10} />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Grid container */}
      <div className="flex-1 overflow-auto custom-scrollbar select-none relative">
        <div className="min-w-max relative">
          {/* Step markers background */}
          <div className="absolute inset-0 flex pointer-events-none">
            <div className="w-16" />
            {[...Array(STEPS)].map((_, i) => (
              <div 
                key={i} 
                className={`w-9 border-r border-white/${i % 4 === 3 ? '15' : '5'} ${
                  isPlaying && currentStep === i 
                    ? 'bg-studio-accent/20 border-studio-accent' 
                    : i % 16 >= 8 ? 'bg-white/[0.02]' : ''
                }`} 
              />
            ))}
          </div>

          {NOTES.map((note) => (
            <div 
              key={note} 
              className={`flex h-6 border-b border-white/5 group relative ${
                isBlackKey(note) ? 'bg-black/50' : 'bg-white/[0.01]'
              }`}
              onMouseEnter={() => setHoveredNote(note)}
              onMouseLeave={() => setHoveredNote(null)}
            >
              {/* Piano Key */}
              <div 
                onClick={() => playAudition(note)}
                className={`w-16 border-r border-studio-border flex items-center justify-between px-2 text-[9px] font-bold sticky left-0 z-20 cursor-pointer transition-colors ${
                  isBlackKey(note) ? 'bg-[#151515] text-studio-text-dim' : 'bg-[#262626] text-studio-text'
                } ${hoveredNote === note ? 'bg-studio-accent text-white' : ''}`}
                title="Click to audition note"
              >
                <span>{note}</span>
                <div className={`w-3 h-2 rounded-xs ${isBlackKey(note) ? 'bg-black border border-white/20' : 'bg-white shadow-sm'}`} />
              </div>

              {/* 32 Step triggers */}
              <div className="flex relative z-10">
                {[...Array(STEPS)].map((_, i) => {
                  const isActive = yAudio?.get(`note_${note}_${i}`) || false;
                  const isCurrent = isPlaying && currentStep === i;
                  return (
                    <button 
                      key={i} 
                      type="button"
                      onClick={() => handleCellClick(note, i)}
                      className={`w-9 border-r border-white/5 transition-all duration-75 relative group/cell ${
                        isActive 
                          ? 'bg-studio-accent shadow-[0_0_12px_rgba(99,102,241,0.6)] z-20 scale-[0.96] rounded-xs' 
                          : isCurrent 
                            ? 'bg-white/15' 
                            : 'hover:bg-white/10'
                      }`}
                    >
                      {isActive && (
                        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/40 rounded-full mx-1 mb-0.5" />
                      )}
                      {!isActive && (
                        <div className="absolute inset-0 opacity-0 group-hover/cell:opacity-100 bg-studio-accent/20 transition-opacity" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Bottom status bar */}
      <div className="h-6 bg-studio-panel border-t border-studio-border flex items-center px-3 justify-between">
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-studio-accent shadow-sm" />
            <span className="text-[8px] font-bold text-studio-text-dim uppercase">Interactive Synthesis</span>
          </div>
          <div className="text-[8px] font-mono text-studio-text-dim">
            STEPS: {STEPS} | RESOLUTION: 1/16th | BARS: 2
          </div>
        </div>
        <div className="flex gap-1.5 text-[8px] text-studio-text-dim font-mono">
          <span>Click key to test • Click cell to trigger</span>
        </div>
      </div>
    </div>
  );
};

export default PianoRoll;
