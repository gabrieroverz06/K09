const firebaseConfig = {
  apiKey: "AIzaSyCe2anai5p3VcgzIpArwvVorHIPQsGIXI0",
  authDomain: "k09z-91bf2.firebaseapp.com",
  projectId: "k09z-91bf2",
  storageBucket: "k09z-91bf2.firebasestorage.app",
  messagingSenderId: "1049510667853",
  appId: "1:1049510667853:web:1fa72fb16c95ba683ade04",
  measurementId: "G-1T5HEWFRXF"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();
