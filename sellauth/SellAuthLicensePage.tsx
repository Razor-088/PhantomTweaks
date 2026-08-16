/**
 * =====================================================================
 *  SellAuthLicensePage.tsx
 *  Licencias SellAuth — componente único e importable
 * =====================================================================
 *
 *  QUÉ ES
 *  Una sola página/componente React, sin dependencias (solo React),
 *  para activar y verificar licencias vendidas con SellAuth.
 *  Cópialo a cualquier proyecto y úsalo así:
 *
 *    import SellAuthLicensePage from './SellAuthLicensePage';
 *
 *    <SellAuthLicensePage
 *      appName="PhantomTweaks"
 *      productName="PhantomTweaks Pro"
 *      buyUrl="https://tu-tienda.sellauth.com/checkout/tu-producto"
 *      verifyUrl="https://tu-backend.com/api/verify-license"
 *      onValid={(info) => { /* desbloquear la app *\/ }}
 *    />
 *
 *  También exporta funciones para usarlo como API programática:
 *
 *    import { verifyLicense, useLicense } from './SellAuthLicensePage';
 *
 *  ---------------------------------------------------------------------
 *  IMPORTANTE (seguridad)
 *  La API de SellAuth (https://api.sellauth.com/v1) necesita tu Bearer
 *  API key de administrador. JAMÁS la pongas en el navegador/cliente:
 *  cualquiera podría robarla y gestionar tu tienda.
 *
 *  Verifica SIEMPRE a través de un backend tuyo. Ejemplo mínimo
 *  (Node.js/Express) para ese backend — copia y pega en tu servidor:
 *
 *    // server.js
 *    const express = require('express');
 *    const app = express();
 *    app.use(express.json());
 *
 *    // 1) Opción A: comprueba la key contra tu lista de seriales vendidos
 *    //    (lista que tú cargaste en SellAuth). Guarda las vendidas en BD.
 *    // 2) Opción B: usa la API de SellAuth desde el servidor si quieres
 *    //    consultar facturas (Bearer key solo aquí, nunca en el cliente):
 *    //    const r = await fetch('https://api.sellauth.com/v1/invoices', {
 *    //      headers: { Authorization: 'Bearer ' + process.env.SELLAUTH_KEY }
 *    //    });
 *
 *    const sold = ['XXXXX-XXXXX-XXXXX-XXXXX']; // <- tu stock (en BD real)
 *    app.post('/api/verify-license', (req, res) => {
 *      const { license_key, instance_id } = req.body || {};
 *      const isSold = sold.includes(String(license_key || '').trim());
 *      if (!isSold) return res.status(404).json({ valid: false, reason: 'key_not_found' });
 *      res.json({
 *        data: {
 *          valid: true,
 *          license_key: {
 *            key: license_key,
 *            status: 'ACTIVE',
 *            expires_at: null,          // null = licencia de por vida
 *            limit: 1,                  // nº de dispositivos permitidos
 *            instances_count: 1,
 *          },
 *          instance: { id: instance_id },
 *        },
 *      });
 *    });
 *    app.listen(3000);
 *
 *  RESPONSE ESPERADO (shape estándar SellAuth/sell.app; configurable
 *  con la prop mapResult si tu backend devuelve otro formato):
 *    { data: { valid: boolean, license_key: {...}, instance: {...} } }
 * =====================================================================
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/* ----------------------------- Tipos ------------------------------ */

export interface LicenseInfo {
  valid: boolean;
  status?: string;
  key?: string;
  product?: string;
  expiresAt?: string | null;
  isExpired?: boolean;
  activationLimit?: number | null;
  activationsUsed?: number | null;
  instanceId?: string;
  raw?: unknown;
}

export interface VerifyOptions {
  licenseKey: string;
  verifyUrl: string;
  instanceId?: string;
  headers?: Record<string, string>;
  body?: (licenseKey: string, instanceId: string) => unknown;
  mapResult?: (json: any) => LicenseInfo;
  fetchFn?: typeof fetch;
}

