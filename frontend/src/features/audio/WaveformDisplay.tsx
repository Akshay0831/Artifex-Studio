import React, { useRef, useEffect, useState } from 'react';
import { ZoomIn, ZoomOut, Volume2 } from 'lucide-react';

interface WaveformDisplayProps {
  currentStep: number;
  isPlaying: boolean;
  totalSteps?: number;
  channelNames?: string[];
  channelColors?: string[];
  activeChannel?: number;
  onSeekStep?: (step: number) => void;
  audioBuffer?: AudioBuffer | null;
}

export const WaveformDisplay: React.FC<WaveformDisplayProps> = ({
  currentStep,
  isPlaying,
  totalSteps = 32,
  channelNames = ['Bass Synth', 'Lead Melody', 'Percussion', 'Atmosphere'],
  channelColors,
  activeChannel = 0,
  onSeekStep,
  audioBuffer
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [zoom, setZoom] = useState<number>(1);

  // Render canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Background
    ctx.fillStyle = '#08080a';
    ctx.fillRect(0, 0, width, height);

    // Draw Grid Lines (Bars and Beats)
    const stepWidth = width / totalSteps;
    for (let i = 0; i <= totalSteps; i++) {
      const x = i * stepWidth;
      const isBar = i % 16 === 0;
      const isBeat = i % 4 === 0;

      ctx.beginPath();
      ctx.strokeStyle = isBar ? 'rgba(255,255,255,0.2)' : isBeat ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)';
      ctx.lineWidth = isBar ? 1.5 : 1;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      // Top timeline tick labels
      if (isBeat) {
        const barNumber = Math.floor(i / 16) + 1;
        const beatNumber = (Math.floor(i / 4) % 4) + 1;
        ctx.fillStyle = isBar ? '#e2e8f0' : '#64748b';
        ctx.font = '9px monospace';
        ctx.fillText(`${barNumber}.${beatNumber}`, x + 4, 12);
      }
    }

    // Top Ruler Background
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, width, 16);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.moveTo(0, 16);
    ctx.lineTo(width, 16);
    ctx.stroke();

    // Render Waveform Tracks
    const trackHeight = (height - 18) / channelNames.length;
    channelNames.forEach((name, chIdx) => {
      const trackTop = 18 + chIdx * trackHeight;
      const trackCenter = trackTop + trackHeight / 2;

      // Track separator line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, trackTop + trackHeight);
      ctx.lineTo(width, trackTop + trackHeight);
      ctx.stroke();

      // Track label
      const defaultColors = ['#6366f1', '#38bdf8', '#ec4899', '#10b981', '#f59e0b', '#a855f7'];
      const labelColor = (channelColors && channelColors[chIdx]) || defaultColors[chIdx % defaultColors.length];
      ctx.fillStyle = chIdx === activeChannel ? labelColor : '#64748b';
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText(name.toUpperCase(), 8, trackTop + 14);

      const peaks = new Float32Array(width);
      if (audioBuffer && chIdx === activeChannel) {
        const channelData = audioBuffer.getChannelData(0);
        const samplesPerPixel = Math.floor(channelData.length / width);
        for (let x = 0; x < width; x++) {
          let max = 0;
          const start = x * samplesPerPixel;
          const end = Math.min(start + samplesPerPixel, channelData.length);
          for (let s = start; s < end; s++) {
            const val = Math.abs(channelData[s]);
            if (val > max) max = val;
          }
          peaks[x] = max;
        }
      }

      // Draw Waveform
      const trackColor = (channelColors && channelColors[chIdx]) || defaultColors[chIdx % defaultColors.length];
      ctx.fillStyle = trackColor;
      ctx.strokeStyle = trackColor;
      ctx.lineWidth = 1;

      for (let x = 0; x < width; x++) {
        const amp = Math.abs(peaks[x]);
        const barH = Math.max(2, amp * (trackHeight * 0.4));
        ctx.fillRect(x, trackCenter - barH / 2, 1, barH);
      }

      // Center reference zero-axis line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.beginPath();
      ctx.moveTo(0, trackCenter);
      ctx.lineTo(width, trackCenter);
      ctx.stroke();
    });

    // Playhead Line
    const playheadX = (currentStep / totalSteps) * width;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();

    // Playhead Top Marker
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(playheadX - 5, 0);
    ctx.lineTo(playheadX + 5, 0);
    ctx.lineTo(playheadX, 10);
    ctx.closePath();
    ctx.fill();

  }, [currentStep, totalSteps, channelNames, channelColors, activeChannel, zoom, audioBuffer]);

  // Handle Timeline Scrubbing
  const handleTimelineClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    const targetStep = Math.floor(ratio * totalSteps);
    if (onSeekStep) {
      onSeekStep(targetStep);
    }
  };

  return (
    <div className="flex flex-col h-full bg-studio-panel border border-studio-border rounded-lg overflow-hidden shadow-lg">
      {/* Top Toolbar */}
      <div className="h-8 bg-studio-header border-b border-studio-border flex items-center justify-between px-3">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold tracking-wider uppercase text-studio-accent font-mono flex items-center gap-1.5">
            <Volume2 size={12} />
            MIDI TIMELINE & AUDIO WAVEFORM
          </span>
          <span className={`text-[9px] font-mono ${isPlaying ? 'text-emerald-400' : 'text-studio-text-dim'}`} aria-live="polite">
            {isPlaying ? 'PLAYING' : 'STOPPED'}
          </span>
          <span className="text-[9px] font-mono text-studio-text-dim">
            32 STEPS • 2 BARS (4/4) • 16TH NOTES
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
            className="p-1 rounded bg-black/40 border border-studio-border text-studio-text-dim hover:text-white"
            title="Zoom Out"
          >
            <ZoomOut size={12} />
          </button>
          <span className="text-[9px] font-mono text-studio-text-dim w-10 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom(z => Math.min(3, z + 0.25))}
            className="p-1 rounded bg-black/40 border border-studio-border text-studio-text-dim hover:text-white"
            title="Zoom In"
          >
            <ZoomIn size={12} />
          </button>
        </div>
      </div>

      {/* Waveform Canvas Area */}
      <div className="flex-1 relative overflow-x-auto custom-scrollbar bg-black/80">
        <canvas
          ref={canvasRef}
          width={800 * zoom}
          height={200}
          onClick={handleTimelineClick}
          className="cursor-crosshair w-full h-full block"
        />
        {!audioBuffer && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 px-4 text-center text-xs text-studio-text-dim">
            Waveform preview unavailable: this MIDI pattern has not been rendered to audio.
          </div>
        )}
      </div>
    </div>
  );
};

export default WaveformDisplay;
