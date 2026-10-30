# Requirements and Design

## 1. Change History

| **Change Date** | **Modified Sections** | **Rationale** |
| --------------- | --------------------- | ------------- |
| 2026-10-19 | All sections | First version for CP1, based on the features and use case diagram agreed on in M2 and on the back-end implemented so far (authentication, Clothing and Outfits components). |
| 2026-10-30 | 3.1, 3.2, 3.3, 3.4, 3.5 (use case 4 name) | Reorganized the features to match the app we are building (Manage Closet, Customize Avatar, Create Outfit, Recommend Clothes to Buy, Friends and Social). CP1 TA feedback: the use cases were at very different levels of abstraction, so every use case is now one user goal, split into major use cases (the five with formal specifications) and the minor use cases that extend them; the use case diagram was redrawn to match and keeps the Closet and Outfit use cases separate. |
| 2026-10-30 | 4.1, 4.2, 4.3, 4.4 | Interfaces updated to match the code on `main`: `POST /auth/google` returns `{ accessToken }`, the avatar is generated with `POST /avatar` (replacing `PUT /users/me/avatar`), outfits use `items` and `occasion`, rooms use `GET /rooms/{id}` and a Socket.IO connection per room with `room:message`, `room:outfitUpdate` and `room:memberLeft`. Daily outfits are generated with the Claude API instead of Gemini. Added the avatar generation method, Three.js and Socket.IO details. CP1 TA feedback: Clothing and Outfits are described as separate components with their own interfaces everywhere. |
| 2026-10-30 | 4.5, 4.6 | Dependency and sequence diagrams updated to match the interfaces above: Outfits calls the Claude API, Users stores avatar models in Azure Blob Storage, Social saves room outfits through Outfits, and the room sequence diagram shows the membership check and the broadcast before the database write. |

---

## 2. Project Description

Fabricate is a digital wardrobe and outfit generation app. Users photograph their clothes, and the app automatically classifies each item (category, color and style) and adds it to a digital closet. From there, users can have AI generate a daily outfit from their clean clothes and the current weather, preview outfits on a personalized avatar, and browse items from online stores that would fill gaps in their closet.

Fabricate is aimed at fashion enthusiasts who want more out of their wardrobe, people looking for guided daily inspiration, and busy users who want to spend less time getting ready. It is also social: users add friends, post and rate each other's daily outfits, and join rooms to build outfits together in real time.

---

## 3. Requirements Specification

### **3.1. List of Features**

1. **Manage Closet**: Users add clothing items by taking a photo or choosing one from their gallery. The photo is classified by an external AI service and the item is added to the closet, where it can be browsed, edited and removed. Users keep track of which clothes are dirty with a wash bin.
2. **Customize Avatar**: Users customize a personal avatar from their body measurements, skin tone and hair style, preview outfits on it, and generate a realistic image of the avatar wearing an outfit.
3. **Create Outfit**: Users build outfits from their closet by hand, have AI generate a daily outfit from their clean clothes based on the occasion and the current weather, or build an outfit together with friends in a room where chat messages and outfit changes appear live for every member.
4. **Recommend Clothes to Buy**: The app analyzes the gaps in the user's closet and recommends items from online stores that fill them, with the user's clothes that each item pairs with.
5. **Friends and Social**: Users sign in with their Google account (a new user is registered automatically on their first sign-in), add friends by email, post their daily outfit, and rate their friends' outfits.

### **3.2. Use Case Diagram**

![Use case diagram](images/use_case_diagram.png)

### **3.3. Actors Description**

1. **User**: A person who signs in with their Google account to digitize, organize and style their wardrobe, and to share and build outfits with friends.
2. **Weather API (OpenWeather)**: An external API that provides the current weather at the user's location, used when generating the daily outfit.
3. **Online Stores / Catalogs**: External product catalogs that provide the clothing items the user can browse and that the app recommends.

### **3.4. Use Case Description**

Each use case is one goal the user completes in a single visit to a screen. **Major** use cases are the five with formal specifications in 3.5; each **minor** use case is listed under the major use case it extends or depends on.

- Use cases for feature 1: **Manage Closet**
1. **Add Clothing Items** (major): The user takes or chooses a photo of a clothing item, which is classified and added to their closet.
   - 1.1. **Browse Closet** (minor): The user browses their closet, optionally filtered by category.
   - 1.2. **Edit or Remove Item** (minor): The user edits an item's name, category, color, style or tags, or removes it from the closet. Saved outfits that used a removed item still show it.
   - 1.3. **Manage Wash Bin** (minor): The user moves worn clothes to the wash bin and back to the closet once they are clean. Clothes in the wash bin are left out of generated outfits.

