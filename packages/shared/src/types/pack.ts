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
  createdAt: string;
  updatedAt: string;
}
