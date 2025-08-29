import { logger, task } from '@trigger.dev/sdk/v3';
import { prisma } from '@/lib/prisma';

export const checkDb = task({
  id: 'check-db-connectivity',
  // Keep it lightweight; you can run this ad hoc from the Trigger.dev UI
  run: async () => {
    try {
      // Simple connectivity check
      const result = await prisma.$queryRawUnsafe('SELECT 1 AS ok');
      logger.log('DB connectivity OK', { result });
      return { ok: true };
    } catch (error) {
      // Log and rethrow so the run shows as failed
      logger.error('DB connectivity failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
});
