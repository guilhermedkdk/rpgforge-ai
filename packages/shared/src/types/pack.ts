export type PackLicenseType = 'CC_BY_4_0';

export interface PackResponse {
  id: string;
  slug: string;
  name: string;
  version: string;
  description?: string;
  systemName: string;
  licenseType: PackLicenseType;
  licenseUrl?: string;
  attributionText: string;
  createdAt: string;
  updatedAt: string;
}
