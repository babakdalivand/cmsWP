'use client';
import { useEffect, useRef, useCallback, useState } from 'react';
import { useHistoryStore } from '@/store/history';
import type { Video } from '@/types';
import { formatDuration, cn } from '@/lib/utils';

interface Props {
  video: Video;
  startTime?: number;
  autoPlay?: boolean;
}

declare global {
  interface Window {
    YT: {
      Player: new (el: string | HTMLElement, opts: object) => YTPlayer;
      PlayerState: { PLAYING: number; PAUSED: number; ENDED: number; BUFFERING: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayer {
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (secs: number, allow: boolean) => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  setVolume: (v: number) => void;
  getVolume: () => number;
  destroy: () => void;
}

export function VideoPlayer({ video, startTime = 0, autoPlay = false }: Props) {
  const playerDivId = `yt-player-${video.ytId}`;
  const playerRef  = useRef<YTPlayer | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveProgress = useHistoryStore((s) => s.saveProgress);

  const [ready,    setReady]    = useState(false);
  const [playing,  setPlaying]  = useState(autoPlay);
  const [muted,    setMuted]    = useState(false);
  const [duration, setDuration] = useState(video.duration);
  const [current,  setCurrent]  = useState(startTime);
  const [volume,   setVolume]   = useState(80);
  const [showCtrl, setShowCtrl] = useState(true);
  const ctrlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Load YT IFrame API ──────────────────────────────────────────── */
  useEffect(() => {
    const initPlayer = () => {
      playerRef.current = new window.YT.Player(playerDivId, {
        videoId: video.ytId,
        playerVars: {
          autoplay:        autoPlay ? 1 : 0,
          start:           startTime || 0,
          controls:        0,
          modestbranding:  1,
          rel:             0,
          disablekb:       1,
          iv_load_policy:  3,
        },
        events: {
          onReady: (e: { target: YTPlayer }) => {
            setReady(true);
            setDuration(e.target.getDuration() || video.duration);
            e.target.setVolume(volume);
          },
          onStateChange: (e: { data: number }) => {
            const State = window.YT.PlayerState;
            setPlaying(e.data === State.PLAYING);
          },
        },
      });
    };

    if (window.YT?.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
      if (!document.querySelector('#yt-api-script')) {
        const s = document.createElement('script');
        s.id  = 'yt-api-script';
        s.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(s);
      }
    }

    return () => {
      playerRef.current?.destroy();
      if (progressRef.current) clearInterval(progressRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.ytId]);

  /* ── Progress tracking + save ────────────────────────────────────── */
  useEffect(() => {
    if (progressRef.current) clearInterval(progressRef.current);
    progressRef.current = setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      const cur = p.getCurrentTime();
      const dur = p.getDuration() || duration;
      setCurrent(cur);
      if (dur > 0) {
        saveProgress({
          ytId:      video.ytId,
          postId:    video.id,
          title:     video.title,
          thumbnail: video.thumbnail,
          progress:  cur / dur,
          duration:  dur,
        });
      }
    }, 5_000);
    return () => { if (progressRef.current) clearInterval(progressRef.current); };
  }, [duration, saveProgress, video]);

  /* ── Auto-hide controls ──────────────────────────────────────────── */
  const resetCtrlTimer = useCallback(() => {
    setShowCtrl(true);
    if (ctrlTimer.current) clearTimeout(ctrlTimer.current);
    ctrlTimer.current = setTimeout(() => setShowCtrl(false), 3000);
  }, []);

  /* ── Controls ────────────────────────────────────────────────────── */
  const togglePlay = () => {
    playing ? playerRef.current?.pauseVideo() : playerRef.current?.playVideo();
  };
  const toggleMute = () => {
    const p = playerRef.current;
    if (!p) return;
    p.isMuted() ? p.unMute() : p.mute();
    setMuted((m) => !m);
  };
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    // RTL: invert x
    const frac = 1 - (e.clientX - rect.left) / rect.width;
    playerRef.current?.seekTo(frac * duration, true);
    setCurrent(frac * duration);
  };
  const changeVolume = (v: number) => {
    playerRef.current?.setVolume(v);
    setVolume(v);
  };

  const pct = duration > 0 ? (current / duration) * 100 : 0;

  /* ── Keyboard shortcuts ──────────────────────────────────────────── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      switch (e.key) {
        case ' ':    e.preventDefault(); togglePlay(); break;
        case 'ArrowRight': playerRef.current?.seekTo(current - 10, true); break;
        case 'ArrowLeft':  playerRef.current?.seekTo(current + 10, true); break;
        case 'm':    toggleMute(); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  return (
    <div
      className="player-wrapper select-none"
      onMouseMove={resetCtrlTimer}
      onMouseLeave={() => setShowCtrl(false)}
    >
      {/* YouTube player target */}
      <div id={playerDivId} className="absolute inset-0 w-full h-full" />

      {/* Loading overlay */}
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
          <div className="w-12 h-12 border-2 border-brand-light border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Controls overlay */}
      <div
        className={cn(
          'absolute inset-0 z-20 flex flex-col justify-end transition-opacity duration-300',
          showCtrl ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={togglePlay}
      >
        {/* Gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

        {/* Bottom bar */}
        <div className="relative p-3 space-y-2" onClick={(e) => e.stopPropagation()}>

          {/* Progress bar */}
          <div
            className="relative h-1.5 bg-white/20 rounded-full cursor-pointer group/prog"
            onClick={seek}
          >
            <div className="absolute inset-y-0 right-0 bg-brand-light rounded-full transition-all"
              style={{ width: `${pct}%` }} />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-brand-light border-2 border-white opacity-0 group-hover/prog:opacity-100 transition-opacity"
              style={{ right: `${pct}%`, transform: 'translateY(-50%) translateX(50%)' }}
            />
          </div>

          {/* Buttons row */}
          <div className="flex items-center gap-3">
            {/* Play/Pause */}
            <button onClick={togglePlay} className="text-white hover:text-brand-light transition-colors" aria-label={playing ? 'مکث' : 'پخش'}>
              {playing ? (
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              ) : (
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* Skip ±10s */}
            <button onClick={() => playerRef.current?.seekTo(current + 10, true)} className="text-white hover:text-brand-light transition-colors text-xs font-bold ltr" aria-label="10 ثانیه جلو">
              +10
            </button>
            <button onClick={() => playerRef.current?.seekTo(current - 10, true)} className="text-white hover:text-brand-light transition-colors text-xs font-bold ltr" aria-label="10 ثانیه عقب">
              -10
            </button>

            {/* Volume */}
            <button onClick={toggleMute} className="text-white hover:text-brand-light transition-colors" aria-label={muted ? 'صدا' : 'بی‌صدا'}>
              {muted || volume === 0 ? '🔇' : volume < 50 ? '🔉' : '🔊'}
            </button>
            <input
              type="range" min={0} max={100} value={muted ? 0 : volume}
              onChange={(e) => changeVolume(+e.target.value)}
              className="w-16 h-1 accent-brand-light hidden sm:block"
              aria-label="حجم صدا"
            />

            {/* Time */}
            <span className="text-white/70 text-xs font-mono ltr ml-1">
              {formatDuration(Math.floor(current))} / {formatDuration(Math.floor(duration))}
            </span>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Fullscreen */}
            <button
              onClick={() => {
                const el = document.querySelector('.player-wrapper') as HTMLElement;
                el?.requestFullscreen?.();
              }}
              className="text-white hover:text-brand-light transition-colors"
              aria-label="تمام‌صفحه"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
