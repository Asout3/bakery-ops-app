const railwayEnvironmentName = process.env.RAILWAY_ENVIRONMENT_NAME?.toLowerCase();

export const isRailwayRuntime = Boolean(process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID);

export const isProductionRuntime = process.env.NODE_ENV === 'production'
  || railwayEnvironmentName === 'production'
  || process.env.APP_ENV === 'production';

export const deploymentPlatform = isRailwayRuntime ? 'railway' : 'generic';