- Use cases for feature 2: **Customize Avatar**
2. **Customize Avatar** (major): The user sets their avatar's body measurements, skin tone and hair style and saves it to their profile.
   - 2.1. **Preview Outfit on Avatar** (minor): The user sees an outfit displayed on their avatar before deciding to wear or save it.
   - 2.2. **Generate Realistic Outfit Image** (minor): The app generates a realistic image of the user's avatar wearing a chosen outfit.

- Use cases for feature 3: **Create Outfit**
3. **Generate Daily Outfit** (major): The app generates an outfit from the user's clean clothes for an occasion they choose, taking the current weather into account.
   - 3.1. **Create Outfit Manually** (minor): The user picks items from their closet, names the outfit and saves it; saved outfits can be edited or deleted later.
4. **Join Room to Create Outfits Together** (major): The user joins a room with friends, where they chat and build an outfit together, and every message and outfit change appears live on all members' devices.

- Use cases for feature 4: **Recommend Clothes to Buy**
5. **Browse Recommended Items** (major): The user browses items from online stores, recommended by analyzing the gaps in their closet, and sees which of their clothes each item pairs with.

- Use cases for feature 5: **Friends and Social**
6. **Sign In / Out** (minor): The user signs in with their Google account, or signs out. If they have never used Fabricate, a new account is created on their first sign-in. Every other use case requires it.
7. **Add Friend** (minor): The user adds another user to their friend list by email. Needed by use case 4 to invite friends to a room.
8. **Post Daily Outfit** (minor): The user posts the outfit they are wearing today so their friends can see it.
9. **Rate Friend's Outfit** (minor): The user rates an outfit a friend posted, from 1 to 5 stars.

### **3.5. Formal Use Case Specifications (5 Most Major Use Cases)**

#### Use Case 1: Add Clothing Items

**Description**: The user adds a clothing item to their closet by taking or choosing a photo, which is classified automatically by an external AI service.

**Primary actor(s)**: User

**Main success scenario**:

1. The user opens the Closet tab and taps "Add clothing".
2. The app asks whether to take a photo with the camera or choose one from the gallery.
3. The user takes or chooses a photo of a clothing item.
4. The app uploads the photo and shows a loading indicator while the item is classified.
5. The app shows the new item at the top of the closet with its photo and name; its details show the category, colour and style the app detected.

**Failure scenario(s)**:

- 3a. The user closes the camera or gallery without choosing a photo.
  - 3a1. The app returns to the Closet screen and the closet is unchanged.
- 4a. The photo does not show a clothing item.
  - 4a1. The app shows the message "This photo doesn't show a clothing item. Try another photo." and the closet is unchanged.
- 4b. The photo can't be uploaded or classified (no network, or the server is unavailable).
  - 4b1. The app shows the message "Couldn't add the item. Please try again." with a "Try again" button.
  - 4b2. The user taps "Try again" and the app repeats step 4.

#### Use Case 2: Generate Daily Outfit

**Description**: The user picks an occasion and the app generates an outfit from their clean clothes, taking the current weather into account.

**Primary actor(s)**: User, Weather API

**Main success scenario**:

1. The user taps "Generate outfit" on the Outfits screen.
2. The app shows a list of occasions (casual, work, formal and workout).
3. The user selects an occasion.
4. The app shows a loading indicator while the outfit is generated from the user's clean clothes, the occasion and the current weather.
5. The app displays the generated outfit on the user's avatar, with the weather it was based on.
6. The user saves the outfit, or taps "Regenerate" to get a different one.

**Failure scenario(s)**:

- 1a. The user's clean clothes do not include at least one shirt and one pair of pants.
  - 1a1. The app displays a message listing the missing items and prompts the user to add clothes or empty their wash bin.
- 4a. The outfit generation service is unavailable or does not respond in time.
  - 4a1. The app displays an error message prompting the user to try again later.
- 4b. The current weather cannot be retrieved.
  - 4b1. The app generates the outfit without the weather and tells the user that the weather was not considered.

#### Use Case 3: Join Room to Create Outfits Together

