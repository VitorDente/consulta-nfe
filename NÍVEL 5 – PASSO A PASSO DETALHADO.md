### 1. Pré-Requisitos do Sistema

1. **Sistema Operacional**
        
    - **Linux (Ubuntu 20.04+, Debian 10+, CentOS 7+)**
        
2. **Acesso e Ferramentas**
    
    - Conta GCP com permissão de Owner ou Editor
        
    - Organização Salesforce com perfil de System Administrator
        
    - Ferramentas de linha de comando instaladas:
        
        - Git
        - cURL (ou similar)
            


---

### 2. Instalar Node.js e npm

1. **Verificar se já está instalado**
    
    ```bash
    node --version npm --version
```
    
    - Se ambos retornarem versão ≥ 22.x (Node) e ≥ 8.x (npm), pule para o próximo passo.
        
    - Se retornar “command not found” ou versão baixa, siga abaixo.
        
2. **Linux (Ubuntu/Debian)**
    
    ```bash
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - sudo apt-get install -y nodejs node --version npm --version
```
        
    - Se der erro de permissão, adicione `sudo` antes do comando.
    
---

### 3. Instalar e Configurar Google Cloud SDK

1. **Verificar instalação**
    
    ```bash
    gcloud --version
```
    
    - Se não estiver instalado, siga: https://cloud.google.com/sdk/docs/install
        
2. **Login e Projeto**
    
    ```bash
    gcloud auth login gcloud config set project YOUR_PROJECT_ID
```
    
    
3. **Components necessários**
    
    ```bash
    gcloud components install beta gcloud components update
```
    
    ---

### 4. Clonar o Repositório e Instalar Dependências

1. **Clonar**
    
    ```bash
	git clone https://github.com/sua-organizacao/consulta-nfe.git cd consulta-nfe
	```
    
    - Se ocorrer “Permission denied”, verifique se você tem acesso SSH ou use HTTPS.
        
2. **Instalar Dependências**
    
    ```bash
    npm install
```
        
    - Isso criará a pasta `node_modules` com:
        
        - **express**, **ajv**, **xmlbuilder2**, **xml-crypto**, **soap**, **opossum**, **@google-cloud/pubsub**, **axios**
            

---

### 5. Configurar Variáveis de Ambiente Locais

Crie um arquivo `.env` na raiz (não commitá-lo ao Git):

```ini
PROJECT_ID=YOUR_PROJECT_ID
REGION=us-central1
SECRET_CERT_PASS=SuaSenhaDoCertificado
```

E carregue no shell:

```bash
export PROJECT_ID=$(grep PROJECT_ID .env | cut -d'=' -f2)
export REGION=$(grep REGION .env | cut -d'=' -f2)
export SECRET_CERT_PASS=$(grep SECRET_CERT_PASS .env | cut -d'=' -f2)
```

---
### 6. Enviar Certificado ao Secret Manager

```bash
gcloud secrets create cert-a1 --replication-policy="automatic" || echo "já existe"
gcloud secrets versions add cert-a1 \
  --data-file=./cert-a1.p12
# Em seguida, armazene a senha concatenada
echo -n "${SECRET_CERT_PASS}" | gcloud secrets versions add cert-a1 --data-file=-

```

---

### 7. Deploy da API no Cloud Run

1. **Build da imagem Docker**
    
    ```bash
    gcloud builds submit --tag gcr.io/$PROJECT_ID/consulta-nfe:latest
```
    
 2. **Deploy**
    
    ```bash
    gcloud run deploy consulta-nfe \
  --image gcr.io/$PROJECT_ID/consulta-nfe:latest \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --memory=1Gi --cpu=2 \
  --set-env-vars=GOOGLE_CLOUD_PROJECT=$PROJECT_ID

```
    
4. **Anote a URL** que o comando retorna (ex.: `https://consulta-nfe-xyz.a.run.app`).
    

---
### 8. Configurar Cloud Scheduler (Health Check)

bash
```bash
gcloud scheduler jobs create http nfe-health \
  --schedule="0 */8 * * *" \
  --uri="https://YOUR_CLOUD_RUN_URL/health" \
  --http-method=GET \
  --oidc-service-account-email="YOUR_SA@$PROJECT_ID.iam.gserviceaccount.com"
```

---
### 9. Configurar Salesforce (Passo a Passo)

1. **Connected App (JWT Bearer)**
    
    - Setup → App Manager → New Connected App
        
        - Name: “Consulta NFe App”
            
        - Enable OAuth Settings → Check “Enable JWT Bearer Assertion”
            
        - Callback URL: `https://login.salesforce.com`
            
        - Selected OAuth Scopes: `full`, `refresh_token`
            
    - Salve e aguarde ~10 min para propagação.
        
    - Baixe o certificado público do Connected App.
        
