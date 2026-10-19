# Fabricate (CPEN 321 — M1)

An Android app skeleton with a Node.js/TypeScript back-end. The app has three
independent features:

1. **Login + Server** — Google Sign-In, then displays the server/client IP
   addresses, server/client local times, the app owner's name (from a back-end
   API), and the signed-in user's name.
2. **Live Updates** — a 16×16 pixel-art canvas that fills in live, streamed from
   a course web-socket server and relayed through the back-end.
3. **Timer** — a countdown timer that, on completion, fetches and displays a
   trivia question (Open Trivia DB).

_Keep this README up to date with the steps required to build and run the frontend and backend._

## Requirements

Install the following before the frontend or backend setup steps:

- [git](https://git-scm.com/)

---

## Frontend Setup

### Requirements

- [Android Studio](https://developer.android.com/studio) (latest version)
- [Java 17](https://adoptium.net/temurin/releases/?version=17)
- [Android SDK](https://developer.android.com/studio) with API level 36 (Android 16 / "Baklava")

### Setup

1. **Open project**: Open the `frontend/` directory in Android Studio.
2. **Sync Gradle**: Click "Sync Now" when prompted (or run `cd frontend && ./gradlew build`).
3. **Configure Android SDK**: Ensure Android SDK API 36 is installed.
4. **Set up emulator/device**:
   - Create an AVD with **Pixel 9** and the **Android Baklava (API 36)** system image, **or**
   - Connect a physical Android device running API 36.
5. **Set up app config**: copy the example file:
   ```bash
   cp frontend/local.properties.example frontend/local.properties
   ```
   It already has the right values for the deployed back-end. Check:
   - `sdk.dir`: path to your Android SDK (Android Studio usually writes this automatically).
   - `GOOGLE_CLIENT_ID`: the back-end's Google OAuth Web client ID (already filled in; it is not a secret).
   - `API_BASE_URL`: the back-end URL baked into the app. Choose one:
     - **Deployed back-end (recommended, already running):** `https://api.evannawfal.com`
     - **Local back-end on the emulator:** `http://10.0.2.2:3000` (`10.0.2.2` is the host machine)
     - **Local back-end on a physical device (same Wi-Fi):** `http://<your-lan-ip>:3000`

### Build and Run

- **Debug build**: click the green ▶ button in Android Studio to build, install, and run on the emulator/device. (Or `./scripts/run-frontend.sh` from the project root.)
- **Release build**: `cd frontend && ./gradlew :app:assembleRelease`, then install `frontend/app/build/outputs/apk/release/app-release.apk` (e.g. `adb install` or drag it onto the emulator).

Debug and release builds are both signed with the team's shared debug key, `frontend/app/fabricate-debug.keystore` (password `android`). Its SHA-1 is registered for Google Sign-In in our Google Cloud project, so sign-in works no matter who builds the app. It only identifies our builds; it is not a production secret.

---

## Backend Setup

You can run the back-end either locally via Node.js or via Docker Compose.

### Environment configuration

Copy the example file and fill in the values:

```bash
cp backend/.env.example backend/.env
```
- `GOOGLE_CLIENT_ID` (required): the OAuth client ID used to verify Google Sign-In tokens.
- `JWT_SECRET` (required): any long random string, e.g. the output of `openssl rand -base64 48`.
- `MONGODB_URI` (required): the MongoDB connection string. Docker Compose sets this automatically.
- `PORT` (optional): defaults to `3000`.
- `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_CONTAINER` (needed for photos and avatars): see [File storage](#file-storage).
- `ANTHROPIC_API_KEY` (needed to classify clothing photos): see [Photo classification](#photo-classification).

### Database

The back-end stores users, clothing items and outfits in **MongoDB** (accessed with
[Mongoose](https://mongoosejs.com/)). MongoDB fits the app's document-shaped data
(clothing items with tags, outfits referencing items) and runs as a container next to
the back-end, so no separate database server needs to be set up.

- **Docker Compose** (Option 2) starts MongoDB automatically.
- **Running locally** (Option 1) needs a MongoDB 7 server, with `MONGODB_URI=mongodb://localhost:27017/cpen321`:
  - With Docker: `docker run -d -p 27017:27017 mongo:7`
  - Without Docker on macOS: `brew tap mongodb/brew && brew install mongodb-community@7.0 && brew services start mongodb-community@7.0`
  - Without Docker on Windows/Linux: install [MongoDB Community Server](https://www.mongodb.com/try/download/community)
- **Tests** (`npm test`) start their own temporary in-memory MongoDB, so no database setup is
  needed. The first run downloads a MongoDB binary, which requires an internet connection.

### File storage

Clothing photos and avatar models are stored in a **private Azure Blob Storage container**. The
app never gets direct storage access; the back-end hands it short-lived signed (SAS) download links.

- `AZURE_STORAGE_CONNECTION_STRING`: the storage account's connection string (Azure portal →
  storage account → *Access keys*). It must include the account key, which is used to sign links.
- `AZURE_STORAGE_CONTAINER`: the container name, e.g. `fabricate-files`. It is created
  automatically (private) on the first upload if it doesn't exist.

To try it locally without an Azure account, run the official emulator,
`docker run -p 10000:10000 mcr.microsoft.com/azure-storage/azurite azurite-blob --blobHost 0.0.0.0`,
and set `AZURE_STORAGE_CONNECTION_STRING=UseDevelopmentStorage=true`.

File storage is optional for running the server: without it, everything else works and features
that store files respond with `503 File storage is not available`. Tests never use real storage.

### Photo classification

Uploaded clothing photos are classified (name, category, colour, style) by **Claude Sonnet 5.5**
through the [Claude API](https://platform.claude.com/docs) (an external AI vision API). It was chosen
for reliable results on tricky items (dresses vs. tops, outerwear) at a cost of well under a cent
per photo; the account has a monthly spend limit.

- `ANTHROPIC_API_KEY`: an API key from the [Anthropic Console](https://platform.claude.com/).

Classification is optional for running the server: without a key, everything else works and
features that classify photos respond with `503 Photo classification is not available right now`.
Tests never call the real API.

### Option 1: Run locally

**Requirements:** [Node.js](https://nodejs.org/en/download/) 22+, [npm](https://docs.npmjs.com/) 10+, a MongoDB server (see above)

```bash
cd backend
npm install
npm run dev          # development, auto-reload
# or:
npm run build && npm start   # production
```
The server listens on `http://localhost:3000`. Verify with `curl http://localhost:3000/health` → `{"status":"ok"}`.

### Option 2: Run with Docker Compose

**Requirements:** [Docker + Docker Compose](https://docs.docker.com/desktop/) v2.24+, curl

```bash
./scripts/run-backend.sh      # from the project root
# or: docker compose up --build -d
docker compose down           # to stop
```

---

## Deployed Back-end (already live)

For grading, the back-end is already deployed and running — you do **not** need to
deploy it yourself:

- **URL:** `https://api.evannawfal.com`
- **Public IP:** `104.154.109.127`
- Hosted on a Google Cloud Compute Engine VM (Ubuntu 24.04), with [Caddy](https://caddyserver.com/) as a reverse proxy providing HTTPS (Let's Encrypt).
- It will remain running from the submission deadline until grades are posted.

The submitted release APK is configured to use this URL (`API_BASE_URL` in
`frontend/local.properties`), so it works on a fresh emulator with no additional setup.

### How the deployed back-end runs

The VM is too small for Docker, so it runs the same code directly:

- The back-end runs from a clone of this repository under [pm2](https://pm2.keymetrics.io/)
  (process name `backend`), which restarts it automatically, including after reboots.
- MongoDB 8 runs as a system service on the VM and only accepts local connections.
- Configuration lives in `backend/.env` on the server (not in the repository).
- MongoDB 8 refuses to start on Linux kernels 6.19 through 7.0.13
  ([MongoDB release notes](https://www.mongodb.com/docs/upcoming/release-notes/8.0)), so the VM
  boots a 6.17 kernel until a fixed kernel (7.0.14 or later) is available.

### Automatic tests and deploys

[`.github/workflows/backend.yml`](.github/workflows/backend.yml) runs on GitHub Actions:

- **Every pull request and push to `main`:** builds the back-end and runs all back-end tests
  (the **Backend tests** check). `main` is protected: a pull request can only be merged once this
  check passes.
- **After a merge to `main` whose tests pass:** connects to the VM over SSH and runs
  [`backend/scripts/deploy-server.sh`](backend/scripts/deploy-server.sh), which installs, builds,
  restarts the back-end only if the build succeeded, waits for `/health`, and runs the live
  Upload Clothing check when available. A failed deploy turns the workflow red.

The deploy uses a dedicated SSH key that the VM only allows to pull `main` and run the deploy
script. One-time setup on the VM, in `~/.ssh/authorized_keys` (one line):

```
restrict,command="cd ~/fabricate && git fetch -q origin main && git checkout -q main && git merge --ff-only -q origin/main && exec bash backend/scripts/deploy-server.sh" ssh-ed25519 AAAA... github-actions-deploy
```

and the repository secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` (the private key) and
`DEPLOY_KNOWN_HOSTS` (the VM's host key, from `ssh-keyscan`).

To redeploy by hand instead:

```bash
cd ~/fabricate && git pull --ff-only && bash backend/scripts/deploy-server.sh
```

`npm run build` prints nothing for a few minutes on the VM; let it finish.

## Google Sign-In

The Google OAuth app is **published to production**, so any Google account can sign
in. No credentials or client IDs need to be configured in the app.
