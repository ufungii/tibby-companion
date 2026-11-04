# Shared backend deployment

The backend is custom code written for this project in `tibby_backend/`. It is
not a hosted service supplied by UF or NaviGator. NaviGator is the model provider;
this API supplies app sessions, patient context, audio handling and conversation
history around that provider.

Deploy this API once. Configure its stable HTTPS URL in the app build once. Every
installed copy then contacts the same service automatically, without asking users
for a server address. Every app session has its own token and histories; a shared
endpoint does not imply a shared patient/conversation session.

## Initial recommendation: Render for a test-data prototype

Render supports FastAPI web services and supplies an HTTPS `onrender.com` URL.
The root `render.yaml` specifies a Python service, dependency lockfile, health
endpoint and a single worker. It starts in deterministic demo mode, so no model
key is needed for the first deployment.

1. Commit/push the reviewed backend and deployment files to a repository the
   team's hosting account can access. Deploy the reviewed source commit.
   Do not include `.env`, caches or credentials.
2. In the team's Render account, create a Blueprint using the repository/branch
   containing `render.yaml`. Review the service/plan before deployment.
3. Deploy and verify `https://YOUR_ASSIGNED_HOST/health`. Expect `status: ok` and
   `provider: demo`. This checks the API, not Navigator access.
4. Set `EXPO_PUBLIC_BACKEND_URL` to that exact assigned HTTPS URL in the app's
   build environment; leave `EXPO_PUBLIC_DEMO_MODE=false`. Rebuild/reload the app.
   Never invent a production URL or use the example hostname as a real endpoint.
5. Open the app. It automatically opens an isolated server session and loads the
   roster. There is no server-address form or manual backend selection.

The Render integration can perform account operations after it is connected.
No hosting account was connected and no remote service was created in this task.

The manifest deliberately uses the free plan and disables automatic deploys. Free
Render services sleep after 15 minutes without traffic; the next request can take
time to start the process. They are useful for prototypes, not uninterrupted shift
use. Choose an always-on instance with the team when that is required. No paid
resource has been provisioned.

## Configure Navigator on the server

Set runtime secrets in the hosting dashboard, not source control or the phone:

```text
TIBBY_PROVIDER=navigator
NAVIGATOR_TOOLKIT_API_KEY=<team key>
NAVIGATOR_CHAT_MODEL=<a model available to that key>
NAVIGATOR_STT_MODEL=whisper-large-v3
```

Restart/redeploy and make a test conversation request. Verify the selected host
can reach UF's API and that the key has the required model/audio permissions.
The health endpoint or an API key alone does not prove this. If the host cannot
reach UF, use a team/UF-hosted runtime or a team-approved networking arrangement.

This prototype still uses anonymous demo-session creation, rather than clinician
authentication. Before offering a shared live-key service to actual users, add
real user/device authorization and usage controls. Initial hosting is for synthetic
patient fixtures and test speech. For real patient recordings/records, choose the
team's approved hosting and authentication arrangement.

## Other hosts

The same application can run on a UF/team server or another container host:

```sh
docker build -t tibby-backend ./tibby_backend
docker run --rm -p 8000:8000 -e TIBBY_PROVIDER=demo tibby-backend
```

The image excludes `.env` and runs as a non-root user. The host supplies TLS,
runtime secrets and the `PORT` value. Use one worker/replica for now. Sessions and
the last 40 conversation messages per patient are in process memory; restart,
redeploy, sleep or instance replacement loses them. A shared database/session
store is needed before horizontal scaling or durable conversation retention.

The phone works from any network that can reach the service. It still requires
internet access: remote hosting does not bypass eduroam authentication on the
phone. The wearable only needs its BLE link to that phone.

References: [Render FastAPI deployment](https://render.com/docs/deploy-fastapi),
[Blueprint specification](https://render.com/docs/blueprint-spec),
[free-service behavior](https://render.com/docs/free).
