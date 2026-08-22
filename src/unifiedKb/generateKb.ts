import Anthropic from '@anthropic-ai/sdk';
import { buildSystemBlocks, buildUserMessage, type StaticKbContext } from './promptBuilder.js';
import { parseKbDoc, validateKbDoc } from '../kb/kbDocParser.js';
import type { CompanyProfile } from '../company/types.js';
import type { KbDoc } from '../kb/types.js';

export interface GenerateKbSuccess {
  ok: true;
  kbDoc: KbDoc;
  rawMarkdown: string;
}
export interface GenerateKbFailure {
  ok: false;
  reason: string;
}
export type GenerateKbResult = GenerateKbSuccess | GenerateKbFailure;

/** Only the surface generateKb actually calls, pinned to the non-streaming overload we always
 * use — lets tests inject a plain fake object instead of needing to structurally satisfy the
 * full overloaded Anthropic client method. */
export interface AnthropicMessagesClient {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
}

export interface GenerateKbDeps {
  apiKey: string;
  staticContext: StaticKbContext;
  /** Injectable for tests; defaults to a real Anthropic client built from apiKey. */
  client?: AnthropicMessagesClient;
}

/** Not verified against the live Claude API from this environment — there's no Anthropic API
 * key available in this session (this session's own Claude access isn't exposed as a usable API
 * key to code it runs). Built and tested against a mocked client; see src/unifiedKb/README.md. */
export async function generateKb(
  profile: CompanyProfile,
  verticalText: string,
  niche: string,
  deps: GenerateKbDeps,
): Promise<GenerateKbResult> {
  const client = deps.client ?? new Anthropic({ apiKey: deps.apiKey });

  let response: Awaited<ReturnType<AnthropicMessagesClient['messages']['create']>>;
  try {
    response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
      system: buildSystemBlocks(deps.staticContext, verticalText),
      messages: [{ role: 'user', content: buildUserMessage(profile, niche) }],
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return { ok: false, reason: `Claude API error (${err.status}): ${err.message}` };
    }
    return { ok: false, reason: `Claude API call failed: ${(err as Error).message}` };
  }

  if (response.stop_reason === 'refusal') {
    return { ok: false, reason: 'Claude refused to generate this KB (safety classifier).' };
  }

  const markdown = response.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('\n')
    .trim();

  if (!markdown) {
    return { ok: false, reason: 'Claude returned no text content.' };
  }

  const kbDoc = parseKbDoc(markdown);
  const validation = validateKbDoc(kbDoc);
  if (!validation.ok) {
    return {
      ok: false,
      reason:
        `Generated KB is missing required section(s): §${validation.missingRequiredSections.join(', §')}. ` +
        'Refusing to hand back an invalid KB rather than silently accepting it.',
    };
  }

  return { ok: true, kbDoc, rawMarkdown: markdown };
}
