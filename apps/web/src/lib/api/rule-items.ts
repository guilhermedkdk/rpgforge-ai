import apiClient from './client';
import type {
  RuleItemResponse,
  RuleItemListParams,
  RuleItemListResult,
  RuleItemBatchRequest,
  RuleItemBatchResult,
} from '@rpgforce-ai/shared';

export const ruleItemsApi = {
  getList: async (params: RuleItemListParams = {}): Promise<RuleItemListResult> => {
    const searchParams = new URLSearchParams();
    if (params.packId) searchParams.set('packId', params.packId);
    if (params.type) searchParams.set('type', params.type);
    if (params.q) searchParams.set('q', params.q);
    if (params.level != null) searchParams.set('level', String(params.level));
    if (params.class) searchParams.set('class', params.class);
    if (params.tags?.length) {
      params.tags.forEach((t) => searchParams.append('tag', t));
    } else if (params.tag) {
      searchParams.set('tag', params.tag);
    }
    if (params.limit != null) searchParams.set('limit', String(params.limit));
    if (params.offset != null) searchParams.set('offset', String(params.offset));
    if (params.includeRaw === false) searchParams.set('includeRaw', 'false');
    const query = searchParams.toString();
    const url = query ? `/rule-items?${query}` : '/rule-items';
    const response = await apiClient.get<RuleItemListResult>(url);
    return response.data;
  },

  /** Runs several list queries in one request; results are keyed by each query's `key`. */
  getBatch: async (request: RuleItemBatchRequest): Promise<RuleItemBatchResult> => {
    const response = await apiClient.post<RuleItemBatchResult>('/rule-items/batch', request);
    return response.data;
  },

  getByIdOrSlug: async (
    idOrSlug: string,
    packId?: string
  ): Promise<RuleItemResponse> => {
    const params = packId ? `?packId=${encodeURIComponent(packId)}` : '';
    const response = await apiClient.get<RuleItemResponse>(
      `/rule-items/${encodeURIComponent(idOrSlug)}${params}`
    );
    return response.data;
  },
};
