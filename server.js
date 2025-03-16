const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require("multer");
const { exec } = require("child_process");
const { MongoClient, GridFSBucket } = require("mongodb");

dotenv.config();
const app = express();
let username;
let subjectname;
app.use(express.json());
app.use(cors());

const MONGO_URI = process.env.MONGO_URI || "your_mongo_uri";
const DB_NAME = "mydatabase";
const client = new MongoClient(MONGO_URI);

mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log("MongoDB Connected"))
  .catch(err => console.error("MongoDB Connection Failed:", err));

// User Schema
const UserSchema = new mongoose.Schema({
    fullName: String,
    subject: String,
    email: { type: String, unique: true },
    password: String,
    Class:String
});

const StudentSchema = new mongoose.Schema({
    fullName: String,
    Rollno: String,
    email: { type: String, unique: true },
    password: String,
    Class:String
});

const User = mongoose.model('User', UserSchema);
const Student = mongoose.model('Student', StudentSchema);


app.post('/signup', async (req, res) => {
    const { fullName, subject, email, password,Class } = req.body;
    try {
        await client.connect();
        const db = client.db("test");
        const existingUser = await db.collection("users").findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "Email already registered" });
        }
        const newUser = new User({ fullName, subject, email, password,Class });
        await newUser.save();
        res.status(201).json({ message: "User registered successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error", error });
    }
});

app.post('/studentsignup', async (req, res) => {
    const { fullName, Rollno, email, password,Class } = req.body;
    try {
        await client.connect();
        const db = client.db("test");
        const existingUser = await db.collection("students").findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "Email already registered" });
        }
        const newUser = new Student({ fullName, Rollno, email, password,Class });
        await newUser.save();
        res.status(201).json({ message: "User registered successfully" });
    } catch (error) {
        res.status(500).json({ message: "User Already Exist", error });
    }
});
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        await client.connect();
        const db = client.db("test");
        const user = await db.collection("users").findOne({ email });
      
        if (!user) {
            return res.status(400).json({ message: "User not found, Please Sign Up", ans: "no user" });
        }
        if (user.password !== password) {
            return res.status(400).json({ message: "Incorrect password", ans: "wrong Pass" });
        }
        username = user.fullName;
        subjectname = user.subject;
        res.status(200).json({ message: "Login successful" });
    } catch (error) {
        res.status(500).json({ message: "Server error", error });
    }
});

app.post('/studentlogin', async (req, res) => {
    const { email, password } = req.body;
    try {
        await client.connect();
        const db = client.db("test");
        const user = await db.collection("students").findOne({ email });
        if (!user) {
            return res.status(400).json({ message: "User not found, Please Sign Up", ans: "no user" });
        }
        if (user.password !== password) {
            return res.status(400).json({ message: "Incorrect password", ans: "wrong Pass" });
        }
        studentname = user.fullName;
        res.status(200).json({ message: "Login successful" });
    } catch (error) {
        res.status(500).json({ message: "Server error", error });
    }
});

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

async function uploadToGridFS(fileBuffer, filename, fileType) {
    try {
        await client.connect();
        const db = client.db(DB_NAME);
        const bucket = new GridFSBucket(db);
        const uploadStream = bucket.openUploadStream(filename, {
            metadata: { file_type: fileType,teacher:username,subject:subjectname }
        });
        await new Promise((resolve, reject) => {
            uploadStream.end(fileBuffer, (err) => (err ? reject(err) : resolve()));
        });
        console.log(`✅ Uploaded ${filename} to MongoDB`);
    } catch (error) {
        console.error("❌ Error uploading to GridFS:", error);
    }
}

app.post("/upload", upload.single("audio"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded" });
        }
        const filename = `recording.wav`;
        await uploadToGridFS(req.file.buffer, filename, "audio");
        exec("python process_text.py", (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ Processing Error: ${error.message}`);
                return res.status(500).json({ message: "Processing failed", error: error.message });
            }
            if (stderr) console.warn(`⚠️ Processing stderr: ${stderr}`);
            console.log("📄 Processing Output:", stdout);
            res.json({ message: "File processed successfully" });
        });
    } catch (error) {
        console.error("❌ Error handling upload:", error);
        res.status(500).json({ message: "File processing failed", error: error.message });
    }
});

// API to fetch the latest summary from MongoDB
app.get("/summary", async (req, res) => {
    try {
        await client.connect();
        const db = client.db(DB_NAME);
        const results = await db.collection("transcriptions").find({}).sort({ teacher: 1 }).toArray();
        
        if (results.length === 0) {
            return res.status(404).json({ message: "No transcriptions found" });
        }
        
        // Organizing data by subject
        const organizedData = results.reduce((acc, item) => {
            const subject = item.subject;
            if (!acc[subject]) {
                acc[subject] = [];
            }
            acc[subject].push({
                summary: item.summary,
                assignment: item.assignment,
                deadline: item.deadline,
                teacher: item.teacher,
                topic: item.topic,
                Student:studentname
            });
            return acc;
        }, {});

        res.json({ organizedData,Student:studentname });
    } catch (error) {
        console.error("❌ Error retrieving summary:", error);
        res.status(500).json({ message: "Error retrieving summary" });
    } finally {
        await client.close();
    }
});


// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
});
