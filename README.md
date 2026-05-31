# JARVIS AI Assistant

JARVIS (Just A Rather Very Intelligent System) is a local AI assistant inspired by Tony Stark's interface.
It combines voice interaction, task execution, browser/app control, and multi-model orchestration with automatic fallback between Claude Code and Codex.

## Author

**Yago Davi Cerqueira Nogueira**

## Core Features

- Real-time voice mode (mic + speech response)
- Wake-word activation (`Jarvis`)
- Fast local command execution (apps, URLs, system tasks)
- Claude Code as primary engine with Codex fallback when Claude usage is at limit
- Automatic return to Claude when usage is available again
- Screen analysis and automation helpers
- PDF generation and document workflow utilities

## Tech Stack

- Node.js + Express
- OpenAI API (TTS/STT/Realtime)
- Anthropic SDK / Claude CLI
- Codex CLI fallback orchestration
- Puppeteer + Python utilities
- Speech Recognition
- Voice Commands
- Workflow Automation

## Project Purpose

This project was created to explore how AI assistants can combine voice interaction, task automation, browser control, and multi-model orchestration to improve personal productivity.

## Requirements

- Node.js 18+
- Python 3.11+
- OpenAI API key
- Claude Code CLI installed and authenticated
- Codex CLI installed and authenticated
- Google Chrome

## Quick Start

```bash
npm install
npm run start
```

Server default URL:

```text
http://localhost:3000
```

## Environment Variables

Create a `.env` file at the project root (already ignored by git):

```env
OPENAI_API_KEY=your_openai_key
```

Add any other local credentials required by your setup.

## Git Ignore Notes

This repository is configured to avoid committing sensitive or machine-specific files, including:

- `.env` and local env variants
- `node_modules/`
- logs (`*.log`)
- local memory/history files under `system/`
- generated workspace content under `Documents and Projects/`

## Disclaimer

This is a personal AI assistant project for productivity and automation.  
Use destructive system actions (shutdown/restart/process control) responsibly.
