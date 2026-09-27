import {
  CreateDepartureInput,
  DepartureDto,
  DepartureStatus,
  UpdateDepartureInput,
} from '../../../../../shared/src/index.js';
import { DepartureService } from '../../inventory/services/departure.service.js';
import {
  DepartureRepository,
  DepartureListOptions,
} from '../../inventory/repositories/departure.repository.js';
import { AdminAuditLogService } from './adminAuditLog.service.js';

export class AdminDepartureService {
  constructor(
    private readonly departureService: DepartureService,
    private readonly departureRepo: DepartureRepository,
    private readonly auditLogService: AdminAuditLogService,
  ) {}

  /**
   * Admin schedules a new departure.
   */
  async createDeparture(
    adminId: string,
    input: CreateDepartureInput,
    ipAddress?: string | null,
  ): Promise<DepartureDto> {
    const departure = await this.departureService.createDeparture(input);

    await this.auditLogService.logAction({
      adminId,
      action: 'DEPARTURE_CREATE',
      entityType: 'DEPARTURE',
      entityId: departure.id,
      details: {
        packageId: departure.packageId,
        departureDate: departure.departureDate,
        totalCapacity: departure.totalSeatCapacity,
      },
      ipAddress,
    });

    return departure;
  }

  /**
   * Admin updates a departure (e.g. capacity, dates, prices).
   */
  async updateDeparture(
    adminId: string,
    id: string,
    input: UpdateDepartureInput,
    ipAddress?: string | null,
  ): Promise<DepartureDto> {
    const updated = await this.departureService.updateDeparture(id, input);

    await this.auditLogService.logAction({
      adminId,
      action: 'DEPARTURE_UPDATE',
      entityType: 'DEPARTURE',
      entityId: id,
      details: { changes: input },
      ipAddress,
    });

    return updated;
  }

  /**
   * Admin changes departure operational status (OPEN, CLOSED, CANCELLED, COMPLETED).
   */
  async setDepartureStatus(
    adminId: string,
    id: string,
    status: DepartureStatus,
    ipAddress?: string | null,
  ): Promise<DepartureDto> {
    const updated = await this.departureService.updateDeparture(id, { status });

    await this.auditLogService.logAction({
      adminId,
      action: 'DEPARTURE_UPDATE',
      entityType: 'DEPARTURE',
      entityId: id,
      details: { status },
      ipAddress,
    });

    return updated;
  }

  /**
   * Admin deletes a departure (blocked if confirmed bookings or active holds exist).
   */
  async deleteDeparture(adminId: string, id: string, ipAddress?: string | null): Promise<void> {
    await this.departureService.deleteDeparture(id);

    await this.auditLogService.logAction({
      adminId,
      action: 'DEPARTURE_DELETE',
      entityType: 'DEPARTURE',
      entityId: id,
      details: { deleted: true },
      ipAddress,
    });
  }

  /**
   * List departures for a package with administrative filters and pagination.
   */
  async listDepartures(packageId: string, options: DepartureListOptions = {}) {
    return this.departureRepo.listByPackageId(packageId, options);
  }

  /**
   * Retrieve single departure by ID.
   */
  async getDepartureById(id: string) {
    return this.departureRepo.findById(id);
  }
}
