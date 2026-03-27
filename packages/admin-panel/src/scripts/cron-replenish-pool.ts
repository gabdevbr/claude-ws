#!/usr/bin/env tsx
/**
 * Cron Job: Pool Replenishment
 * Schedule: Every 5 minutes (cron: 5 asterisks)
 * Description: Ensures pool always has 5 idle containers ready
 */

import { containerPoolManager } from '@/lib/container-pool-manager';
import { createLogger } from '@/lib/logger';

const log = createLogger('Cron-ReplenishPool');

async function replenishPool() {
  try {
    await containerPoolManager.replenishPool();
    log.info('✅ Pool replenished successfully');
  } catch (error) {
    log.error('❌ Pool replenishment failed:', String(error));
  }
}

if (require.main === module) {
  replenishPool();
}

export { replenishPool };
