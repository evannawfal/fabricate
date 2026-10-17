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
5. **Set up app config**: copy the example file and fill in local values:
   ```bash
   cp frontend/local.properties.example frontend/local.properties
   ```
   Set:
   - `sdk.dir`: path to your Android SDK (Android Studio usually writes this automatically).
   - `API_BASE_URL`: the back-end URL baked into the app. Choose one:
     - **Deployed back-end (recommended, already running):** `https://api.evannawfal.com`
     - **Local back-end on the emulator:** `http://10.0.2.2:3000` (`10.0.2.2` is the host machine)
     - **Local back-end on a physical device (same Wi-Fi):** `http://<your-lan-ip>:3000`

### Build and Run

- **Debug build**: click the green ▶ button in Android Studio to build, install, and run on the emulator/device. (Or `./scripts/run-frontend.sh` from the project root.)
- **Release build**: Build → Generate Signed App Bundle or APK → APK → select the **release** variant → install the generated APK.

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
- Hosted on a Google Cloud Compute Engine VM, with [Caddy](https://caddyserver.com/) as a reverse proxy providing HTTPS (Let's Encrypt).
- It will remain running from the submission deadline until grades are posted.

The submitted release APK is already configured to use this URL, so it works on a
fresh emulator with no additional setup.

## Google Sign-In

The Google OAuth app is **published to production**, so any Google account can sign
in. No credentials or client IDs need to be configured in the app.
