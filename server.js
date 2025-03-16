const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const { exec } = require('child_process');
const { MongoClient, GridFSBucket } = require('mongodb');
const path = require('path');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
  });
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files


const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://chandru127001:hfjSd3QoX5y6Gn6I@aiclassroom.hrciz.mongodb.net/?retryWrites=true&w=majority&appName=AIclassroom";
const DB_NAME = "mydatabase";
let client;

// Connect to MongoDB
const connectToMongoDB = async () => {
  try {
    client = new MongoClient(MONGO_URI);
    await client.connect();
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error("❌ MongoDB Connection Failed:", error);
    process.exit(1); // Exit if MongoDB connection fails
  }
};

// User Schema
const UserSchema = new mongoose.Schema({
  fullName: String,
  subject: String,
  email: { type: String, unique: true },
  password: String,
  Class: String
});

const StudentSchema = new mongoose.Schema({
  fullName: String,
  Rollno: String,
  email: { type: String, unique: true },
  password: String,
  Class: String
});

const User = mongoose.model('User', UserSchema);
const Student = mongoose.model('Student', StudentSchema);

// File Upload Configuration
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Upload to GridFS
const uploadToGridFS = async (fileBuffer, filename, fileType, metadata = {}) => {
  try {
    const db = client.db(DB_NAME);
    const bucket = new GridFSBucket(db);
    const uploadStream = bucket.openUploadStream(filename, { metadata });
    await new Promise((resolve, reject) => {
      uploadStream.end(fileBuffer, (err) => (err ? reject(err) : resolve()));
    });
    console.log(`✅ Uploaded ${filename} to MongoDB`);
  } catch (error) {
    console.error("❌ Error uploading to GridFS:", error);
    throw error;
  }
};



app.post('/signup', async (req, res) => {
  const { fullName, subject, email, password, Class } = req.body;
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }
    const newUser = new User({ fullName, subject, email, password, Class });
    await newUser.save();
    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

app.post('/studentsignup', async (req, res) => {
  const { fullName, Rollno, email, password, Class } = req.body;
  try {
    const existingUser = await Student.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }
    const newUser = new Student({ fullName, Rollno, email, password, Class });
    await newUser.save();
    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ message: "User Already Exist", error });
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "User not found, Please Sign Up", ans: "no user" });
    }
    if (user.password !== password) {
      return res.status(400).json({ message: "Incorrect password", ans: "wrong Pass" });
    }
    res.status(200).json({ message: "Login successful" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

app.post('/studentlogin', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await Student.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "User not found, Please Sign Up", ans: "no user" });
    }
    if (user.password !== password) {
      return res.status(400).json({ message: "Incorrect password", ans: "wrong Pass" });
    }
    res.status(200).json({ message: "Login successful" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

app.post('/upload', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    const filename = `recording.wav`;
    await uploadToGridFS(req.file.buffer, filename, "audio", { teacher: req.body.teacher, subject: req.body.subject });
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

app.get('/summary', async (req, res) => {
  try {
    const db = client.db(DB_NAME);
    const results = await db.collection("transcriptions").find({}).sort({ teacher: 1 }).toArray();
    if (results.length === 0) {
      return res.status(404).json({ message: "No transcriptions found" });
    }
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
        topic: item.topic
      });
      return acc;
    }, {});
    res.json({ organizedData });
  } catch (error) {
    console.error("❌ Error retrieving summary:", error);
    res.status(500).json({ message: "Error retrieving summary" });
  }
});

// Start Server
const startServer = async () => {
  await connectToMongoDB();
  app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
  });
};

startServer();