import {
  AdminDashboardStatsDto,
  adminDashboardStatsSchema,
} from '../../../../../shared/src/index.js';
import { AdminDashboardRepository } from '../repositories/adminDashboard.repository.js';

export class AdminDashboardService {
  constructor(private readonly dashboardRepo: AdminDashboardRepository) {}

  /**
   * Retrieves high-level operational statistics and KPI counts.
   * Note: Does NOT compute or aggregate financial revenue, preserving the frozen [UNKNOWN] revenue status.
   */
  async getDashboardStats(): Promise<AdminDashboardStatsDto> {
    const rawStats = await this.dashboardRepo.getOperationalStats();
    return adminDashboardStatsSchema.parse(rawStats);
  }
}
