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
