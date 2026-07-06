import type { PackLicenseType } from '@rpgforce-ai/shared';

const LICENSE_LABELS: Record<PackLicenseType, string> = {
  CC_BY_4_0: 'CC BY 4.0',
};

export const licenseLabel = (type: PackLicenseType): string => LICENSE_LABELS[type] ?? type;
