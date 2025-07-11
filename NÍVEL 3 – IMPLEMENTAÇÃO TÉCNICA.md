
### 1. `config.js`

```js
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const secretClient = new SecretManagerServiceClient();
export async function getCert() {
  const [version] = await secretClient.accessSecretVersion({
    name: 'projects/PROJECT_ID/secrets/cert-a1/versions/latest'
  });
  const payload = version.payload.data.toString('utf8');
  const [p12Base64, password] = payload.split('||');
  return { 
    cert: Buffer.from(p12Base64, 'base64'), 
    pass: password 
  };
}

// Versão da API Salesforce para callbacks
export const SALESFORCE_API_VERSION = 'v64.0';

```

---

### 2. Publicação de Platform Event

```js
import axios from 'axios';

// Reaproveita o mesmo método para Success e Failed
export async function publishPlatformEvent(callback, result) {
  await axios.post(
    callback.url,
    {
      ConsultaId__e: result.consultaId,
      Status__e:   result.status,
      DataEmissao__e: result.dataEmissao || null,
      ValorTotal__e:  result.valorTotal  || null,
      Error__e:       result.error       || null
    },
    { headers: { Authorization: `Bearer ${callback.jwt}` } }
  );
}

```

---

### 3. `server.js`

```js
import express from 'express';
import Ajv from 'ajv';
import axios from 'axios';
import { consultaWithCircuit } from './soapClient.js';
import { buildSignedXml } from './transformSign.js';
import { publishPlatformEvent } from './eventPublisher.js';

const app = express();
app.use(express.json());

const ajv = new Ajv();
const schema = /* JSON schema gerado a partir de openapi.yaml */;
const validate = ajv.compile(schema);

app.post('/consultaNFe', async (req, res) => {
  if (!validate(req.body)) {
    return res.status(400).json({ error: validate.errors });
  }

  const { consultaId, numeroNFe, callback } = req.body;
  let lastError;
  const start = Date.now();

  while (Date.now() - start < 180_000) {
    try {
      const signedXml = await buildSignedXml(req.body);
      const [response] = await consultaWithCircuit.fire(signedXml);

      const result = {
        consultaId,
        status:      'Success',
        dataEmissao: response.dataEmissao,
        valorTotal:  response.valorTotal
      };

      // Resposta síncrona até 60 s
      if (Date.now() - start <= 60_000) {
        return res.status(200).json(result);
      }

      // Callback assíncrono (Platform Event)
      await publishPlatformEvent(callback, result);
      return res.status(202).json({ status: 'Queued' });

    } catch (err) {
      lastError = err.message;
      // backoff exponencial até 10s
      const delay = Math.min((req.attempts || 0) ** 2 * 100, 10_000);
      await new Promise(r => setTimeout(r, delay));
      req.attempts = (req.attempts || 0) + 1;
    }
  }

  // Após 180 s: publica evento com Status=Failed e retorna 424
  const failureResult = {
    consultaId,
    status: 'Failed',
    error:  lastError
  };
  await publishPlatformEvent(callback, failureResult);
  return res
    .status(424)
    .json(failureResult);
});

app.get('/health', (_, res) => res.sendStatus(200));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`API Consulta NFe rodando na porta ${PORT}`);
});

```

---
### 4. Terraform (Infraestrutura em `us-central1`, e2-micro)

```hcl
variable "project" {}
variable "region"  { default = "us-central1" }

resource "google_cloud_run_service" "consulta_nfe" {
  name     = "consulta-nfe"
  location = var.region

  template {
    spec {
      containers {
        image = "gcr.io/${var.project}/consulta-nfe:latest"
        resources {
          limits = {
            cpu    = "2"
            memory = "1Gi"
          }
        }
        env = [
          { name = "GOOGLE_CLOUD_PROJECT", value = var.project }
        ]
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }
}

resource "google_secret_manager_secret" "cert" {
  name       = "cert-a1"
  replication { automatic = true }
}

resource "google_secret_manager_secret_version" "cert_version" {
  secret      = google_secret_manager_secret.cert.id
  secret_data = filebase64("${path.module}/cert-a1.p12") + "||" + var.cert_pass
}

```

---

### 5. Salesforce Declarativo

1. **Named Credential**
    
    - **URL**: `https://api.my-domain/consultaNFe`
        
    - **API Version**: **v64.0**
        
    - **Token JWT** configurado via Connected App
        
2. **External Service**
    
    - Importe `openapi.yaml` para criar a ação `ConsultaNFe`.
        
3. **Platform Event `NFeConsultaResult__e`**
    
    - Campos:
        
        - `ConsultaId__e` (Text)
            
        - `Status__e` (Picklist: Pending, InProgress, Success, Failed, Queued)
            
        - `DataEmissao__e` (DateTime)
            
        - `ValorTotal__e` (Number)
            
        - `Error__e` (Long Text)
            
4. **Flows**
    
    - **OnCreate/OnUpdate** de `NFConsulta__c` → chama `ConsultaNFe`.
        
    - **OnPlatformEvent** (`NFeConsultaResult__e`):
        
        1. Busca `NFConsulta__c` por `ConsultaId__c`.
            
        2. Atualiza campos de status/dados ou preenche `LastError__c`.
            
        3. Se `Status__e = Failed`, dispara **Email Alert** configurado em Flow (usando template no Salesforce).