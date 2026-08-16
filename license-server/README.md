# PhantomTweaks License Server

Backend de validación de licencias para PhantomTweaks. Desplegado en Render con PostgreSQL de Supabase.

## Arquitectura

```
PhantomTweaks.exe  →  License Server (Render)  →  PostgreSQL (Supabase)
                              ↑
                        SellAuth Webhook
```

- El `.exe` **nunca** contiene API keys ni secretos
- SellAuth solo se comunica con el servidor, nunca con el cliente
- Todas las decisiones de validación se toman en el servidor
- Las migraciones SQL se ejecutan automáticamente al iniciar

## Despliegue rápido

### 1. Supabase — Crear base de datos

1. Ve a [supabase.com](https://supabase.com) y crea una cuenta gratuita
2. Crea un nuevo proyecto (elige la región más cercana a Render)
3. Ve a **Settings > Database > Connection string > URI**
4. Copia el valor completo. Formato:
   ```
   postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
   ```
5. **No necesitas ejecutar SQL manualmente.** Las tablas se crean automáticamente al iniciar el servidor.

### 2. Render — Desplegar el servicio

1. Ve a [render.com](https://render.com) y conecta tu repositorio GitHub
2. **New > Web Service**
3. Configura:
   - **Name:** `phantontweaks-license`
   - **Root Directory:** `license-server`
   - **Runtime:** Node
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `node dist/server.js`
4. Añade las variables de entorno en el tab **Environment**:

| Variable | Valor | Obligatoria |
|----------|-------|:-----------:|
| `DATABASE_URL` | Connection string de Supabase | Sí |
| `JWT_SECRET` | Secreto aleatorio (ver abajo) | Sí |
| `ADMIN_PASSWORD` | Tu contraseña para el panel admin | Sí |
| `LICENSE_SERVER_SECRET` | Secreto aleatorio (ver abajo) | Sí |
| `SELLAUTH_API_KEY` | De SellAuth > Settings > API | Sí |
| `SELLAUTH_SHOP_ID` | De SellAuth > Settings | Sí |
| `SELLAUTH_WEBHOOK_SECRET` | Del webhook en SellAuth | Sí |
| `LICENSE_SERVER_URL` | URL pública del servicio (ej: `https://phantontweaks-license.onrender.com`) | Sí |
| `OFFLINE_GRACE_DAYS` | `7` | No |
| `TOKEN_EXPIRY_HOURS` | `24` | No |
| `STORE_URL` | `https://phantontweaks.sellauth.com` | No |
| `NODE_ENV` | `production` | No |

5. **Create Web Service**

**Genera secretos con:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. SellAuth — Configurar webhook

1. Ve a tu dashboard de SellAuth > **Storefront > Configure > Webhooks**
2. **Add webhook:**
   - **URL:** `https://tu-app.onrender.com/webhooks/sellauth`
   - **Event:** Invoice completado/pagado
3. Copia el **Webhook Secret** → pégalo como `SELLAUTH_WEBHOOK_SECRET` en Render
4. Ve a tu dashboard > **Products** y copia los product IDs
5. Edita `src/routes/webhook.ts` → `mapProductToLicenseType()` con tus IDs:
   ```typescript
   const mappings: Record<string, string> = {
     'TU_PRODUCT_ID_LIFETIME': 'lifetime',
     'TU_PRODUCT_ID_30D': '30d',
     'TU_PRODUCT_ID_1Y': '1y',
   };
   ```
6. Haz commit + push para actualizar el servidor en Render

### 4. Verificar

1. **Health check:**
   ```bash
   curl https://tu-app.onrender.com/health
   ```
   Debe devolver: `{"status":"ok","database":"connected","timestamp":"..."}`

2. **Panel admin:**
   Abre `https://tu-app.onrender.com/admin` → inicia sesión con `ADMIN_USERNAME` / `ADMIN_PASSWORD`

3. **Crear licencia de prueba:**
   Desde el panel admin, haz clic en **Crear** o usa curl:
   ```bash
   # Login
   TOKEN=$(curl -s -X POST https://tu-app.onrender.com/api/admin/login \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"TU_PASSWORD"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).token))")

   # Crear licencia
   curl -X POST https://tu-app.onrender.com/api/admin/licenses \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"license_type":"lifetime","max_activations":1}'
   ```

4. **Probar activación:**
   ```bash
   curl -X POST https://tu-app.onrender.com/api/license/activate \
     -H "Content-Type: application/json" \
     -d '{"license_key":"PHNT-XXXX-XXXX-XXXX","hwid":"test-hwid-123","version":"1.0.0"}'
   ```

## API Endpoints

### Públicos (cliente)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/api/license/activate` | Activar licencia |
| POST | `/api/license/validate` | Validar sesión |
| POST | `/api/license/deactivate` | Desactivar dispositivo |
| POST | `/webhooks/sellauth` | Webhook de SellAuth |

### Admin (requiere JWT)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/admin/login` | Login administrador |
| GET | `/api/admin/licenses` | Listar/buscar licencias |
| GET | `/api/admin/licenses/:key` | Ver licencia |
| POST | `/api/admin/licenses` | Crear licencia |
| POST | `/api/admin/licenses/:key/revoke` | Revocar |
| POST | `/api/admin/licenses/:key/suspend` | Suspender |
| POST | `/api/admin/licenses/:key/reactivate` | Reactivar |
| POST | `/api/admin/licenses/:key/reset-hwid` | Resetear HWID |
| PUT | `/api/admin/licenses/:key/expiry` | Cambiar expiración |
| PUT | `/api/admin/licenses/:key/max-activations` | Cambiar max dispositivos |
| GET | `/api/admin/dashboard` | Estadísticas |

## Seguridad

- HTTPS (proporcionado por Render)
- Rate limiting en endpoints sensibles
- JWT para autenticación admin
- Helmet headers de seguridad
- Validación de inputs
- SQL parametrizado (sin injection)
- Logs sin secretos
- HWID hasheado con SHA-256 (irreversible)
- Offline grace period configurable
- Sin API keys en el cliente

## Estructura

```
license-server/
├── src/
│   ├── server.ts               # Express + startup + admin seed
│   ├── config.ts               # Variables de entorno tipadas
│   ├── database/
│   │   ├── pool.ts             # Conexión PostgreSQL (pg)
│   │   └── migrate.ts          # Migraciones embebidas (SQL inline)
│   ├── routes/
│   │   ├── health.ts           # GET /health
│   │   ├── license.ts          # Activate/validate/deactivate
│   │   ├── admin.ts            # CRUD de licencias
│   │   └── webhook.ts          # SellAuth webhook
│   ├── middleware/
│   │   ├── rateLimit.ts        # Rate limiting por IP
│   │   ├── auth.ts             # JWT admin auth
│   │   └── errorHandler.ts
│   └── utils/
│       ├── licenseGenerator.ts # Generador PHNT-XXXX
│       ├── crypto.ts           # SHA-256, scrypt passwords, HMAC
│       └── logger.ts
├── admin/                      # Panel web estático
│   ├── index.html
│   ├── app.js
│   └── style.css
├── package.json
├── tsconfig.json
├── render.yaml                 # Blueprint de Render
└── .env.example
```

## Tablas PostgreSQL (creadas automáticamente)

- **licenses** — Licencias con key, status, HWID, expiración, tipo, metadata
- **sessions** — Tokens de sesión post-activación con expiración
- **admin_users** — Usuarios administrador (hash scrypt)
- **activity_log** — Registro de acciones (audit trail)
- **_migrations** — Control de migraciones aplicadas
