### 1. Monitoramento (Cloud Monitoring & Logging)

- **Uptime Check**
    
    - Endpoint: `GET /health`
        
    - Frequência: a cada **8 horas**
        
    - Condição de alerta: 1 falha (já que o intervalo é longo) → dispara notificação.
        
- **Métricas e Dashboards**
    
    - **Latência Média**: tempo médio (em ms) de cada chamada SOAP → extraída de metricas custom enviadas pelo Node.js.
        
    - **Taxa de Erro 5xx**: % de respostas HTTP ≥500 no endpoint `/consultaNFe`.
        
    - **DLQ Depth**: número de mensagens atuais no tópico `nfe-dlq`.
        
    - **Health Check Success**: % de verificações bem-sucedidas do uptime (esperado ≥ 99.9%).
        
    - **Dashboard**: um painel no Cloud Monitoring em `us-central1` exibindo gráficos de Latência, Taxa de Erro 5xx, DLQ Depth e Health Check Success.
        
- **Alerting Policies**
    
    1. **Latência Média > 5 s** em janela de 15 min → e-mail.
        
    2. **Taxa de Erro 5xx ≥ 5%** em janela de 15 min → e-mail.
        
    3. **DLQ Depth ≥ 1** por mais de 10 min → e-mail.
        
    4. **Health Check** falhar em 1 ciclo (8 h) → e-mail.
        
    
    **Destinatário**: vitor@standout.com.br
    

### 2. Logs Estruturados

- **Cloud Logging**:
    
    - Estruture logs com `severity` (INFO, ERROR).
        
    - Inclua campos custom: `consultaId`, `phase` (“transform”, “soap-call”, “callback”).
        
- **Log-Based Metrics**:
    
    - Contar `publishPlatformEvent` com `Status=Failed`.
        
    - Contar eventos de retry e circuit breaker open.
        
- **Export**:
    
    - Exportar logs de erro para BigQuery para auditoria e análise histórica.
        

### 3. Runbook de Operação

|Situação|Passos|Ferramentas|
|---|---|---|
|**Health Check falhando**|1. Conferir Uptime Check → Cloud Monitoring||

2. Verificar serviço Cloud Run (`gcloud run services describe`)
    
3. Revisar logs no Cloud Logging (`resource.type="cloud_run_revision" AND severity="ERROR"`)
    
4. Reiniciar serviço se necessário (`gcloud run services update-traffic …`) | GCP Console, gcloud CLI |  
    | **Alta latência** | 1. Checar Latência Média no dashboard
    
5. Identificar picos de tráfego
    
6. Avaliar retries em DLQ
    
7. Ajustar timeout/backoff ou escalar recurso | Cloud Monitoring, Pub/Sub UI |  
    | **Mensagens em DLQ** | 1. `gcloud pubsub subscriptions pull …`
    
8. Inspecionar payload e erro
    
9. Corrigir causa (schema, certificado)
    
10. Re-publicar manualmente ou via script | gcloud CLI |  
    | **Erro 5xx recorrente** | 1. Revisar logs de erro
    
11. Verificar status do circuito (Circuit Breaker)
    
12. Se necessário, atualizar WSDL/XSD ou rede TLS
    
13. Deploy de correção | Cloud Logging, código & CI/CD |  
    | **Certificado expirado** | 1. Validar expiração no Secret Manager
    
14. Gerar novo `.p12` e carregar nova versão
    
15. Redeploy do Cloud Run para carregar novo segredo | Secret Manager, Console GCP |
    

### 4. Planos de Contingência

- **Reprocessamento Manual**
    
    - Botão “Reprocessar” em `NFConsulta__c` dispara novo callout.
        
- **Fallback Offline**
    
    - Exportar CSV de registros pendentes em Salesforce para execução em lote.
        
- **Contato Prefeitura**
    
    - Manter lista de suporte técnico e SLA oficial para acionamento em caso de indisponibilidade prolongada.