import re
import sys
from datetime import datetime
import gridfs
from pymongo import MongoClient
from faster_whisper import WhisperModel
from transformers import pipeline
import torch
from io import BytesIO
from keybert import KeyBERT




sys.stdout.reconfigure(encoding='utf-8')

# MongoDB Connection
MONGO_URI = "mongodb+srv://chandru127001:hfjSd3QoX5y6Gn6I@aiclassroom.hrciz.mongodb.net/?retryWrites=true&w=majority&appName=AIclassroom"
client = MongoClient(MONGO_URI)
db = client["mydatabase"]
fs = gridfs.GridFS(db)

# Ensure MongoDB is connected
try:
    client.server_info()  # Check if connection is successful
    print("✅ Connected to MongoDB")
except Exception as e:
    print(f"❌ MongoDB connection failed: {e}")
    sys.exit(1)

# Load models safely
try:
    print("Loading models...")
    whisper_model = WhisperModel("medium", device="cpu", compute_type="float32")
    summarizer = pipeline("summarization", model="facebook/bart-large-cnn")
    qa_pipeline = pipeline("question-answering", model="deepset/roberta-base-squad2")
    topic_model = KeyBERT()  # Initialize KeyBERT model
    print("✅ Models loaded successfully")
except Exception as e:
    print(f"❌ Error loading models: {e}")
    sys.exit(1)

def get_latest_audio():
    """Retrieve the latest audio file from MongoDB GridFS as a BytesIO object."""
    try:
        latest_file = fs.find().sort("uploadDate", -1).limit(1)
        for file in latest_file:
            teachername = file.metadata.get('teacher', 'Unknown')
            subjectname = file.metadata.get('subject', 'Unknown')
            audio_data = file.read()
            print(f"✅ Downloaded latest audio file: {file.filename}")  
            return BytesIO(audio_data), teachername, subjectname  # Return audio stream, teacher, and subject
    except Exception as e:
        print(f"❌ Error retrieving audio from MongoDB: {e}")
        return None, '', ''

def transcribe_audio(audio_stream):
    """Transcribes the given in-memory audio file using FasterWhisper."""
    print("Transcribing audio...")
    segments, _ = whisper_model.transcribe(audio_stream, language="ta", task="translate")
    transcript_text = "\n".join([segment.text for segment in segments])
    return transcript_text if transcript_text.strip() else None

def summarize_text(text):
    """Summarizes the transcribed text using BART."""
    max_chunk_size = 500  # Handle long texts better
    summaries = []
    
    for i in range(0, len(text), max_chunk_size):
        chunk = text[i:i+max_chunk_size]
        summary = summarizer(chunk, max_length=150, min_length=50,  num_beams=4 ,length_penalty=1.2, do_sample=False)[0]['summary_text']
        summaries.append(summary)
    
    return " ".join(summaries)

def extract_assignment_and_deadline(text):
    """Extracts assignments and deadlines from the text using a QA pipeline."""
    assignment = qa_pipeline(question="What is the assigned homework for students?", context=text).get("answer", "No assignment found.")
    deadline = qa_pipeline(question="By when do students need to complete the assignment?", context=text).get("answer", "No deadline found.")

    # Regex backup for assignments
    if "No assignment found" in assignment:
        match = re.search(r'For your homework, (.*?)(?=\.\s|$)', text, re.IGNORECASE)
        assignment = match.group(1) if match else "No assignment found."

    # Improved deadline extraction regex
    if "No deadline found" in deadline:
        match = re.search(r'(?:due|deadline|submit by|last date is)\s*(\d{1,2}(?:st|nd|rd|th)?\s\w+|\w+day)', text, re.IGNORECASE)
        deadline = match.group(1) if match else "No deadline found."

    return assignment, deadline

def get_topic_from_text(text):
    """Extracts topics from the transcribed text using KeyBERT."""
    print("Extracting topics...")
    keywords = topic_model.extract_keywords(text, keyphrase_ngram_range=(1, 2), stop_words='english', top_n=5)
    topics = [keyword[0] for keyword in keywords]  # Extract only words from (word, score) tuples
    return topics if topics else ["No clear topic detected"]

def process_audio():
    """Processes the latest audio file from MongoDB."""
    audio_data, teachername, subjectname = get_latest_audio()
    if not audio_data:
        print("❌ No audio file found to process.")
        return
    
    transcript_text = transcribe_audio(audio_data)
    if not transcript_text:
        print("No speech detected in the audio file.")
        return
    
    print("Summarizing text...")
    summary = summarize_text(transcript_text)
    
    print("Extracting assignments and deadlines...")
    assignment, deadline = extract_assignment_and_deadline(transcript_text)
    
    print("Extracting topics...")
    topics = get_topic_from_text(transcript_text)

    document = {
        "timestamp": datetime.now().isoformat(),
        "transcription": transcript_text,
        "summary": summary,
        "assignment": assignment,
        "deadline": deadline,
        "topic": topics[0],
        "teacher": teachername,
        "subject": subjectname
    }
    db["transcriptions"].insert_one(document)
    print("✅ Data saved to MongoDB!")

# Run the processing function
if __name__ == "__main__":
    process_audio()
