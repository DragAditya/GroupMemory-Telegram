# Project TODO

- [x] Validate Telegram webhook capabilities and select a managed runtime approach.
- [x] Integrate the Telegram Bot API credentials and protected webhook verification.
- [x] Define database schema for per-group settings, captured messages, metadata, embeddings, and retention indexes.
- [x] Implement webhook ingestion for group messages and structured metadata extraction.
- [x] Enforce strict group-administrator authorization for `/memory`, `/retention`, and `/status`.
- [x] Implement `/ask`, `/search`, and bot-mention query paths with source-aware response formatting.
- [x] Generate Gemini embeddings and store searchable vectors for each retained message.
- [x] Retrieve relevant evidence and produce non-hallucinatory Gemini answers with source links.
- [x] Implement the authenticated per-group retention cleanup endpoint with observability and safe batching.
- [x] Activate the managed retention cleanup schedule after the production site is published.
- [x] Build a minimal, owner-only dashboard for group status, settings, message counts, and activity.
- [x] Add unit tests for credential validation, metadata normalization, command parsing, webhook secrets, and Gemini retrieval input shaping.
- [x] Verify the operational flows, responsive dashboard, server health, and deployment configuration.
- [x] Deliver a checkpoint and exact Telegram webhook setup instructions.
- [x] Persist eligible query-trigger and anonymous-admin group messages with complete available sender metadata.
- [x] Process retention deletion in bounded batches with explicit cleanup progress logging.
- [x] Verify the owner dashboard at mobile and tablet breakpoints before delivery.
- [x] Send a simple Telegram onboarding checklist covering privacy mode, group access, commands, and active service verification.
