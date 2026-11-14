'use strict';

// Keep the original storage key so existing planners load after the rename.
const LOCAL_KEY = 'weekpad.records.v1';

function localStore(onChange) {
  const read = () => Object.values(JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'));
  const update = (id, record) => {
    const records = Object.fromEntries(read().map(item => [item.id, item]));
    if (record) records[id] = record;
    else delete records[id];
    localStorage.setItem(LOCAL_KEY, JSON.stringify(records));
    onChange(Object.values(records));
  };
  window.addEventListener('storage', event => {
    if (event.key === LOCAL_KEY || event.key === null) onChange(read());
  });
  onChange(read());
  return {
    save: record => update(record.id, record),
    remove: id => update(id),
  };
}

async function connectFirebase(config, callbacks) {
  const sdk = 'https://www.gstatic.com/firebasejs/12.1.0/';
  const [appSdk, authSdk, dbSdk] = await Promise.all([
    import(sdk + 'firebase-app.js'),
    import(sdk + 'firebase-auth.js'),
    import(sdk + 'firebase-firestore.js'),
  ]);
  const app = appSdk.initializeApp(config);
  const auth = authSdk.getAuth(app);
  const db = dbSdk.getFirestore(app);
  let unsubscribe;
  authSdk.onAuthStateChanged(auth, user => {
    unsubscribe?.();
    callbacks.lock(user ? 'Loading your planner…' : 'Sign in to access your private Tempo.', !user, Boolean(user));
    if (!user) return;
    const records = dbSdk.collection(db, 'planners', user.uid, 'records');
    unsubscribe = dbSdk.onSnapshot(records, { includeMetadataChanges: true }, snapshot => {
      if (snapshot.metadata.fromCache) return;
      callbacks.ready({
        save: record => dbSdk.setDoc(dbSdk.doc(records, record.id), record),
        remove: id => dbSdk.deleteDoc(dbSdk.doc(records, id)),
      }, snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
    }, () => callbacks.lock('Could not open your planner. Check your account and Firestore setup.', false, true));
  });
  return {
    signIn: () => authSdk.signInWithPopup(auth, new authSdk.GoogleAuthProvider()),
    signOut: () => authSdk.signOut(auth),
  };
}
