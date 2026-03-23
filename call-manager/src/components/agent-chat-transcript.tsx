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
              ? 'border-[var(--accent-glow)] bg-[var(--accent-soft)]'
              : 'border-[var(--card-border)] bg-[var(--background-elevated)]';
          const labelClasses =
            messageOrigin === 'user'
              ? 'text-[var(--accent)]'
              : 'text-[var(--foreground-muted)]';

          return (
            <div
              key={id}
              className={`w-full rounded-2xl border px-5 py-4 shadow-sm transition-all duration-300 hover:shadow-md ${accentClasses} ${messageOrigin === 'user' ? 'ml-auto max-w-[85%]' : 'mr-auto max-w-[85%]'
                }`}
            >
              <div className="flex items-center justify-between gap-3 text-[0.65rem] font-bold uppercase tracking-[0.1em]">
                <span className={labelClasses}>{messageOrigin === 'user' ? 'Caller' : 'Agent'}</span>
                <span className="text-[var(--foreground-muted)] opacity-50">{title}</span>
              </div>
              <div className="mt-3 whitespace-pre-wrap text-[0.95rem] leading-7 text-[var(--foreground)]">
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
