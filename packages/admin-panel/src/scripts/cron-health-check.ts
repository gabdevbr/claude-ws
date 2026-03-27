#!/usr/bin/env tsx
/**
 * Cron Job: Container Health Check
 * Schedule: * * * * * (every minute)
 * Description: Monitors health of all pool containers
 */

import { containerPoolManager } from '@/lib/container-pool-manager';
import { createLogger } from '@/lib/logger';

const log = createLogger('Cron-HealthCheck');

async function healthCheck() {
  try {
    await containerPoolManager.healthCheck();
    log.debug('✅ Health check completed');
  } catch (error) {
    log.error('❌ Health check failed:', String(error));
  }
}

if (require.main === module) {
  healthCheck();
}

export { healthCheck };
