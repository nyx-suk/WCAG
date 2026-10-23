# Deploy the WCAG Project on Render (Free)

This guide uses **Render only**: one platform for your dashboard,
Express API, fixtures, and Playwright audits.

> **Free-tier warning:** Render's free web service has limited RAM
> (typically 512 MB) and temporary local storage. Chromium audits may
> fail from memory pressure, and your SQLite database or evidence files
> may be lost after a restart or redeploy. This is okay for a quick
> demo, but do not rely on it for permanent data.

## 1. Prepare your GitHub repository

1.  Make sure your latest project code is pushed to GitHub.
2.  Check that the repository contains your `Dockerfile`.
3.  Check `package.json` and confirm your project has the correct
    production start command.
4.  Confirm your server reads `process.env.PORT` and listens on
    `0.0.0.0`.

Example server setup:

``` ts
const port = Number(process.env.PORT || 5000);
server.listen(port, "0.0.0.0");
```

Use your project's actual server file and scripts.

## 2. Create the Render service

1.  Go to [Render Dashboard](https://dashboard.render.com/).
2.  Click **New → Web Service**.
3.  Connect GitHub, then select your WCAG project repository.
4.  Choose **Docker** as the runtime.
5.  Give the service a name, such as `wcag-audit`.
6.  Select the branch you want to deploy.
7.  Choose the **Free** instance type for a demo.
8.  Click **Create Web Service** and wait for the build/deploy to
    finish.

Render will build the app using the `Dockerfile` in your repository.

## 3. Add environment variables

In Render, open your service → **Environment**. Add:

  ----------------------------------------------------------------------------
  Variable                            Value
  ----------------------------------- ----------------------------------------
  `PUBLIC_BASE_URL`                   The public URL Render assigns to your
                                      service,
                                      e.g. `https://wcag-audit.onrender.com`

  `ADMIN_TOKEN`                       A long random secret

  `PORT`                              Your app must read Render's assigned
                                      `PORT`; don't hardcode a production port
  ----------------------------------------------------------------------------

Generate an admin token on your computer:

``` bash
node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))'
```

Copy the output into Render's `ADMIN_TOKEN` field. **Do not commit the
token to GitHub or put it in frontend JavaScript.**

If your code requires a fixture URL or other environment variables, add
those too using the exact names your code expects.

## 4. Set the health check

1.  In Render service settings, find **Health Check Path**.
2.  Set it to:

``` text
/health
```

3.  Make sure your Express app has a health route that returns HTTP 200,
    for example:

``` ts
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});
```

Only add this route if your project does not already have one.

## 5. Open and test the deployment

Replace the example host with your actual Render URL.

1.  Open:

    `https://YOUR-RENDER-URL/health`

    It should return HTTP 200.

2.  Open your dashboard at the Render service's root URL.

3.  Open your deployed fixture route (use the real route from your
    project).

4.  Run **one** audit against a fixture.

5.  Check the audit result and open its screenshot/video evidence if
    produced.

## 6. If the audit fails, check these five things first

1.  **Chromium launch:** Confirm the Docker Playwright image version
    matches the Playwright package in your project.
2.  **Shared memory:** Chromium may crash if shared memory is
    constrained. Check logs; `--disable-dev-shm-usage` can be a fallback
    to test.
3.  **Timeouts:** Check navigation and audit timeouts, and whether the
    target fixture responds slowly.
4.  **Fixture URL:** Make sure the fixture server/route is deployed and
    reachable from the audit service.
5.  **Evidence permissions:** Check that the app can create folders and
    write screenshots/videos.

## 7. Remember the free-tier limits

-   Run audits **one at a time** to reduce memory pressure.
-   Render Free may sleep after inactivity, so the first request can be
    slow.
-   Local `data/` and `evidence/` files are **not guaranteed to
    persist**. Download or back up anything important.
-   If Chromium repeatedly runs out of memory, or you need durable
    database/evidence storage, the free Render service is not enough.
    You will need a larger service and persistent storage, or a separate
    database/object-storage setup.
