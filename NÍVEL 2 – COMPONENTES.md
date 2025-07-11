
---

### Proposta Arquitetural de Componentes

mermaid
``` mermaid
flowchart TB
  subgraph Salesforce
    subgraph Setup
      NC[Named Credential → Middleware URL + JWT Auth]
      ES[External Service → Registra OpenAPI do middleware]
      PE[NFeConsultaResult__e Platform Event]
    end

    subgraph Runtime
      F[Flow: NFConsulta__c → Ação “ConsultaNFe”] -->|POST JSON| M[API Middleware]
      F -->|Falha| U1[Atualiza NFConsulta__c Status Failed, LastError + SendEmail]
      M -->|200 JSON síncrono| U2[Atualiza NFConsulta__c Status, DataEmissao, ValorTotal]
      subgraph Callback
        M2[Middleware publica Platform Event] --> EV[Flow de Evento → Atualiza NFConsulta__c]
      end
    end
  end
 
  subgraph Middleware_GCP
    A[API Layer Express] --> T[Transform and Sign - JSON to XML and PKCS12]
    T --> S[SOAP Client com TLS mútua]
    S --> R[Parse XML to JSON]
    R --> B{Tempo de resposta}
    B -->|≤60 s| RESP[Retorna JSON]
    B -->|>60 s e ≤180 s| Retry[Retry + Backoff]
    Retry --> S
    B -->|>180 s| DLQ[Publica em Pub/Sub DLQ]
    DLQ --> AL[Cloud Function: SendEmail e/ou Pubblica Platform Event]
  end
```


#### 1. Salesforce

- **Custom Object `NFConsulta__c`**
    
    - Campos-chave:
        
        |Campo|Tipo|Descrição|
        |---|---|---|
        |`NumeroNFe__c`|Text(44)|Número da NF|
        |`ConsultaId__c`|Text(36)|UUID gerado pelo middleware|
        |`Status__c`|Picklist|Pending, InProgress, Success, Failed…|
        |`DataEmissao__c`|DateTime|Data de emissão retornada|
        |`ValorTotal__c`|Currency|Valor total da NF|
        |`LastError__c`|Long Text|Mensagem de erro em caso de falha|
        
- **Named Credential & External Service**
    
    1. Criar **Named Credential** apontando ao endpoint do middleware, usando JWT Bearer Flow para autenticação.
        
    2. Importar o **OpenAPI spec** do middleware (via URL estática) em **External Services**.
        
    3. O Salesforce gera automaticamente uma **Ação invocável** “ConsultaNFe” para o Flow.
        
- **Flow de Integração**
    
    - **Trigger**: Ao criar ou atualizar `NFConsulta__c` com status “Pending”.
        
    - **Ação**: Chama “ConsultaNFe” (síncrono, timeout 60 s).
        
        - **Sucesso**: Atualiza campos (`Status__c=Success`, mapeia `DataEmissao__c`, `ValorTotal__c`).
            
        - **Falha/Fault**: Atualiza (`Status__c=Failed`, `LastError__c`), envia e-mail de alerta.
            
- **Platform Event `NFeConsultaResult__e`**
    
    - Campos:
        
        |Campo|Tipo|Descrição|
        |---|---|---|
        |`ConsultaId__e`|Text(36)|Correlaciona com `ConsultaId__c`|
        |`Status__e`|Picklist|Success, Failed, Queued|
        |`DataEmissao__e`|DateTime|Emissão da NF|
        |`ValorTotal__e`|Number|Valor total|
        |`RawResponse__e`|Long Text|JSON ou XML bruto (opcional)|
        
    - **Flow de Evento**: Ao receber `NFeConsultaResult__e`, busca `NFConsulta__c` por `ConsultaId__c` e atualiza status/dados.
        

---

```json
{
  "consultaId": "UUID",
  "numeroNFe": "35190712345678000130550010000000011000000012",
  "callback": {
    "url": "https://your-domain/services/data/vXX.X/sobjects/NFeConsultaResult__e/",
    "jwt": "eyJhbGciOiJ..."
  }
}

```

#### 2. Middleware (Node.js / GCP)

- **API Layer (Express.js)**
    
    - Endpoint `POST /consultaNFe`: recebe payload JSON:
    
```json
{
  "consultaId": "UUID",
  "numeroNFe": "35190712345678000130550010000000011000000012",
  "callback": {
    "url": "https://your-domain/services/data/vXX.X/sobjects/NFeConsultaResult__e/",
    "jwt": "eyJhbGciOiJ..."
  }
}

```

    - Valida esquema (ajuste com `ajv`).
        
- **Transform & Sign**
    
    - Converte JSON → XML usando `xml2js`/`xmlbuilder`.
        
    - Assina XML via `xml-crypto` com PKCS#12 (arquivo `.p12` e senha do Certificado A1).
        
    - **Segurança**:
        
        - Armazena `.p12` e senha no **Secret Manager**.
            
        - Permissões restritas ao Service Account.
            
- **SOAP Client**
    
    - Usa `strong-soap` ou `soap` configurado com mutual TLS (certificado A1).
        
    - Aplica **Circuit Breaker** (biblioteca `opossum`) para fails fast.
        
- **Retry & DLQ**
    
    - Retry automático com backoff exponencial (até 5 tentativas ou 180 s).
        
    - Depois de 180 s, publica mensagem no **Pub/Sub** tópico `nfe-dlq`.
        
- **Alertas & Callback**
    
    - **Cloud Function** subscrita a `nfe-dlq`:
        
        1. Envia e-mail de alerta (SendGrid ou SMTP).
            
        2. Publica Platform Event no Salesforce via REST API (JWT Bearer).
            
- **Logs & Auditoria**
    
    - **Cloud Logging**: logs estruturados de cada etapa.
        
    - **Cloud Storage**: armazena raw XML requests/responses (AES-256 + KMS).
        
- **Infraestrutura GCP**
    
    - **Cloud Run** para a API (autoscaling, VPC-egress opcional).
        
    - **Secret Manager** para certificados.
        
    - **Pub/Sub** tópicos: `nfe-dlq`.
        
    - **Cloud Function** para alertas.
        
    - **Cloud Scheduler**: health-check diário do Web Service.