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

## Configuración

### 1. Supabase — Crear base de datos

1. Ve a [supabase.com](https://supabase.com) y crea una cuenta gratuita
2. Crea un nuevo proyecto
3. Ve a **Settings > Database** y copia la **Connection string > URI**
4. Formato: `postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres`

### 2. Variables de entorno

Crea un archivo `.env` basado en `.env.example`:

```bash
DATABASE_URL=tu_url_de_supabase
LICENSE_SERVER_SECRET=un_secreto_aleatorio
JWT_SECRET=otro_secreto_aleatorio
ADMIN_PASSWORD=tu_contraseña_admin
SELLAUTH_API_KEY=tu_api_key_de_sellauth
SELLAUTH_SHOP_ID=tu_shop_id
SELLAUTH_WEBHOOK_SECRET=tu_webhook_secret
LICENSE_SERVER_URL=https://tu-app.onrender.com
```

Genera secretos con:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Desarrollo local

```bash
cd license-server
npm install
npm run build
npm start
```

Verificar:
```bash
curl http://localhost:3000/health
```

### 4. Desplegar en Render

1. Conecta tu repositorio GitHub
2. **New > Web Service**
3. Configuración:
   - **Root Directory:** `license-server`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Runtime:** Node
4. Añade todas las variables de entorno en el panel de Render
5. **Create Web Service**

### 5. SellAuth — Configurar webhook

1. Ve a tu dashboard de SellAuth > **Storefront > Configure > Webhooks**
2. Añade un webhook:
   - **URL:** `https://tu-app.onrender.com/webhooks/sellauth`
   - **Event:** Invoice completado/pagado
3. Copia el **Webhook Secret** y ponlo como `SELLAUTH_WEBHOOK_SECRET` en Render
4. Mapea tus product IDs en `src/routes/webhook.ts` → `mapProductToLicenseType()`

### 6. Generar licencia de prueba

Desde la URL del servidor:
```bash
curl -X POST https://tu-app.onrender.com/api/admin/licenses \
  -H "Authorization: Bearer TU_TOKEN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"license_type":"lifetime","max_activations":1}'
```

O usa el panel admin en `https://tu-app.onrender.com/admin`

### 7. Probar activación

```bash
curl -X POST https://tu-app.onrender.com/api/license/activate \
  -H "Content-Type: application/json" \
  -d '{"license_key":"PHNT-XXXX-XXXX-XXXX","hwid":"test-hwid-123","version":"1.0.0"}'
```

### 8. Probar validación

```bash
curl -X POST https://tu-app.onrender.com/api/license/validate \
  -H "Content-Type: application/json" \
  -d '{"token":"TU_TOKEN","hwid":"test-hwid-123"}'
```

### 9. Revocar una licencia

```bash
curl -X POST https://tu-app.onrender.com/api/admin/licenses/PHNT-XXXX/revoke \
  -H "Authorization: Bearer TU_TOKEN_JWT"
```

### 10. Resetear HWID

```bash
curl -X POST https://tu-app.onrender.com/api/admin/licenses/PHNT-XXXX/reset-hwid \
  -H "Authorization: Bearer TU_TOKEN_JWT"
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

## Panel de Admin

Accede a `https://tu-app.onrender.com/admin` con las credenciales configuradas en `ADMIN_USERNAME` y `ADMIN_PASSWORD`.

## Seguridad

- HTTPS (proporcionado por Render)
- Rate limiting en endpoints sensibles
- JWT para autenticación admin
- Helmets headers de seguridad
- Validación de inputs
- SQL parametrizado (sin injection)
- Logs sin secretos
- HWID hasheado con SHA-256
- Offline grace period configurable
- Sin API keys en el cliente

## Estructura

```
license-server/
├── src/
│   ├── server.ts              # Express + startup
│   ├── config.ts              # Variables de entorno
│   ├── database/
│   │   ├── pool.ts            # Conexión PostgreSQL
│   │   ├── migrate.ts         # Runner de migraciones
│   │   └── migrations/
│   │       └── 001_initial.sql
│   ├── routes/
│   │   ├── health.ts          # GET /health
│   │   ├── license.ts         # Activate/validate/deactivate
│   │   ├── admin.ts           # CRUD de licencias
│   │   └── webhook.ts         # SellAuth webhook
│   ├── middleware/
│   │   ├── rateLimit.ts       # Rate limiting
│   │   ├── auth.ts            # JWT admin auth
│   │   └── errorHandler.ts
│   └── utils/
│       ├── licenseGenerator.ts # Generador PHNT-XXXX
│       ├── crypto.ts           # SHA-256, passwords, HMAC
│       └── logger.ts
├── admin/                     # Panel web estático
│   ├── index.html
│   ├── app.js
│   └── style.css
├── package.json
├── tsconfig.json
└── .env.example
```
