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

 // Get All Issues (with server-side filters, search & pagination
 app.get('/issues', async (req, res) => {
    try {
        const { page = 1, limit = 9, category, status, priority, search } = req.query;
        const query = {};

        if (category) query.category = category;
        if (status) query.status = status;
        if (priority) query.priority = priority;

        // use text search if 'search' provided
        if (search) {
            query.title = { $regex: search, $options: "i" };
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        // boosted first, then sort by createdAt desc (newest)
        const cursor = issuesCollection.find(query).sort({ boosted: -1, createdAt: -1 }).skip(skip).limit(parseInt(limit));
        const items = await cursor.toArray();
        const total = await issuesCollection.countDocuments(query);

        res.send({
            data: items,
            meta: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (err) {
        res.status(500).send({ error: err.message });
    }
});


// Get All Issues (with server-side filters, search & pagination
app.get('/feature-issues', async (req, res) => {
    try {
        const cursor = issuesCollection.find().sort({ boosted: -1, createdAt: -1 }).limit(6);
        const result = await cursor.toArray();
        res.send(result)
    } catch (err) {
        res.status(500).send({ error: err.message });
    }
});


  // Get single issue
  app.get('/issues/:id', verifyFireToken, async (req, res) => {
    try {
        const id = req.params.id;
        const issue = await issuesCollection.findOne({ _id: new ObjectId(id) });
        if (!issue) return res.status(404).send({ message: 'Issue not found' });
        res.send(issue);
    } catch (err) {
        res.status(500).send({ error: err.message });
    }
});

    // Get All Issues by email;
    app.get('/my-issues-email', async (req, res) => {
        try {
            const { email, page = 1, limit = 10, category, status, priority, search } = req.query;
            const query = {};

            if (email) query.authorEmail = email;
            if (category) query.category = category;
            if (status) query.status = status;
            if (priority) query.priority = priority;

            // use text search if 'search' provided
            if (search) {
                query.title = { $regex: search, $options: "i" };
            }

            const skip = (parseInt(page) - 1) * parseInt(limit);

            // boosted first, then sort by createdAt desc (newest)
            const cursor = issuesCollection.find(query).sort({ boosted: -1, createdAt: -1 }).skip(skip).limit(parseInt(limit));
            const items = await cursor.toArray();
            const total = await issuesCollection.countDocuments(query);

            res.send({
                data: items,
                meta: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(total / parseInt(limit))
                }
            });
        } catch (err) {
            res.status(500).send({ error: err.message });
        }
    });

   //  Update  by ID
   app.patch('/issues/:id', verifyFireToken, async (req, res) => {
    const id = req.params.id;
    const updatedData = req.body;
    const email = req.query.email;

    // if (email !== req.token_email) {
    //     return res.status(403).send({ message: 'forbidden access' });
    // }

    const filter = { _id: new ObjectId(id) };
    const updateDoc = {
        $set: {
            title: updatedData.title,
            description: updatedData.description,
            category: updatedData.category,
            image: updatedData.image,
            postedDate: new Date(),
        }
    };

    const result = await issuesCollection.updateOne(filter, updateDoc);
    res.send(result);
});



   // Delete issue (only author or admin)
   app.delete('/issues/:id', verifyFireToken, async (req, res) => {
    try {
        const id = req.params.id;
        const result = await issuesCollection.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
    } catch (err) {
        res.status(500).send({ error: err.message });
    }
});

     // Upvote issue14
     app.patch('/issues/upvote/:id', verifyFireToken, async (req, res) => {
        try {
            const issueId = req.params.id;
            const userEmail = req.decoded_email; // token থেকে আসবে

            const issue = await issuesCollection.findOne({ _id: new ObjectId(issueId) });

            if (!issue) return res.status(404).send({ message: "Issue not found" });

            // Can't upvote own issue
            if (issue.authorEmail === userEmail) {
                return res.status(400).send({ message: "You can't upvote your own issue" });
            }

            // Prevent double upvote
            if (issue.upvotedUsers?.includes(userEmail)) {
                return res.status(400).send({ message: "Already upvoted" });
            }

            // Update
            const result = await issuesCollection.updateOne(
                { _id: new ObjectId(issueId) },
                {
                    $inc: { upvotes: 1 },
                    $push: { upvotedUsers: userEmail }
                }
            );

            res.send({ success: true, message: "Upvoted!" });

        } catch (err) {
            res.status(500).send({ error: err.message });
        }
    });


  // create-payment-intent
  app.post('/create-payment-intent', async (req, res) => {
    const { issue, amount, issueId, email } = req.body;

    const parseAmount = Number(amount) * 100;  // safer

    try {
        const session = await stripe.checkout.sessions.create({
            line_items: [
                {
                    price_data: {
                        currency: 'bdt',
                        unit_amount: parseAmount,
                        product_data: {
                            name: issue || "Boost Priority"
                        }
                    },
                    quantity: 1,
                },
            ],
            customer_email: email,
            mode: 'payment',
            metadata: {
                issueId: issueId,
                issueEmail: email
            },

            success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
        });

        res.send({ url: session.url });

    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});


        // /payment-success patch
        app.patch('/payment-success', async (req, res) => {
            const sessionId = req.query.session_id;
            if (!sessionId) {
                return res.status(400).send({ error: 'session_id is required' });
            }

            try {
                const session = await stripe.checkout.sessions.retrieve(sessionId);
                if (session.payment_status !== 'paid') {
                    return res.status(400).send({ error: 'Payment not completed yet', payment_status: session.payment_status });
                }

                // Get transaction id (payment intent id) and metadata
                const transactionId = session.payment_intent; // e.g. "pi_..."
                const metadata = session.metadata || {};
                const issueId = metadata.issueId || metadata.parcelId || null;
                const issueEmail = metadata.issueEmail || session.customer_email || null;


                if (!transactionId) {
                    return res.status(400).send({ error: 'No payment_intent found on session' });
                }

                // Check if payment record already exists
                const existing = await paymentCollection.findOne({ transactionId });
                if (existing) {
                    // Already processed — return existing info
                    return res.send({
                        message: 'already exists',
                        transactionId,
                        trackingId: existing.trackingId,
                        issueId: existing.issueId,
                        issueEmail: existing.issueEmail,
                    });
                }

                // Create a trackingId (unique)
                // const trackingId = 'TRK-' + randomBytes(4).toString('hex').toUpperCase();
                const trackingId = generateTrackingId();


                // Insert payment record
                const paymentDoc = {
                    transactionId,
                    sessionId,
                    amount_total: session.amount_total ?? null,
                    currency: session.currency ?? null,
                    issueId,
                    issueEmail,
                    trackingId,
                    createdAt: new Date(),
                };

                await paymentCollection.insertOne(paymentDoc);

                // If you want: update the issue's priority and push a timeline entry
                if (issueId) {
                    const issueQuery = { _id: new ObjectId(issueId) }; // ensure issueId is valid ObjectId string
                    const timelineEntry = {
                        type: 'boost',
                        note: 'Priority boosted after successful payment',
                        by: issueEmail || session.customer_email,
                        trackingId,
                        date: new Date()
                    };

                    const update = {
                        $set: { priority: 'high', boosted: true },
                        $push: { timeline: timelineEntry }
                    };

                    // Update the issue document (safe: use upsert: false)
                    await issuesCollection.updateOne(issueQuery, update);
                }

                // Return useful info to client
                return res.send({
                    message: 'processed',
                    transactionId,
                    sessionId,
                    trackingId,
                    issueId,
                    issueEmail
                });

            } catch (err) {
                return res.status(500).send({ error: err.message || 'Internal Server Error' });
            }
        });




        // Increment issueCount
        app.patch("/users/increment-issue-count/:email", async (req, res) => {
            try {
                const email = req.params.email;

                const filter = { email };
                const updateDoc = {
                    $inc: { issueCount: 1 }  // Issue count +1
                };

                const result = await userCollection.updateOne(filter, updateDoc);

                res.send({
                    success: true,
                    message: "Issue count incremented!",
                    result
                });

            } catch (error) {
                res.status(500).send({
                    success: false,
                    message: "Failed to increment issue count",
                    error: error.message
                });
            }
        });


        // subscription
        app.post('/create-payment-sub', async (req, res) => {
            const { amount, email } = req.body;

            const parseAmount = Number(amount) * 100;  // safer

            try {
                const session = await stripe.checkout.sessions.create({
                    line_items: [
                        {
                            price_data: {
                                currency: 'bdt',
                                unit_amount: parseAmount,
                                product_data: {
                                    name: "Subscriber"
                                }
                            },
                            quantity: 1,
                        },
                    ],
                    customer_email: email,
                    mode: 'payment',
                    metadata: {
                        issueEmail: email
                    },

                    success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success-sub?session_id={CHECKOUT_SESSION_ID}`,
                    cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
                });
                res.send({ url: session.url });

            } catch (error) {
                res.status(500).send({ error: error.message });
            }
        });


        // /payment-success subscription patch
        app.patch('/payment-success-sub', async (req, res) => {
            const sessionId = req.query.session_id;
            if (!sessionId) {
                return res.status(400).send({ error: 'session_id is required' });
            }

            try {
                const session = await stripe.checkout.sessions.retrieve(sessionId);

                if (session.payment_status !== 'paid') {
                    return res.status(400).send({
                        error: 'Payment not completed yet',
                        payment_status: session.payment_status
                    });
                }


                // Create tracking code
                const trackingId = generateTrackingId();
                // Extract metadata
                const transactionId = session.payment_intent;
                const metadata = session.metadata || {};
                const issueEmail = metadata.issueEmail || session.customer_email;

                // Prevent duplicate insert
                const existing = await paymentCollection.findOne({ transactionId });
                if (existing) {
                    return res.send({
                        message: 'already exists',
                        transactionId,
                        trackingId: existing.trackingId,
                        issueEmail,
                        trackingId
                    });
                }

                // Insert payment record
                await paymentCollection.insertOne({
                    transactionId,
                    sessionId,
                    amount_total: session.amount_total,
                    currency: session.currency,
                    issueEmail,
                    trackingId,
                    createdAt: new Date(),
                });

                // ⭐======== UPDATE USER SUBSCRIPTION =========⭐
                if (issueEmail) {
                    const query = { email: issueEmail };
                    const update = {
                        $set: { subscription: true }
                    };

                    await userCollection.updateOne(query, update, { upsert: false });
                }

                return res.send({
                    message: "processed",
                    transactionId,
                    trackingId,
                    issueEmail,
                    subscriptionUpdated: true
                });

            } catch (err) {
                return res.status(500).send({ error: err.message });
            }
        });


        // GET: /admin/issues
        app.get('/admin/issues', verifyFireToken, verifyAdmin, async (req, res) => {
            try {

                const result = await issuesCollection.find().toArray();
                res.send(result);

            } catch (error) {
                res.status(500).send({ error: error.message });
            }
        });




        // PATCH: /admin/issues/reject/:id
        app.patch('/admin/issues/reject/:id', verifyFireToken, verifyAdmin, async (req, res) => {
            try {
                const id = req.params.id;
                const query = { _id: new ObjectId(id) };
                const update = {
                    $set: {
                        status: "rejected",
                    }
                };

                const result = await issuesCollection.updateOne(query, update);

                res.send({ success: true, message: "Issue rejected successfully", result });

            } catch (error) {
                res.status(500).send({ error: error.message });
            }
        });


        // staff api choose
        app.get('/admin/staff', verifyFireToken, verifyAdmin, async (req, res) => {
            const staff = await userCollection.find({ role: "staff" }).toArray();
            res.send(staff);
        });



        // issues/assign
        app.patch('/admin/issues/assign/:issueId', verifyFireToken, verifyAdmin, async (req, res) => {
            try {
                const issueId = req.params.issueId;
                const { staffEmail } = req.body;

                const issue = await issuesCollection.findOne({ _id: new ObjectId(issueId) });

                if (!issue) return res.status(404).send({ message: "Issue not found" });

                // Prevent double assignment
                if (issue.assignedStaff)
                    return res.send({ success: false, message: "Staff already assigned!" });

                // Only pending can be assigned
                if (issue.status !== "pending")
                    return res.send({ success: false, message: "Only pending issues can be assigned!" });

                // Update issue
                const updateIssue = await issuesCollection.updateOne(
                    { _id: new ObjectId(issueId) },
                    {
                        $set: {
                            assignedStaff: staffEmail,
                            assignmentDate: new Date(),
                            status: "in-progress",
                        },
                        $push: {
                            timeline: {
                                action: `Assigned to ${staffEmail}`,
                                time: new Date()
                            }
                        }
                    }
                );

                // Update staff status
                const updateStaff = await userCollection.updateOne(
                    { email: staffEmail },
                    { $set: { workStatus: "busy" } }
                );

                res.send({
                    success: true,
                    message: "Staff assigned successfully",
                    updateIssue,
                    updateStaff
                });

            } catch (error) {
                res.status(500).send({ error: error.message });
            }
        });



        app.get('/issues/status/stats', async (req, res) => {
            const pipeline = [
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 }
                    }
                },
                {
                    $project: {
                        status: '$_id',
                        count: 1
                    }
                }
            ]
            const result = await issuesCollection.aggregate(pipeline).toArray();
            res.send(result);
        })

        app.get('/issuesCitizen/status/stats', verifyFireToken, async (req, res) => {
            const email = req.query.email;

            let matchStage = {};

            if (email) {
                matchStage = { authorEmail: email };
                if (email !== req.decoded_email) {
                    return res.status(403).send({ messaging: 'forbidden Access' })
                }
            }


            const pipeline = [
                { $match: matchStage },  // <-- filter first
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 }
                    }
                },
                {
                    $project: {
                        status: '$_id',
                        count: 1,
                        _id: 0
                    }
                }
            ];

            const result = await issuesCollection.aggregate(pipeline).toArray();
            res.send(result);
        });



        // staff all api
        // app.get('/staff/issues', verifyFireToken, async (req, res) => {
        //     const email = req.query.email;
        //     const assignedStaff = {}
        //     if (email) {
        //         assignedStaff.assignedStaff = email;
        //     }
        //     try {

        //         const result = await issuesCollection.find(assignedStaff).toArray();

        //         res.send(result);

        //     } catch (error) {
        //         res.status(500).send({ error: error.message });
        //     }
        // });


        // Staff Assigned Issues (boosted first, filtered)
        app.get('/staff/issues', verifyFireToken, async (req, res) => {
            const email = req.query.email;
            const status = req.query.status;
            const priority = req.query.priority;

            let query = { assignedStaff: email };

            if (status) query.status = status;
            if (priority) query.priority = priority;

            const issues = await issuesCollection
                .find(query)
                .sort({ boosted: -1, createdAt: -1 }) // boosted first
                .toArray();

            res.send(issues);
        });


        // Staff Change Status API
        app.patch('/staff/issues/status/:id', async (req, res) => {
            const id = req.params.id;
            const { newStatus, staffName } = req.body;

            const updatedDate = new Date().toISOString().split('T')[0];

            // VALID TRANSITION RULES
            const validTransition = {
                pending: "in-progress",
                "in-progress": "working",
                working: "resolved",
                resolved: "closed"
            };

            const issue = await issuesCollection.findOne({ _id: new ObjectId(id) });
            if (!issue || validTransition[issue.status] !== newStatus) {
                return res.status(400).send({ success: false, message: "Invalid status transition" });
            }

            // DB Update
            await issuesCollection.updateOne(
                { _id: new ObjectId(id) },
                {
                    $set: { status: newStatus, updatedDate },
                    $push: {
                        timeline: {
                            date: new Date(),
                            message: `Status changed to ${newStatus} by ${staffName}`
                        }
                    }
                }
            );

            res.send({ success: true, message: "Status updated" });
        });




        // dashboard api need
        app.get('/issuesStaff/status/stats', async (req, res) => {
            const email = req.query.email;
            if (!email) {
                return res.status(400).send({ message: 'Email is required' });
            }

            const pipeline = [
                { $match: { assignedStaff: email } },

                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 }
                    }
                },
                {
                    $project: {
                        status: '$_id',
                        count: 1,
                        _id: 0
                    }
                }
            ];

            // extra data
            const assignedCount = await issuesCollection.countDocuments({ assignedStaff: email });
            const resolvedCount = await issuesCollection.countDocuments({ assignedStaff: email, status: 'resolved' });

            const today = new Date().toISOString().split("T")[0];
            const todaysTaskCount = await issuesCollection.countDocuments({
                staffEmail: email,
                updatedDate: today // তুমি issue update করলে updatedDate save করবে
            });

            const stats = await issuesCollection.aggregate(pipeline).toArray();

            res.send({
                assignedCount,
                resolvedCount,
                todaysTaskCount,
                chart: stats
            });
        });


        app.get('/payments', verifyFireToken, async (req, res) => {
            const email = req.query.email;
            const query = {};

            // console.log('headers', req.headers)

            if (email) {
                query.issueEmail = email;

                if (email !== req.decoded_email) {
                    return res.status(403).send({ messaging: 'forbidden Access' })
                }
            }

            const cursor = paymentCollection.find(query).sort({ paidAt: -1 });
            const result = await cursor.toArray();

            res.send(result);
        })

        // Ping test
        // await client.db("admin").command({ ping: 1 })


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
