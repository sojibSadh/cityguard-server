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

   // UserManegement()
   app.get('/users', verifyFireToken,  async (req, res) => {
    const searchText = req.query.searchText;
    const query = {};
    if (searchText) {
        query.displayName = { $regex: searchText, $options: 'i' }
    }
    const cursor = userCollection.find(query).sort({ createdAt: -1 });
    const result = await cursor.toArray();
    res.send(result);
});

  // Register()
  app.post('/users', async (req, res) => {
    const user = req.body;
    user.role = 'citizen';
    user.subscription = false; // free | premium
    user.blocked = false;
    user.issueCount = 0,
        user.createdAt = new Date();
    const email = user.email;
    const userExist = await userCollection.findOne({ email })

    if (userExist) {
        return res.send({ message: 'user exits' })
    }

    const result = await userCollection.insertOne(user);
    res.send(result);
})




const verifyAdmin = async (req, res, next) => {
    const email = req.decoded_email;
    const query = { email }

    const user = await userCollection.findOne(query);
    if (!user || user.role !== 'admin') {
        return res.status(403).send({ message: "forbiden page" })
    };
    next();
};



// user role update
app.patch('/users/:id/role', verifyFireToken, verifyAdmin, async (req, res) => {
    const id = req.params.id;
    const roleInfo = req.body;
    const query = { _id: new ObjectId(id) }
    const updateDoc = {
        $set: {
            role: roleInfo.role,
            workStatus: roleInfo.workStatus
        }
    }
    const result = await userCollection.updateOne(query, updateDoc)
    res.send(result);
})



   // user role update
   app.patch('/users/:id/block', verifyFireToken, verifyAdmin, async (req, res) => {
    const id = req.params.id;
    const blockInfo = req.body;
    const query = { _id: new ObjectId(id) }
    const updateDoc = {
        $set: {
            blocked: blockInfo.blocked,
            workStatus: blockInfo.workStatus
        }
    }
    const result = await userCollection.updateOne(query, updateDoc)
    res.send(result);
})


   // useRole()
   app.get('/users/:email/role',verifyFireToken, async (req, res) => {
    const email = req.params.email;
    const query = { email };
    const user = await userCollection.findOne(query);
    res.send({ role: user?.role || 'citizen' });
});


 // useSub()
 app.get("/users/status/:email", verifyFireToken, async (req, res) => {
    const user = await userCollection.findOne({ email: req.params.email });
    res.send(user);
});



 // issues api here
 app.post('/issues', verifyFireToken, async (req, res) => {
    try {
        const userEmail = req.decoded_email;
        const body = req.body;

        // basic validation
        if (!body.title || !body.category || !body.location || !body.description) {
            return res.status(400).send({ message: 'Missing required fields' });
        }

        const issue = {
            title: body.title,
            image: body.image || '', // image url
            category: body.category,
            status: body.status || 'pending',
            priority: body.priority || 'Normal',
            location: body.location,
            description: body.description,
            upvotes: 0,
            boosted: body.boosted || false,
            authorEmail: userEmail,
            voters: [], // store voter emails
            timeline: [
                {
                    status: 'issue_reported',
                    note: 'Issue reported by citizen',
                    by: userEmail,
                    createdAt: new Date()
                }
            ],
            createdAt: new Date()
        };

        const result = await issuesCollection.insertOne(issue);
        res.send({ success: true, insertedId: result.insertedId });
    } catch (err) {
        res.status(500).send({ error: err.message });
    }
});








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
