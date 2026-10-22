import { z } from 'zod';
import { CATEGORIES } from '../core/types';

const cents = z.number().int().min(0);

export const CategorySchema = z.enum(CATEGORIES);

export const GuardrailsSchema = z.object({
  maxPerPaymentCents: cents,
  dailyLimitCents: cents,
  blockedCategories: z.array(CategorySchema),
  allowedMerchants: z.array(z.string().min(1)).nullable(),
});

export const MandateSchema = z.object({
  goal: z.string().min(1),
  budgetCents: cents,
  maxPerPaymentCents: cents.nullable(),
  allowedCategories: z.array(CategorySchema).min(1),
  allowedMerchants: z.array(z.string().min(1)).nullable(),
  maxItems: z.number().int().min(1),
});

/** Shape the LLM fills in. Dollars are easier for a model than cents. */
export const LlmMandateSchema = z.object({
  goal: z.string().describe('One sentence: what the user wants bought'),
  budgetUsd: z.number().positive().describe('Total budget for this task in USD, as stated by the user'),
  maxPerPaymentUsd: z
    .number()
    .positive()
    .nullable()
    .describe('Per-purchase cap in USD only if the user stated one, otherwise null'),
  allowedCategories: z
    .array(CategorySchema)
    .min(1)
    .describe('Only the product categories needed for this goal'),
  allowedMerchants: z
    .array(z.string())
    .nullable()
    .describe('Merchant ids the user explicitly named, or null if they did not restrict merchants'),
  maxItems: z.number().int().min(1).describe('Maximum quantity per payment implied by the request'),
});

export const CreateTaskSchema = z.object({
  prompt: z.string().min(1),
  mandate: MandateSchema.optional(),
  origin: z.enum(['console', 'mcp']).default('console'),
});

export const CheckoutRequestSchema = z.object({
  productId: z.string().describe('Product id from search results'),
  quantity: z.number().int().min(1).describe('Quantity to buy'),
});
