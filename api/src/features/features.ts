import { SetMetadata } from '@nestjs/common';

/**
 * Product switch. The live product is the sales + telecaller + admin CRM; the
 * "operations" modules (finance, stock, vendors, service, installations, HR
 * leave/holidays/LOP/allowances) are hidden unless OPERATIONS_ENABLED is on.
 * Their code and tables are untouched, so switching it on brings them back.
 * Read on every request, so a restart with the new value is all it takes.
 */
export const operationsEnabled = () => /^(1|true|yes|on)$/i.test((process.env.OPERATIONS_ENABLED ?? '').trim());

export const OPERATIONS_FEATURE_KEY = 'feature:operations';

/** Marks a controller (or route) as part of the operations modules. */
export const OperationsFeature = () => SetMetadata(OPERATIONS_FEATURE_KEY, true);
