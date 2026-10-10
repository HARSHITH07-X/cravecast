import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Send,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Terminal,
  Activity,
  RotateCcw,
  Languages,
  Calendar,
  Utensils,
  TrendingUp,
  AlertTriangle,
  Layers,
  ChevronRight,
  Info,
  Check,
  Flame,
  CloudRain,
  DollarSign,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAuth } from '../lib/authContext';

interface AgentTraceStep {
  id: string;
  runId: string;
  restaurantId: string;
  agent: string;
  step: string;
  input: any;
  output: any;
  latencyMs: number;
  tokenCounts: {
    promptTokens: number;
    candidateTokens: number;
    totalTokens: number;
  };
  model: string;
  timestamp: string;
  toolCalls?: Array<{ name: string; args: any; result?: any }>;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  language?: string;
  triage?: {
    route: string;
    confidence: number;
    language: string;
    reasoning?: string;
  };
  actionType?: string | null;
  actionData?: any;
}

interface AskCraveCastViewProps {
  onNavigateTab?: (tab: string) => void;
}

export const AskCraveCastView: React.FC<AskCraveCastViewProps> = ({ onNavigateTab }) => {
  const { restaurant, idToken } = useAuth();
  const [selectedLanguage, setSelectedLanguage] = useState<'en' | 'hi' | 'te'>('en');
  const [inputMessage, setInputMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [traces, setTraces] = useState<AgentTraceStep[]>([]);
  const [expandedTraceId, setExpandedTraceId] = useState<string | null>(null);
  const [filterAgent, setFilterAgent] = useState<string>('all');
  const [sseConnected, setSseConnected] = useState(false);
  const [confirmedFeedbacks, setConfirmedFeedbacks] = useState<Record<string, string>>({});
  const [confirmedWhatIfs, setConfirmedWhatIfs] = useState<Record<string, boolean>>({});
  const [simulatingWhatIfId, setSimulatingWhatIfId] = useState<string | null>(null);
  const [whatIfDraftOverrides, setWhatIfDraftOverrides] = useState<Record<string, any>>({});
  const [confirmedIngests, setConfirmedIngests] = useState<Record<string, string>>({});
  const [committingIngestId, setCommittingIngestId] = useState<string | null>(null);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const tracesScrollRef = useRef<HTMLDivElement>(null);

  // Initial welcome message
  useEffect(() => {
    const welcomeEn =
      'Hello! I am your CraveCast Kitchen Assistant. Ask me to run tomorrow\'s plan, explain portion forecasts (e.g. "Why 45 biryanis tomorrow?"), simulate what-if scenarios ("What if it rains?"), record stockouts, or ingest sales numbers.';
    const welcomeHi =
      'नमस्ते! मैं CraveCast किचन असिस्टेंट हूँ। आप मुझसे कल की प्लानिंग चलाने, किसी डिश का कारण पूछने ("बिरयानी 45 क्यों?"), व्हाट-इफ सिमुलेशन ("बारिश हुई तो क्या होगा?"), या स्टॉकआउट दर्ज करने को कह सकते हैं।';
    const welcomeTe =
      'నమస్కారం! నేను CraveCast కిచెన్ అసిస్టెంట్. మీరు నన్ను రేపటి ప్లాన్ రన్ చేయమని, డిష్ భాగాల వివరణలు ("రేపు 45 బిర్యానీ ఎందుకు?"), వాట్-ఇఫ్ పరీక్షలు ("వర్షం పడితే?"), లేదా స్టాక్ వివరాలు నమోదు చేయమని అడగవచ్చు.';

    const text = selectedLanguage === 'hi' ? welcomeHi : selectedLanguage === 'te' ? welcomeTe : welcomeEn;

    setMessages([
      {
        id: 'msg_welcome',
        sender: 'assistant',
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        triage: {
          route: 'other',
          confidence: 1.0,
          language: selectedLanguage,
          reasoning: 'Operational greeting and capability overview',
        },
      },
    ]);
  }, [selectedLanguage]);

  const fetchTraces = async () => {
    if (!idToken) return;
    try {
      const r = await fetch('/api/agent/traces', {
        headers: {
          Authorization: `Bearer ${idToken}`,
          'x-restaurant-id': restaurant?.id || '',
        },
      });
      const data = await r.json();
      if (data.steps && Array.isArray(data.steps)) {
        setTraces(data.steps);
      }
    } catch (err) {
      console.warn('Could not fetch traces:', err);
    }
  };

  // Load initial traces and connect to SSE stream with auth token
  useEffect(() => {
    if (!idToken) return;

    fetchTraces();

    let eventSource: EventSource | null = null;
    try {
      const streamUrl = `/api/agent/traces/stream?token=${encodeURIComponent(idToken)}`;
      eventSource = new EventSource(streamUrl);

      eventSource.onopen = () => {
        setSseConnected(true);
      };

      eventSource.onmessage = (event) => {
        try {
          const step: AgentTraceStep = JSON.parse(event.data);
          if (step && step.id) {
            setTraces((prev) => {
              if (prev.some((p) => p.id === step.id)) return prev;
              return [step, ...prev];
            });
          }
        } catch {}
      };

      eventSource.onerror = () => {
        setSseConnected(false);
      };
    } catch {}

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [idToken, restaurant]);

  // Auto scroll chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  // Language suggestions
  const suggestions = {
    en: [
      { text: 'Why 45 biryanis tomorrow?', label: 'Explain Biryani' },
      { text: 'What if it rains tomorrow?', label: 'What-If: Rain' },
      { text: 'We have a 40-person booking tomorrow lunch', label: 'What-If: 40 Covers' },
      { text: 'We ran out of naan at 8pm', label: 'Feedback: Naan Stockout' },
      { text: "Generate tomorrow's plan", label: 'Plan: Tomorrow' },
      { text: 'Yesterday we sold 45 biryanis and 30 naans', label: 'Ingest: Sales' },
    ],
    hi: [
      { text: 'कल 45 बिरयानी क्यों?', label: 'कारण: बिरयानी' },
      { text: 'अगर कल बारिश हुई तो क्या होगा?', label: 'व्हाट-इफ: बारिश' },
      { text: 'कल 40 लोगों की पार्टी की बुकिंग है', label: 'व्हाट-इफ: 40 बुकिंग' },
      { text: 'नान रात को 8 बजे खत्म हो गया', label: 'स्टॉकआउट: नान' },
      { text: 'कल का किचन प्लान बनाओ', label: 'प्लान: कल की तैयारी' },
      { text: 'कल 45 बिरयानी और 30 नान बिका', label: 'सेल्स इनटेक' },
    ],
    te: [
      { text: 'రేపు 45 బిర్యానీలు ఎందుకు?', label: 'వివరణ: బిర్యానీ' },
      { text: 'రేపు వర్షం పడితే ఏమి అవుతుంది?', label: 'వాట్-ఇఫ్: వర్షం' },
      { text: 'రేపు మధ్యాహ్నం 40 మంది బుకింగ్ ఉంది', label: 'వాట్-ఇఫ్: 40 మంది' },
      { text: 'రాత్రి 8 గంటలకు రోటీ అయిపోయింది', label: 'స్టాక్ వివరాలు: రోటీ' },
      { text: 'రేపటి ప్లాన్ చేయండి', label: 'ప్లాన్: రేపటి తయారీ' },
      { text: 'నిన్న 45 బిర్యానీలు మరియు 30 నాన్ అమ్మారు', label: 'సేల్స్ నమోదు' },
    ],
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputMessage).trim();
    if (!query || sending || !idToken) return;

    setInputMessage('');
    setSending(true);

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      language: selectedLanguage,
    };

    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
          'x-restaurant-id': restaurant?.id || '',
        },
        body: JSON.stringify({
          message: query,
          languagePreference: selectedLanguage,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Agent request failed.');
      }

      const msgId = `bot_${Date.now()}`;
      if (data.actionType === 'what_if_card' && data.actionData?.parsed?.overrides) {
        setWhatIfDraftOverrides((prev) => ({
          ...prev,
          [msgId]: {
            isRain: Boolean(data.actionData.parsed.overrides.isRain),
            additionalBookingCovers: Number(data.actionData.parsed.overrides.additionalBookingCovers || 0),
            tempMax: Number(data.actionData.parsed.overrides.tempMax || 32),
          },
        }));
      }

      const botMsg: ChatMessage = {
        id: msgId,
        sender: 'assistant',
        text: data.reply || 'Request completed.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        language: data.triage?.language || selectedLanguage,
        triage: data.triage,
        actionType: data.actionType,
        actionData: data.actionData,
      };

      setMessages((prev) => [...prev, botMsg]);
      fetchTraces();
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot_err_${Date.now()}`,
          sender: 'assistant',
          text: `Error: ${err.message || 'Failed to process request.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleConfirmFeedback = async (feedbackData: any, msgId: string) => {
    if (!idToken || !feedbackData) return;
    try {
      const res = await fetch('/api/agent/feedback/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
          'x-restaurant-id': restaurant?.id || '',
        },
        body: JSON.stringify({ feedback: feedbackData }),
      });
      const data = await res.json();
      if (data.success) {
        setConfirmedFeedbacks((prev) => ({ ...prev, [msgId]: data.id || 'saved' }));
        fetchTraces();
      }
    } catch (err) {
      console.error('Failed to confirm feedback:', err);
    }
  };

  const handleConfirmWhatIf = async (msg: ChatMessage) => {
    if (!idToken || !msg.actionData) return;
    setSimulatingWhatIfId(msg.id);
    const overrides = whatIfDraftOverrides[msg.id] || msg.actionData.parsed?.overrides || {};
    const scenarioTitle = msg.actionData.parsed?.scenarioTitle || msg.actionData.simulation?.scenarioTitle || 'Scenario';
    const targetDate = msg.actionData.targetDate;

    try {
      const res = await fetch('/api/agent/what-if/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
          'x-restaurant-id': restaurant?.id || '',
        },
        body: JSON.stringify({
          targetDate,
          overrides,
          scenarioTitle,
          language: msg.language || selectedLanguage,
        }),
      });
      const data = await res.json();
      if (data.success && data.simulation) {
        setConfirmedWhatIfs((prev) => ({ ...prev, [msg.id]: true }));
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id
              ? {
                  ...m,
                  text: data.simulation.explanation,
                  actionData: {
                    ...m.actionData,
                    simulation: data.simulation,
                  },
                }
              : m
          )
        );
        fetchTraces();
      }
    } catch (err) {
      console.error('Failed to simulate what-if overrides:', err);
    } finally {
      setSimulatingWhatIfId(null);
    }
  };

  const handleConfirmIngest = async (ingestData: any, msgId: string) => {
    if (!idToken || !ingestData?.rows) return;
    setCommittingIngestId(msgId);
    try {
      const rowsToCommit = ingestData.rows.map((r: any) => ({
        date: ingestData.date,
        dishName: r.dishName,
        quantitySold: Number(r.quantitySold) || 0,
        soldOut: Boolean(r.stockoutTime),
        soldOutTime: r.stockoutTime || undefined,
      }));

      const res = await fetch('/api/sales/commit-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
          'x-restaurant-id': restaurant?.id || '',
        },
        body: JSON.stringify({
          rows: rowsToCommit,
          source: 'ask_cravecast_ingest',
          filename: `ask_cravecast_${ingestData.date}`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setConfirmedIngests((prev) => ({ ...prev, [msgId]: data.batchId || 'saved' }));
        fetchTraces();
      }
    } catch (err) {
      console.error('Failed to commit ingested sales:', err);
    } finally {
      setCommittingIngestId(null);
    }
  };

  const handleGeneratePlanAndExplain = async (originalQuery: string) => {
    if (!idToken || sending) return;
    await handleSendMessage("Generate tomorrow's plan");
    setTimeout(() => {
      handleSendMessage(originalQuery);
    }, 400);
  };

  const filteredTraces = traces.filter((t) => {
    if (filterAgent === 'all') return true;
    return t.agent.toLowerCase().includes(filterAgent.toLowerCase());
  });

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-112px)] gap-5 max-w-7xl mx-auto">
      {/* ======================================================== */}
      {/* LEFT COLUMN: CHAT INTERFACE & MULTI-LINGUAL ASSISTANT    */}
      {/* ======================================================== */}
      <div className="flex-1 flex flex-col bg-[#142823] rounded-2xl border border-[#24463D] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#24463D] bg-[#0F1F1B] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#18332C] border border-[#2F5D50] text-[#E0A526] flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-serif text-base font-bold text-[#FBF6EE]">Ask CraveCast</h2>
              <p className="text-xs text-[#FBF6EE]/60">
                Triage routing · Grounded explanations · What-If delta · Number Guard
              </p>
            </div>
          </div>

          {/* Language Selector */}
          <div className="flex items-center gap-1 bg-[#142823] p-1 rounded-xl border border-[#24463D] text-xs shrink-0">
            <button
              onClick={() => setSelectedLanguage('en')}
              className={`px-2.5 py-1 rounded-lg font-medium transition whitespace-nowrap shrink-0 cursor-pointer ${
                selectedLanguage === 'en'
                  ? 'bg-[#C8553D] text-[#FBF6EE]'
                  : 'text-[#FBF6EE]/70 hover:text-[#FBF6EE]'
              }`}
            >
              English
            </button>
            <button
              onClick={() => setSelectedLanguage('hi')}
              className={`px-2.5 py-1 rounded-lg font-medium transition whitespace-nowrap shrink-0 cursor-pointer ${
                selectedLanguage === 'hi'
                  ? 'bg-[#C8553D] text-[#FBF6EE]'
                  : 'text-[#FBF6EE]/70 hover:text-[#FBF6EE]'
              }`}
            >
              हिन्दी
            </button>
            <button
              onClick={() => setSelectedLanguage('te')}
              className={`px-2.5 py-1 rounded-lg font-medium transition whitespace-nowrap shrink-0 cursor-pointer ${
                selectedLanguage === 'te'
                  ? 'bg-[#C8553D] text-[#FBF6EE]'
                  : 'text-[#FBF6EE]/70 hover:text-[#FBF6EE]'
              }`}
            >
              తెలుగు
            </button>
          </div>
        </div>

        {/* Suggestion Quick Buttons */}
        <div className="px-5 py-2.5 bg-[#0F1F1B]/60 border-b border-[#24463D] flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-xs font-medium text-[#E0A526] whitespace-nowrap shrink-0">
            Try:
          </span>
          {suggestions[selectedLanguage].map((s, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(s.text)}
              disabled={sending}
              className="text-xs px-3 py-1 bg-[#18332C] hover:bg-[#24463D] border border-[#2F5D50] text-[#FBF6EE]/90 hover:text-[#FBF6EE] rounded-lg whitespace-nowrap shrink-0 transition cursor-pointer"
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Messages Stream */}
        <div ref={chatScrollRef} className="flex-1 p-5 overflow-y-auto space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              {/* Message Bubble */}
              <div
                className={`max-w-[88%] rounded-2xl p-4 text-sm leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-[#C8553D] text-[#FBF6EE]'
                    : 'bg-[#18332C] text-[#FBF6EE] border border-[#2F5D50]'
                }`}
              >
                {/* Triage Route Metadata Line for Assistant (Zero-pill clean text with separators) */}
                {msg.sender === 'assistant' && msg.triage && (
                  <div className="flex flex-wrap items-center gap-2 mb-2.5 pb-2 border-b border-[#24463D] text-xs text-[#FBF6EE]/60 font-mono tabular-nums">
                    <span className="font-semibold text-[#E0A526]">
                      route: {msg.triage.route}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      confidence: {(msg.triage.confidence * 100).toFixed(0)}%
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>lang: {msg.triage.language}</span>
                    <span className="ml-auto inline-flex items-center gap-1 text-[#E0A526]">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Number Guard Verified
                    </span>
                  </div>
                )}

                <div className="whitespace-pre-wrap text-[#FBF6EE]/95">{msg.text}</div>

                {/* ======================================================== */}
                {/* ACTION CARDS BY ROUTE                                    */}
                {/* ======================================================== */}

                {/* 1. Plan Orchestrator Summary Card */}
                {msg.actionType === 'trigger_plan' && (
                  <div className="mt-3 p-3.5 bg-[#0F1F1B] border border-[#2F5D50] rounded-xl space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-[#FBF6EE]">
                          Orchestrated Plan · {msg.actionData?.targetDate}
                        </div>
                        <div className="text-[11px] text-[#FBF6EE]/60 font-mono tabular-nums mt-0.5">
                          {msg.actionData?.summary
                            ? `${msg.actionData.summary.totalDishesCount} dishes · ${msg.actionData.summary.totalPlannedPortions} portions · ₹${msg.actionData.summary.totalEstimatedOrderCost} order cost`
                            : `Target Date: ${msg.actionData?.targetDate}`}
                        </div>
                      </div>
                      <button
                        onClick={() => onNavigateTab && onNavigateTab('plan')}
                        className="px-3 py-1.5 bg-[#E0A526] hover:bg-[#CCA51E] text-[#0F1F1B] rounded-lg text-xs font-semibold transition flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Open Daily Plan
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {msg.actionData?.topDishes?.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#24463D] font-mono tabular-nums">
                        {msg.actionData.topDishes.map((d: any, i: number) => (
                          <div key={i} className="bg-[#142823] p-2 rounded-lg border border-[#24463D]">
                            <div className="text-[10px] text-[#FBF6EE]/60 truncate font-sans">{d.dishName}</div>
                            <div className="font-bold text-[#E0A526] text-xs mt-0.5">{d.plannedPortions} portions</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 2. Grounded Explanation Citation Card */}
                {msg.actionType === 'explanation_card' && msg.actionData?.grounded && (
                  <div className="mt-3 p-3.5 bg-[#0F1F1B] border border-[#2F5D50] rounded-xl space-y-2.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#24463D] pb-2">
                      <span className="flex items-center gap-1.5 font-semibold text-[#FBF6EE]">
                        <Utensils className="w-3.5 h-3.5 text-[#E0A526]" />
                        {msg.actionData.dishName}
                      </span>
                      <span className="text-[11px] text-[#E0A526] font-mono tabular-nums">
                        Cited Plan: {msg.actionData.citation?.dataSource || 'Plan Run'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center pt-1 font-mono tabular-nums">
                      <div className="bg-[#142823] p-2 rounded-lg border border-[#24463D]">
                        <div className="text-[10px] text-[#FBF6EE]/60 font-sans">Planned</div>
                        <div className="font-bold text-[#E0A526] text-sm">
                          {msg.actionData.factors?.plannedPortions}
                        </div>
                      </div>
                      <div className="bg-[#142823] p-2 rounded-lg border border-[#24463D]">
                        <div className="text-[10px] text-[#FBF6EE]/60 font-sans">Lower p10</div>
                        <div className="font-semibold text-[#FBF6EE]">
                          {msg.actionData.factors?.p10}
                        </div>
                      </div>
                      <div className="bg-[#142823] p-2 rounded-lg border border-[#24463D]">
                        <div className="text-[10px] text-[#FBF6EE]/60 font-sans">Median p50</div>
                        <div className="font-semibold text-[#FBF6EE]">
                          {msg.actionData.factors?.p50}
                        </div>
                      </div>
                      <div className="bg-[#142823] p-2 rounded-lg border border-[#24463D]">
                        <div className="text-[10px] text-[#FBF6EE]/60 font-sans">Upper p90</div>
                        <div className="font-semibold text-[#FBF6EE]">
                          {msg.actionData.factors?.p90}
                        </div>
                      </div>
                      <div className="bg-[#142823] p-2 rounded-lg border border-[#24463D]">
                        <div className="text-[10px] text-[#FBF6EE]/60 font-sans">Service Level</div>
                        <div className="font-semibold text-[#E0A526]">
                          {msg.actionData.factors?.serviceLevelPercent}%
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2b. Un-grounded Refusal Helper Card (when no plan exists yet) */}
                {msg.actionType === 'explanation_card' && !msg.actionData?.grounded && (
                  <div className="mt-3 p-3.5 bg-[#0F1F1B] border border-[#2F5D50] rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="text-[#FBF6EE]/75">
                      Grounding Guard refused to invent numbers because no stored plan was found for this dish/date.
                    </div>
                    <button
                      onClick={() => handleGeneratePlanAndExplain(msg.actionData?.dishName || 'Why 45 biryanis tomorrow?')}
                      disabled={sending}
                      className="px-3 py-1.5 bg-[#E0A526] hover:bg-[#CCA51E] text-[#0F1F1B] rounded-lg font-semibold text-xs transition whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Run Tomorrow&apos;s Plan &amp; Explain
                    </button>
                  </div>
                )}

                {/* 3. What-If Override Confirmation + Computed Delta Card */}
                {msg.actionType === 'what_if_card' && msg.actionData?.simulation && (
                  <div className="mt-3 p-3.5 bg-[#0F1F1B] border border-[#2F5D50] rounded-xl space-y-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#24463D] pb-2">
                      <span className="flex items-center gap-1.5 font-semibold text-[#FBF6EE]">
                        <CloudRain className="w-4 h-4 text-[#E0A526]" />
                        {msg.actionData.simulation.scenarioTitle}
                      </span>
                      <span className="text-[11px] font-mono tabular-nums text-[#E0A526]">
                        Net Delta: {msg.actionData.simulation.netPortionDelta > 0 ? '+' : ''}
                        {msg.actionData.simulation.netPortionDelta} portions · ₹{msg.actionData.simulation.orderCostDelta}
                      </span>
                    </div>

                    {/* LLM-Parsed Overrides for Owner Confirmation */}
                    <div className="p-2.5 bg-[#142823] rounded-lg border border-[#24463D] space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-[#FBF6EE]/70">
                        <span>Parsed Scenario Overrides (Review &amp; Confirm):</span>
                        {confirmedFeedbacks[msg.id] || confirmedWhatIfs[msg.id] ? (
                          <span className="text-[#E0A526] font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Overrides Confirmed
                          </span>
                        ) : null}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                        <label className="flex items-center justify-between bg-[#0F1F1B] px-2.5 py-1.5 rounded border border-[#24463D]">
                          <span className="text-[11px] text-[#FBF6EE]/80">Rain Expected</span>
                          <input
                            type="checkbox"
                            checked={Boolean(
                              whatIfDraftOverrides[msg.id]?.isRain ??
                                msg.actionData.parsed?.overrides?.isRain
                            )}
                            onChange={(e) =>
                              setWhatIfDraftOverrides((prev) => ({
                                ...prev,
                                [msg.id]: {
                                  ...(prev[msg.id] || msg.actionData.parsed?.overrides || {}),
                                  isRain: e.target.checked,
                                },
                              }))
                            }
                            className="accent-[#C8553D]"
                          />
                        </label>

                        <label className="flex items-center justify-between bg-[#0F1F1B] px-2.5 py-1.5 rounded border border-[#24463D]">
                          <span className="text-[11px] text-[#FBF6EE]/80">Extra Covers</span>
                          <input
                            type="number"
                            min={0}
                            max={500}
                            value={
                              whatIfDraftOverrides[msg.id]?.additionalBookingCovers ??
                              (msg.actionData.parsed?.overrides?.additionalBookingCovers || 0)
                            }
                            onChange={(e) =>
                              setWhatIfDraftOverrides((prev) => ({
                                ...prev,
                                [msg.id]: {
                                  ...(prev[msg.id] || msg.actionData.parsed?.overrides || {}),
                                  additionalBookingCovers: Number(e.target.value) || 0,
                                },
                              }))
                            }
                            className="w-16 text-right font-mono tabular-nums bg-transparent text-[#E0A526] focus:outline-none"
                          />
                        </label>

                        <button
                          onClick={() => handleConfirmWhatIf(msg)}
                          disabled={simulatingWhatIfId === msg.id}
                          className="px-3 py-1.5 bg-[#E0A526] hover:bg-[#CCA51E] disabled:opacity-50 text-[#0F1F1B] rounded font-semibold text-xs transition flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          {simulatingWhatIfId === msg.id
                            ? 'Re-running Planner...'
                            : confirmedWhatIfs[msg.id]
                            ? 'Re-run With Overrides'
                            : 'Confirm & Run Override'}
                        </button>
                      </div>
                    </div>

                    {/* Computed Delta Metrics */}
                    <div className="grid grid-cols-3 gap-2 font-mono tabular-nums text-[11px]">
                      <div className="bg-[#142823] p-2 rounded-lg border border-[#24463D]">
                        <div className="text-[10px] text-[#FBF6EE]/60 font-sans">Baseline Prep</div>
                        <div className="font-bold text-[#FBF6EE]">
                          {msg.actionData.simulation.baselineTotalPortions} portions
                        </div>
                      </div>
                      <div className="bg-[#142823] p-2 rounded-lg border border-[#24463D]">
                        <div className="text-[10px] text-[#FBF6EE]/60 font-sans">Simulated Prep</div>
                        <div className="font-bold text-[#E0A526]">
                          {msg.actionData.simulation.simulatedTotalPortions} portions
                        </div>
                      </div>
                      <div className="bg-[#142823] p-2 rounded-lg border border-[#24463D]">
                        <div className="text-[10px] text-[#FBF6EE]/60 font-sans">Order Cost Shift</div>
                        <div className="font-bold text-[#E0A526]">
                          {msg.actionData.simulation.orderCostDelta >= 0 ? '+' : ''}₹{msg.actionData.simulation.orderCostDelta}
                        </div>
                      </div>
                    </div>

                    {msg.actionData.simulation.dishDeltas?.length > 0 && (
                      <div className="pt-1 border-t border-[#24463D]">
                        <table className="w-full text-[11px] font-mono tabular-nums">
                          <thead className="text-[#FBF6EE]/60 border-b border-[#24463D]">
                            <tr>
                              <th className="py-1 text-left font-sans font-medium">Dish</th>
                              <th className="py-1 text-right font-sans font-medium">Baseline</th>
                              <th className="py-1 text-right font-sans font-medium">Simulated</th>
                              <th className="py-1 text-right font-sans font-medium">Delta</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#24463D]/60">
                            {msg.actionData.simulation.dishDeltas.slice(0, 5).map((d: any, i: number) => (
                              <tr key={i}>
                                <td className="py-1 font-sans text-[#FBF6EE]">{d.dishName}</td>
                                <td className="py-1 text-right text-[#FBF6EE]/70">{d.baselinePortions}</td>
                                <td className="py-1 text-right text-[#FBF6EE]">{d.simulatedPortions}</td>
                                <td
                                  className={`py-1 text-right font-semibold ${
                                    d.delta > 0 ? 'text-[#E0A526]' : d.delta < 0 ? 'text-[#C8553D]' : 'text-[#FBF6EE]/50'
                                  }`}
                                >
                                  {d.delta > 0 ? `+${d.delta}` : d.delta}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. Feedback Stockout/Leftover Confirmation Card */}
                {msg.actionType === 'feedback_card' && msg.actionData && (
                  <div className="mt-3 p-3.5 bg-[#0F1F1B] border border-[#2F5D50] rounded-xl space-y-2.5 text-xs">
                    <div className="flex items-center justify-between font-semibold text-[#FBF6EE] border-b border-[#24463D] pb-2">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-[#E0A526]" />
                        Parsed {msg.actionData.type === 'stockout' ? 'Stockout' : 'Leftovers'} Record
                      </span>
                      <span className="text-[11px] text-[#E0A526] font-mono tabular-nums">
                        {msg.actionData.occurredAtTime || '8:00 PM'} · {msg.actionData.serviceShift}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 bg-[#142823] p-2.5 rounded-lg border border-[#24463D] font-mono tabular-nums">
                      <div>
                        <div className="text-[10px] text-[#FBF6EE]/60 font-sans">Dish</div>
                        <div className="font-semibold text-[#FBF6EE] font-sans">{msg.actionData.dishName}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#FBF6EE]/60 font-sans">Date</div>
                        <div className="font-semibold text-[#FBF6EE]">{msg.actionData.date}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#FBF6EE]/60 font-sans">Suggested Delta</div>
                        <div className="font-bold text-[#E0A526]">
                          {msg.actionData.suggestedDelta > 0 ? '+' : ''}
                          {msg.actionData.suggestedDelta} portions
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      {confirmedFeedbacks[msg.id] ? (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#E0A526]">
                          <CheckCircle2 className="w-4 h-4" />
                          Confirmed &amp; Saved to Firestore ({confirmedFeedbacks[msg.id]})
                        </div>
                      ) : (
                        <button
                          onClick={() => handleConfirmFeedback(msg.actionData, msg.id)}
                          className="px-3.5 py-1.5 bg-[#C8553D] hover:bg-[#B54832] text-[#FBF6EE] rounded-lg font-semibold text-xs transition flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Confirm &amp; Save Feedback
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* 5. Ingest Sales Confirmation Card */}
                {msg.actionType === 'ingest_card' && msg.actionData && (
                  <div className="mt-3 p-3.5 bg-[#0F1F1B] border border-[#2F5D50] rounded-xl space-y-2.5 text-xs">
                    <div className="flex items-center justify-between font-semibold text-[#FBF6EE] border-b border-[#24463D] pb-2">
                      <span>Parsed Sales Rows ({msg.actionData.date})</span>
                      <span className="text-[11px] font-mono tabular-nums text-[#E0A526]">
                        Total: {msg.actionData.totalQuantity} portions
                      </span>
                    </div>

                    <div className="bg-[#142823] rounded-lg border border-[#24463D] overflow-hidden">
                      <table className="w-full text-[11px] font-mono tabular-nums">
                        <thead className="bg-[#0F1F1B] text-[#FBF6EE]/60 border-b border-[#24463D]">
                          <tr>
                            <th className="px-3 py-1.5 text-left font-sans font-medium">Dish</th>
                            <th className="px-3 py-1.5 text-right font-sans font-medium">Qty Sold</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#24463D]">
                          {msg.actionData.rows?.map((r: any, rIdx: number) => (
                            <tr key={rIdx}>
                              <td className="px-3 py-1.5 font-sans text-[#FBF6EE]">{r.dishName}</td>
                              <td className="px-3 py-1.5 text-right font-semibold text-[#E0A526]">
                                {r.quantitySold}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        onClick={() => onNavigateTab && onNavigateTab('sales')}
                        className="text-xs text-[#FBF6EE]/70 hover:text-[#E0A526] transition flex items-center gap-1 cursor-pointer"
                      >
                        Open Sales View
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>

                      {confirmedIngests[msg.id] ? (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#E0A526]">
                          <CheckCircle2 className="w-4 h-4" />
                          Saved Sales Batch ({confirmedIngests[msg.id]})
                        </div>
                      ) : (
                        <button
                          onClick={() => handleConfirmIngest(msg.actionData, msg.id)}
                          disabled={committingIngestId === msg.id}
                          className="px-3.5 py-1.5 bg-[#E0A526] hover:bg-[#CCA51E] disabled:opacity-50 text-[#0F1F1B] rounded-lg text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          {committingIngestId === msg.id ? 'Saving...' : 'Confirm & Save Sales Rows'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Timestamp */}
              <span className="text-[10px] font-mono tabular-nums text-[#FBF6EE]/40 mt-1 px-1">
                {msg.timestamp}
              </span>
            </div>
          ))}

          {sending && (
            <div className="flex items-center gap-2 text-xs text-[#E0A526]">
              <Clock className="w-3.5 h-3.5 animate-spin" />
              <span>Triage agent classifying and executing route...</span>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-3.5 bg-[#0F1F1B] border-t border-[#24463D]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2.5"
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={
                selectedLanguage === 'hi'
                  ? 'कल की प्लानिंग या किसी डिश का कारण पूछें...'
                  : selectedLanguage === 'te'
                  ? 'రేపటి ప్లాన్ లేదా ఏదైనా డిష్ గురించి అడగండి...'
                  : "Ask about tomorrow's plan, why 45 biryanis tomorrow, or what if it rains..."
              }
              className="flex-1 px-4 py-2.5 rounded-xl bg-[#142823] border border-[#2F5D50] text-sm text-[#FBF6EE] placeholder:text-[#FBF6EE]/40 focus:outline-none focus:border-[#E0A526] transition"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={sending || !inputMessage.trim()}
              className="px-4 py-2.5 bg-[#C8553D] hover:bg-[#B54832] disabled:opacity-50 text-[#FBF6EE] rounded-xl text-sm font-semibold transition flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>Send</span>
            </button>
          </form>
        </div>
      </div>

      {/* ======================================================== */}
      {/* RIGHT COLUMN: LIVE AGENT TRACE TIMELINE (OBSERVABILITY) */}
      {/* ======================================================== */}
      <div className="w-full lg:w-[420px] flex flex-col bg-[#0F1F1B] rounded-2xl border border-[#24463D] text-[#FBF6EE] overflow-hidden shrink-0">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-[#24463D] bg-[#142823] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-[#E0A526]" />
            <span className="text-xs font-semibold tracking-wide text-[#FBF6EE]">
              Live Agent Trace Timeline
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-mono tabular-nums text-[#E0A526]">
              {sseConnected ? 'SSE Live' : 'Active'} · {traces.length} steps
            </span>

            <button
              onClick={() => setTraces([])}
              title="Clear Trace View"
              className="p-1.5 hover:bg-[#18332C] rounded-lg text-[#FBF6EE]/60 hover:text-[#FBF6EE] transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="px-4 py-2 bg-[#0F1F1B] border-b border-[#24463D] flex items-center gap-1 text-[11px] overflow-x-auto no-scrollbar font-mono">
          {['all', 'triage', 'explainer', 'what_if', 'feedback', 'ingest', 'orchestrator'].map((ag) => (
            <button
              key={ag}
              onClick={() => setFilterAgent(ag)}
              className={`px-2.5 py-1 rounded-md transition whitespace-nowrap shrink-0 cursor-pointer ${
                filterAgent === ag
                  ? 'bg-[#18332C] text-[#E0A526] border border-[#2F5D50] font-semibold'
                  : 'text-[#FBF6EE]/60 hover:text-[#FBF6EE]'
              }`}
            >
              {ag}
            </button>
          ))}
        </div>

        {/* Trace Steps Timeline */}
        <div ref={tracesScrollRef} className="flex-1 p-3.5 overflow-y-auto space-y-2.5 font-mono tabular-nums text-xs">
          {filteredTraces.length === 0 ? (
            <div className="py-12 text-center text-[#FBF6EE]/50 text-xs">
              <Activity className="w-6 h-6 mx-auto mb-2 opacity-50 text-[#E0A526]" />
              Waiting for agent steps...
              <div className="text-[11px] mt-1 text-[#FBF6EE]/40 font-sans px-4">
                Every step logged to agent_runs streams here live with step name, latency, token counts, model, and tool calls.
              </div>
            </div>
          ) : (
            filteredTraces.map((trace) => {
              const isExpanded = expandedTraceId === trace.id;
              return (
                <div
                  key={trace.id}
                  className="bg-[#142823] border border-[#24463D] rounded-xl p-3 hover:border-[#2F5D50] transition"
                >
                  <div
                    onClick={() => setExpandedTraceId(isExpanded ? null : trace.id)}
                    className="flex items-center justify-between cursor-pointer gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[11px] font-bold text-[#E0A526] shrink-0">
                        {trace.agent}
                      </span>
                      <span aria-hidden="true" className="text-[#FBF6EE]/30">·</span>
                      <span className="text-[#FBF6EE]/90 font-medium text-[11px] truncate">
                        {trace.step}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-[#FBF6EE]/70 shrink-0">
                      <span className="text-[#E0A526]">{trace.latencyMs}ms</span>
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5 text-[#FBF6EE]/50" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-[#FBF6EE]/50" />
                      )}
                    </div>
                  </div>

                  {/* Summary Bar */}
                  <div className="mt-2 flex items-center justify-between text-[10px] text-[#FBF6EE]/50 border-t border-[#24463D] pt-1.5">
                    <span className="truncate max-w-[140px]">{trace.model}</span>
                    <span>
                      tokens: {trace.tokenCounts?.totalTokens || 0}
                      {trace.tokenCounts?.totalTokens
                        ? ` (in:${trace.tokenCounts.promptTokens}/out:${trace.tokenCounts.candidateTokens})`
                        : ''}
                    </span>
                    <span>{trace.timestamp ? trace.timestamp.slice(11, 19) : ''}</span>
                  </div>

                  {trace.toolCalls && trace.toolCalls.length > 0 && !isExpanded && (
                    <div className="mt-1.5 text-[10px] text-[#E0A526]/90 truncate">
                      tools: {trace.toolCalls.map((tc) => tc.name).join(', ')}
                    </div>
                  )}

                  {/* Expandable JSON payload details */}
                  {isExpanded && (
                    <div className="mt-2.5 pt-2 border-t border-[#24463D] space-y-2 text-[10px]">
                      <div className="text-[#FBF6EE]/50">runId: {trace.runId}</div>
                      {trace.toolCalls && trace.toolCalls.length > 0 && (
                        <div>
                          <span className="text-[#E0A526] font-semibold block mb-0.5">
                            Tool Calls ({trace.toolCalls.length}):
                          </span>
                          <div className="bg-[#0F1F1B] p-2 rounded border border-[#24463D] text-[#FBF6EE]/80 overflow-x-auto max-h-32">
                            {JSON.stringify(trace.toolCalls, null, 2)}
                          </div>
                        </div>
                      )}

                      <div>
                        <span className="text-[#FBF6EE]/60 font-semibold block mb-0.5">Input:</span>
                        <div className="bg-[#0F1F1B] p-2 rounded border border-[#24463D] text-[#FBF6EE]/80 overflow-x-auto max-h-28">
                          {typeof trace.input === 'string'
                            ? trace.input
                            : JSON.stringify(trace.input, null, 2)}
                        </div>
                      </div>

                      <div>
                        <span className="text-[#E0A526] font-semibold block mb-0.5">Output:</span>
                        <div className="bg-[#0F1F1B] p-2 rounded border border-[#24463D] text-[#FBF6EE]/80 overflow-x-auto max-h-32">
                          {typeof trace.output === 'string'
                            ? trace.output
                            : JSON.stringify(trace.output, null, 2)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
