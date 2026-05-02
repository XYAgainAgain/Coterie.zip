/* Firebase Realtime Database — Batthew's worldwide counters.
   SDK loaded via CDN in main.html; this file just inits and exposes helpers. */
(function () {
  'use strict';

  if (typeof firebase === 'undefined' || !firebase.database) return;

  var app = firebase.initializeApp({
    apiKey: 'AIzaSyAEHxHwfggbE_O51EAkgTA1tq10aGqR5BU',
    authDomain: 'coterie-ttrpg.firebaseapp.com',
    databaseURL: 'https://coterie-ttrpg-default-rtdb.firebaseio.com',
    projectId: 'coterie-ttrpg',
    storageBucket: 'coterie-ttrpg.firebasestorage.app',
    messagingSenderId: '673995949420',
    appId: '1:673995949420:web:0702b25fb6db7c9acb5f49'
  });

  var db = firebase.database(app);
  var ref = db.ref('batthew');

  window.__kdrIncrement = function (key) {
    if (key !== 'bites' && key !== 'meals' && key !== 'deaths') return;
    ref.child(key).set(firebase.database.ServerValue.increment(1));
  };

  window.__kdrRead = function (callback) {
    ref.once('value', function (snap) {
      var val = snap.val() || {};
      callback({
        bites: val.bites || 0,
        meals: val.meals || 0,
        deaths: val.deaths || 0
      });
    }, function () {
      callback(null);
    });
  };
})();
