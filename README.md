# Tempo

A laptop-first personal planner. Weekly is a Monday–Sunday calendar. Time Pad is a quick-capture task list with an optional Eisenhower matrix.

## Try it on your laptop

Unzip the project and open `public/index.html` in your browser. For a consistent local URL and browser storage, run this from the project folder instead:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory public
```

Then visit <http://127.0.0.1:8765>. Keep using that same address to see the items you added there. Local data belongs to the browser and origin and does not transfer to Firebase automatically.

- Home opens a ten-card gallery. Scroll or drag to browse, click a card to expand it, then click again to open the feature. The plus controls, thumbnails, arrow keys and Escape also navigate the gallery. Weekly and Timepad open the planner tools. The other eight cards and About contain placeholders.
- In Weekly, use **Tags** to create colour categories. Click any hour to add an event in that slot. A weekly series repeats on the original weekday through the specified date. Editing or deleting a series applies to every occurrence.
- In Time Pad, type a name on the sticky note and press **Enter** or click **Add task**. Set a due date, choose a time block, or assign a quadrant on the note or by clicking an existing task.
- **Show in Weekly** puts a timed task in its chosen slot. A task with only a due date appears at the top of that day. Tasks without either stay in Time Pad.

## Connect a personal Firebase project

1. In a separate Firebase project, register a Web App and copy its Firebase config object into `public/firebase-config.js` in place of `null`.
2. Enable the Google provider in Authentication and create a default Cloud Firestore database in production mode.
3. Sign in with your Google account once to create the Firebase Auth user. You can deploy Hosting first with `firebase deploy --only hosting --project YOUR_PROJECT_ID` and sign in on the Hosting URL. The planner will show a Firestore access error until you authorize your UID. In Firebase Console → Authentication → Users, copy your User UID into `firestore.rules` in place of `REPLACE_WITH_YOUR_FIREBASE_AUTH_UID`.
4. From this folder, with the Firebase CLI installed and signed in, deploy both Hosting and the rules:

   ```sh
   firebase deploy --only hosting,firestore:rules --project YOUR_PROJECT_ID
   ```

5. Reload your Hosting URL. Your planner data is accessible only to your authorized UID. Future interface tweaks can be pushed with the Hosting-only command.

The client uses the Firebase Web SDK via Google's CDN when Firebase is configured. The local preview has no external dependencies.
