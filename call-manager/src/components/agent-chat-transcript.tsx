'use client';

import { type ComponentProps } from 'react';
import { type AgentState } from '@livekit/components-react';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { AgentChatIndicator } from '@/components/agent-chat-indicator';
import { AnimatePresence } from 'motion/react';

export interface TranscriptMessage {
  id: string;
  timestamp: number;
  from: {
    isLocal: boolean;
  };
  message: string;
}

/**
 * Props for the AgentChatTranscript component.
 */
export interface AgentChatTranscriptProps extends ComponentProps<'div'> {
  /**
   * The current state of the agent. When 'thinking', displays a loading indicator.
   */
  agentState?: AgentState;
  /**
   * Array of messages to display in the transcript.
   * @defaultValue []
   */
  messages?: TranscriptMessage[];
  /**
   * Additional CSS class names to apply to the conversation container.
   */
  className?: string;
}

/**
 * A chat transcript component that displays a conversation between the user and agent.
 * Shows messages with timestamps and origin indicators, plus a thinking indicator
 * when the agent is processing.
 *
 * @extends ComponentProps<'div'>
 *
 * @example
 * ```tsx
 * <AgentChatTranscript
 *   agentState={agentState}
 *   messages={chatMessages}
 * />
 * ```
 */
export function AgentChatTranscript({
  agentState,
  messages = [],
  className,
  ...props
}: AgentChatTranscriptProps) {
  return (
    <Conversation className={className} {...props}>
      <ConversationContent>
        {messages.map((receivedMessage) => {
          const { id, timestamp, from, message } = receivedMessage;
          const locale = navigator?.language ?? 'en-US';
          const messageOrigin = from?.isLocal ? 'user' : 'assistant';
          const time = new Date(timestamp);
          const title = time.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
          const accentClasses =
            messageOrigin === 'user'
              ? 'border-cyan-500/20 bg-cyan-500/8'
              : 'border-emerald-500/20 bg-emerald-500/8';
          const labelClasses =
            messageOrigin === 'user'
              ? 'text-cyan-200'
              : 'text-emerald-200';

          return (
            <div
              key={id}
              className={`w-full rounded-2xl border px-4 py-3 shadow-sm ${accentClasses} ${
                messageOrigin === 'user' ? 'ml-auto max-w-[92%]' : 'mr-auto max-w-[92%]'
              }`}
            >
              <div className="flex items-center justify-between gap-3 text-[0.72rem] uppercase tracking-[0.14em] text-slate-400">
                <span className={labelClasses}>{messageOrigin === 'user' ? 'Caller' : 'Agent'}</span>
                <span>{title}</span>
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-100">
                {message}
              </div>
            </div>
          );
        })}
        <AnimatePresence>
          {agentState === 'thinking' && <AgentChatIndicator size="sm" />}
        </AnimatePresence>
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