**Description**: The user joins a room with friends, where members chat and build a shared outfit together, and every message and outfit change appears live on all members' devices.

**Primary actor(s)**: User

**Main success scenario**:

1. The user opens the Rooms screen and selects a room, or creates one and invites friends from their friend list.
2. The app shows the room's chat and the shared outfit board.
3. The user sends a chat message, or adds an item from their closet to the shared outfit board or removes an item from it.
4. The message or outfit change appears on every room member's screen.
5. The user taps "Save outfit" to save the items from their own closet on the shared outfit board to their outfits.

**Failure scenario(s)**:

- 1a. The user has no friends in their friend list to invite.
  - 1a1. The app explains that friends must be added first and lets the user add a friend by email.
- 3a. The connection to the server is lost.
  - 3a1. The app shows a "Reconnecting" banner and disables sending until the connection is restored.
- 4a. Another member leaves the room.
  - 4a1. The app shows a notice that the member left, and the room continues for the remaining members.

#### Use Case 4: Browse Recommended Items

**Description**: The app analyzes the user's closet for gaps and shows items from online stores that would fill them, along with the user's clothes that each item pairs with.

**Primary actor(s)**: User, Online Stores / Catalogs

**Main success scenario**:

1. The user opens the Shop screen.
2. The app shows a loading indicator while the closet is analyzed.
3. The app displays recommended items from online stores, each with a photo, price and reason (e.g. "No outerwear in your closet").
4. The user taps an item.
5. The app shows the items in the user's closet that the recommendation pairs with, and a link to the item in the store.

**Failure scenario(s)**:

- 2a. The closet does not include at least one shirt and one pair of pants.
  - 2a1. The app displays a message prompting the user to add those items first.
- 3a. The online catalogs return no matching items.
  - 3a1. The app shows the closet gaps it found and a message that no matching items are available right now.
- 3b. The analysis or the catalog search fails because of a server or network problem.
  - 3b1. The app displays an error message prompting the user to try again.

#### Use Case 5: Customize Avatar

**Description**: The user customizes their avatar's appearance and saves it to their profile, so outfits can be previewed on it.

**Primary actor(s)**: User

**Main success scenario**:

1. The user opens the Avatar screen.
2. The app shows the user's current avatar and options for body size, skin tone and hair style.
3. The user changes one or more options, and the avatar preview updates.
4. The user taps "Save".
5. The app saves the avatar to the user's profile and confirms the save.

**Failure scenario(s)**:

- 1a. The user has never customized their avatar.
  - 1a1. The app shows a default avatar for the user to start from.
- 5a. The save fails because of a network problem.
  - 5a1. The app displays an error message, keeps the user's changes on screen and lets them retry.

### **3.6. Screen Mock-ups**

Not included for CP1.

### **3.7. Non-Functional Requirements**

1. <a id="nfr1"></a>**Room update latency**
   - **Description**: Chat messages and outfit changes in a room appear on the other members' devices within 1 second, for 95% of updates under normal network conditions.
   - **Justification**: Rooms are only useful if they feel live. 1 second is the limit for a user's flow of thought to stay uninterrupted (Nielsen, "Response Times: The 3 Important Limits", Nielsen Norman Group), so longer delays make the collaboration feel broken.
2. <a id="nfr2"></a>**Clothing upload time**
   - **Description**: An uploaded clothing photo is classified and the new item appears in the closet within 10 seconds, for photos up to the 5 MB upload limit.
   - **Justification**: Adding clothes is the first thing every user does and depends on an external AI service. 10 seconds is the limit for keeping a user's attention on a task (same source); past it, users tend to give up or switch tasks.
3. <a id="nfr3"></a>**Closet analysis time**
   - **Description**: The closet gap analysis for recommendations completes on the back-end within 2 seconds for closets of up to 500 items.
   - **Justification**: Recommendations update as the closet changes, so the analysis runs often. 500 items is well above a typical wardrobe, so the limit leaves room to grow, and 2 seconds keeps the Shop screen responsive.

---

## 4. Designs Specification

### **4.1. Main Components**

