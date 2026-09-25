import {
  PackageSearchQueryDto,
  PackageSearchResultDto,
  SearchPaginationMetaDto,
  packageSearchQuerySchema,
} from '../../../../../shared/src/index.js';
import { PackageSearchRepository } from '../repositories/packageSearch.repository.js';

export interface PackageSearchResultResponse {
  items: PackageSearchResultDto[];
  pagination: SearchPaginationMetaDto;
}

/**
 * PackageSearchService: Orchestrates multi-criteria package searches, canonical sorting, and pagination.
 *
 * Core Principles:
 * - Decoupled from SQL/data access (delegates strictly to PackageSearchRepository).
 * - Validates & normalizes inputs using the frozen shared Zod schema (packageSearchQuerySchema).
 * - Computes standardized SearchPaginationMetaDto metadata.
 * - Handles empty search states gracefully by returning items: [] (FR-SEARCH-003).
 */
export class PackageSearchService {
  constructor(private readonly searchRepo: PackageSearchRepository) {}

  /**
   * Search published tour packages using multi-criteria filters, canonical sorting, and pagination.
   */
  async searchPackages(query: PackageSearchQueryDto = {}): Promise<PackageSearchResultResponse> {
    // 1. Validate & normalize input through shared schema
    const validatedQuery = packageSearchQuerySchema.parse(query);

    // 2. Delegate data access to repository
    const result = await this.searchRepo.searchPackages(validatedQuery);

    // 3. Compute pagination metadata
    const page = validatedQuery.page ?? 1;
    const limit = validatedQuery.limit ?? 12;
    const total = result.total;
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    const pagination: SearchPaginationMetaDto = {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };

    // 4. Return formatted response (FR-SEARCH-003: valid empty array for 0 matches)
    return {
      items: result.items,
      pagination,
    };
  }
}
