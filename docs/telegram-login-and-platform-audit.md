# Telegram Login and Multi-User Platform Audit

## Verified authentication approach

Telegram’s current website login flow uses **OpenID Connect Authorization Code Flow with PKCE**. The bot owner must register allowed website origins and exact redirect URLs in BotFather. The application sends users to Telegram’s authorization endpoint with a random state value and PKCE challenge, receives an authorization code at the callback URL, exchanges it for tokens, and verifies the returned ID token against Telegram’s JWKS keys. The verifier must enforce the expected issuer, audience, expiry, and one-time state.[1]

## Current product state

| Area | Current behavior | Gap for multi-user product |
| --- | --- | --- |
| Dashboard identity | Manus OAuth account only; one durable project-owner flag. | Users cannot use Telegram identity to sign in or see their own groups. |
| Group access | Any Telegram group admin can configure a group in chat. | No user-to-group access table exists for dashboard tenancy. |
| Dashboard data | A single owner dashboard reads every configured group. | Need scoped personal group dashboards and owner-only global views. |
| Statistics | Per-group counts are available through the bot and global dashboard cards. | Need safe per-user aggregates, active-group measures, and owner-only platform aggregates. |
| Authorization | Group chat commands are checked live with Telegram `getChatMember`. | Dashboard needs a separate verified Telegram identity and a group-access synchronization strategy. |
| Operations | Webhook, retention cleanup, embeddings, and semantic retrieval are live. | No user notification, group-member invitation flow, billing, rate limiting, or group offboarding workflow exists. |

## Recommended design

The application should bind a verified Telegram user ID to an internal dashboard account. A user should see only groups for which the bot has observed that user as an administrator. The owner account should retain a separate `isProjectOwner` capability allowing cross-group global statistics, webhook health, retention operations, and group-level diagnostic detail.

The Telegram login credentials and allowed callback URLs must be configured before the login flow can be activated. The existing Manus login should remain available as a fallback for the project owner until the Telegram flow has been verified in production.

## Finalized authorization model

| Component | Design decision | Protection provided |
| --- | --- | --- |
| Dashboard identity | Store Telegram `sub` as a unique numeric `telegramId`; preserve the existing internal `openId` so prior Manus-owner access remains intact. | A Telegram account is linked to one durable internal account without exposing bot credentials to the browser. |
| Owner claim | The authenticated existing project owner starts a one-time Telegram-linking flow. The callback binds that Telegram ID to the durable owner record. | Owner access cannot be granted merely by knowing a Telegram numeric ID. |
| Group grants | A `user_group_access` record is created only after the bot verifies that the command sender is a live Telegram group administrator. | A dashboard user cannot self-assign a group or view unrelated group metadata. |
| Access freshness | The personal dashboard rechecks the Telegram admin status for each accessible group before returning scoped data; stale or failed checks are excluded. | Group access is removed when the person is no longer an administrator, rather than remaining permanent. |
| Owner console | The global procedure requires `isProjectOwner`, not a general application-admin role. | Ordinary Telegram dashboard users cannot enumerate groups, messages, webhook health, or platform totals. |
| Login callback | Use random state, an HTTP-only host-only cookie, PKCE S256, basic-authenticated code exchange, JWKS signature validation, and issuer/audience/expiry checks. | Protects against CSRF, authorization-code interception, token forgery, and token mix-up. |

## Dashboard information model

Every signed-in Telegram user receives a personal view with only the groups whose live administrator check succeeds, plus per-group memory state, retention window, retained-message count, and last activity. The owner receives the same personal view as a member plus a separate global console that covers every group, total retained messages, active-group count, memory-enabled count, retention-job telemetry, and Telegram webhook/bot health. The dashboard is intentionally read-focused: group setting changes remain auditable Telegram admin commands.

> **Operational note:** Existing groups will become visible in a regular user’s dashboard after that user issues an admin command such as `/status` in each group. This lets the bot observe and verify the administrator relationship without inventing access records.

## References

[1] [Telegram: Log In With Telegram](https://core.telegram.org/bots/telegram-login)