1. **Users**
   - **Purpose**: Signs users in with Google, stores their profiles, avatars and friend lists, and authenticates the requests sent to every other component. Keeping authentication in one component means every component checks users the same way.
   - **Interfaces**:
     1. `POST /auth/google`, body `{ idToken: String }`, returns `{ accessToken: String }`
        - **Purpose**: Verifies a Google ID token with Google, finds or creates the user by their Google ID, and returns a session token signed by the back-end.
     2. `POST /avatar`, body `{ height, shoulderWidth, chestWidth, waistWidth, hipWidth }` (numbers, in cm), returns `201 { downloadUrl: String, contentType: String }`
        - **Purpose**: Generates the user's 3D avatar model (a GLB file) from their measurements, stores it in file storage, saves it to their profile, and returns a time-limited link to download it.
     3. `GET /friends`, returns `{ friends: List<Friend> }`, and `POST /friends`, body `{ email: String }`, returns `201 Friend`
        - **Purpose**: Returns the user's friend list, or adds the user with that email as a friend of both users. `POST` returns 404 if no user has the email, 400 for the user's own email, and 409 if they are already friends.
     4. `requireAuth(request, response, next)` and `String? verifyToken(String token)`
        - **Purpose**: `requireAuth` checks the session token sent in the `Authorization` header and attaches the user's ID to the request, or rejects it with 401 if the token is missing or invalid. Every other component's routes use it; room sockets use `verifyToken` to check the token sent when they connect.
     5. `List<String> getFriendIds(String userId)`
        - **Purpose**: Returns the IDs of a user's friends, so Social can check who can see and rate posts or join rooms.
   - **Avatar generation**: The avatar is built procedurally on the back-end with Three.js. The body is defined as signed distance fields (ellipsoids, capsules and rounded boxes for each body part, joined with smooth unions) sized from the user's measurements, sampled on a 3D grid, meshed with marching tetrahedra, and exported as a GLB file that the app displays with SceneView.

2. **Clothing**
   - **Purpose**: Stores and manages the user's clothing items and wash bin. It sends new photos to the clothing classifier and keeps the photos in file storage. It is separate from Outfits so that the other components read closet data through one interface.
   - **Interfaces**:
     1. `POST /clothing`, multipart form with a `photo` file (JPEG, PNG or WebP, at most 5 MB), returns `201 ClothingItem`
        - **Purpose**: Classifies the photo, stores it, and saves the new item with the detected category, color and style. Returns 422 if the photo does not show clothing and 503 if classification or storage is unavailable.
     2. `GET /clothing`, query `category?: String`, `clean?: Boolean`, returns `{ items: List<ClothingItem> }`
        - **Purpose**: Returns the user's items that are still in the closet, newest first, optionally filtered by category or clean status (`clean=false` lists the wash bin).
     3. `GET /clothing/{id}`, returns `ClothingItem`
        - **Purpose**: Returns one of the user's items, including items that were removed from the closet.
     4. `PATCH /clothing/{id}`, body with any of `{ name, category, color, style, tags, isClean }`, returns `ClothingItem`
        - **Purpose**: Updates an item's details, or moves it into or out of the wash bin.
     5. `DELETE /clothing/{id}`, returns `204`
        - **Purpose**: Archives an item: it leaves the closet, but saved outfits still show it.
     6. `List<ClothingItem> getItemsForUser(String userId, Boolean cleanOnly)`
        - **Purpose**: Returns a user's items in the closet, optionally only the clean ones, for Outfits and Social.

3. **Outfits**
   - **Purpose**: Saves and generates outfits, renders realistic outfit images, and runs the closet gap analysis for shopping recommendations. These are in the same component because they all reason about how closet items combine.
   - **Interfaces**:
     1. `POST /outfits`, body `{ name: String, occasion?: String, items: List<String> }`, returns `201 Outfit`
        - **Purpose**: Saves an outfit made from items in the user's closet.
     2. `GET /outfits`, returns `{ outfits: List<Outfit> }`, and `GET /outfits/{id}`, returns `Outfit`
        - **Purpose**: Returns the user's saved outfits, or one of them.
     3. `PATCH /outfits/{id}`, body with any of `{ name, occasion, items }`, returns `Outfit`, and `DELETE /outfits/{id}`, returns `204`
        - **Purpose**: Edits or deletes a saved outfit.
     4. `POST /outfits/generate`, body `{ occasion: String, latitude: Double, longitude: Double }`, returns `{ outfit: { name, occasion, items }, weather: Weather? }`
        - **Purpose**: Generates an outfit from the user's clean clothes for the occasion (`casual`, `work`, `formal` or `workout`) and the current weather, without saving it; the app saves it with `POST /outfits` if the user keeps it. Returns 400 listing the missing categories if the clean clothes don't include a top and a bottom, and 503 if generation is unavailable.
     5. `POST /outfits/{id}/render`, returns `{ imageUrl: String }`
        - **Purpose**: Generates a realistic image of the user's avatar wearing the outfit.
     6. `GET /recommendations`, returns `{ gaps: List<String>, items: List<StoreItem> }`
        - **Purpose**: Analyzes the user's closet for gaps and returns matching items from online catalogs, each with the closet items it pairs with.
     7. `Outfit getOutfit(String outfitId)` and `Outfit saveOutfit(String userId, String name, List<String> itemIds)`
        - **Purpose**: Read and save outfits for other users' posts and rooms. Used by Social.

