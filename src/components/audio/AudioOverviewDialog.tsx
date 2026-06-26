'use client'

import { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { loadAISettings } from '@/lib/client-settings'
import {
  Play, Pause, Square, Loader2, Headphones, RotateCcw, Volume2,
} from 'lucide-react'

interface DialogueLine {
  speaker: string
  text: string
}

interface AudioOverviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string | undefined
  projectName: string | undefined
}

export function AudioOverviewDialog({ open, onOpenChange, projectId, projectName }: AudioOverviewDialogProps) {
  const [script, setScript] = useState<DialogueLine[]>([])
  const [loading, setLoading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  const transcriptRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<(HTMLDivElement | null)[]>([])
  const isPlayingRef = useRef(false)
  const currentIndexRef = useRef(-1)

  // Keep refs in sync
  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])
  useEffect(() => { currentIndexRef.current = currentIndex }, [currentIndex])

  // Check if SpeechSynthesis is available
  const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

  // Load voices and pick two distinct ones
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  useEffect(() => {
    if (!speechSupported) return
    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices()
      setVoices(v)
    }
    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices
    return () => { window.speechSynthesis.onvoiceschanged = null }
  }, [speechSupported])

  function pickVoices(): { alex: SpeechSynthesisVoice | null; jordan: SpeechSynthesisVoice | null } {
    if (!voices.length) return { alex: null, jordan: null }
    // Prefer English voices
    const english = voices.filter((v) => v.lang.startsWith('en'))
    const pool = english.length > 0 ? english : voices

    // Try to find a male and a female voice for variety
    const maleHints = ['male', 'david', 'mark', 'daniel', 'alex', 'fred', 'george']
    const femaleHints = ['female', 'samantha', 'victoria', 'karen', 'zira', 'susan', 'catherine']

    const findByHints = (hints: string[]) =>
      pool.find((v) => hints.some((h) => v.name.toLowerCase().includes(h))) || null

    let alex = findByHints(maleHints)
    let jordan = findByHints(femaleHints)

    // Fallback: just pick two different voices
    if (!alex) alex = pool[0]
    if (!jordan) jordan = pool[1] !== pool[0] ? pool[1] : pool[0]

    return { alex, jordan }
  }

  // Generate the script when the dialog opens
  useEffect(() => {
    if (!open || !projectId) return
    let cancelled = false

    const generate = async () => {
      setLoading(true)
      setError(null)
      setScript([])
      setCurrentIndex(-1)

      try {
        const aiSettings = loadAISettings()
        const res = await fetch('/api/audio-overview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            ...(aiSettings ? { settings: aiSettings } : {}),
          }),
        })

        if (cancelled) return

        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          if (err.needsSettings) {
            setError('Add your AI API key in Settings to generate audio overviews.')
          } else if (err.needsAuth) {
            setError('Session expired. Please sign in again.')
          } else {
            throw new Error(err.error || 'Failed to generate audio overview')
          }
          return
        }

        const data = await res.json()
        if (cancelled) return
        setScript(data.script || [])
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to generate audio overview')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    generate()
    return () => { cancelled = true }
  }, [open, projectId])

  // Stop speech when dialog closes
  useEffect(() => {
    if (!open && speechSupported) {
      window.speechSynthesis.cancel()
      setIsPlaying(false)
      setCurrentIndex(-1)
    }
  }, [open, speechSupported])

  // Auto-scroll to current line
  useEffect(() => {
    if (currentIndex >= 0 && lineRefs.current[currentIndex]) {
      lineRefs.current[currentIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [currentIndex])

  // Use a ref for the recursive speakLine to avoid self-referential useCallback
  const speakLineRef = useRef<(index: number) => void>(() => {})

  useEffect(() => {
    speakLineRef.current = (index: number) => {
      if (!speechSupported || index >= script.length) {
        setIsPlaying(false)
        setCurrentIndex(-1)
        return
      }

      const line = script[index]
      const { alex, jordan } = pickVoices()
      const utterance = new SpeechSynthesisUtterance(line.text)

      // Assign voice based on speaker
      if (line.speaker === 'Jordan' && jordan) {
        utterance.voice = jordan
        utterance.pitch = 1.1
      } else if (alex) {
        utterance.voice = alex
        utterance.pitch = 0.9
      }

      utterance.rate = 1.05
      utterance.volume = 1

      utterance.onstart = () => {
        setCurrentIndex(index)
      }

      utterance.onend = () => {
        if (isPlayingRef.current && index + 1 < script.length) {
          speakLineRef.current(index + 1)
        } else {
          setIsPlaying(false)
          setCurrentIndex(-1)
        }
      }

      utterance.onerror = () => {
        setIsPlaying(false)
        setCurrentIndex(-1)
      }

      window.speechSynthesis.speak(utterance)
    }
  }, [script, speechSupported])

  const handlePlay = () => {
    if (!speechSupported || script.length === 0) return
    if (isPlaying) {
      // Pause
      window.speechSynthesis.cancel()
      setIsPlaying(false)
      setCurrentIndex(-1)
    } else {
      // Resume from current position or start from beginning
      const startIndex = currentIndex >= 0 ? currentIndex : 0
      setIsPlaying(true)
      speakLineRef.current(startIndex)
    }
  }

  const handleStop = () => {
    if (!speechSupported) return
    window.speechSynthesis.cancel()
    setIsPlaying(false)
    setCurrentIndex(-1)
  }

  const handleRestart = () => {
    if (!speechSupported) return
    window.speechSynthesis.cancel()
    setIsPlaying(true)
    setCurrentIndex(-1)
    speakLineRef.current(0)
  }

  const isHost = (speaker: string) => speaker === 'Jordan' ? 'Jordan' : 'Alex'
  const isAlex = (speaker: string) => speaker !== 'Jordan'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Headphones className="h-4 w-4 text-emerald-500" />
            Audio Overview
          </DialogTitle>
          <DialogDescription>
            AI-generated podcast about your project{projectName ? `: ${projectName}` : ''}
          </DialogDescription>
        </DialogHeader>

        {/* Error state */}
        {error && (
          <div className="py-8 text-center space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setError(null)
                if (projectId) {
                  setScript([])
                  setLoading(true)
                  fetch('/api/audio-overview', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ projectId, ...(loadAISettings() ? { settings: loadAISettings()! } : {}) }),
                  })
                    .then((r) => r.json())
                    .then((data) => {
                      if (data.script) setScript(data.script)
                      else if (data.error) setError(data.error)
                    })
                    .catch(() => setError('Failed to generate'))
                    .finally(() => setLoading(false))
                }
              }}
            >
              Try Again
            </Button>
          </div>
        )}

        {/* Loading state */}
        {loading && !error && (
          <div className="py-12 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
            <div className="text-center space-y-1">
              <p className="text-sm font-medium">Generating your podcast...</p>
              <p className="text-xs text-muted-foreground">Analyzing documents and writing a conversational script</p>
            </div>
          </div>
        )}

        {/* Script + Player */}
        {!loading && !error && script.length > 0 && (
          <div className="space-y-4">
            {/* Player controls */}
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  onClick={handlePlay}
                  disabled={!speechSupported}
                  className="h-9 w-9"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={handleStop}
                  disabled={!speechSupported || (!isPlaying && currentIndex < 0)}
                  className="h-9 w-9"
                  title="Stop"
                >
                  <Square className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={handleRestart}
                  disabled={!speechSupported}
                  className="h-9 w-9"
                  title="Restart from beginning"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-2">
                  <Volume2 className="h-3.5 w-3.5" />
                  {speechSupported
                    ? `${script.length} segments`
                    : 'Audio not supported in this browser'}
                </div>
              </div>
              {currentIndex >= 0 && (
                <Badge variant="secondary" className="text-xs">
                  {currentIndex + 1} / {script.length}
                </Badge>
              )}
            </div>

            {/* Transcript */}
            <ScrollArea className="h-[300px] rounded-lg border" ref={transcriptRef}>
              <div className="p-4 space-y-3">
                {script.map((line, i) => {
                  const isActive = i === currentIndex
                  const isPast = i < currentIndex
                  return (
                    <div
                      key={i}
                      ref={(el) => { lineRefs.current[i] = el }}
                      className={`flex gap-3 rounded-lg p-2.5 transition-colors ${
                        isActive ? 'bg-emerald-50 dark:bg-emerald-950/30' : ''
                      }`}
                    >
                      <div className="shrink-0">
                        <div
                          className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                            isAlex(line.speaker)
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                              : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
                          }`}
                        >
                          {isAlex(line.speaker) ? 'A' : 'J'}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-semibold mb-0.5 ${
                          isAlex(line.speaker)
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-blue-700 dark:text-blue-400'
                        }`}>
                          {isHost(line.speaker)}
                        </p>
                        <p className={`text-sm leading-relaxed ${
                          isActive ? 'text-foreground' : isPast ? 'text-muted-foreground' : 'text-foreground/80'
                        }`}>
                          {line.text}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>

            {!speechSupported && (
              <p className="text-xs text-muted-foreground text-center">
                Your browser doesn&apos;t support text-to-speech. You can still read the transcript above.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
