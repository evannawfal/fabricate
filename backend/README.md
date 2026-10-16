# CPEN 321 Project - Fabricate - Backend
## Setup Steps 

1. **Clone the repository at the submitted commit:**
   ```bash
   git clone https://github.com/khaidoan2729/CPEN321-W2026
   cd CPEN321-W2026
   ```

2. **Set up the backend config:**
   ```bash
   cd backend
   cp .env.example .env
   ```
   Fill in `backend/.env` with exactly the values below (must match what the deployed instance uses, since access tokens are only valid against the secret that signed them):
   ```dotenv
   PORT=3000
   NODE_ENV=development
   MONGODB_URI=mongodb://localhost:27017/cpen321   # boilerplate, unused by current code
   GOOGLE_CLIENT_ID=579363237977-4hpuo0hq1um9ns877et9r0jshgo735jr.apps.googleusercontent.com
   JWT_SECRET=mlGUGpmjqQOzH/Z5QdoctJMVnZev2dy6OkBhAFVZgcjPzizB2UneQj0qE5JYYvIi7Rpcgkp5yd0hGIe/ACBUFA==
   ```

   For deployment can use newly signed tokens or new Google Client IDs. 


3. **Deploy/run the backend** To run it locally:
   ```bash
   cd backend
   # ensure .env is filled in per step 2
   ./scripts/run-backend.sh
   ```

   or 

    ```bash
   cd backend
   # ensure .env is filled in per step 2
   npx tsx src/index.ts
   ```