import { NextResponse } from 'next/server';
import { AccessToken, AgentDispatchClient } from 'livekit-server-sdk';
import { resolveAgentRuntimeConfig, type AgentRuntimeConfig } from '@/lib/agent-presets';

const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

const TEST_AGENT_NAME = 'outbound-caller';

const createRandomSuffix = () => Math.random().toString(36).slice(2, 10);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const agentConfig = body?.agentConfig as Partial<AgentRuntimeConfig> | undefined;
    const presetId = agentConfig?.presetId;
    const resolvedAgentConfig = resolveAgentRuntimeConfig(presetId, agentConfig);

    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
      return NextResponse.json({ error: 'LiveKit configuration missing' }, { status: 500 });
    }

    const roomName = typeof body?.roomName === 'string' && body.roomName.trim()
      ? body.roomName.trim()
      : `web-test-${Date.now()}-${createRandomSuffix()}`;
    const identity = typeof body?.identity === 'string' && body.identity.trim()
      ? body.identity.trim()
      : `frontend-${createRandomSuffix()}`;
    const displayName = typeof body?.displayName === 'string' && body.displayName.trim()
      ? body.displayName.trim()
      : 'Frontend Tester';

    const dispatchClient = new AgentDispatchClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    const dispatch = await dispatchClient.createDispatch(
      roomName,
      TEST_AGENT_NAME,
      {
        metadata: JSON.stringify({
          source: 'web-test',
          test_mode: true,
          preset_id: resolvedAgentConfig.presetId,
          agent_config: resolvedAgentConfig,
        }),
      },
    );

    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
      name: displayName,
      ttl: '1h',
    });
    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return NextResponse.json({
      success: true,
      roomName,
      identity,
      dispatchId: dispatch.id,
      token: await token.toJwt(),
      presetId: resolvedAgentConfig.presetId,
    });
  } catch (error: unknown) {
    console.error('Web test token error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal Server Error',
      },
      { status: 500 },
    );
  }
}
