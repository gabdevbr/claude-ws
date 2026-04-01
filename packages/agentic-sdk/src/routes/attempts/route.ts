/**
 * POST /api/attempts — create a new attempt and start the agent.
 * Thin transport adapter — all business logic lives in attempt-creation-orchestrator.
 */
import { FastifyInstance } from 'fastify';
import { SessionManager } from '../../lib/session-manager';
import { createAttemptOrchestrator, AttemptValidationError } from '../../services/attempt/attempt-creation-orchestrator';
import { extractProviderOverrides } from '../../config/env-config';

export default async function attemptRoot(fastify: FastifyInstance) {
  const sessionManager = new SessionManager(fastify.db);

  const orchestrator = createAttemptOrchestrator({
    taskService: fastify.services.task,
    projectService: fastify.services.project,
    attemptService: fastify.services.attempt,
    forceCreateService: fastify.services.forceCreate,
    sessionManager,
    startAgent: (params) => fastify.agentManager.start(params),
    defaultBasePath: fastify.envConfig.dataDir,
  });

  fastify.post('/api/attempts', async (request, reply) => {
    try {
      // Extract provider key overrides from proxy-injected headers
      const providerKeys = extractProviderOverrides(request.headers as Record<string, string | string[] | undefined>);
      const body = request.body as any;
      const input = Object.keys(providerKeys).length > 0 ? { ...body, providerKeys } : body;
      const result = await orchestrator.createAndRun(input);

      if (result.type === 'file') {
        reply.header('Content-Type', result.contentType);
        return reply.code(200).send(result.content);
      }
      return reply.code(result.statusCode).send(result.data);
    } catch (error: any) {
      if (error instanceof AttemptValidationError) {
        return reply.code(error.statusCode).send({ error: error.message });
      }
      request.log.error({ err: error }, 'Failed to create attempt');
      return reply.code(500).send({ error: 'Failed to create attempt' });
    }
  });
}
