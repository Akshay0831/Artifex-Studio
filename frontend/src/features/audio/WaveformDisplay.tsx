import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ZoomIn, ZoomOut, Play, Pause, Scissors, Volume2 } from 'lucide-react';
import * as Tone from 'tone';

interface WaveformDisplayProps {
  currentStep: number;
  isPlaying: boolean;
  totalSteps?: number;
  channelNames?: string[];
  activeChannel?: number;
  onSeekStep?: (step: number) => void;
  audioBuffer?: AudioBuffer | null;
}

export const WaveformDisplay: React.FC<WaveformDisplayProps> = ({
  currentStep,
  isPlaying,
  totalSteps = 32,
  channelNames = ['Bass Synth', 'Lead Melody', 'Percussion', 'Atmosphere'],
  activeChannel = 0,
  onSeekStep,
  audioBuffer
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [selectedRegion, setSelectedRegion] = useState<{ start: number; end: number } | null>(null);

  // Generate synthetic waveform peaks if audioBuffer is not provided
  const generateSyntheticPeaks = useCallback((channelIdx: number, sampleCount: number) => {
    const peaks = new Float32Array(sampleCount);
    const seed = (channelIdx + 1) * 31.415;
    for (let i = 0; i < sampleCount; i++) {
      const stepIdx = Math.floor((i / sampleCount) * totalSteps);
      const isKickBeat = stepIdx % 4 === 0;
      const isSnareBeat = stepIdx % 8 === 4;
      const t = i / 10;
      let amp = Math.sin(t * (channelIdx + 1) * 0.4) * 0.4;
      if (channelIdx === 2) {
        // Percussion channel
        amp = (isKickBeat ? 0.9 : isSnareBeat ? 0.7 : 0.15) * Math.sin(t * 2);
      } else if (channelIdx === 0) {
        // Bass
        amp = 0.6 * Math.sin(t * 0.15 + seed) * (stepIdx % 2 === 0 ? 0.9 : 0.3);
      } else if (channelIdx === 1) {
        // Lead
        amp = 0.5 * Math.sin(t * 0.8) * Math.cos(t * 0.2);
      } else {
        // Atmosphere
        amp = 0.35 * Math.sin(t * 0.05 + seed);
      }
      peaks[i] = Math.max(-1, Math.min(1, amp));
    }
    return peaks;
  }, [totalSteps]);

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
      ctx.fillStyle = chIdx === activeChannel ? '#818cf8' : '#64748b';
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText(name.toUpperCase(), 8, trackTop + 14);

      // Extract or compute audio peaks
      let peaks: Float32Array;
      if (audioBuffer && chIdx === activeChannel) {
        const channelData = audioBuffer.getChannelData(0);
        const samplesPerPixel = Math.floor(channelData.length / width);
        peaks = new Float32Array(width);
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
      } else {
        peaks = generateSyntheticPeaks(chIdx, width);
      }

      // Draw Waveform
      const trackColor = chIdx === 0 ? '#6366f1' : chIdx === 1 ? '#38bdf8' : chIdx === 2 ? '#ec4899' : '#10b981';
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

    // Selected region overlay
    if (selectedRegion) {
      const startX = (selectedRegion.start / totalSteps) * width;
      const endX = (selectedRegion.end / totalSteps) * width;
      ctx.fillStyle = 'rgba(99, 102, 241, 0.18)';
      ctx.fillRect(startX, 18, endX - startX, height - 18);
      ctx.strokeStyle = '#6366f1';
      ctx.strokeRect(startX, 18, endX - startX, height - 18);
    }

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

  }, [currentStep, totalSteps, channelNames, activeChannel, zoom, selectedRegion, audioBuffer, generateSyntheticPeaks]);

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
            MULTI-TRACK AUDIO TIMELINE & WAVEFORM
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
          {selectedRegion && (
            <button
              type="button"
              onClick={() => setSelectedRegion(null)}
              className="text-[9px] px-1.5 py-0.5 rounded bg-red-950/60 text-red-300 border border-red-800"
            >
              Clear Loop
            </button>
          )}
        </div>
      </div>

      {/* Waveform Canvas Area */}
      <div ref={containerRef} className="flex-1 relative overflow-x-auto custom-scrollbar bg-black/80">
        <canvas
          ref={canvasRef}
          width={800 * zoom}
          height={200}
          onClick={handleTimelineClick}
          className="cursor-crosshair w-full h-full block"
        />
      </div>
    </div>
  );
};

export default WaveformDisplay;
