# Deployment

How this app gets to production on Vercel, and what you (the human) need to configure by hand.

## Vercel project

| | |
|---|---|
| Project name | `learn-english-from-hebrew` |
| Project ID | `prj_mReWR2O7GxFsUWZytM30sfDFritk` |
| Team | Jordan's projects (`team_zpor3pyEc9WmIEUKI1hmQUBi`) |
| Linked repo | `JordanG8/learn-English-from-Hebrew` (GitHub) |
| Framework preset | Next.js (auto-detected) |
| Production branch | `claude/english-alphabet-game-kids-v3dlw7` |
| Production URL | https://learn-english-from-hebrew-jordans-projects-222c21c6.vercel.app |
| Dashboard | https://vercel.com/jordans-projects-222c21c6/learn-english-from-hebrew |

The GitHub repo is linked, so **every push triggers a deployment automatically**. No
`vercel deploy` needed.

### About the production branch

This repo currently has exactly one branch — `claude/english-alphabet-game-kids-v3dlw7` —
and GitHub has set it as the repo's **default branch**. There is no `main`. Vercel
inherited that default, so this branch *is* production: pushes to it deploy straight to
the production URL, with no preview step in between.

That is convenient right now, but it is not where you want to end up. When the app
stabilises, do one of the following:

- **Recommended:** create a `main` branch, make it the GitHub default, and set it as the
  Vercel production branch (Project → Settings → Git → Production Branch). The
  `claude/*` branches then deploy as previews and you merge to `main` to release.
- **Or:** leave it as-is and accept that every push is a production release.

Until you change it, treat any push to `claude/english-alphabet-game-kids-v3dlw7` as
shipping to users.

## Environment variables

### `AI_GATEWAY_API_KEY` — required for conversation mode

Conversation mode calls an LLM through the **Vercel AI Gateway** using the AI SDK
(`ai` v5). The gateway is the AI SDK's default provider, so a route can name a model as a
plain string (see *Model IDs* below) and the SDK routes it through the gateway
automatically. Authentication is read from the environment — no client construction and no
provider SDK required.

**On Vercel (deployed):** you have two options.

1. **OIDC (no key to manage).** Vercel injects a `VERCEL_OIDC_TOKEN` into deployments,
   and the AI SDK falls back to it when `AI_GATEWAY_API_KEY` is absent. This is the
   lowest-maintenance path: nothing to rotate, nothing to leak. Confirm OIDC is enabled
   for this project under **Project → Settings → Security → OIDC Federation**; if the
   toggle is not available on your current plan, use option 2.
2. **An explicit API key.** Create one, then set it as an environment variable:
   - Create the key: **Vercel dashboard → AI Gateway → API Keys → Create key**
     (or `vercel ai-gateway api-keys create`). Copy the secret — it is shown once.
   - Add it: **Project → Settings → Environment Variables**
     - Key: `AI_GATEWAY_API_KEY`
     - Value: the key you just created
     - Environments: tick **Production**, **Preview**, and **Development**
   - Redeploy. Environment variables are baked in at build/run time, so an existing
     deployment will not pick up a newly added variable until it is redeployed.

If both are present, `AI_GATEWAY_API_KEY` wins.

**Locally (`npm run dev`):** OIDC is not automatic — there is no deployment to issue a
token — so local development needs an explicit value. Either:

```bash
# Option A: put the gateway key in .env.local (gitignored)
echo 'AI_GATEWAY_API_KEY=your_key_here' >> .env.local
```

```bash
# Option B: pull a short-lived OIDC token from the linked project
vercel link          # once, links this checkout to the Vercel project
vercel env pull      # writes .env.local, including VERCEL_OIDC_TOKEN
```

Option B's token is short-lived; re-run `vercel env pull` when it expires. Option A is
simpler for day-to-day work.

> **Never commit either value.** `.env*.local` is already in `.gitignore`, as is `.vercel`.
> No key belongs in the repo, in `vercel.json`, or in `next.config.ts`.

### A Blob store — required to record the app's voice in production

The app speaks in a recorded human voice where one exists (see `docs/voice.md`).
Recordings made from `/studio` on the deployed site are written to **Vercel
Blob**, because a lambda's filesystem is read-only. Create the store under
**Project → Storage → Create → Blob**, connect it to the project with
**Production** ticked, and redeploy.

