import { describe, expect, it } from 'vitest';
import { parseCapture } from './paymentGateway';

describe('parseCapture', () => {
  it('reads the order from the toolkit wrapper', () => {
    expect(parseCapture({ status: 'success', response: { id: '96U64057GJ6679728', status: 'COMPLETED', links: [] } })).toEqual({
      orderId: '96U64057GJ6679728',
      status: 'COMPLETED',
    });
  });

  it('fails clearly when PayPal reports an error', () => {
    expect(() => parseCapture({ status: 'error', response: { name: 'UNPROCESSABLE_ENTITY' } })).toThrow(
      'PayPal did not capture the payment',
    );
  });
});
