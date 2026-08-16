import { Router, Request, Response } from 'express';
import { config } from '../config';
import { createLicense, getLicenseByOrder, logActivity } from '../services/licenseService';
import { verifyWebhookSignature } from '../utils/crypto';
import { log } from '../utils/logger';

const router = Router();

interface SellAuthInvoice {
  id: string;
  status: string;
  product_id?: string;
  customer?: {
    id: string;
    email: string;
  };
  items?: Array<{
    product_id: string;
    variant_id?: string;
    quantity: number;
  }>;
}

router.post('/webhooks/sellauth', async (req: Request, res: Response) => {
  const rawBody = (req as any).rawBody;
  const signature = req.headers['x-signature'] as string;
  const timestamp = req.headers['x-timestamp'] as string;

  // Verify webhook signature if secret is configured
  if (config.sellauthWebhookSecret && signature) {
    const payload = rawBody || JSON.stringify(req.body);
    if (!verifyWebhookSignature(payload, signature, config.sellauthWebhookSecret)) {
      log('WARN', 'webhook', 'Firma de webhook inválida');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  const event = req.body;

  log('INFO', 'webhook', `SellAuth webhook recibido: ${JSON.stringify(event).slice(0, 200)}`);

  try {
    // Handle different webhook types
    // SellAuth sends invoice data when an order is completed
    if (event && event.id && event.status) {
      const invoice = event as SellAuthInvoice;

      if (invoice.status === 'completed' || invoice.status === 'paid') {
        // Check if we already created a license for this order (idempotent)
        const existing = await getLicenseByOrder(invoice.id);
        if (existing) {
          log('INFO', 'webhook', `Duplicado ignorado: order=${invoice.id}`);
          return res.json({ ok: true, message: 'Already processed' });
        }

        // Determine license type from product_id
        // Map your SellAuth product IDs to license types here
        const productId = invoice.product_id || (invoice.items && invoice.items[0]?.product_id) || '';
        const licenseType = mapProductToLicenseType(productId);

        const lic = await createLicense({
          licenseType,
          maxActivations: 1,
          sellauthOrderId: invoice.id,
          sellauthCustomerId: invoice.customer?.id,
          sellauthCustomerEmail: invoice.customer?.email,
        });

        log('SUCCESS', 'webhook', `Licencia creada via webhook: ${lic.license_key} order=${invoice.id}`);

        // Return the license key — SellAuth can include it in the delivery email
        return res.json({
          ok: true,
          license_key: lic.license_key,
          message: 'License created',
        });
      }

      // Other statuses (cancelled, refunded, etc.) — just acknowledge
      return res.json({ ok: true, message: 'Ignored status: ' + invoice.status });
    }

    // Unknown webhook format
    log('WARN', 'webhook', `Formato de webhook desconocido: ${JSON.stringify(event).slice(0, 200)}`);
    return res.json({ ok: true, message: 'Acknowledged' });

  } catch (err: any) {
    log('ERROR', 'webhook', `Error procesando webhook: ${err.message}`);
    return res.status(500).json({ error: 'Internal error' });
  }
});

function mapProductToLicenseType(productId: string): string {
  // Configure these mappings based on your SellAuth product IDs
  // You can find product IDs in your SellAuth dashboard

  const mappings: Record<string, string> = {
    // 'SELLAUTH_PRODUCT_ID_LIFETIME': 'lifetime',
    // 'SELLAUTH_PRODUCT_ID_30D': '30d',
    // 'SELLAUTH_PRODUCT_ID_90D': '90d',
    // 'SELLAUTH_PRODUCT_ID_1Y': '1y',
  };

  return mappings[productId] || 'lifetime';
}

export default router;
