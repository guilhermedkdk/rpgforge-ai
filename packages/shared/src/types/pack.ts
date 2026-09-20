import type { RuleItemKind } from './ruleitem';

export type PackLicenseType = 'CC_BY_4_0';

export interface PackResponse {
  id: string;
  slug: string;
  name: string;
  version: string;
  description?: string;
  systemName: string;
  externalKey?: string;
  apiVersionHint?: string;
  publisherName?: string;
  permalink?: string;
  licenseType: PackLicenseType;
  licenseUrl?: string;
  attributionText: string;
  isEnabled: boolean;
  /** Rule items per kind. Only the `/packs` routes carry it; a sheet payload's pack does not. */
  itemCounts?: Partial<Record<RuleItemKind, number>>;
  createdAt: string;
  updatedAt: string;
}