export interface LicensePageProps {
  appName?: string;
  productName?: string;
  /** URL de tu página/checkout de SellAuth para comprar. */
  buyUrl?: string;
  /** Endpoint de TU backend que valida la clave (nunca pongas la API key de SellAuth aquí). */
  verifyUrl: string;
  /** Identificador de instalación/máquina. Si no se pasa, se genera y guarda en localStorage. */
  instanceId?: string;
  /** Persistir la clave validada en localStorage y mostrarla ya activada al abrir. */
  persist?: boolean;
  storagePrefix?: string;
  theme?: 'dark' | 'light' | 'system';
  defaultLang?: 'es' | 'en';
  className?: string;
  /** Se llama al validar correctamente (para desbloquear la app, guardar la licencia, etc.). */
  onValid?: (info: LicenseInfo) => void;
  /** Personaliza el body/parseo de la respuesta. */
  api?: Pick<VerifyOptions, 'headers' | 'body' | 'mapResult' | 'fetchFn'>;
}

/* --------------------------- Paleta por tema ----------------------- */

interface Palette {
  base: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  muted: string;
  dim: string;
  accent: string;
  accent2: string;
  danger: string;
  warn: string;
  ok: string;
}

const PALETTES: Record<'dark' | 'light', Palette> = {
  dark: {
    base: '#080b0a',
    surface: '#111615',
    surface2: '#151d1b',
    border: '#1e2a26',
    text: '#ffffff',
    muted: '#a8b3ae',
    dim: '#6f7c76',
    accent: '#00ff88',
    accent2: '#00b46a',
    danger: '#ff4d6d',
    warn: '#ffb84d',
    ok: '#00d66b',
  },
  light: {
    base: '#eef2f0',
    surface: '#ffffff',
    surface2: '#f5f8f7',
    border: '#d5dfdb',
    text: '#111917',
    muted: '#4c5b55',
    dim: '#7b8a84',
    accent: '#00b46a',
    accent2: '#00985a',
    danger: '#d93a54',
    warn: '#b87f14',
    ok: '#00985a',
  },
};

/* ------------------------ Normalización respuesta ------------------- */

function defaultMapResult(json: any): LicenseInfo {
  const data = json?.data && typeof json.data === 'object' ? json.data : json;
  const lk = data?.license_key && typeof data.license_key === 'object' ? data.license_key : data;
  const inst = data?.instance && typeof data.instance === 'object' ? data.instance : undefined;
  const valid = Boolean(data?.valid ?? json?.valid ?? json?.success);
  return {
    valid,
    status: typeof lk?.status === 'string' ? lk.status : undefined,
    key: typeof lk?.key === 'string' ? lk.key : undefined,
    product: typeof lk?.product_id === 'number' ? String(lk.product_id) : undefined,
    expiresAt: typeof lk?.expires_at === 'string' ? lk.expires_at : null,
    isExpired: typeof lk?.is_expired === 'number' ? lk.is_expired === 1 : undefined,
    activationLimit: typeof lk?.limit === 'number' ? lk.limit : null,
    activationsUsed: typeof lk?.instances_count === 'number' ? lk.instances_count : null,
    instanceId: inst?.id ? String(inst.id) : undefined,
    raw: json,
  };
}

/* ------------------------- Función de verificación ------------------ */

export async function verifyLicense(opts: VerifyOptions): Promise<LicenseInfo> {
  const {
    licenseKey,
    verifyUrl,
    instanceId = '',
    headers = {},
    body,
    mapResult = defaultMapResult,
    fetchFn = fetch,
  } = opts;

  const key = String(licenseKey || '').trim();
  if (!key) throw new Error('empty_key');

  const payload = body ? body(key, instanceId) : { license_key: key, instance_id: instanceId };
  const res = await fetchFn(verifyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: JSON.stringify(payload),
  });

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* respuesta no-JSON */
  }

  if (!res.ok) {
    const reason = json?.reason || json?.error || json?.message || `http_${res.status}`;
    const info = mapResult(json ?? {});
    return { ...info, valid: false, raw: json, status: reason };
  }
  return mapResult(json);
}

/* ------------------------------- Hook ------------------------------- */

