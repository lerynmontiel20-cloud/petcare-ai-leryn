import { ArrowUpRight, Bot, MapPin, RotateCcw, Send, User } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_SUGGESTED_QUERIES,
  type ChatTurn,
  type SuggestedQueryItem,
} from '../types/petcare.ts';
import { SafeMarkdown } from './SafeMarkdown.tsx';

const WELCOME_TURN: ChatTurn = {
  role: 'assistant',
  content:
    'Hola, soy **PetCare AI**. Puedo responder dudas generales sobre el cuidado de perros y gatos y consultar en tiempo real los establecimientos, servicios, horarios y precios registrados en nuestra base de datos.\n\n*Recordá que mis respuestas son de orientación general y no sustituyen la consulta con un médico veterinario.*',
};

const SESSION_STORAGE_KEY = 'petcare_chat_session_id';

function getOrCreateSessionId(): string {
  try {
    const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (existing && existing.trim()) return existing.trim();
    const created =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `session-${Date.now()}`;
    window.localStorage.setItem(SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    return 'default';
  }
}

interface AssistantPanelProps {
  suggestedQueries?: SuggestedQueryItem[];
  onSelectEstablishmentFromAI: (id: string) => void;
}

export function AssistantPanel({
  suggestedQueries = [],
  onSelectEstablishmentFromAI,
}: AssistantPanelProps) {
  const [sessionId, setSessionId] = useState<string>(() => getOrCreateSessionId());
  const [messages, setMessages] = useState<ChatTurn[]>([WELCOME_TURN]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const activeQueries =
    suggestedQueries.length > 0
      ? suggestedQueries.map((q) => q.question)
      : [...DEFAULT_SUGGESTED_QUERIES];

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/chat/history?sessionId=${encodeURIComponent(sessionId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { messages?: ChatTurn[] } | null) => {
        if (cancelled) return;
        if (data?.messages && data.messages.length > 0) {
          setMessages([WELCOME_TURN, ...data.messages]);
        }
      })
      .catch(() => {
        // Ignorar: mantiene el mensaje de bienvenida si no hay historial previo
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const sendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || loading) return;

    setError(null);
    const nextUserTurn: ChatTurn = { role: 'user', content: trimmed };
    const updatedHistory = [...messages, nextUserTurn];
    setMessages(updatedHistory);
    setInput('');
    setLoading(true);

    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: trimmed,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = (await res.json()) as {
        reply?: string;
        referencedEstablishments?: ChatTurn['referencedEstablishments'];
        error?: string;
      };

      if (!res.ok || !data.reply) {
        throw new Error(
          data.error || 'No se pudo obtener respuesta del asistente.'
        );
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply!,
          referencedEstablishments: data.referencedEstablishments ?? [],
        },
      ]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Error inesperado al consultar el asistente.'
      );
    } finally {
      setLoading(false);
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 60);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
  };

  const handleReset = () => {
    setError(null);
    const nextId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `session-${Date.now()}`;
    try {
      window.localStorage.setItem(SESSION_STORAGE_KEY, nextId);
    } catch {
      // Ignorado
    }
    setSessionId(nextId);
    setMessages([
      {
        role: 'assistant',
        content:
          'Conversación reiniciada. Consultame sobre cuidados de mascotas o sobre cualquier veterinaria, peluquería canina o tienda del catálogo.',
      },
    ]);
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-12rem)] min-h-[540px] max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-display text-sm font-bold text-slate-900">
              Asistente Inteligente PetCare AI
            </h2>
            <p className="text-xs text-slate-500">
              Conectado en tiempo real al catálogo de establecimientos · Orientación general sin sustituir al veterinario
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 whitespace-nowrap"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Nueva consulta
        </button>
      </div>

      <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500">
            Consultas sugeridas:
          </span>
          {activeQueries.map((q) => (
            <button
              key={q}
              type="button"
              disabled={loading}
              onClick={() => void sendMessage(q)}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-teal-600 hover:text-teal-800 disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.map((turn, idx) => {
          const isUser = turn.role === 'user';
          return (
            <div
              key={idx}
              className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              {!isUser && (
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-700 text-white">
                  <Bot className="h-4 w-4" />
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-xl px-4 py-3 ${
                  isUser
                    ? 'bg-slate-900 text-sm text-white'
                    : 'border border-slate-200 bg-slate-50/70 text-slate-800'
                }`}
              >
                {isUser ? (
                  <p className="leading-relaxed">{turn.content}</p>
                ) : (
                  <>
                    <SafeMarkdown content={turn.content} />
                    {turn.referencedEstablishments &&
                      turn.referencedEstablishments.length > 0 && (
                        <div className="mt-3 border-t border-slate-200 pt-2.5">
                          <div className="text-[11px] font-semibold text-slate-500">
                            Establecimientos consultados en la base de datos:
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-2">
                            {turn.referencedEstablishments.map((est) => (
                              <button
                                key={est.id}
                                type="button"
                                onClick={() => onSelectEstablishmentFromAI(est.id)}
                                className="inline-flex items-center gap-1 rounded-md border border-teal-200 bg-white px-2.5 py-1 text-xs font-medium text-teal-800 transition-colors hover:bg-teal-50"
                              >
                                <MapPin className="h-3 w-3" />
                                <span>{est.name}</span>
                                <ArrowUpRight className="h-3 w-3" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                  </>
                )}
              </div>

              {isUser && (
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-slate-700">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          );
        })}

        {loading && (
          <div className="flex items-start gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-700 text-white">
              <Bot className="h-4 w-4" />
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              Consultando registros del sistema y preparando respuesta...
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-800"
          >
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-slate-200 bg-white px-5 py-3.5"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Preguntá sobre cuidados, peluquerías caninas, vacunas o precios..."
          disabled={loading}
          className="flex-1 rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20 disabled:bg-slate-50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2.5 text-xs font-medium text-white transition-colors hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <Send className="h-4 w-4" />
          Enviar
        </button>
      </form>
    </div>
  );
}
