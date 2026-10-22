import { guardrailConstraints, mandateConstraints } from './policy';
import { proveMandateWithinGuardrails } from './prover';
import { narrowMandate, relaxGuardrails, type RepairInput } from './repair';
import type { Guardrails, Mandate, ProofResult, Suggestion } from './types';

export const proveMandate = (mandate: Mandate, guardrails: Guardrails, spentTodayCents: number): Promise<ProofResult> =>
  proveMandateWithinGuardrails({
    mandate: mandateConstraints(mandate),
    guardrails: guardrailConstraints(guardrails),
    spentTodayBeforeTaskCents: spentTodayCents,
  });

const isProven = async (s: Suggestion, input: RepairInput): Promise<boolean> => {
  const mandate = s.kind === 'narrow-mandate' ? s.mandate : input.mandate;
  const guardrails = s.kind === 'relax-guardrails' ? s.guardrails : input.guardrails;
  return (await proveMandate(mandate, guardrails, input.spentTodayCents)).status === 'proven';
};

/** Only suggestions that Z3 confirms actually resolve the conflict are returned. */
export const suggestFixes = async (input: RepairInput): Promise<Suggestion[]> => {
  const candidates = [narrowMandate(input), relaxGuardrails(input)].filter((s): s is Suggestion => s !== null);
  const verified: Suggestion[] = [];
  for (const candidate of candidates) {
    if (await isProven(candidate, input)) verified.push(candidate);
  }
  return verified;
};
