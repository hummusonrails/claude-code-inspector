// pro module loader — active version
// this file is copied over pro-loader.ts when building with pro analytics
// cp src/pro-loader.pro.ts src/pro-loader.ts && npm run build

import { AnalyticsDashboard } from '@hummusonrails/cci-pro';
import { validateLicense, getStoredLicense, storeLicense } from '@hummusonrails/cci-pro';

const proModule = {
  AnalyticsDashboard,
  validateLicense,
  getStoredLicense,
  storeLicense,
};

export default proModule;
