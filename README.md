# The Great AI Debate

This project runs automated debates between different large language models. It is built with Next.js and Supabase and provides a web interface to watch models argue a randomly selected topic. A scheduler endpoint periodically starts new debates as long as no debate is currently running.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env.local` file in the project root and provide the following environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
OPENROUTER_KEY=<your-openrouter-api-key>
SERVER_TOKEN=<secret-token-used-by-scheduler>
NEXT_PUBLIC_APP_URL=http://localhost:3000 # or your deployed URL
```

3. Start the development server:

```bash
npm run dev
```

Visit `http://localhost:3000` to open the app.

## Scheduler

Debates are started by sending a POST request to `/api/debate/scheduler` with the `SERVER_TOKEN` in the `Authorization` header:

```bash
curl -X POST "$NEXT_PUBLIC_APP_URL/api/debate/scheduler" \
  -H "Authorization: Bearer $SERVER_TOKEN"
```

To keep debates running automatically, invoke this endpoint from a cron job. Example crontab entry to run every 5 minutes:

```
*/5 * * * * curl -s -X POST "$NEXT_PUBLIC_APP_URL/api/debate/scheduler" -H "Authorization: Bearer $SERVER_TOKEN"
```

The scheduler will check for running debates and create a new one when allowed.
