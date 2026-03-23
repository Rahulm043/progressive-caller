import { z } from 'zod';

export const CampaignCreateSchema = z.object({
  name: z.string().min(1),
  startsAt: z.string().datetime().optional(),
  presetId: z.string().min(1),
  agentConfig: z.record(z.string(), z.any()).optional(),
  phoneNumbers: z.array(z.string().min(5)).min(1),
});

export type CampaignCreateInput = z.infer<typeof CampaignCreateSchema>;
