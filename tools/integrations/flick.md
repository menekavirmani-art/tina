# Flick

All-in-one social media marketing platform (flick.social) built around Instagram and TikTok hashtag research, hashtag performance tracking, post scheduling, and AI-assisted caption/hashtag writing.

## Capabilities

| Integration | Available | Notes |
|-------------|-----------|-------|
| API | - | No public developer API. Flick uses the official Instagram API internally (publishing, analytics, hashtags) but does not expose an API for third-party integration |
| MCP | - | Not available |
| CLI | - | Not available |
| SDK | - | Not available |

Flick is a web/mobile-app product, not a programmatic integration. Use the web app at https://www.flick.social or the mobile app for all workflows — there's nothing here for a script to call.

## Authentication

- **Type**: Account login at https://www.flick.social
- **Free trial**: 7 days, no credit card details confirmed either way — verify current terms before quoting
- **Paid plans** (billed yearly, per flick.social/learn/pricing as of last check — verify current pricing before quoting to a user):

| Plan | Price (billed yearly) | Social Profiles | Posts/Social/Month |
|------|------------------------|------------------|---------------------|
| Solo | ~£11/mo | 4 | 30 |
| Pro | ~£24/mo | 8 | Unlimited |
| Agency | ~£55/mo | 20 (up to 5 logins) | Unlimited |

## What Flick Does

- **Hashtag research** — find high-performing, relevant hashtags for Instagram and TikTok posts
- **Hashtag tracking** — measure how each hashtag performed on each published post
- **Post scheduling** — plan and publish to Instagram, Facebook, TikTok, and LinkedIn
- **Analytics & reporting** — post and account-level performance insights
- **AI Social Assistant** — generates captions and hashtag suggestions from a topic or draft caption

## Common Agent Operations

Since there's no API, agents can't call Flick directly. Guide the user through the web app instead:

### Hashtag research for a post

1. Open Flick's Hashtag tool and enter the post topic or draft caption
2. Review the suggested hashtags, sorted by relevance/competition
3. Save a hashtag group for reuse on similar future posts

### Tracking hashtag performance over time

1. After publishing with Flick's tracked hashtags, check the Hashtag Tracking dashboard
2. Compare reach/engagement across hashtag groups to find what's actually working
3. Retire underperforming hashtags from saved groups; keep testing new ones

### Scheduling with AI-assisted captions

1. Draft the post topic or key point
2. Use the AI Social Assistant to generate caption + hashtag options
3. Edit for brand voice, then schedule via Flick's post scheduler

## When to Use

- Instagram/TikTok hashtag research and performance tracking specifically (its core strength)
- Multi-platform scheduling when the user is already paying for Flick
- Quick AI-drafted captions/hashtags as a starting point (always edit for brand voice)

## When Not to Use

- Anything requiring programmatic/automated access — there's no API, so this can't be wired into an agent pipeline. Use **buffer** (`tools/clis/buffer.js`) instead for API-driven scheduling.
- Deep cross-platform analytics beyond Instagram/TikTok/Facebook/LinkedIn — check the tool's current platform coverage before assuming support.

## Limitations

- No public API, CLI, MCP, or SDK — every workflow above requires a human (or a browser-automation tool) driving the web/mobile app
- Pricing and plan details change; verify current figures at flick.social/learn/pricing before quoting them to a user
- Hashtag/engagement data is bounded by what Instagram's and TikTok's own official APIs expose to Flick

## Relevant Skills

- social
- content-strategy
