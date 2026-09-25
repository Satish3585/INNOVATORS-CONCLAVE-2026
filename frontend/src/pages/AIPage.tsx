import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowRight, Check, Clock3, ImagePlus, LoaderCircle, MessageSquare, Mic, MicOff, Plus, Send, ShieldCheck, Sparkles, Sprout, ThumbsDown, ThumbsUp, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";
import { api, errorMessage, recordId, type IdRecord } from "@/lib/api";
import { useCrops } from "@/hooks/useFarmData";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, PageHeading, PageSurface, SelectInput, TextInput } from "@/components/FarmUI";

type Message = { role: "user" | "assistant"; content: string | null; created_at?: string; availability?: string; confidence_reason?: string; proposed_actions?: Array<Record<string, unknown>>; input_type?: string };
const timeLabel = (value?: string, language: string = "en") => value ? new Intl.DateTimeFormat(({ en: "en-IN", hi: "hi-IN", kn: "kn-IN", mr: "mr-IN" } as Record<string, string>)[language] || "en-IN", { hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "";

function localizedSpeechCode(lang: string): string {
  switch (lang) {
    case "hi": return "hi-IN";
    case "kn": return "kn-IN";
    case "mr": return "mr-IN";
    default: return "en-IN";
  }
}

export function AIPage() {
  const { user } = useAuth(); const qc = useQueryClient(); const bottomRef = useRef<HTMLDivElement>(null);
  const { language } = useLanguage();
  const conversations = useQuery({ queryKey: ["ai-conversations"], queryFn: () => api.ai.conversations({ limit: 30, offset: 0 }) });
  const crops = useCrops(); const actions = useQuery({ queryKey: ["ai-actions"], queryFn: () => api.ai.actions({ limit: 50, offset: 0 }) });
  const [conversationId, setConversationId] = useState(""); const [message, setMessage] = useState(""); const [cropId, setCropId] = useState(new URLSearchParams(window.location.search).get("crop_id") || "");
  const [imageFile, setImageFile] = useState<File | null>(null); const [imagePreview, setImagePreview] = useState(""); const [imageUploadId, setImageUploadId] = useState(""); const [uploading, setUploading] = useState(false); const [showTaskDraft, setShowTaskDraft] = useState(false);
  
  // Voice & Conversation States
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [autoVoice, setAutoVoice] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [voiceLoopMode, setVoiceLoopMode] = useState(false);
  const recognitionRef = useRef<any>(null);

  const conversation = useQuery({ queryKey: ["ai-conversation", conversationId], queryFn: () => api.ai.conversation(conversationId), enabled: Boolean(conversationId) });
  
  // Text-To-Speech
  function speak(text: string, index: number, onComplete?: () => void) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      toast.error("Text-to-speech is not supported in this browser.");
      return;
    }
    if (speakingIndex === index) {
      window.speechSynthesis.cancel();
      setSpeakingIndex(null);
      return;
    }
    window.speechSynthesis.cancel();
    const cleanText = text.replace(/[*#_`]/g, "");
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = localizedSpeechCode(language);
    utterance.rate = 0.98;
    utterance.onend = () => {
      setSpeakingIndex(null);
      if (onComplete) onComplete();
    };
    utterance.onerror = () => {
      setSpeakingIndex(null);
    };
    setSpeakingIndex(index);
    window.speechSynthesis.speak(utterance);
  }

  function stopSpeaking() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setSpeakingIndex(null);
    }
  }

  // Speech-To-Text
  function toggleListening(autoSendOnFinish = false) {
    const browser = window as any;
    const Recognition = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Recognition) {
      toast.error("Voice input is not supported in this browser. You can type your question.");
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    stopSpeaking();
    try {
      const instance = new Recognition();
      instance.lang = localizedSpeechCode(language);
      instance.interimResults = true;
      instance.continuous = false;
      let finalAccumulated = "";

      instance.onstart = () => {
        setIsListening(true);
        toast.info(`Listening in ${language === "hi" ? "Hindi" : language === "kn" ? "Kannada" : language === "mr" ? "Marathi" : "English"}… speak now`);
      };

      instance.onresult = (event: any) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) {
            finalAccumulated += (finalAccumulated ? " " : "") + res[0].transcript;
          } else {
            interim += res[0].transcript;
          }
        }
        const currentSpoken = finalAccumulated || interim;
        if (currentSpoken) {
          setMessage(currentSpoken);
        }
      };

      instance.onerror = (e: any) => {
        console.warn("Speech recognition error:", e);
        setIsListening(false);
        if (e.error === "not-allowed") {
          toast.error("Microphone access was denied. Please allow microphone permissions in browser.");
        }
      };

      instance.onend = () => {
        setIsListening(false);
        if (autoSendOnFinish && finalAccumulated.trim()) {
          send.mutate(finalAccumulated.trim());
        }
      };

      recognitionRef.current = instance;
      instance.start();
    } catch (err) {
      console.error("Speech start failure:", err);
      setIsListening(false);
    }
  }

  const createConversation = useMutation({ mutationFn: (title: string) => api.ai.createConversation({ title: title.slice(0, 80), context: cropId ? { crop_id: cropId } : {} }), onSuccess: async result => { setConversationId(recordId(result)); await qc.invalidateQueries({ queryKey: ["ai-conversations"] }); }, onError: e => toast.error(errorMessage(e)) });
  
  const send = useMutation({ mutationFn: async (text: string) => {
    let id = conversationId;
    if (!id) { const created = await api.ai.createConversation({ title: text.slice(0, 80), context: cropId ? { crop_id: cropId } : {} }); id = recordId(created); setConversationId(id); }
    let upload = imageUploadId;
    if (imageFile && !upload) { const response = await api.support.upload(imageFile); upload = response.upload_id; setImageUploadId(upload); }
    const result = await api.ai.sendMessage(id, { message: text, input_type: isListening ? "voice" : "text", crop_id: cropId || undefined, image_upload_id: upload || undefined, language });
    return { id, result };
  }, onSuccess: async ({ id, result }) => {
    setMessage(""); setImageFile(null); setImagePreview(""); setImageUploadId("");
    await qc.invalidateQueries({ queryKey: ["ai-conversation", id] });
    await qc.invalidateQueries({ queryKey: ["ai-conversations"] });
    await qc.invalidateQueries({ queryKey: ["ai-actions"] });
    
    const assistantMsg = result?.assistant_message as Record<string, unknown> | undefined;
    const replyContent = typeof assistantMsg?.content === "string" ? assistantMsg.content : "";
    if (Boolean(result?.provider_available)) {
      toast.success("FarmSaathi replied.");
      if (autoVoice && replyContent) {
        // Auto-read response aloud!
        speak(replyContent, 999999, () => {
          if (voiceLoopMode) {
            // In continuous voice conversation mode, automatically start listening for the user's next turn!
            setTimeout(() => toggleListening(true), 400);
          }
        });
      }
    } else {
      toast.info("Your question was saved. FarmSaathi is currently unavailable.");
    }
  }, onError: e => toast.error(errorMessage(e)) });

  const actionDecision = useMutation({ mutationFn: ({ id, decision }: { id: string; decision: "approve" | "reject" }) => api.ai.decideAction(id, decision), onSuccess: async (_, variables) => { await qc.invalidateQueries({ queryKey: ["ai-actions"] }); await qc.invalidateQueries({ queryKey: ["records", "tasks"] }); toast.success(variables.decision === "approve" ? "The reviewed action was applied." : "Action declined."); }, onError: e => toast.error(errorMessage(e)) });
  const createAction = useMutation({ mutationFn: (payload: Record<string, unknown>) => api.ai.createAction(payload), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["ai-actions"] }); setShowTaskDraft(false); toast.success("Task draft created; review it before applying."); }, onError: e => toast.error(errorMessage(e)) });
  
  const thread = conversation.data as (IdRecord & { messages?: Message[] }) | undefined;
  const messages = thread?.messages || [];
  const pendingActions = (actions.data?.items || []).filter(action => action.status === "pending_confirmation");
  
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages.length, send.isPending]);
  useEffect(() => () => {
    stopSpeaking();
    recognitionRef.current?.stop();
  }, []);

  const currentTitle = useMemo(() => String(thread?.title || "New conversation"), [thread?.title]);

  async function attach(file?: File) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast.error("Choose a JPEG, PNG or WebP image."); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error("Choose an image smaller than 8 MB."); return; }
    setImageFile(file); setImagePreview(URL.createObjectURL(file)); setImageUploadId(""); setUploading(true);
    try { const uploaded = await api.support.upload(file); setImageUploadId(uploaded.upload_id); toast.success("Image uploaded securely."); }
    catch (error) { toast.error(errorMessage(error)); setImageFile(null); setImagePreview(""); }
    finally { setUploading(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = message.trim();
    if (!value) { toast.error("Write or speak a question before sending."); return; }
    stopSpeaking();
    send.mutate(value);
  }

  function enterKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function newChat() {
    stopSpeaking();
    setConversationId(""); setMessage(""); setImageFile(null); setImagePreview(""); setImageUploadId("");
  }

  function createTaskDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    createAction.mutate({
      action_type: "create_task",
      title: String(fd.get("title") || "").trim(),
      payload: {
        title: String(fd.get("title") || "").trim(),
        due_date: new Date(String(fd.get("due_date"))).toISOString(),
        priority: fd.get("priority"),
        crop_id: cropId || undefined
      }
    });
  }

  const cropOptions = (crops.data?.items || []).map(crop => ({ value: recordId(crop), label: String(crop.crop_name) }));

  return (
    <PageSurface className="ai-page">
      <PageHeading
        eyebrow="YOUR AGRICULTURAL ASSISTANT"
        title="Ask FarmSaathi."
        subtitle="Conversational crop intelligence in text and voice. Ask questions, explore recommendations and review actions."
        action={
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <Button
              variant={autoVoice ? "primary" : "secondary"}
              onClick={() => {
                const next = !autoVoice;
                setAutoVoice(next);
                if (!next) stopSpeaking();
                toast.info(next ? "Voice response enabled (FarmSaathi will read replies aloud)." : "Voice response muted.");
              }}
              title="Toggle automatic voice speech for replies"
            >
              {autoVoice ? <Volume2 size={16} /> : <VolumeX size={16} />}
              {autoVoice ? "Voice Readout: On" : "Voice Readout: Off"}
            </Button>
            <Button variant="secondary" onClick={newChat}>
              <Plus size={15} /> New conversation
            </Button>
          </div>
        }
      />

      <div className="ai-layout">
        <aside className="ai-sidebar">
          <div className="ai-sidebar-head">
            <span>RECENT CONVERSATIONS</span>
            <button className="icon-button" aria-label="Start a new conversation" onClick={newChat}>
              <Plus size={16} />
            </button>
          </div>
          {conversations.isLoading ? (
            <LoadingState label="Loading…" />
          ) : conversations.isError ? (
            <ErrorState message="Conversation history is unavailable." retry={() => void conversations.refetch()} />
          ) : conversations.data?.items.length ? (
            <div className="conversation-list">
              {conversations.data.items.map((item, index) => (
                <button
                  key={recordId(item) || index}
                  className={`conversation-item ${conversationId === recordId(item) ? "active" : ""}`}
                  onClick={() => {
                    stopSpeaking();
                    setConversationId(recordId(item));
                  }}
                >
                  <MessageSquare size={15} />
                  <span>
                    <strong>{String(item.title || "FarmSaathi conversation")}</strong>
                    <small>{Number(item.message_count || 0)} messages</small>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="conversation-empty">Your saved conversations will appear here.</div>
          )}

          <div style={{ padding: "0.85rem", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", marginTop: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
              <Mic size={16} style={{ color: "#166534" }} />
              <strong style={{ fontSize: "0.88rem", color: "#166534" }}>Voice Conversation</strong>
            </div>
            <p style={{ margin: 0, fontSize: "0.8rem", color: "#374151" }}>
              FarmSaathi can speak replies aloud and listen to your voice in English, Hindi, Kannada, or Marathi.
            </p>
            <Button
              variant={voiceLoopMode ? "primary" : "secondary"}
              style={{ width: "100%", marginTop: "0.6rem" }}
              onClick={() => {
                const next = !voiceLoopMode;
                setVoiceLoopMode(next);
                if (next) {
                  setAutoVoice(true);
                  toggleListening(true);
                  toast.success("Voice Conversation Mode activated! Speak your question.");
                } else {
                  stopSpeaking();
                  if (isListening) toggleListening();
                  toast.info("Voice Conversation Mode paused.");
                }
              }}
            >
              {voiceLoopMode ? <MicOff size={15} /> : <Mic size={15} />}
              {voiceLoopMode ? "Stop Voice Mode" : "Start Voice Dialogue"}
            </Button>
          </div>

          <div className="ai-sidebar-bottom">
            <span className="ai-mini-mark">
              <Sparkles size={16} />
            </span>
            <div>
              <strong>FarmSaathi Companion</strong>
              <small>Always verify critical advice locally.</small>
            </div>
          </div>
        </aside>

        <section className="ai-chat-panel">
          <div className="ai-chat-header">
            <div className="ai-chat-avatar">
              <Sprout size={18} />
            </div>
            <div>
              <strong>{currentTitle}</strong>
              <span>FarmSaathi · connected AI</span>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {isListening && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "0.78rem", color: "#b91c1c", fontWeight: 600, animation: "pulse 1.5s infinite" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#dc2626" }} />
                  Listening…
                </span>
              )}
              {speakingIndex !== null && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "0.78rem", color: "#15803d", fontWeight: 600 }}>
                  <Volume2 size={14} className="spin" />
                  Speaking…
                </span>
              )}
              <Badge kind="ai">VOICE READY</Badge>
            </div>
          </div>

          <div className="ai-context-row">
            <label htmlFor="ai-crop-context">
              <span><Sprout size={14} /> CROP CONTEXT</span>
            </label>
            <SelectInput
              label="Crop context"
              id="ai-crop-context"
              value={cropId}
              onChange={event => setCropId(event.target.value)}
              options={cropOptions}
            />
            <small>This crop is attached to your next message.</small>
          </div>

          <div className="ai-message-feed">
            {conversation.isLoading && <LoadingState label="Loading conversation…" />}
            {conversation.isError && <ErrorState message={errorMessage(conversation.error)} retry={() => void conversation.refetch()} />}
            {!messages.length && !conversation.isLoading && (
              <div className="ai-welcome">
                <div className="ai-welcome-symbol">
                  <Sprout size={32} />
                </div>
                <div className="eyebrow">YOUR FARM, YOUR QUESTIONS</div>
                <h2>A little context.<br /><em>A better conversation.</em></h2>
                <p>Ask about saved crop records, disease symptoms, weather or soil. FarmSaathi can respond in text and voice.</p>
                <div className="ai-suggestions">
                  {[
                    "What tasks are coming up?",
                    "What are the best companion crops for tomato?",
                    "How should I manage soil pH for beans?",
                    "Give me irrigation guidelines for flowering stage"
                  ].map(suggestion => (
                    <button key={suggestion} onClick={() => setMessage(suggestion)}>
                      {suggestion}
                      <ArrowRight size={14} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((item, index) => (
              <div
                className={`chat-message ${item.role === "user" ? "user-message" : "assistant-message"}`}
                key={`${item.created_at || index}-${index}`}
              >
                <div className={`chat-avatar ${item.role === "assistant" ? "assistant-avatar" : "user-avatar"}`}>
                  {item.role === "assistant" ? <Sprout size={16} /> : String(user?.full_name || "F").split(" ").map(x => x[0]).slice(0, 2).join("").toUpperCase()}
                </div>
                <div className="chat-bubble">
                  <div className="chat-message-head">
                    <strong>{item.role === "assistant" ? "FarmSaathi" : "You"}</strong>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      {item.role === "assistant" && item.content && (
                        <button
                          type="button"
                          className="icon-button"
                          style={{ width: "26px", height: "26px", color: speakingIndex === index ? "#16a34a" : "#64748b" }}
                          aria-label={speakingIndex === index ? "Stop voice readout" : "Listen to response"}
                          title={speakingIndex === index ? "Stop voice readout" : "Listen aloud"}
                          onClick={() => speak(item.content || "", index)}
                        >
                          {speakingIndex === index ? <VolumeX size={15} /> : <Volume2 size={15} />}
                        </button>
                      )}
                      <time>{timeLabel(item.created_at, language)}</time>
                    </div>
                  </div>

                  {item.role === "assistant" && item.availability === "unavailable" ? (
                    <div className="ai-unavailable-inline">
                      <span className="provider-status-dot" />
                      <strong>FarmSaathi provider unavailable</strong>
                      <p>Your question was saved, but an AI response could not be generated right now. No answer was fabricated.</p>
                    </div>
                  ) : (
                    <p style={{ whiteSpace: "pre-wrap" }}>{String(item.content || "")}</p>
                  )}

                  {item.role === "assistant" && item.confidence_reason && (
                    <small className="ai-confidence-note">{item.confidence_reason}</small>
                  )}
                  {item.role === "user" && item.input_type === "voice" && (
                    <Badge kind="info">Voice input</Badge>
                  )}
                </div>
              </div>
            ))}

            {send.isPending && (
              <div className="chat-message assistant-message">
                <div className="chat-avatar assistant-avatar">
                  <Sprout size={16} />
                </div>
                <div className="chat-bubble typing-bubble">
                  <LoaderCircle className="spin" size={16} /> Waiting for FarmSaathi…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="ai-safety-line">
            <ShieldCheck size={14} />
            <span>FarmSaathi will never alter your farm records without your explicit confirmation.</span>
          </div>

          {imagePreview && (
            <div className="ai-image-chip">
              <img src={imagePreview} alt="Photo attached to next message" />
              <span>{imageFile?.name || "Crop image"}{uploading ? " · uploading" : imageUploadId ? " · secure upload complete" : ""}</span>
              <button className="icon-button" aria-label="Remove attached image" onClick={() => { setImageFile(null); setImagePreview(""); setImageUploadId(""); }}>
                <X size={15} />
              </button>
            </div>
          )}

          <form className="ai-composer" onSubmit={submit}>
            <textarea
              aria-label="Your question for FarmSaathi"
              placeholder={isListening ? "Listening… speak now" : "Ask a question about your farm or speak…"}
              rows={2}
              maxLength={8000}
              value={message}
              onChange={event => setMessage(event.target.value)}
              onKeyDown={enterKey}
            />
            <div className="ai-composer-footer">
              <div className="ai-composer-tools">
                <label className="ai-attach-button" title="Attach a crop photo">
                  <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void attach(event.target.files?.[0])} />
                  <ImagePlus size={16} />
                  <span>Add a photo</span>
                </label>
                <button
                  type="button"
                  className={`button button-ghost ${isListening ? "listening-active" : ""}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    color: isListening ? "#dc2626" : "inherit",
                    fontWeight: isListening ? 700 : 500,
                  }}
                  onClick={() => toggleListening()}
                  title="Speak your question by voice"
                >
                  {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                  <span>{isListening ? "Listening…" : "Speak"}</span>
                </button>
                <span className="ai-char-count">{message.length}/8000</span>
              </div>
              <Button type="submit" disabled={!message.trim() || send.isPending || uploading}>
                {send.isPending ? "Sending…" : "Send"}
                <Send size={15} />
              </Button>
            </div>
          </form>
        </section>
      </div>

      <div className="ai-bottom-tools">
        <Card>
          <div className="ai-tool-intro">
            <span className="ai-mini-mark">
              <Check size={16} />
            </span>
            <div>
              <strong>Review actions before applying</strong>
              <small>Pending actions need an explicit decision from you.</small>
            </div>
          </div>
          <Button variant="secondary" onClick={() => setShowTaskDraft(!showTaskDraft)}>
            {showTaskDraft ? "Close draft" : "Prepare a task draft"}
            <ArrowRight size={14} />
          </Button>
        </Card>

        {showTaskDraft && (
          <Card className="task-draft-card">
            <div className="eyebrow">USER-CREATED ACTION</div>
            <h3>Draft a task for review.</h3>
            <p>This draft will not change your task list until you approve it below.</p>
            <form className="task-draft-form" onSubmit={createTaskDraft}>
              <TextInput label="Task title" id="draft-title" name="title" required minLength={3} placeholder="e.g. Review irrigation" />
              <TextInput label="Due date" id="draft-due" name="due_date" type="datetime-local" required />
              <SelectInput label="Priority" id="draft-priority" name="priority" defaultValue="normal" options={[{ value: "low", label: "Low" }, { value: "normal", label: "Normal" }, { value: "high", label: "High" }]} />
              <Button type="submit" disabled={createAction.isPending}>
                {createAction.isPending ? "Saving draft…" : "Save pending action"}
                <Plus size={15} />
              </Button>
            </form>
          </Card>
        )}

        {actions.isError && <ErrorState message="Action review list is unavailable." retry={() => void actions.refetch()} />}
        {pendingActions.map((action, index) => (
          <Card className="action-review-card" key={recordId(action) || index}>
            <div className="action-review-top">
              <Badge kind="warning">PENDING CONFIRMATION</Badge>
              <span>{String(action.action_type).replaceAll("_", " ")}</span>
            </div>
            <h3>{String(action.title || "Review proposed action")}</h3>
            <div className="action-review-payload">
              {Object.entries((action.payload || {}) as Record<string, unknown>).filter(([key]) => key !== "crop_id").map(([key, value]) => (
                <span key={key}>
                  {key.replaceAll("_", " ")}
                  <strong>{String(value ?? "—")}</strong>
                </span>
              ))}
            </div>
            <div className="action-review-footer">
              <span>Applying this action will update your records.</span>
              <div>
                <Button variant="ghost" disabled={actionDecision.isPending} onClick={() => actionDecision.mutate({ id: recordId(action), decision: "reject" })}>
                  <ThumbsDown size={14} /> Decline
                </Button>
                <Button disabled={actionDecision.isPending} onClick={() => { if (confirm("Apply this task action to your FarmSaathi records?")) actionDecision.mutate({ id: recordId(action), decision: "approve" }); }}>
                  <ThumbsUp size={14} /> Approve & apply
                </Button>
              </div>
            </div>
          </Card>
        ))}
        {actions.isLoading && <LoadingState label="Loading action reviews…" />}
        {!actions.isLoading && !actions.isError && !pendingActions.length && (
          <div className="no-actions">
            <Check size={15} /> No actions are waiting for review.
          </div>
        )}
      </div>
    </PageSurface>
  );
}
