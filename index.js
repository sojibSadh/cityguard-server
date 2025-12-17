const express = require('express')
const cors = require('cors')
require('dotenv').config()
const stripe = require('stripe')(process.env.STRIPE_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')

const app = express()
const port = process.env.PORT || 3000

var admin = require("firebase-admin");
// index.js
const decoded = Buffer.from(process.env.FIREBASE_SERVICE_KEY, "base64").toString("utf8");
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});




function generateTrackingId() {
    const date = Date.now().toString(36).toUpperCase();
    const rand = Math.floor(Math.random() * 99999).toString().padStart(5, '0');
    return `TRK-${date}-${rand}`;
}




// middleware
app.use(cors())
app.use(express.json())


const verifyFireToken = async (req, res, next) => {
    const token = req.headers.authorization
    if (!token) {
        return res.status(401).send({ message: 'unauthorized access' })
    }


    try {
        const idToken = token.split(' ')[1];
        const decoded = await admin.auth().verifyIdToken(idToken)
        req.decoded_email = decoded.email;
        next();
    }
    catch (err) {

    }

};


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@test1.mnnsraa.mongodb.net/?appName=test1`
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
})

async function run() {
    try {

        const db = client.db("city_db");
        const userCollection = db.collection("users");
        const issuesCollection = db.collection("issues");
        const paymentCollection = db.collection("payments");

        // ---------- ROUTES ----------

        const logTracking = async (trackingId, status) => {
            const log = {
                trackingId,
                status,
                details: status.split('-').join(' '),
                createdAt: new Date()
            }
            const result = await trackingCollection.insertOne(log);
            return result;
        }










    } catch (err) {
    }
}

run().catch(console.dir)

app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.listen(port, () => {
    console.log(`Server running on port ${port}`)
})