4. **Social**
   - **Purpose**: Manages outfit posts, ratings and rooms, and delivers chat messages and shared outfit changes to room members in real time.
   - **Interfaces**:
     1. `POST /posts`, body `{ outfitId: String }`, returns `201 Post`
        - **Purpose**: Posts the user's daily outfit for their friends.
     2. `GET /posts`, returns `List<Post>`
        - **Purpose**: Returns the outfits the user's friends posted, newest first, with their average ratings.
     3. `POST /posts/{id}/ratings`, body `{ stars: Int }` (1 to 5), returns `Rating`
        - **Purpose**: Rates a friend's posted outfit; rating again replaces the user's previous rating.
     4. `POST /rooms`, body `{ name: String, friendIds: List<String> }`, returns `201 Room`, and `GET /rooms`, returns `{ rooms: List<Room> }`
        - **Purpose**: Creates a room with the user and their friends as members (400 if an ID is not a friend), or returns the rooms the user belongs to, most recently updated first.
     5. `GET /rooms/{id}`, returns `Room` with `outfitItems: List<ClothingItem>` and `messages: List<Message>`
        - **Purpose**: Returns a room's shared outfit and its 50 most recent messages, oldest first, when the user opens it. Returns 403 if the user is not a member.
     6. Socket.IO connection, auth `{ token: String, roomId: String }`
        - **Purpose**: The app opens one connection per room while the room screen is open. The connection is refused unless the token is valid and the user is a member of the room. When it closes, the other members receive `room:memberLeft` with `{ roomId, userId, name }`.
     7. Socket.IO event `room:message`, payload `{ text: String }`, sent to the members as `Message`
        - **Purpose**: Sends a chat message to every member of the room, then saves it. The sender's acknowledgement is `{ ok: true }` or `{ error: String }`.
     8. Socket.IO event `room:outfitUpdate`, payload `{ itemIds: List<String> }`, sent to the members as `{ roomId, updatedBy, items: List<ClothingItem> }`
        - **Purpose**: Replaces the room's shared outfit for every member, then saves it. Items must be in a room member's closet; the item details are sent so members can see items from each other's closets.
     9. `POST /rooms/{id}/save`, returns `201 Outfit`
        - **Purpose**: Saves the items from the user's own closet on the shared outfit board as one of their outfits, named after the room. Returns 400 if the board has none of the user's items.

### **4.2. Databases**

1. **MongoDB**
   - **Purpose**: Stores users (Google ID, email, name, avatar and friend list), clothing items, outfits, posts, ratings, rooms and chat messages. A document database fits because clothing items and outfits have flexible attributes such as tags, and MongoDB is one of the two databases the course allows.

### **4.3. External Modules**

1. **Google Sign-In**
   - **Purpose**: Signs the user in on their device and issues a Google ID token, which the Users component verifies with Google.
