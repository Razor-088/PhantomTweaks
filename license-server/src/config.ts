export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',

  databaseUrl: process.env.DATABASE_URL || '',
  licenseServerSecret: process.env.LICENSE_SERVER_SECRET || '',
  jwtSecret: process.env.JWT_SECRET || '',

  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || '',

  sellauthApiKey: process.env.SELLAUTH_API_KEY || '',
  sellauthShopId: process.env.SELLAUTH_SHOP_ID || '',
  sellauthWebhookSecret: process.env.SELLAUTH_WEBHOOK_SECRET || '',

  licenseServerUrl: process.env.LICENSE_SERVER_URL || 'http://localhost:3000',
  offlineGraceDays: parseInt(process.env.OFFLINE_GRACE_DAYS || '7', 10),
  tokenExpiryHours: parseInt(process.env.TOKEN_EXPIRY_HOURS || '24', 10),

  storeUrl: process.env.STORE_URL || 'https://phantontweaks.sellauth.com',

  // Product ID → license type mapping (e.g. "123:lifetime,456:30d,789:1y")
  sellauthProductMap: process.env.SELLAUTH_PRODUCT_MAP || '',
};