**No token to manage.** Connecting a store injects `BLOB_STORE_ID`, and the
project's OIDC federation supplies a short-lived `VERCEL_OIDC_TOKEN` per
deployment; the SDK exchanges the pair for access. A long-lived
`BLOB_READ_WRITE_TOKEN` is honoured if present but is not required and not
recommended.

Without a store the studio says so on screen and refuses to record rather than
pretending to save. Locally, `npm run dev` needs nothing: clips are written
straight into `public/voice/`.

### `VOICE_STUDIO_PASSCODE` — required to record from the deployed site

`/studio` writes the voice every child then hears, and the production URL is
public. Set this to any string (Production, Preview and Development) and the
studio asks for it once per device. If it is unset, recording is allowed in
development and **refused in production** with a message saying what to set.

### Summary

| Variable | Where it comes from | Deployed | Local |
|---|---|---|---|
| `AI_GATEWAY_API_KEY` | You create it in the AI Gateway dashboard | Set it in Project → Settings → Environment Variables | Put it in `.env.local` |
| `VERCEL_OIDC_TOKEN` | Injected by Vercel automatically | Automatic, nothing to do | Only via `vercel env pull`, and it expires |
| `BLOB_STORE_ID` (+ OIDC) | Injected when you connect a Blob store | Project → Storage → Create → Blob, Production ticked | Not needed; dev writes to `public/voice/` |
| `VOICE_STUDIO_PASSCODE` | You choose it | Project → Settings → Environment Variables | Optional; dev allows recording without one |

## Model IDs

AI Gateway model IDs are `creator/model-name` strings — the provider slug, a slash, then
the model:

```ts
import { streamText } from 'ai';

const result = streamText({
  model: 'anthropic/claude-sonnet-5',   // creator/model-name
  messages,
});
```

Other valid examples: `openai/gpt-5.6-sol`, `google/gemini-3.1-pro-preview`,
`xai/grok-4.5`. The full live list is a public, unauthenticated endpoint:

```bash
curl https://ai-gateway.vercel.sh/v1/models
```

Do not use a bare model name (`claude-sonnet-5`) — the gateway needs the creator prefix to
route the request.

## Build and runtime configuration

- **Node.js:** pinned to 22 via `.nvmrc`. Vercel reads this and matches it locally-to-
  deployed, so a version drift on Vercel's default cannot silently change build behaviour.
- **Next.js:** pinned to an exact `15.5.23` in `package.json`. This is deliberate —
  Vercel **refuses to deploy** builds using Next.js versions vulnerable to
  CVE-2025-66478 (the React Server Components RCE), which covers everything in the 15.5
  line before 15.5.7. The build compiles fine on older versions and is then rejected at
  the *deploy* step, which makes the failure look confusing. If you ever downgrade Next,
  stay at 15.5.7 or above.
- **Tailwind v4:** configured through `postcss.config.mjs` with the
  `@tailwindcss/postcss` plugin. v4 needs no `tailwind.config.js`; theme and content are
  driven from `app/globals.css`. Adding a v3-style config file will not help and may
  confuse things.
- **TypeScript:** `strict` mode, `moduleResolution: "bundler"`, `@/*` path alias mapped to
  the repo root. `next build` type-checks as part of the build, so a type error fails the
  deploy.
- **No `vercel.json`.** Next.js is auto-detected; build command, output directory, and
  routing are all inferred correctly. Adding one is not required and would only be
  worth it for things the framework cannot express (custom cron jobs, per-function region
  or memory overrides). If the chat route eventually needs a longer timeout, prefer
  `export const maxDuration = 60` in the route file over a `vercel.json` entry.

## Deploying

```bash
git push          # -> automatic deployment, currently straight to production
```

To check a deploy: **Dashboard → Deployments**, or `vercel inspect <url> --logs`.

### If a deploy fails

1. Reproduce locally first — `npm run build` runs the same compile and type-check.
2. If it builds locally but fails on Vercel, read the *end* of the build log. A build that
   reports "Build Completed" and *then* errors is being rejected by a platform gate
   (vulnerable dependency version, size limit), not by your code.
3. `npm run typecheck` isolates type errors from bundling errors.