2. **Claude API**
   - **Purpose**: Used with Claude Sonnet 5.5 (`claude-sonnet-5-5`) for two tasks: classifying clothing photos (detecting an item's category, color and style, or reporting that the photo is not clothing), and generating daily outfits by picking items from the user's clean clothes for the occasion and weather.
3. **Gemini API**
   - **Purpose**: Renders realistic images of the user's avatar wearing an outfit with the Nano Banana 2.1 image model (`gemini-nano-banana-2.1`).
4. **OpenWeather API**
   - **Purpose**: Provides the current weather at the user's location for daily outfit generation. Chosen because it is widely used and its free plan (1,000,000 calls a month) is far more than the project needs.
5. **Online Stores / Catalogs**
   - **Purpose**: Provide product listings (photo, price, category and store link) that the Outfits component searches for items that fill the user's closet gaps.
6. **Azure Blob Storage**
   - **Purpose**: Stores clothing photos, avatar models and generated outfit images, and gives the app time-limited links to download them.

### **4.4. Frameworks and Libraries**

1. **Jetpack Compose**
   - **Purpose**: Builds the Android user interface.
   - **Reason**: Required by the course; its state-driven model suits screens with loading and error states.
2. **Navigation Compose**
   - **Purpose**: Moves between screens and manages the back stack.
   - **Reason**: The standard navigation library for Compose apps.
3. **OkHttp**
   - **Purpose**: Sends HTTP requests from the app to the back-end.
   - **Reason**: A widely used, reliable HTTP client for Android.
4. **AndroidX Credential Manager and Google ID library**
   - **Purpose**: Shows the Google account picker and returns a Google ID token.
   - **Reason**: Google's current recommended way to implement Sign in with Google; the older Google Sign-In client is deprecated.
5. **Coil**
   - **Purpose**: Loads and caches clothing photos and outfit images from their download links.
   - **Reason**: A lightweight image loader built for Compose.
6. **Socket.IO (server and Android client)**
   - **Purpose**: Delivers live chat messages and outfit changes in rooms.
   - **Reason**: Keeps a persistent connection with built-in rooms and automatic reconnection, so the app does not have to poll.
7. **Express.js**
   - **Purpose**: Defines the back-end's HTTP routes and middleware.
   - **Reason**: The most widely used web framework for Node.js, with simple middleware for authentication and error handling.
8. **Mongoose**
   - **Purpose**: Defines the MongoDB schemas and runs queries from TypeScript.
   - **Reason**: Adds schema validation and typed models on top of MongoDB.
9. **google-auth-library**
   - **Purpose**: Verifies Google ID tokens on the back-end.
   - **Reason**: Google's official Node.js library; it fetches and caches Google's public keys.
10. **Three.js**
    - **Purpose**: Builds the avatar mesh on the back-end and exports it as a GLB file.
    - **Reason**: A widely used 3D library whose GLB exporter produces a standard file the app can display.
11. **SceneView**
    - **Purpose**: Displays the avatar's GLB model in the app.
    - **Reason**: Renders 3D models in Compose with Google's Filament engine, without writing a renderer ourselves.
12. **Jest and mongodb-memory-server**
    - **Purpose**: Run the back-end tests and report coverage; the tests use an in-memory MongoDB server.
    - **Reason**: Jest is required by the course; an in-memory database lets the tests run without a real database or credentials.

### **4.5. Dependencies Diagram**

```mermaid
flowchart LR
    FE[Front-end]
    US[Users]
    CL[Clothing]
    OU[Outfits]
    SO[Social]
    DB[(MongoDB)]
    GS[Google Sign-In]
    CA[Claude API]
    AZ[Azure Blob Storage]
    GE[Gemini API]
    WE[OpenWeather API]
    ST[Online Stores / Catalogs]

    FE --> GS
    FE --> US
    FE --> CL
    FE --> OU
    FE <--> SO

    CL --> US
    OU --> US
    SO --> US

    OU --> CL
    SO --> CL
    SO --> OU

    US --> GS
    US --> AZ
    CL --> CA
    CL --> AZ
    OU --> CA
    OU --> AZ
    OU --> GE
    OU --> WE
    OU --> ST

    US --> DB
    CL --> DB
    OU --> DB
    SO --> DB
```

### **4.6. Use Case Sequence Diagram (5 Most Major Use Cases)**

1. [**Add Clothing Items**](#use-case-1-add-clothing-items)

```mermaid
sequenceDiagram
    actor U as User
    participant FE as Front-end
    participant CL as Clothing
    participant US as Users
    participant CA as Claude API
    participant AZ as Azure Blob Storage
    participant DB as MongoDB

    U->>FE: Tap "Add clothing", take or choose photo
    FE->>CL: POST /clothing (photo)
    CL->>US: requireAuth(request)
    US-->>CL: userId
    CL->>CA: classify photo
    CA-->>CL: category, color, style
    CL->>AZ: store photo
    AZ-->>CL: stored
    CL->>DB: create clothing item
    DB-->>CL: saved item
    CL-->>FE: 201 ClothingItem
    FE-->>U: Show the new item in the closet
```

2. [**Generate Daily Outfit**](#use-case-2-generate-daily-outfit)

```mermaid
sequenceDiagram
    actor U as User
    participant FE as Front-end
    participant OU as Outfits
    participant US as Users
    participant CL as Clothing
    participant WE as OpenWeather API
    participant CA as Claude API

    U->>FE: Tap "Generate outfit", select occasion
    FE->>OU: POST /outfits/generate (occasion, location)
    OU->>US: requireAuth(request)
    US-->>OU: userId
    OU->>CL: getItemsForUser(userId, cleanOnly = true)
    CL-->>OU: List<ClothingItem>
    OU->>WE: get current weather (location)
    WE-->>OU: weather
    OU->>CA: generate outfit (clean items, occasion, weather)
    CA-->>OU: outfit name and chosen item IDs
    OU-->>FE: 200 { outfit, weather }
    FE-->>U: Show the outfit on the avatar
```

3. [**Join Room to Create Outfits Together**](#use-case-3-join-room-to-create-outfits-together)

```mermaid
sequenceDiagram
    actor U as User
    participant FE as Front-end (user)
    participant SO as Social
    participant US as Users
    participant DB as MongoDB
    participant FE2 as Front-end (other members)

    U->>FE: Open room
    FE->>SO: GET /rooms/{id}
    SO->>US: requireAuth(request)
    US-->>SO: userId
    SO->>DB: load room, shared outfit and recent messages
    DB-->>SO: room
    SO-->>FE: 200 Room
    FE->>SO: Connect (session token, roomId)
    SO->>US: verifyToken(token)
    US-->>SO: userId
    SO->>DB: check the user is a room member
    DB-->>SO: room
    U->>FE: Send message or change shared outfit
    FE->>SO: room:message / room:outfitUpdate
    SO-->>FE: Message / shared outfit
    SO-->>FE2: Message / shared outfit
    SO->>DB: save message or shared outfit
    SO-->>FE: ack { ok: true }
```

4. [**Browse Recommended Items**](#use-case-4-browse-recommended-items)

```mermaid
sequenceDiagram
    actor U as User
    participant FE as Front-end
    participant OU as Outfits
    participant US as Users
    participant CL as Clothing
    participant ST as Online Stores / Catalogs

    U->>FE: Open Shop screen
    FE->>OU: GET /recommendations
    OU->>US: requireAuth(request)
    US-->>OU: userId
    OU->>CL: getItemsForUser(userId, cleanOnly = false)
    CL-->>OU: List<ClothingItem>
    OU->>OU: Analyze closet gaps
    OU->>ST: search items for each gap
    ST-->>OU: matching store items
    OU-->>FE: 200 { gaps, items }
    FE-->>U: Show recommended items and pairings
```

5. [**Customize Avatar**](#use-case-5-customize-avatar)

```mermaid
sequenceDiagram
    actor U as User
    participant FE as Front-end
    participant US as Users
    participant AZ as Azure Blob Storage
    participant DB as MongoDB

    U->>FE: Change measurements, tap "Update avatar"
    FE->>US: POST /avatar (measurements)
    US->>US: requireAuth(request)
    US->>US: generate the avatar mesh and export it as GLB
    US->>AZ: store the model
    AZ-->>US: stored
    US->>DB: save the model's key to the user's profile
    DB-->>US: updated user
    US->>AZ: create a download link
    AZ-->>US: downloadUrl
    US-->>FE: 201 { downloadUrl }
    FE->>AZ: download the model
    AZ-->>FE: GLB file
    FE-->>U: Show the updated avatar
```

### **4.7. Design of Non-Functional Requirements**

1. [**Room update latency**](#nfr1)
   - **Implementation**: Social keeps a persistent Socket.IO connection with each member's device and pushes each update to the room as soon as it arrives, so devices never wait on polling. The update is sent to members before the database write, so storage time does not add to delivery time.
2. [**Clothing upload time**](#nfr2)
   - **Implementation**: Photos are limited to 5 MB and checked for type and size before anything else, so invalid uploads fail immediately. The back-end checks that storage is configured before calling the classifier, and the classifier call has a timeout, so a slow or rate-limited service returns a clear 503 error instead of leaving the user waiting.
3. [**Closet analysis time**](#nfr3)
   - **Implementation**: The gap analysis loads the user's items in one database query (indexed by user ID) and runs entirely in memory, counting items per category, color and style and checking pairings without further database or network calls. The catalog search runs only after the analysis, once per gap found.