2. **Named Credential**
    
    - Setup → Named Credentials → New
        
        - Label: `Consulta_NFe`
            
        - URL: `https://YOUR_CLOUD_RUN_URL/consultaNFe`
            
        - Identity Type: Named Principal
            
        - Authentication Protocol: JWT Bearer
            
        - Issuer: Consumer Key do Connected App
            
        - Subject: `username@your-org.com`
            
        - Certificate: Upload do certificado público
            
3. **External Service**
    
    - Setup → External Services → Import
        
        - URL da spec: `https://YOUR_CLOUD_RUN_URL/openapi.yaml`
            
        - Nome: `ConsultaNFeService`
            
    - Verifique se a ação “ConsultaNFe” aparece em Actions.
        
4. **Custom Object & Campos**
    
    - Setup → Object Manager → Create → Custom Object
        
        - Label: `NF Consulta`
            
        - Plural: `NF Consultas`
            
        - API Name: `NFConsulta__c`
            
    - Dentro do objeto, crie campos (tipo, API Name):
        
        - Text (44): `NumeroNFe__c`
            
        - Text (36): `ConsultaId__c`
            
        - Picklist: `Status__c` (Pending, InProgress, Success, Failed, Queued)
            
        - DateTime: `DataEmissao__c`
            
        - Currency: `ValorTotal__c`
            
        - Long Text Area: `LastError__c`
            
5. **Platform Event**
    
    - Setup → Platform Events → New
        
        - Label: `NFe Consulta Result`
            
        - API Name: `NFeConsultaResult__e`
            
    - Campos (tipo/API):
        
        - Text (36): `ConsultaId__e`
            
        - Picklist: `Status__e` (mesmos valores)
            
        - DateTime: `DataEmissao__e`
            
        - Number: `ValorTotal__e`
            
        - Long Text Area: `Error__e`
            
6. **Flow 1 – Síncrono**
    
    - Setup → Flows → New → Autolaunched Flow
        
        - Trigger: Record-Triggered → NFConsulta__c on Create or Update where Status__c = “Pending”.
            
        - Element: Action → selecione “ConsultaNFe” (da External Service).
            
        - Mapeie entrada:
            
            - consultaId → ConsultaId__c
                
            - numeroNFe → NumeroNFe__c
                
            - callback.url → Named Credential endpoint de Platform Event
                
            - callback.jwt → {!$Credential.Token}
                
        - Após ação, use Decision (sefault) e Assignment para atualizar campos:
            
            - Se retorno status=Success: atualize DataEmissao__c, ValorTotal__c, Status__c=Success.
                
            - Se status=Failed: atualize Status__c=Failed e LastError__c.
                
        - Salve e ative.
            
7. **Flow 2 – Assíncrono (Platform Event)**
    
    - Setup → Flows → New → Platform Event-Triggered
        
        - Evento: NFeConsultaResult__e
            
        - Action: Get Records → NFConsulta__c where ConsultaId__c = ConsultaId__e
            
        - Update Records → mapeie Status__c, DataEmissao__c, ValorTotal__c, LastError__c.
            
        - Salve e ative.
            

---

### 10. Testes Finais (Detalhado)

1. **Teste de Instalação**
    
    - `node --version` e `npm --version`
        
    - `gcloud run services list --project=$PROJECT_ID`
        
    - `terraform plan` (se usar Terraform)
        
2. **Teste Síncrono**
    
    - No Salesforce, crie `NFConsulta__c`:
        
        - `NumeroNFe__c` = um número válido de teste
            
        - `Status__c` = Pending
            
    - Em até 60 s, verifique:
        
        - Status__c → Success
            
        - DataEmissao__c e ValorTotal__c preenchidos
            
3. **Teste Assíncrono (>60 s & <180 s)**
    
    - Simule latência adicionando um `await new Promise(r => setTimeout(r, 70000));` em `server.js` após a chamada SOAP.
        
    - Atualize a imagem e redeploy.
        
    - Crie novo registro Pending.
        
    - Aguarde callback: Status passa a Success via Platform Event.
        
4. **Teste DLQ (>180 s)**
    
    - Simule erro eterno: use um número de NF inválido.
        
    - Após 180 s, verifique:
        
        - Platform Event com Status__e = Failed e Error__e preenchido
            
        - E-mail automático enviado para vitor@standout.com.br
            
5. **Verificação de Monitoramento**
    
    - Acesse Cloud Monitoring → Dashboards
        
    - Confira:
        
        - Latência média
            
        - Taxa de erro ≥ 5xx
            
        - DLQ Depth = 0 (após reprocessar)
            
        - Último Health Check bem-sucedido em até 8 h
            
