# Express

**Tipo:** Framework HTTP para Node.js

## O que e

Express e o framework web minimalista para [[Tecnologias/Node.js]]. Fornece roteamento, middleware e gerenciamento de requisicoes/respostas HTTP.

## Como o JARVIS usa

- Serve todos os endpoints da API REST do JARVIS
- Roteamento de endpoints de voz, visao, execucao de tarefas e computer use
- Middleware de parsing JSON para corpo das requisicoes
- Serve arquivos estaticos do frontend (HTML, CSS, JS)
- Gerencia rotas para geracao de PDFs via [[Tecnologias/Puppeteer]]
- Endpoint `/api/pdf` para conversao HTML -> PDF

## Gotchas

- Body parser tem limite de tamanho configurado para suportar screenshots base64 grandes
- Rotas de streaming (SSE) precisam de headers especificos para manter conexao aberta
- CORS configurado para aceitar requisicoes do Electron launcher

## Links

- [[Arquitetura]]
