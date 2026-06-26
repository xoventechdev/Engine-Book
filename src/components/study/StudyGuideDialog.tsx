'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/hooks/use-toast'
import { loadAISettings } from '@/lib/client-settings'
import {
  Loader2, GraduationCap, Check, X, ChevronDown, ChevronUp,
  BookOpen, HelpCircle, ListChecks, FileText,
} from 'lucide-react'

interface KeyTerm { term: string; definition: string }
interface FAQItem { question: string; answer: string }
interface QuizItem {
  question: string
  options: string[]
  correctIndex: number
  explanation: string
}

interface StudyGuide {
  summary: string
  keyTerms: KeyTerm[]
  faq: FAQItem[]
  quiz: QuizItem[]
}

interface StudyGuideDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string | undefined
  projectName: string | undefined
}

export function StudyGuideDialog({ open, onOpenChange, projectId, projectName }: StudyGuideDialogProps) {
  const [guide, setGuide] = useState<StudyGuide | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedQuiz, setExpandedQuiz] = useState<number | null>(null)
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({})
  const { toast } = useToast()

  useEffect(() => {
    if (!open || !projectId) return
    let cancelled = false

    const generate = async () => {
      setLoading(true)
      setError(null)
      setGuide(null)
      setSelectedAnswers({})
      setExpandedQuiz(null)

      try {
        const aiSettings = loadAISettings()
        const res = await fetch('/api/study-guide', {
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
            setError('Add your AI API key in Settings to generate a study guide.')
          } else if (err.needsAuth) {
            setError('Session expired. Please sign in again.')
          } else {
            throw new Error(err.error || 'Failed to generate study guide')
          }
          return
        }

        const data = await res.json()
        if (cancelled) return
        setGuide(data)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to generate study guide')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    generate()
    return () => { cancelled = true }
  }, [open, projectId])

  const handleAnswerSelect = (quizIndex: number, optionIndex: number) => {
    setSelectedAnswers((prev) => ({ ...prev, [quizIndex]: optionIndex }))
  }

  const score = guide?.quiz
    ? guide.quiz.reduce((acc, q, i) => acc + (selectedAnswers[i] === q.correctIndex ? 1 : 0), 0)
    : 0

  const allAnswered = guide?.quiz && Object.keys(selectedAnswers).length === guide.quiz.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-emerald-500" />
            Study Guide
          </DialogTitle>
          <DialogDescription>
            AI-generated study guide from your project{projectName ? `: ${projectName}` : ''}
          </DialogDescription>
        </DialogHeader>

        {/* Error */}
        {error && (
          <div className="py-8 text-center space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={() => {
              setError(null)
              setGuide(null)
              if (projectId) {
                setLoading(true)
                fetch('/api/study-guide', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ projectId, ...(loadAISettings() ? { settings: loadAISettings()! } : {}) }),
                })
                  .then((r) => r.json())
                  .then((data) => { if (data.summary !== undefined) setGuide(data); else if (data.error) setError(data.error) })
                  .catch(() => setError('Failed to generate'))
                  .finally(() => setLoading(false))
              }
            }}>
              Try Again
            </Button>
          </div>
        )}

        {/* Loading */}
        {loading && !error && (
          <div className="py-12 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
            <div className="text-center space-y-1">
              <p className="text-sm font-medium">Generating study guide...</p>
              <p className="text-xs text-muted-foreground">Extracting key terms, FAQ, and quiz questions</p>
            </div>
          </div>
        )}

        {/* Study guide content */}
        {!loading && !error && guide && (
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-6 pb-4">
              {/* Summary */}
              <section className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-emerald-500" />
                  Summary
                </h3>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <p>{guide.summary}</p>
                </div>
              </section>

              {/* Key Terms */}
              {guide.keyTerms.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold flex items-center gap-1.5">
                    <BookOpen className="h-4 w-4 text-emerald-500" />
                    Key Terms
                    <Badge variant="secondary" className="text-[10px]">{guide.keyTerms.length}</Badge>
                  </h3>
                  <div className="space-y-2">
                    {guide.keyTerms.map((item, i) => (
                      <div key={i} className="rounded-lg border p-2.5">
                        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{item.term}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{item.definition}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* FAQ */}
              {guide.faq.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold flex items-center gap-1.5">
                    <HelpCircle className="h-4 w-4 text-emerald-500" />
                    Frequently Asked Questions
                    <Badge variant="secondary" className="text-[10px]">{guide.faq.length}</Badge>
                  </h3>
                  <div className="space-y-2">
                    {guide.faq.map((item, i) => (
                      <div key={i} className="rounded-lg border p-2.5">
                        <p className="text-xs font-medium">{item.question}</p>
                        <p className="text-xs text-muted-foreground mt-1">{item.answer}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Quiz */}
              {guide.quiz.length > 0 && (
                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold flex items-center gap-1.5">
                      <ListChecks className="h-4 w-4 text-emerald-500" />
                      Quiz
                      <Badge variant="secondary" className="text-[10px]">{guide.quiz.length}</Badge>
                    </h3>
                    {allAnswered && (
                      <Badge className="text-[10px] gap-1">
                        Score: {score}/{guide.quiz.length}
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-3">
                    {guide.quiz.map((q, quizIdx) => {
                      const selected = selectedAnswers[quizIdx]
                      const isAnswered = selected !== undefined
                      const isExpanded = expandedQuiz === quizIdx
                      return (
                        <div key={quizIdx} className="rounded-lg border p-3 space-y-2">
                          <p className="text-xs font-medium">
                            {quizIdx + 1}. {q.question}
                          </p>
                          <div className="space-y-1.5">
                            {q.options.map((opt, optIdx) => {
                              const isCorrect = optIdx === q.correctIndex
                              const isSelected = selected === optIdx
                              const showResult = isAnswered

                              return (
                                <button
                                  key={optIdx}
                                  type="button"
                                  disabled={isAnswered}
                                  onClick={() => handleAnswerSelect(quizIdx, optIdx)}
                                  className={`w-full text-left rounded-md border px-2.5 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                                    !showResult
                                      ? 'hover:bg-accent cursor-pointer'
                                      : isCorrect
                                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                                        : isSelected
                                          ? 'border-destructive bg-destructive/5'
                                          : 'opacity-60'
                                  }`}
                                >
                                  <span className={`shrink-0 h-4 w-4 rounded-full border flex items-center justify-center text-[9px] font-semibold ${
                                    showResult && isCorrect
                                      ? 'border-emerald-500 text-emerald-600 bg-emerald-100 dark:bg-emerald-900/40'
                                      : showResult && isSelected
                                        ? 'border-destructive text-destructive'
                                        : 'border-muted-foreground/30'
                                  }`}>
                                    {String.fromCharCode(65 + optIdx)}
                                  </span>
                                  <span className="flex-1">{opt}</span>
                                  {showResult && isCorrect && <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                                  {showResult && isSelected && !isCorrect && <X className="h-3.5 w-3.5 text-destructive shrink-0" />}
                                </button>
                              )
                            })}
                          </div>
                          {isAnswered && q.explanation && (
                            <button
                              type="button"
                              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                              onClick={() => setExpandedQuiz(isExpanded ? null : quizIdx)}
                            >
                              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              Explanation
                            </button>
                          )}
                          {isAnswered && isExpanded && q.explanation && (
                            <p className="text-[11px] text-muted-foreground bg-muted/50 rounded p-2">
                              {q.explanation}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}
