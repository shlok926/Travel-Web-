import { FastifyReply, FastifyRequest } from 'fastify';
import { AdminDashboardService } from '../services/adminDashboard.service.js';

export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  /**
   * GET /api/v1/admin/dashboard/stats
   * Retrieve operational KPI counts and utilization metrics.
   * Note: Revenue aggregation semantics remain strictly [UNKNOWN] and are excluded.
   */
  getStats = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const stats = await this.dashboardService.getDashboardStats();

    return reply.status(200).send({
      success: true,
      data: stats,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };
}
