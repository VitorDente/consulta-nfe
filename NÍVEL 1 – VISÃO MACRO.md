### Premissas

- **Integração síncrona**: callout direto do Salesforce Flow → Middleware (timeout em **60 segundos**).
- **Fallback assíncrono**: caso o processamento com a Prefeitura ultrapasse **180 segundos**, o Middleware assume e concluirá o fluxo de forma desacoplada, retornando o resultado ao Salesforce via callback.
- **Persistência em Salesforce**: apenas o **status** e os **dados essenciais** da NFe (sem XML bruto).
- **Alertas**: notificações por **e-mail** para falhas graves ou Dead-Letter.
- **Certificado A1**: pode ser guardado no Salesforce ou no Middleware, desde que com criptografia e acesso restrito; rotação anual.

---

### Proposta Arquitetural

``` mermaid
flowchart LR
  subgraph Salesforce
    F[Flow: NFConsulta__c to Callout] -->|JSON| M1[API Middleware]
    M1 -->|Callback JSON| U[Atualiza NFConsulta__c]
  end
  subgraph Middleware_GCP
    M2[Recebe JSON] --> M3[Converte JSON to XML e Assina Cert A1]
    M3 --> M4[SOAP HTTPS to Prefeitura]
    M4 -->|XML| M5[Converte XML to JSON]
    M5 --> M6{Tempo < 60s?}
    M6 -->|Sim| R[Retorna JSON síncrono ao SF]
    M6 -->|Não e < 180s| retry[Retry com backoff exp.]
    retry --> M4
    M6 -->|Mais de 180s| queue[Enfileira em DLQ Pub/Sub]
    queue --> notify[Envia e-mail de alerta]
    queue --> callback[Callback assíncrono a SF]
  end
  subgraph Prefeitura
    P[Web Service SOAP TLS mútua]
  end
```

---

1. **Salesforce (Flow)**

    - Dispara callout síncrono (HTTP POST) ao endpoint do Middleware.
    - Timeout configurado em 60 segundos.
    - Aguardar resposta ou falha no mesmo contexto de execução.

2. **Middleware (Node.js @ GCP)**

    - **API Layer**: recebe JSON, valida esquema mínimo (número da NF, credenciais JWT).
    - **Transform & Sign**: converte para XML conforme XSD, assina PKCS#12 com Certificado A1.
    - **Transport SOAP**: invoca método `ConsultaNFe` da Prefeitura via HTTPS mútua TLS.
    - **Resiliência**:
        - _Retry_ automático até 5 tentativas com backoff exponencial (no total < 180s).
        - _Circuit Breaker_ para suspender chamadas se > X% de falhas em janela de 5 min.
        - _DLQ_ Após 180 segundos sem sucesso, enfileira mensagem em DLQ (Pub/Sub).
    - **Callback & DLQ**:
        - Se dentro de 60 s, retorna JSON ao Salesforce.
        - Se >60 s e <180 s, mantém retry.
        - Se >180 s, envia e-mail de alerta e dispara callback assíncrono a um endpoint REST em Salesforce.
    - **Logs & Auditoria**:
        - Todos os XML requests/responses salvos (criptografados) em Cloud Storage.
        - Logs estruturados no Cloud Logging para troubleshooting.

3. **Prefeitura (Web Service)**

    - SOAP síncrono com XSD/WSDL oficiais.
    - TLS mútua obrigatória via Certificado A1.
    - Retorna XML com dados oficiais da NF (dados de emissor, itens, valores, status).

---

### Pontos Críticos de Falha

- **Timeout** no callout síncrono (> 60 s)
- **Instabilidade** da API da Prefeitura (5xx, timeouts)
- **Assinatura digital** (certificado expirado ou inválido)
- **Parsing XML** (schemas ou WSDLs desatualizados)

---

### Estratégia de Resiliência Geral

- **Retry + Backoff** no Middleware (até 180 s)
- **Dead-Letter Queue** (Pub/Sub) e alertas por e-mail
- **Circuit Breaker** para evitar overload
- **Health Check** periódico (Cloud Scheduler → endpoint de teste)
- **Monitoramento** de métricas (latência, taxa de erro) via Cloud Monitoring
