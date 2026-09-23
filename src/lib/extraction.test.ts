import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { ExtractionError, buildPrompt, extractWithClaude, validateExtraction } from './extraction';

const good = {
  isExpectedDocument: true, documentCheckReason: 'Es un Modelo 303.',
  fields: [
    { key: 'base_21', value: '310.000,00', page: 1, quote: '[07] Base imponible al 21 % 310.000,00' },
    { key: 'quarter', value: '2', page: 1, quote: 'Periodo 2T' },
  ],
};

function fakeClient(respond: (params: Record<string, unknown>) => unknown) {
  const calls: Record<string, unknown>[] = [];
  const client = { beta: { messages: { parse: async (params: Record<string, unknown>) => { calls.push(params); return respond(params); } } } };
  return { client: client as unknown as Pick<Anthropic, 'beta'>, calls };
}

describe('validateExtraction', () => {
  it('normalizes values and keeps page and quote', () => {
    expect(validateExtraction('modelo_303', good)).toEqual([
      { key: 'base_21', value: '310000.00', page: 1, quote: '[07] Base imponible al 21 % 310.000,00' },
      { key: 'quarter', value: '2', page: 1, quote: 'Periodo 2T' },
    ]);
  });
  it.each([
    ['unknown key', { ...good, fields: [{ key: 'revenue', value: '1', page: 1, quote: 'x' }] }],
    ['duplicate key', { ...good, fields: [good.fields[0], good.fields[0]] }],
    ['unparsable amount', { ...good, fields: [{ ...good.fields[0], value: 'unos 300 mil' }] }],
    ['missing quote', { ...good, fields: [{ ...good.fields[0], quote: '  ' }] }],
    ['page zero', { ...good, fields: [{ ...good.fields[0], page: 0 }] }],
    ['not an object', null],
  ])('fails the whole extraction on %s', (_name, raw) => {
    expect(() => validateExtraction('modelo_303', raw)).toThrow(ExtractionError);
  });
  it('rejects a document of the wrong type with the model explanation', () => {
    expect(() => validateExtraction('modelo_303', { ...good, isExpectedDocument: false, documentCheckReason: 'Es un balance.' }))
      .toThrow(/no parece ser modelo 303.*Es un balance/);
  });
});

describe('extractWithClaude', () => {
  const pdf = new TextEncoder().encode('%PDF-1.4 test');

  it('sends the PDF as a document block with structured output and fallbacks', async () => {
    const { client, calls } = fakeClient(() => ({ stop_reason: 'end_turn', model: 'claude-opus-5', parsed_output: good }));
    const result = await extractWithClaude('modelo_303', pdf, client);
    expect(result.model).toBe('claude-opus-5');
    expect(result.fields).toHaveLength(2);
    const params = calls[0] as { model: string; fallbacks: string; betas: string[]; output_config: { format: unknown }; messages: { content: { type: string; source?: { media_type: string; data: string } }[] }[] };
    expect(params.model).toBe('claude-opus-5');
    expect(params.fallbacks).toBe('default');
    expect(params.betas).toContain('server-side-fallback-2026-07-01');
    expect(params.output_config.format).toBeTruthy();
    const [docBlock, textBlock] = params.messages[0]!.content;
    expect(docBlock!.type).toBe('document');
    expect(Buffer.from(docBlock!.source!.data, 'base64').toString()).toBe('%PDF-1.4 test');
    expect(textBlock!.type).toBe('text');
  });

  it('maps refusals, truncation and API errors to extraction errors', async () => {
    const cases: [() => unknown, string][] = [
      [() => ({ stop_reason: 'refusal', model: 'm', parsed_output: null }), 'refused'],
      [() => ({ stop_reason: 'max_tokens', model: 'm', parsed_output: null }), 'invalid_response'],
      [() => ({ stop_reason: 'end_turn', model: 'm', parsed_output: null }), 'invalid_response'],
      [() => { throw new Anthropic.RateLimitError(429, undefined, 'rate', new Headers()); }, 'rate_limit'],
      [() => { throw new Anthropic.APIConnectionTimeoutError(); }, 'timeout'],
      [() => { throw new Anthropic.AuthenticationError(401, undefined, 'auth', new Headers()); }, 'not_configured'],
      [() => { throw new Error('boom'); }, 'provider'],
    ];
    for (const [respond, code] of cases) {
      const { client } = fakeClient(respond);
      await expect(extractWithClaude('modelo_303', pdf, client)).rejects.toMatchObject({ code });
    }
  });

  it('refuses to run without an API key', async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    await expect(extractWithClaude('modelo_303', pdf)).rejects.toMatchObject({ code: 'not_configured' });
    if (saved) process.env.ANTHROPIC_API_KEY = saved;
  });

  it('lists every field with its casilla in the prompt', () => {
    const prompt = buildPrompt('modelo_303');
    expect(prompt).toContain('base_21: Base imponible al 21 % (casilla [07])');
    expect(prompt).toContain('resultado_liquidacion');
  });
});