export function useLicense(
  licenseKey: string | null | undefined,
  opts: { verifyUrl: string; instanceId?: string; enabled?: boolean } & Pick<VerifyOptions, 'headers' | 'body' | 'mapResult' | 'fetchFn'>
) {
  const [info, setInfo] = useState<LicenseInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const check = useCallback(async () => {
    if (!licenseKey) return;
    setLoading(true);
    setError(null);
    try {
      const r = await verifyLicense({ licenseKey, ...opts });
      setInfo(r);
      setLoading(false);
    } catch (e: any) {
      setError(e?.message ?? 'network_error');
      setLoading(false);
    }
  }, [licenseKey, opts]);

  useEffect(() => {
    if (opts.enabled === false) return;
    void check();
    timer.current = setInterval(() => void check(), 1000 * 60 * 5);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [check, opts.enabled]);

  return { info, loading, error, refresh: check };
}

/* ----------------------------- i18n interno -------------------------- */

const STR: Record<'es' | 'en', Record<string, string>> = {
  es: {
    title: 'Licencia',
    subtitle: 'Activa tu licencia para usar la aplicación',
    placeholder: 'XXXXX-XXXXX-XXXXX-XXXXX',
    verify: 'Verificar licencia',
    checking: 'Verificando…',
    valid: 'Licencia válida',
    validDesc: 'Tu licencia está activa',
    invalid: 'Licencia no válida',
    expired: 'Licencia caducada',
    revoked: 'Licencia revocada',
    error: 'No se pudo conectar con el servidor de licencias',
    retry: 'Reintentar',
    buy: 'Comprar licencia',
    buyHint: '¿No tienes licencia?',
    haveKey: '¿Ya tienes una clave? Introdúcela arriba',
    expiry: 'Caducidad',
    lifetime: 'De por vida',
    activations: 'Activaciones',
    instance: 'Dispositivo',
    securityNote: 'La verificación se hace contra tu servidor; la API key de SellAuth nunca viaja a esta página.',
    persistHint: 'Licencia guardada en este dispositivo',
    langLabel: 'Idioma',
  },
  en: {
    title: 'License',
    subtitle: 'Activate your license to use the app',
    placeholder: 'XXXXX-XXXXX-XXXXX-XXXXX',
    verify: 'Verify license',
    checking: 'Verifying…',
    valid: 'Valid license',
    validDesc: 'Your license is active',
    invalid: 'Invalid license',
    expired: 'License expired',
    revoked: 'License revoked',
    error: 'Could not reach the license server',
    retry: 'Retry',
    buy: 'Buy license',
    buyHint: "Don't have a license?",
    haveKey: 'Already have a key? Enter it above',
    expiry: 'Expires',
    lifetime: 'Lifetime',
    activations: 'Activations',
    instance: 'Device',
    securityNote: 'Verification runs against your server; the SellAuth API key never reaches this page.',
    persistHint: 'License saved on this device',
    langLabel: 'Language',
  },
};

/* ------------------------------ Componente --------------------------- */

function getInstanceId(prefix: string): string {
  if (typeof window === 'undefined') return '';
  const k = `${prefix}_instance_id`;
  const existing = window.localStorage.getItem(k);
  if (existing) return existing;
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `inst-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(k, id);
  return id;
}

export default function SellAuthLicensePage(props: LicensePageProps) {
  const {
    appName = 'Mi aplicación',
    productName = 'Licencia Pro',
    buyUrl,
    verifyUrl,
    persist = true,
    storagePrefix = 'pt_license',
    theme = 'system',
    defaultLang = 'es',
    className,
    onValid,
    api,
  } = props;

  const [lang, setLang] = useState<'es' | 'en'>(defaultLang);
  const [keyInput, setKeyInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'checking' | 'done'>('idle');
  const [result, setResult] = useState<LicenseInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [usedInstance, setUsedInstance] = useState<string>(() => getInstanceId(storagePrefix));

  const resolvedTheme = useMemo<'dark' | 'light'>(() => {
    if (theme === 'system') {
      if (typeof window === 'undefined') return 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
  }, [theme]);

  const p = PALETTES[resolvedTheme];
  const str = STR[lang];

  const { instanceId = usedInstance } = props;
  const storageKey = `${storagePrefix}_key`;

  useEffect(() => {
    if (!persist) return;
    try {
      const k = window.localStorage.getItem(storageKey);
      if (k) setSavedKey(k);
    } catch {
      /* ignore */
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (theme === 'system') {
      const onChange = () => setStatus((s) => s);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
  }, [persist, storageKey, theme]);

  const check = useCallback(
    async (key?: string) => {
      const licenseKey = (key ?? keyInput).trim();
      if (!licenseKey) return;
      setStatus('checking');
      setError(null);
      setResult(null);
      try {
        const info = await verifyLicense({
          licenseKey,
          verifyUrl,
          instanceId,
          headers: api?.headers,
          body: api?.body,
          mapResult: api?.mapResult,
          fetchFn: api?.fetchFn,
        });
        setResult(info);
        setStatus('done');
        if (info.valid) {
          if (persist) {
            try {
              window.localStorage.setItem(storageKey, licenseKey);
            } catch {
              /* ignore */
            }
          }
          onValid?.(info);
        }
      } catch (e: any) {
        setError(e?.message ?? 'network_error');
        setStatus('done');
      }
    },
    [keyInput, verifyUrl, instanceId, persist, storageKey, onValid, api]
  );

  const finalKey = savedKey ?? keyInput;
  const valid = status === 'done' && result?.valid === true;
  const failReason = status === 'done' && result && !result.valid ? (result.status ?? 'invalid') : null;

  const reasonText =
    failReason === 'expired' || result?.isExpired
      ? str.expired
      : failReason === 'revoked' || /revok|ban|disable/i.test(failReason ?? '')
        ? str.revoked
        : failReason
          ? str.invalid
          : null;

  const fmtDate = (iso?: string | null) => {
    if (!iso) return str.lifetime;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 12px',
    borderRadius: '8px',
    border: `1px solid ${p.border}`,
    background: p.surface2,
    color: p.text,
    fontSize: '13px',
    fontFamily: '"Cascadia Mono", Consolas, monospace',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    outline: 'none',
  };

  const btn: React.CSSProperties = {
    width: '100%',
    padding: '10px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    color: '#06120c',
    background: p.accent,
    transition: 'opacity .15s ease, transform .15s ease',
  };

  const chip: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '8px',
    padding: '6px 0',
    fontSize: '12px',
    color: p.muted,
  };

  return (
    <div
      className={className}
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        boxSizing: 'border-box',
        background: `radial-gradient(900px 400px at 80% -10%, ${p.accent}14, transparent 60%), ${p.base}`,
        color: p.text,
        fontFamily: '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          background: p.surface,
          border: `1px solid ${p.border}`,
          borderRadius: '14px',
          padding: '20px',
          boxShadow: `0 0 0 1px ${p.border}22, 0 24px 60px -20px rgba(0,0,0,.5)`,
        }}
      >
        {/* Cabecera */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: `${p.accent}1f`,
              border: `1px solid ${p.accent}55`,
            }}
          >
            <GhostMark color={p.accent} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '14px', letterSpacing: '0.02em' }}>{appName}</div>
            <div style={{ fontSize: '11.5px', color: p.dim }}>{productName}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: p.dim }}>
            <button
              onClick={() => setLang('es')}
              style={{
                ...langChip,
                color: lang === 'es' ? p.text : p.dim,
                borderColor: lang === 'es' ? p.accent : p.border,
              }}
            >
              ES
            </button>
            <button
              onClick={() => setLang('en')}
              style={{
                ...langChip,
                color: lang === 'en' ? p.text : p.dim,
                borderColor: lang === 'en' ? p.accent : p.border,
              }}
            >
              EN
            </button>
          </div>
        </div>

        <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '2px' }}>{str.title}</div>
        <div style={{ fontSize: '12px', color: p.dim, marginBottom: '16px' }}>
          {valid ? str.validDesc : str.subtitle}
        </div>

        {!valid ? (
          <>
            <input
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && status !== 'checking' && check()}
              placeholder={str.placeholder}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              style={inputStyle}
              aria-label="License key"
            />
            <button
              onClick={() => check()}
              disabled={status === 'checking' || !keyInput.trim()}
              style={{ ...btn, marginTop: '10px', opacity: status === 'checking' || !keyInput.trim() ? 0.55 : 1 }}
            >
              {status === 'checking' ? str.checking : str.verify}
            </button>

            {error && status === 'done' && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  background: `${p.danger}1a`,
                  border: `1px solid ${p.danger}55`,
                  color: p.danger,
                }}
              >
                {str.error} · {error}
                <button
                  onClick={() => check()}
                  style={{
                    display: 'block',
                    marginTop: '8px',
                    background: 'transparent',
                    border: `1px solid ${p.danger}66`,
                    color: p.danger,
                    borderRadius: '6px',
                    padding: '5px 12px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  {str.retry}
                </button>
              </div>
            )}

            {failReason && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  background: `${p.danger}1a`,
                  border: `1px solid ${p.danger}55`,
                  color: p.danger,
                }}
              >
                {reasonText}
                {buyUrl && (
                  <a
                    href={buyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'block',
                      marginTop: '8px',
                      textAlign: 'center',
                      background: p.accent,
                      color: '#06120c',
                      borderRadius: '6px',
                      padding: '7px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    {str.buy}
                  </a>
                )}
              </div>
            )}
          </>
        ) : (
          <div
            style={{
              padding: '12px',
              borderRadius: '8px',
              background: `${p.accent}1a`,
              border: `1px solid ${p.accent}55`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: p.accent }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '20px',
                  height: '20px',
                  borderRadius: '999px',
                  background: p.accent,
                  color: '#06120c',
                  fontSize: '12px',
                }}
              >
                ✓
              </span>
              {str.valid}
            </div>
            <div style={{ marginTop: '10px' }}>
              <div style={chip}>
                <span>{str.expiry}</span>
                <span style={{ color: p.text, fontFamily: 'Consolas, monospace', fontSize: '12px' }}>
                  {fmtDate(result?.expiresAt)}
                </span>
              </div>
              {typeof result?.activationLimit === 'number' && (
                <div style={chip}>
                  <span>{str.activations}</span>
                  <span style={{ color: p.text, fontFamily: 'Consolas, monospace' }}>
                    {result.activationsUsed ?? 0} / {result.activationLimit}
                  </span>
                </div>
              )}
              {result?.instanceId && (
                <div style={chip}>
                  <span>{str.instance}</span>
                  <span style={{ color: p.text, fontFamily: 'Consolas, monospace', fontSize: '11px', wordBreak: 'break-all' }}>
                    {result.instanceId}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {persist && valid && (
          <div style={{ marginTop: '10px', fontSize: '11px', color: p.dim }}>✓ {str.persistHint}</div>
        )}

        {buyUrl && !valid && (
          <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '12px', color: p.dim }}>
            {str.buyHint}{' '}
            <a
              href={buyUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: p.accent, fontWeight: 600, textDecoration: 'none' }}
            >
              {str.buy} →
            </a>
          </div>
        )}

        <div style={{ marginTop: '14px', fontSize: '10.5px', lineHeight: '1.5', color: p.dim, borderTop: `1px solid ${p.border}`, paddingTop: '10px' }}>
          {str.securityNote}
        </div>
      </div>
    </div>
  );
}

const langChip: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid',
  borderRadius: '6px',
  padding: '2px 7px',
  fontSize: '11px',
  cursor: 'pointer',
};

function GhostMark({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" aria-hidden>
      <defs>
        <linearGradient id="ptg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.45" />
          <stop offset="1" stopColor={color} stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <path
        d="M256 23C161 23 61 123 61 238V407H176V303c0-40 31-68 80-68s80 28 80 68V407H451V238C451 123 351 23 256 23Z"
        fill="url(#ptg)"
        stroke={color}
        strokeWidth="14"
        strokeLinejoin="round"
      />
      <path
        d="M146 132h54c15 0 28 13 28 28s-13 28-28 28h-54c-15 0-28-13-28-28s13-28 28-28Z M312 132h54c15 0 28 13 28 28s-13 28-28 28h-54c-15 0-28-13-28-28s13-28 28-28Z"
        fill="#04140c"
      />
      <path
        d="M161 145c9 3 15 9 17 17 M328 145c9 3 15 9 17 17"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M228 236h52c9 0 16 7 16 16 0 3-1 6-3 9l-37 61 9-38h-20c-9 0-16-7-16-16 0-3 1-6 3-9l11-17Z"
        fill={color}
      />
    </svg>
  );
}
