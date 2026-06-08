# JARVIS AI Assistant

JARVIS is a local AI-powered assistant designed to connect natural language, voice commands, AI orchestration, browser control, and workflow automation into one productivity system.

The project explores how AI agents can transform user intent into real actions, such as opening tools, controlling browser flows, executing local commands, generating documents, and supporting daily automation tasks.

## Problem Solved

Many repetitive computer tasks still require manual interaction: opening tools, navigating systems, searching information, triggering commands, generating documents, or switching between AI tools manually.

JARVIS was built to reduce this friction by allowing users to interact with a local assistant through voice and text, while the system handles execution, orchestration, and fallback between AI tools.

## Business Value

This type of assistant can be adapted for:

* Internal productivity assistants
* AI-powered workflow automation
* Customer support operations
* Back-office task automation
* Browser-based process automation
* Developer productivity tools
* Document and PDF workflow generation
* Multi-model AI orchestration

The main value is reducing repetitive manual work and creating a bridge between AI reasoning and real system actions.

## Core Features

* Real-time voice interaction
* Wake-word activation using "Jarvis"
* Local command execution for apps, URLs, and system tasks
* Browser control and automation helpers
* Screen analysis support
* PDF generation and document workflow utilities
* Claude Code as the primary reasoning/coding engine
* Codex CLI fallback when Claude usage is unavailable
* Automatic return to Claude when usage becomes available again
* Multi-tool orchestration for productivity workflows

## What I Built

I designed and implemented the assistant structure, including:

* Voice command flow
* Command normalization and intent handling
* Local task execution logic
* Browser automation helpers
* AI tool orchestration
* Claude/Codex fallback flow
* Environment configuration
* Documentation
* Safety rules for local and destructive commands

## Technical Challenges

Some of the main challenges were:

* Mapping natural voice commands to reliable actions
* Handling different variations of spoken input
* Keeping AI-generated code under human validation
* Managing fallback between different AI tools
* Avoiding unsafe execution of destructive system actions
* Keeping sensitive credentials outside the repository
* Structuring the project so it could grow into a more agentic workflow system

## Tech Stack

* Node.js
* Express
* OpenAI API
* Anthropic SDK / Claude CLI
* Codex CLI
* Puppeteer
* Python utilities
* Speech Recognition
* Voice Commands
* Workflow Automation

## Requirements

* Node.js 18+
* Python 3.11+
* OpenAI API key
* Claude Code CLI installed and authenticated
* Codex CLI installed and authenticated
* Google Chrome

## Quick Start

```bash
npm install
npm run start
```

Default server URL:

```txt
http://localhost:3000
```

## Environment Variables

Create a `.env` file at the project root:

```env
OPENAI_API_KEY=your_openai_key
```

Add any other local credentials required by your setup.

## Security Notes

This repository is configured to avoid committing sensitive or machine-specific files, including:

* `.env` and local environment variants
* `node_modules/`
* logs
* local memory/history files
* generated workspace content
* personal documents or local project files

## Disclaimer

This is a personal AI assistant project for productivity, automation, and AI orchestration.

Use destructive system actions such as shutdown, restart, process control, or file operations responsibly.
