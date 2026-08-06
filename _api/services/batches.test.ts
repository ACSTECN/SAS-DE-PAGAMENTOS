import { describe, expect, it } from 'vitest';
import { validateRows } from './batches.js';

describe('validateRows', () => {
  it('separa linhas válidas e inválidas corretamente', () => {
    const result = validateRows([
      {
        payment_id: 'pg-1',
        recipient_name: 'Maria',
        recipient_document: '12345678901',
        pix_key: 'maria@email.com',
        amount: '100.50',
        description: 'Pagamento 1',
      },
      {
        payment_id: 'pg-1',
        recipient_name: '',
        recipient_document: '12345678901',
        pix_key: 'x',
        amount: '0',
        description: 'Pagamento 2',
      },
    ]);

    expect(result.summary.totalItems).toBe(2);
    expect(result.summary.totalValidItems).toBe(1);
    expect(result.summary.totalInvalidItems).toBe(1);
    expect(result.validRows[0].amount).toBe(100.5);
    expect(result.invalidRows[0].error).toContain('payment_id duplicado no lote');
  });
});
