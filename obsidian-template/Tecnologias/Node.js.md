# Node.js

**Runtime:** v24.x
**Tipo:** Runtime JavaScript server-side

## O que e

Node.js e o runtime JavaScript que executa codigo fora do browser. Baseado no motor V8 do Chrome, permite construir servidores HTTP de alta performance com I/O nao-bloqueante.

## Como o JARVIS usa

- Roda o `server.js` principal na **porta 3000**
- Gerencia todos os endpoints HTTP via [[Tecnologias/Express]]
- Spawna processos filho para executar scripts Python e tarefas do [[Tecnologias/Claude Code CLI]]
- Gerencia WebSocket connections para comunicacao em tempo real com o frontend
- Controla o warm pool de processos Claude (Opus x 1, Sonnet x 3, Haiku x 4)

## Gotchas

- Precisa estar no PATH do sistema para o launcher encontrar
- Child processes spawnam com `shell: true` no Windows para compatibilidade
- Encoding UTF-8 precisa ser forcado em child processes (`chcp 65001`)

## Links

- [[Arquitetura]]
