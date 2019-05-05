// import * as functions from 'firebase-functions';

// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//
// export const helloWorld = functions.https.onRequest((request, response) => {
//  response.send("Hello from Firebase!");
// });

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
admin.initializeApp();
const db = admin.firestore();

// Optional interface, all worker functions should return Promise.
interface Workers {
  [key: string]: (options: any) => Promise<any>;
}

// Business logic for named tasks. Function name should match worker field on task document.
const workers: Workers = {
  syncWakatime: (options: any) => {
    // get date for a week from now
    const nextDate: Date = new Date(new Date(Date.parse(new Date().toUTCString()) + 604800000));

    return db.collection('tasks').add({
      performAt: options.performNext,
      status: 'scheduled',
      worker: options.workerNext,
      options: {
        performNext: admin.firestore.Timestamp.fromDate(nextDate),
        workerNext: options.workerNext,
      },
    });
  },
};

// check tasks array
export const taskRunner = functions
  .runWith({ memory: '2GB' })
  // @ts-ignore
  .pubsub.schedule('* 13 * * *')
  .onRun(async (context: any) => {
    console.log('context', context);
    // Consistent timestamp
    const now = admin.firestore.Timestamp.now();

    // Query all documents ready to perform
    const query = db
      .collection('tasks')
      .where('performAt', '<=', now)
      .where('status', '==', 'scheduled');

    const tasks = await query.get();

    // Jobs to execute concurrently.
    const jobs: Promise<any>[] = [];

    // Loop over documents and push job.
    tasks.forEach(snapshot => {
      const { worker, options } = snapshot.data();

      const job = workers[worker](options)

        // Update doc with status on success or error
        .then(() => snapshot.ref.update({ status: 'complete' }))
        .catch(err => snapshot.ref.update({ status: 'error' }));

      jobs.push(job);
    });

    // Execute all jobs concurrently
    return await Promise.all(jobs);
  });
