import { ValidateBy, type ValidationOptions } from 'class-validator';
import { normalizeLeadPhone, PHONE_HELP } from './intake-parsing.js';

/**
 * A lead's phone, checked with the one phone rule (normalizeLeadPhone). Pair it
 * with a @Transform that normalises the value first; anything the rule can't
 * turn into a number ("1234567890", "12345", words, blank) is refused.
 */
export function IsLeadPhone(options?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isLeadPhone',
      validator: {
        validate: (value: unknown) => typeof value === 'string' && normalizeLeadPhone(value) === value,
        defaultMessage: () => `phone isn't a valid number. ${PHONE_HELP}`,
      },
    },
    options,
  );
}
