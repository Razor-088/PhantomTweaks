import { Router, Request, Response } from 'express';
import { config } from '../config';
import { createLicense, getLicenseByOrder, logActivity } from '../services/licenseService';
import { verifyWebhookSignature } from '../utils/crypto';
import { log } from '../utils/logger';

const router = Router();

// ── SellAuth Dynamic Delivery payload types ──
interface SellAuthItem {
  id: number;
  invoice_id: number;
  product_id: number;
  variant_id: number;
  status: string;
  price: string;
  quantity: number;
  total_price: string;
  custom_fields?: Record<string, string>;
}

interface SellAuthCustomer {
  id: number;
  shop_id: number;
  email: string;
}

interface SellAuthDynamicWebhook {
  event: string;
  id: number;
  unique_id: string;
  status: string;
  email: string;
  ip: string;
  country_code: string;
  shop_id: number;
  shop_customer_id: number;
  created_at: string;
  completed_at: string;
  customer: SellAuthCustomer;
  item: SellAuthItem;
}

router.post('/webhooks/sellauth', async (req: Request, res: Response) => {
  // ── 1. Verify signature ──
  const rawBody = (req as any).rawBody as string | undefined;
  const signature = req.headers['x-signature'] as string | undefined;

  if (!config.sellauthWebhookSecret) {
    log('ERROR', 'webhook', 'SELLAUTH_WEBHOOK_SECRET not configured — rejecting webhook.');
    return res.status(500).send('Server misconfiguration');
  }

  if (!rawBody || !signature) {
    log('WARN', 'webhook', 'Missing raw body or signature header');
    return res.status(401).send('Missing signature');
  }

  if (!verifyWebhookSignature(rawBody, signature, config.sellauthWebhookSecret)) {
    log('WARN', 'webhook', 'Invalid webhook signature');
    return res.status(401).send('Invalid signature');
  }

  const event: SellAuthDynamicWebhook = req.body;

  log('INFO', 'webhook', `Webhook recibido: event=${event.event} invoice=${event.id} item_id=${event.item?.id}`);

  // ── 2. Only handle DYNAMIC DELIVERY events ──
  if (event.event !== 'INVOICE.ITEM.DELIVER-DYNAMIC') {
    log('INFO', 'webhook', `Evento ignorado: ${event.event}`);
    return res.status(200).send('Event type not handled');
  }

  // ── 3. Validate required fields ──
  if (!event.id || !event.item || !event.item.product_id) {
    log('WARN', 'webhook', 'Payload incompleto — campos requeridos faltantes');
    return res.status(400).send('Invalid payload');
  }

  // ── 4. Check product mapping ──
  const productId = String(event.item.product_id);
  const licenseType = mapProductToLicenseType(productId);

  if (!licenseType) {
    log('WARN', 'webhook', `Product ID ${productId} no tiene mapeo de licencia configurado`);
    return res.status(400).send('Product not configured');
  }

  // ── 5. Deduplicate using unique_id ──
  const existing = await getLicenseByOrder(event.unique_id);
  if (existing) {
    log('INFO', 'webhook', `Duplicado ignorado: unique_id=${event.unique_id}`);
    return res.status(200).send(existing.license_key);
  }

  // ── 6. Create license ──
  try {
    const lic = await createLicense({
      licenseType,
      maxActivations: 1,
      sellauthOrderId: event.unique_id,
      sellauthCustomerId: String(event.customer?.id || ''),
      sellauthCustomerEmail: event.customer?.email || event.email || '',
    });

    logActivity(
      lic.license_key,
      'webhook_created',
      `Created via Dynamic Delivery. Invoice: ${event.id}, Email: ${event.email}`,
      event.ip,
    );

    log('SUCCESS', 'webhook', `Licencia creada: ${lic.license_key} (invoice=${event.id})`);

    // ── 7. Return plain text — SellAuth shows this to the customer ──
    return res.status(200).send(lic.license_key);

  } catch (err: any) {
    log('ERROR', 'webhook', `Error creando licencia: ${err.message}`);
    return res.status(500).send('Error creating license');
  }
});

function mapProductToLicenseType(productId: string): string | null {
  // Map SellAuth product IDs to license types via env vars
  // Format: SELLAUTH_PRODUCT_MAP="123:lifetime,456:30d,789:1y"
  const mapStr = config.sellauthProductMap || '';

  if (!mapStr) {
    // Fallback: if no mapping configured, default to lifetime
    log('WARN', 'webhook', 'SELLAUTH_PRODUCT_MAP not configured — using default "lifetime"');
    return 'lifetime';
  }

  const pairs = mapStr.split(',').map(s => s.trim());
  for (const pair of pairs) {
    const [id, type] = pair.split(':').map(s => s.trim());
    if (id === productId) {
      return type || 'lifetime';
    }
  }

  // Product ID not found in mapping
  return null;
}

export default router;
